-- Migração 026: Processo de Conexão (T-05-01).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §11 "Quando a conexão
-- for formalizada, o sistema gera automaticamente um protocolo … Processo
-- DM-2026-000184 … todas as ações ficam vinculadas ao mesmo processo"; §14
-- "cada processo deverá ter um responsável atual"; §16 status padronizados;
-- §28 "a demanda principal possui diferentes Processos de Conexão"; §35 linha
-- do tempo por conexão. Decisões 13 e 16 de decisoes-de-implementacao.md.
-- Contrato com o dm-gestao: dm-docs/gestao/04-modelagem-de-dados.md §3.22.
--
-- - Camada 3 sobre as entidades existentes (decisão 13): `demand_interests` +
--   `user_db.connections` continuam sendo a Camada 2 (interesse, pedido,
--   aceite e a conversa T27); `demand_institutional_tracks` é a análise do
--   órgão antes da formalização. `connection_processes` nasce no aceite do
--   interesse de apoio, no aceite da conexão pedida pela oferta do órgão ou na
--   formalização pelo próprio órgão, com protocolo `DM-AAAA-NNNNNN` (sequência
--   anual, `connection_protocol_counters`), número na demanda (CONEXÃO 01, 02…),
--   parte (conta ou órgão, com o tipo de ator), contribuição, responsável atual
--   e status do §16. Um processo em aberto por parte × demanda.
-- - Status (decisão 16): fluxo recebida → … → prestação de contas e as
--   exceções; `aguardando_*` e `suspensa` guardam o status anterior e voltam a
--   ele; `nao_aprovada`, `nao_e_de_competencia`, `cancelada` e
--   `prestacao_de_contas` são finais (fecham o processo). Justificativa
--   obrigatória em `nao_*`, `suspensa` e `cancelada` (§10, "recusar informando
--   o motivo"). Espelho: src/process/constants.js e state-machine.js.
-- - O status institucional (010) é subconjunto compatível do status do
--   processo: aqui `acao_programada` vira `aprovada_para_execucao` e entram
--   os valores novos; quando o acompanhamento tem processo, o trigger do
--   processo espelha o status nele (`dm.process_mirror`).
-- - Linha do tempo por processo: `demand_events.process_id` (preenchido pelo
--   trigger `demand_events_link_process` a partir de process_id, track_id ou
--   forwarding_id do payload); eventos `processo_formalizado` e
--   `processo_status_alterado` (públicos, payload->'public' sem nome de
--   pessoa) e `responsavel_do_processo_definido` (privado).
-- - `demand_institutional_tracks.process_id` (o processo do órgão, quando
--   formalizado) e `demand_forwardings.process_id` (opcional, herdado do
--   acompanhamento de origem).
-- - A gestão só lê (grant SELECT no dm-infra,
--   db/migrations/gestao/025-gestao-app-post-processes.sql); nada é excluído.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro). Os
-- valores novos do enum institucional não são usados em SQL nesta migração
-- (ADD VALUE não pode ser usado na mesma transação).

-- ---------------------------------------------------------------------------
-- Status institucional alinhado ao §16 (decisão 16). Banco novo já nasce com o
-- enum final (migração 010); aqui o banco existente é migrado.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
              WHERE t.typname = 'institutional_status' AND e.enumlabel = 'acao_programada')
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
                      WHERE t.typname = 'institutional_status' AND e.enumlabel = 'aprovada_para_execucao') THEN
    ALTER TYPE institutional_status RENAME VALUE 'acao_programada' TO 'aprovada_para_execucao';
  END IF;
END $$;
ALTER TYPE institutional_status ADD VALUE IF NOT EXISTS 'solicitacao_de_informacoes' AFTER 'em_analise';
ALTER TYPE institutional_status ADD VALUE IF NOT EXISTS 'aguardando_documentacao' AFTER 'encaminhada_ao_orgao_responsavel';
ALTER TYPE institutional_status ADD VALUE IF NOT EXISTS 'nao_aprovada' AFTER 'aguardando_documentacao';
ALTER TYPE institutional_status ADD VALUE IF NOT EXISTS 'suspensa' AFTER 'nao_aprovada';
ALTER TYPE institutional_status ADD VALUE IF NOT EXISTS 'cancelada' AFTER 'suspensa';

-- ---------------------------------------------------------------------------
-- Vocabulário do processo.
DO $$ BEGIN
  CREATE TYPE connection_process_status AS ENUM (
    'recebida', 'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
    'aprovada_para_execucao', 'em_execucao', 'concluida', 'prestacao_de_contas',
    'aguardando_documentacao', 'aguardando_recurso', 'nao_e_de_competencia', 'nao_aprovada', 'suspensa',
    'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quem é a parte conectada (Modelo §26–§27): o Poder Público e os subperfis de
-- Parceiro (empresa, marca, comércio local, patrocinador), mais investidor
-- (previsto na fonte) e outro parceiro. `fee_applies` (decisão 14) sai daqui.
DO $$ BEGIN
  CREATE TYPE connection_party_kind AS ENUM (
    'poder_publico', 'empresa', 'marca', 'comercio_local', 'patrocinador', 'investidor', 'parceiro_outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- O que cada conectado contribui (§26–§28).
DO $$ BEGIN
  CREATE TYPE connection_contribution_kind AS ENUM (
    'apoio_financeiro', 'patrocinio', 'materiais', 'equipamentos', 'servicos', 'equipe', 'conhecimento_tecnico',
    'execucao_de_etapa', 'infraestrutura', 'articulacao', 'autorizacao', 'encaminhamento', 'programa_publico',
    'recurso_publico'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- De onde o processo nasceu (`conexao_direta`: conexão pedida pelo Agente a um
-- potencial parceiro, T30; banco existente e a regra da origem: migração 030).
DO $$ BEGIN
  CREATE TYPE connection_process_origin AS ENUM (
    'interesse', 'oferta_institucional', 'acompanhamento_institucional', 'conexao_direta'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Protocolo DM-AAAA-NNNNNN: contador por ano (horário de Brasília), que começa
-- em 1 a cada ano. O UPSERT trava a linha do ano: dois processos simultâneos
-- nunca recebem o mesmo número.
CREATE TABLE IF NOT EXISTS connection_protocol_counters (
  year        INT PRIMARY KEY CHECK (year BETWEEN 2000 AND 9999),
  last_value  INT NOT NULL CHECK (last_value BETWEEN 1 AND 999999)
);

CREATE OR REPLACE FUNCTION next_connection_protocol() RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  y INT := extract(year FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  n INT;
BEGIN
  INSERT INTO connection_protocol_counters AS c (year, last_value) VALUES (y, 1)
  ON CONFLICT (year) DO UPDATE SET last_value = c.last_value + 1
  RETURNING last_value INTO n;
  RETURN 'DM-' || y::text || '-' || lpad(n::text, 6, '0');
END
$$;

CREATE TABLE IF NOT EXISTS connection_processes (
  id                             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol                       VARCHAR(20) NOT NULL UNIQUE CHECK (protocol ~ '^DM-[0-9]{4}-[0-9]{6}$'),
  demand_id                      UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- CONEXÃO 01, 02… da demanda (§28), gravado pelo trigger.
  sequence_in_demand             INT NOT NULL CHECK (sequence_in_demand >= 1),
  -- Parte conectada: conta (Parceiro) ou órgão (Poder Público), com retrato do
  -- nome e do subperfil na formalização.
  party_kind                     connection_party_kind NOT NULL,
  party_user_id                  UUID,
  party_organization_id          UUID,
  party_name                     VARCHAR(255) NOT NULL CHECK (btrim(party_name) <> ''),
  party_profile_type             VARCHAR(50),
  party_key                      UUID GENERATED ALWAYS AS (coalesce(party_organization_id, party_user_id)) STORED,
  -- Taxas 4% + 6% só com Parceiros, Investidores e Empresas (Modelo §04 Obs.,
  -- decisão 14); a T-05-06 calcula sobre a contribuição.
  fee_applies                    BOOLEAN GENERATED ALWAYS AS (party_kind <> 'poder_publico') STORED,
  origin_kind                    connection_process_origin NOT NULL,
  origin_interest_id             UUID REFERENCES demand_interests(id) ON DELETE RESTRICT,
  origin_track_id                UUID REFERENCES demand_institutional_tracks(id) ON DELETE RESTRICT,
  origin_offer_id                UUID REFERENCES demand_institutional_offers(id) ON DELETE RESTRICT,
  -- Conexão do user-service (user_db.connections.id, outra base: sem FK).
  origin_connection_id           UUID,
  -- Contribuição do conectado (§28).
  contribution_kinds             connection_contribution_kind[] NOT NULL DEFAULT '{}'
                                   CHECK (cardinality(contribution_kinds) <= 14),
  contribution_description       TEXT CHECK (contribution_description IS NULL
                                   OR (btrim(contribution_description) <> '' AND char_length(contribution_description) <= 3000)),
  contribution_amount_cents      BIGINT CHECK (contribution_amount_cents IS NULL OR contribution_amount_cents >= 0),
  -- Status do §16.
  status                         connection_process_status NOT NULL DEFAULT 'recebida',
  previous_status                connection_process_status,
  status_note                    TEXT CHECK (status_note IS NULL OR char_length(status_note) <= 2000),
  status_changed_by              UUID,
  status_changed_by_kind         VARCHAR(20) CHECK (status_changed_by_kind IS NULL
                                   OR status_changed_by_kind IN ('agente', 'parte', 'sistema')),
  status_changed_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Responsável atual (§14): instituição, órgão, secretaria, setor, pessoa,
  -- cargo, desde quando e data limite da próxima ação.
  responsible_organization_name  VARCHAR(255),
  responsible_organ              VARCHAR(255),
  responsible_department         VARCHAR(255),
  responsible_sector             VARCHAR(255),
  responsible_name               VARCHAR(255),
  responsible_role               VARCHAR(255),
  responsible_since              TIMESTAMPTZ,
  responsible_due_on             DATE,
  responsible_updated_by         UUID,
  -- Quem formalizou (Agente autor ou representante da parte).
  formalized_by                  UUID NOT NULL,
  formalized_by_kind             VARCHAR(20) NOT NULL CHECK (formalized_by_kind IN ('agente', 'parte')),
  formalized_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at                      TIMESTAMPTZ,
  created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT connection_processes_sequence UNIQUE (demand_id, sequence_in_demand),
  CONSTRAINT connection_processes_party CHECK (
    (party_kind = 'poder_publico' AND party_organization_id IS NOT NULL)
    OR (party_kind <> 'poder_publico' AND party_user_id IS NOT NULL AND party_organization_id IS NULL)),
  CONSTRAINT connection_processes_origin CHECK (
    (origin_kind = 'interesse' AND origin_interest_id IS NOT NULL)
    OR (origin_kind = 'oferta_institucional' AND origin_offer_id IS NOT NULL AND origin_track_id IS NOT NULL)
    OR (origin_kind = 'acompanhamento_institucional' AND origin_track_id IS NOT NULL)),
  CONSTRAINT connection_processes_amount CHECK (
    contribution_amount_cents IS NULL OR contribution_kinds && ARRAY['apoio_financeiro', 'patrocinio']::connection_contribution_kind[]),
  CONSTRAINT connection_processes_closed CHECK (
    (status IN ('nao_e_de_competencia', 'nao_aprovada', 'cancelada', 'prestacao_de_contas')) = (closed_at IS NOT NULL))
);

-- Um processo em aberto por parte × demanda; fechado, pode nascer outro.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_processes_open_party
  ON connection_processes(demand_id, party_key) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_connection_processes_demand
  ON connection_processes(demand_id, sequence_in_demand);
CREATE INDEX IF NOT EXISTS idx_connection_processes_party_user
  ON connection_processes(party_user_id, status_changed_at DESC) WHERE party_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connection_processes_party_org
  ON connection_processes(party_organization_id, status_changed_at DESC) WHERE party_organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connection_processes_status
  ON connection_processes(status, status_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_processes_connection
  ON connection_processes(origin_connection_id) WHERE origin_connection_id IS NOT NULL;

-- Vínculos das entidades existentes com o processo (decisão 13).
ALTER TABLE demand_institutional_tracks
  ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES connection_processes(id) ON DELETE RESTRICT;
ALTER TABLE demand_forwardings
  ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES connection_processes(id) ON DELETE RESTRICT;
ALTER TABLE demand_events
  ADD COLUMN IF NOT EXISTS process_id UUID REFERENCES connection_processes(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_institutional_tracks_process
  ON demand_institutional_tracks(process_id) WHERE process_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_forwardings_process
  ON demand_forwardings(process_id) WHERE process_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demand_events_process
  ON demand_events(process_id, created_at) WHERE process_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Transições (espelha TRANSITIONS de src/process/state-machine.js; o teste
-- test/process-domain.test.js compara). De `aguardando_*` e `suspensa`, além
-- da lista, vale voltar ao status anterior (`previous`).
CREATE OR REPLACE FUNCTION connection_process_transition_allowed(
  from_status connection_process_status, to_status connection_process_status, previous connection_process_status
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_status
    WHEN 'recebida' THEN to_status IN ('em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
      'aprovada_para_execucao', 'em_execucao', 'aguardando_documentacao', 'aguardando_recurso', 'suspensa',
      'nao_e_de_competencia', 'nao_aprovada', 'cancelada')
    WHEN 'em_analise' THEN to_status IN ('solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
      'aprovada_para_execucao', 'em_execucao', 'aguardando_documentacao', 'aguardando_recurso', 'suspensa',
      'nao_e_de_competencia', 'nao_aprovada', 'cancelada')
    WHEN 'solicitacao_de_informacoes' THEN to_status IN ('em_analise', 'encaminhada', 'em_articulacao',
      'aprovada_para_execucao', 'em_execucao', 'aguardando_documentacao', 'aguardando_recurso', 'suspensa',
      'nao_e_de_competencia', 'nao_aprovada', 'cancelada')
    WHEN 'encaminhada' THEN to_status IN ('em_analise', 'solicitacao_de_informacoes', 'em_articulacao',
      'aprovada_para_execucao', 'em_execucao', 'aguardando_documentacao', 'aguardando_recurso', 'suspensa',
      'nao_e_de_competencia', 'nao_aprovada', 'cancelada')
    WHEN 'em_articulacao' THEN to_status IN ('em_analise', 'solicitacao_de_informacoes', 'encaminhada',
      'aprovada_para_execucao', 'em_execucao', 'aguardando_documentacao', 'aguardando_recurso', 'suspensa',
      'nao_e_de_competencia', 'nao_aprovada', 'cancelada')
    WHEN 'aprovada_para_execucao' THEN to_status IN ('em_articulacao', 'em_execucao', 'aguardando_documentacao',
      'aguardando_recurso', 'suspensa', 'cancelada')
    WHEN 'em_execucao' THEN to_status IN ('concluida', 'aguardando_recurso', 'suspensa', 'cancelada')
    WHEN 'concluida' THEN to_status IN ('prestacao_de_contas')
    WHEN 'aguardando_documentacao' THEN to_status IN ('aguardando_recurso', 'suspensa', 'nao_e_de_competencia',
      'nao_aprovada', 'cancelada') OR to_status = previous
    WHEN 'aguardando_recurso' THEN to_status IN ('aguardando_documentacao', 'suspensa', 'nao_e_de_competencia',
      'nao_aprovada', 'cancelada') OR to_status = previous
    WHEN 'suspensa' THEN to_status IN ('aguardando_documentacao', 'aguardando_recurso', 'nao_e_de_competencia',
      'nao_aprovada', 'cancelada') OR to_status = previous
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION connection_process_requires_note(to_status connection_process_status) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT to_status IN ('nao_e_de_competencia', 'nao_aprovada', 'suspensa', 'cancelada')
$$;

-- Status em que o processo termina (closed_at).
CREATE OR REPLACE FUNCTION connection_process_is_final(st connection_process_status) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT st IN ('nao_e_de_competencia', 'nao_aprovada', 'cancelada', 'prestacao_de_contas')
$$;

CREATE OR REPLACE FUNCTION connection_processes_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  st demand_status;
  i RECORD;
  t RECORD;
  o RECORD;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os processos de conexão' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'processos de conexão não são excluídos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Trava a demanda: número na demanda e protocolo em ordem.
    SELECT status INTO st FROM demands WHERE id = NEW.demand_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF st NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao') THEN
      RAISE EXCEPTION 'processo de conexão só com a demanda publicada e antes da conclusão (estado: %)', st
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status NOT IN ('recebida', 'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
                          'aprovada_para_execucao', 'em_execucao')
       OR NEW.previous_status IS NOT NULL OR NEW.status_note IS NOT NULL THEN
      RAISE EXCEPTION 'processo nasce num status do fluxo, sem nota (recebido: %)', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF cardinality(NEW.contribution_kinds) <> (SELECT count(DISTINCT k) FROM unnest(NEW.contribution_kinds) AS k) THEN
      RAISE EXCEPTION 'contribuição repetida' USING ERRCODE = 'check_violation';
    END IF;

    -- Origem coerente com a demanda e com a parte.
    IF NEW.origin_interest_id IS NOT NULL THEN
      SELECT demand_id, user_id, organization_id, kind, connection_status, connection_id, withdrawn_at
        INTO i FROM demand_interests WHERE id = NEW.origin_interest_id;
      IF i.demand_id IS DISTINCT FROM NEW.demand_id OR i.kind <> 'apoio' OR i.connection_status IS DISTINCT FROM 'aceita'
         OR i.withdrawn_at IS NOT NULL THEN
        RAISE EXCEPTION 'o processo nasce de interesse de apoio desta demanda com a conexão aceita'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (NEW.party_kind = 'poder_publico' AND i.organization_id IS DISTINCT FROM NEW.party_organization_id)
         OR (NEW.party_kind <> 'poder_publico' AND i.user_id IS DISTINCT FROM NEW.party_user_id) THEN
        RAISE EXCEPTION 'a parte do processo é quem manifestou o interesse' USING ERRCODE = 'check_violation';
      END IF;
      NEW.origin_connection_id := i.connection_id;
    END IF;
    IF NEW.origin_offer_id IS NOT NULL THEN
      SELECT track_id, demand_id, organization_id, connection_id INTO o
        FROM demand_institutional_offers WHERE id = NEW.origin_offer_id;
      IF o.demand_id IS DISTINCT FROM NEW.demand_id THEN
        RAISE EXCEPTION 'oferta institucional de outra demanda' USING ERRCODE = 'check_violation';
      END IF;
      NEW.origin_track_id := o.track_id;
      NEW.origin_connection_id := coalesce(NEW.origin_connection_id, o.connection_id);
    END IF;
    IF NEW.origin_track_id IS NOT NULL THEN
      SELECT demand_id, organization_id INTO t FROM demand_institutional_tracks WHERE id = NEW.origin_track_id;
      IF t.demand_id IS DISTINCT FROM NEW.demand_id OR NEW.party_kind <> 'poder_publico'
         OR t.organization_id IS DISTINCT FROM NEW.party_organization_id THEN
        RAISE EXCEPTION 'o processo do órgão nasce do acompanhamento dele nesta demanda' USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    NEW.protocol := next_connection_protocol();
    NEW.sequence_in_demand := coalesce(
      (SELECT max(sequence_in_demand) FROM connection_processes WHERE demand_id = NEW.demand_id), 0) + 1;
    NEW.status_changed_by := NEW.formalized_by;
    NEW.status_changed_by_kind := NEW.formalized_by_kind;
    NEW.status_changed_at := NOW();
    NEW.responsible_since := CASE WHEN coalesce(NEW.responsible_name, NEW.responsible_organ,
                                                NEW.responsible_organization_name) IS NOT NULL THEN NOW() END;
    NEW.formalized_at := NOW();
    NEW.closed_at := NULL;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.protocol, NEW.demand_id, NEW.sequence_in_demand, NEW.party_kind, NEW.party_user_id,
      NEW.party_organization_id, NEW.party_name, NEW.party_profile_type, NEW.origin_kind, NEW.origin_interest_id,
      NEW.origin_track_id, NEW.origin_offer_id, NEW.origin_connection_id, NEW.formalized_by,
      NEW.formalized_by_kind, NEW.formalized_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.protocol, OLD.demand_id, OLD.sequence_in_demand, OLD.party_kind, OLD.party_user_id,
      OLD.party_organization_id, OLD.party_name, OLD.party_profile_type, OLD.origin_kind, OLD.origin_interest_id,
      OLD.origin_track_id, OLD.origin_offer_id, OLD.origin_connection_id, OLD.formalized_by,
      OLD.formalized_by_kind, OLD.formalized_at, OLD.created_at) THEN
    RAISE EXCEPTION 'protocolo, partes e origem do processo não mudam' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'processo encerrado não muda (status: %)', OLD.status USING ERRCODE = 'check_violation';
  END IF;
  SELECT status INTO st FROM demands WHERE id = NEW.demand_id;
  IF st = 'arquivada' THEN
    RAISE EXCEPTION 'processo de demanda arquivada não muda' USING ERRCODE = 'check_violation';
  END IF;
  IF cardinality(NEW.contribution_kinds) <> (SELECT count(DISTINCT k) FROM unnest(NEW.contribution_kinds) AS k) THEN
    RAISE EXCEPTION 'contribuição repetida' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT connection_process_transition_allowed(OLD.status, NEW.status, OLD.previous_status) THEN
      RAISE EXCEPTION 'transição do processo não permitida: % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'nao_e_de_competencia' AND NEW.party_kind <> 'poder_publico' THEN
      RAISE EXCEPTION 'transição do processo não permitida: "não é de competência" é do Poder Público'
        USING ERRCODE = 'check_violation';
    END IF;
    IF connection_process_requires_note(NEW.status) AND coalesce(btrim(NEW.status_note), '') = '' THEN
      RAISE EXCEPTION 'justificativa (status_note) é obrigatória para %', NEW.status USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status_changed_by IS NULL OR NEW.status_changed_by_kind IS NULL THEN
      RAISE EXCEPTION 'status_changed_by é obrigatório na mudança de status' USING ERRCODE = 'check_violation';
    END IF;
    -- Pausa guarda de onde saiu; retomar limpa.
    IF NEW.status IN ('aguardando_documentacao', 'aguardando_recurso', 'suspensa') THEN
      NEW.previous_status := CASE WHEN OLD.status IN ('aguardando_documentacao', 'aguardando_recurso', 'suspensa')
                                  THEN OLD.previous_status ELSE OLD.status END;
    ELSIF OLD.status IN ('aguardando_documentacao', 'aguardando_recurso', 'suspensa')
          AND NEW.status = OLD.previous_status THEN
      NEW.previous_status := NULL;
    ELSE
      NEW.previous_status := OLD.previous_status;
    END IF;
    NEW.status_changed_at := NOW();
    NEW.closed_at := CASE WHEN connection_process_is_final(NEW.status) THEN NOW() END;
  ELSIF (NEW.previous_status, NEW.status_note, NEW.status_changed_by, NEW.status_changed_by_kind,
         NEW.status_changed_at, NEW.closed_at)
        IS DISTINCT FROM (OLD.previous_status, OLD.status_note, OLD.status_changed_by, OLD.status_changed_by_kind,
                          OLD.status_changed_at, OLD.closed_at) THEN
    RAISE EXCEPTION 'nota, autor e datas do status mudam só junto de uma transição' USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.responsible_organization_name, NEW.responsible_organ, NEW.responsible_department, NEW.responsible_sector,
      NEW.responsible_name, NEW.responsible_role, NEW.responsible_due_on)
     IS DISTINCT FROM
     (OLD.responsible_organization_name, OLD.responsible_organ, OLD.responsible_department, OLD.responsible_sector,
      OLD.responsible_name, OLD.responsible_role, OLD.responsible_due_on) THEN
    IF NEW.responsible_updated_by IS NULL THEN
      RAISE EXCEPTION 'responsible_updated_by é obrigatório na troca do responsável' USING ERRCODE = 'check_violation';
    END IF;
    NEW.responsible_since := NOW();
  ELSIF NEW.responsible_since IS DISTINCT FROM OLD.responsible_since THEN
    RAISE EXCEPTION 'a data do responsável muda só com o responsável' USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION connection_processes_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'connection_processes não é apagada' USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Ator da linha do tempo: o Agente autor, ou a parte (Poder Público/Parceiro).
CREATE OR REPLACE FUNCTION connection_process_actor_type(kind TEXT, party connection_party_kind) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN kind = 'agente' THEN 'agente'
              WHEN kind = 'sistema' THEN 'sistema'
              WHEN party = 'poder_publico' THEN 'poder_publico'
              ELSE 'parceiro' END
$$;

-- Status do processo → status do acompanhamento do órgão (decisão 16). NULL:
-- sem equivalente, o acompanhamento fica como está.
CREATE OR REPLACE FUNCTION connection_process_track_status(st connection_process_status) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE st
    WHEN 'recebida' THEN NULL
    WHEN 'aguardando_recurso' THEN NULL
    WHEN 'prestacao_de_contas' THEN 'concluida'
    ELSE st::text
  END
$$;

-- Linha do tempo do processo e espelho no acompanhamento do órgão.
CREATE OR REPLACE FUNCTION connection_processes_after() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  track_status TEXT;
  base JSONB := jsonb_build_object('process_id', NEW.id, 'protocol', NEW.protocol, 'party_kind', NEW.party_kind);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, NEW.id, 'processo_formalizado',
      connection_process_actor_type(NEW.formalized_by_kind, NEW.party_kind), NEW.formalized_by::text,
      base || jsonb_build_object(
        'origin_kind', NEW.origin_kind, 'status', NEW.status,
        'public', jsonb_build_object(
          'protocol', NEW.protocol, 'sequenceInDemand', NEW.sequence_in_demand, 'partyKind', NEW.party_kind,
          'organizationName', CASE WHEN NEW.party_kind = 'poder_publico' THEN NEW.party_name END,
          'contributionKinds', to_jsonb(NEW.contribution_kinds), 'status', NEW.status)),
      true, clock_timestamp());
    -- O acompanhamento do órgão passa a apontar para o processo (o novo, se o
    -- anterior foi encerrado).
    IF NEW.origin_track_id IS NOT NULL THEN
      UPDATE demand_institutional_tracks SET process_id = NEW.id
       WHERE id = NEW.origin_track_id
         AND (process_id IS NULL
              OR EXISTS (SELECT 1 FROM connection_processes p WHERE p.id = process_id AND p.closed_at IS NOT NULL));
    END IF;
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, NEW.id, 'processo_status_alterado',
      connection_process_actor_type(NEW.status_changed_by_kind, NEW.party_kind), NEW.status_changed_by::text,
      NEW.status_note,
      base || jsonb_build_object(
        'from_status', OLD.status, 'status', NEW.status,
        'public', jsonb_build_object(
          'protocol', NEW.protocol, 'sequenceInDemand', NEW.sequence_in_demand, 'partyKind', NEW.party_kind,
          'fromStatus', OLD.status, 'status', NEW.status)),
      true, clock_timestamp());

    -- Espelho no acompanhamento do órgão (o guard da 010 aceita o salto com
    -- dm.process_mirror ligado nesta transação).
    track_status := connection_process_track_status(NEW.status);
    IF track_status IS NOT NULL THEN
      PERFORM set_config('dm.process_mirror', 'on', true);
      EXECUTE 'UPDATE demand_institutional_tracks
                  SET status = $1::institutional_status, status_note = $2, status_changed_by = $3
                WHERE process_id = $4 AND status::text <> $1'
        USING track_status, NEW.status_note, NEW.status_changed_by, NEW.id;
      PERFORM set_config('dm.process_mirror', '', true);
    END IF;
  END IF;

  IF (NEW.responsible_organization_name, NEW.responsible_organ, NEW.responsible_department, NEW.responsible_sector,
      NEW.responsible_name, NEW.responsible_role, NEW.responsible_due_on)
     IS DISTINCT FROM
     (OLD.responsible_organization_name, OLD.responsible_organ, OLD.responsible_department, OLD.responsible_sector,
      OLD.responsible_name, OLD.responsible_role, OLD.responsible_due_on) THEN
    -- Responsável é dado interno das partes: evento privado.
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, NEW.id, 'responsavel_do_processo_definido',
      connection_process_actor_type(coalesce(nullif(current_setting('dm.process_actor_kind', true), ''), 'parte'),
                                    NEW.party_kind),
      NEW.responsible_updated_by::text,
      base || jsonb_build_object('due_on', NEW.responsible_due_on),
      false, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connection_processes_guard ON connection_processes;
CREATE TRIGGER connection_processes_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_processes
  FOR EACH ROW EXECUTE FUNCTION connection_processes_guard();

DROP TRIGGER IF EXISTS connection_processes_block_truncate ON connection_processes;
CREATE TRIGGER connection_processes_block_truncate
  BEFORE TRUNCATE ON connection_processes
  FOR EACH STATEMENT EXECUTE FUNCTION connection_processes_no_truncate();

DROP TRIGGER IF EXISTS connection_processes_after ON connection_processes;
CREATE TRIGGER connection_processes_after
  AFTER INSERT OR UPDATE ON connection_processes
  FOR EACH ROW EXECUTE FUNCTION connection_processes_after();

-- O contador do protocolo não é escrito pela gestão nem apagado.
CREATE OR REPLACE FUNCTION connection_protocol_counters_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'o contador de protocolos não é alterado por fora' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS connection_protocol_counters_guard ON connection_protocol_counters;
CREATE TRIGGER connection_protocol_counters_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_protocol_counters
  FOR EACH ROW EXECUTE FUNCTION connection_protocol_counters_guard();

-- ---------------------------------------------------------------------------
-- Eventos ligados ao processo: o que as tabelas existentes gravam (status e
-- respostas do órgão, encaminhamentos) entra na linha do tempo do processo
-- quando o acompanhamento ou o encaminhamento já pertencem a um.
CREATE OR REPLACE FUNCTION demand_events_link_process() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.process_id IS NULL AND NEW.payload IS NOT NULL THEN
    IF NEW.payload ? 'forwarding_id' THEN
      SELECT process_id INTO NEW.process_id FROM demand_forwardings
       WHERE id = (NEW.payload->>'forwarding_id')::uuid;
    END IF;
    IF NEW.process_id IS NULL AND NEW.payload ? 'track_id' THEN
      SELECT process_id INTO NEW.process_id FROM demand_institutional_tracks
       WHERE id = (NEW.payload->>'track_id')::uuid;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demand_events_link_process ON demand_events;
CREATE TRIGGER demand_events_link_process
  BEFORE INSERT ON demand_events
  FOR EACH ROW EXECUTE FUNCTION demand_events_link_process();

-- Encaminhamento herda o processo do acompanhamento de origem.
CREATE OR REPLACE FUNCTION forwardings_link_process() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.process_id IS NULL THEN
      SELECT process_id INTO NEW.process_id FROM demand_institutional_tracks WHERE id = NEW.track_id;
    END IF;
  ELSIF NEW.process_id IS DISTINCT FROM OLD.process_id AND OLD.process_id IS NOT NULL THEN
    RAISE EXCEPTION 'o processo do encaminhamento não muda' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS forwardings_link_process ON demand_forwardings;
CREATE TRIGGER forwardings_link_process
  BEFORE INSERT OR UPDATE ON demand_forwardings
  FOR EACH ROW EXECUTE FUNCTION forwardings_link_process();
