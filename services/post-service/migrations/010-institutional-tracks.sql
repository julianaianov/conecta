-- Migração 010: resposta institucional e status do Poder Público (T13).
--
-- Fonte: dm-docs/fonte-da-verdade/03-fluxo-cadastro-poder-publico.html,
-- etapas 03 a 08 (slides 8–15): análise das demandas, atuação institucional,
-- resposta institucional, recursos e formas de apoio, acompanhamento e status,
-- histórico e transparência; decisão 4 de decisoes-de-implementacao.md (status
-- institucional por órgão e por demanda). Contrato com o dm-gestao:
-- dm-docs/gestao/04-modelagem-de-dados.md.
--
-- - `demand_institutional_tracks`: um acompanhamento por (demanda, órgão do
--   Poder Público com cadastro validado), com o status institucional canônico
--   (Recebida → Em análise → Encaminhada → Em articulação → Aprovada para
--   execução → Em execução → Concluída, mais Não é de competência e Encaminhada
--   ao órgão responsável e, desde a decisão 16, Solicitação de informações,
--   Aguardando documentação, Não aprovada, Suspensa e Cancelada), responsável,
--   datas e a nota da última mudança. Nasce
--   `recebida`; as transições ficam em institutional_status_transition_allowed
--   (espelho: services/post-service/src/institutional/state-machine.js).
-- - `demand_institutional_responses`: respostas institucionais (tipos da
--   fonte), só inserção.
-- - `demand_institutional_offers`: interesse em apoiar / oferta de recursos
--   (formas de apoio da fonte), só inserção, com a conexão pedida ao Agente
--   (user_db.connections.id, outra base: sem FK).
-- - Linha do tempo: abertura, respostas, mudanças de status e ofertas entram em
--   `demand_events` como eventos públicos (actor_type `poder_publico`). O que é
--   mostrado ao público fica em payload->'public' (a rota pública não expõe o
--   resto do payload, a nota nem o ator). Os eventos usam clock_timestamp():
--   mudança de status e resposta na mesma transação ficam em ordem.
-- - Neutralidade (fonte, Apresentação slides 11–12): nada aqui ordena ou
--   compara órgãos; não há pontuação nem ranking.
-- - A gestão só lê (grant SELECT no dm-infra, db/migrations/gestao/); os
--   triggers recusam qualquer escrita da sessão gestao_app. Nada é excluído.
-- - Encaminhamentos com órgão e setor de destino, datas e providências são a
--   T14 (migração 011), com FK composta (id, demand_id, organization_id) para
--   o acompanhamento de origem.
--
-- Também: índices da leitura da gestão (fila e recortes por território).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Decisão 16 (Modelo de Conexão §16): o status institucional é subconjunto
-- compatível do status do Processo de Conexão. `acao_programada` virou
-- `aprovada_para_execucao` e entraram `solicitacao_de_informacoes`,
-- `aguardando_documentacao`, `nao_aprovada`, `suspensa` e `cancelada`. Banco
-- novo já nasce assim; banco existente é migrado pela 026
-- (026-connection-processes.sql: RENAME VALUE e ADD VALUE). Por isso as funções
-- SQL abaixo comparam o texto do status: esta migração é reaplicada a cada
-- deploy antes da 026 e não pode citar um rótulo que o enum ainda não tem.
-- Espelho: src/institutional/constants.js.
DO $$ BEGIN
  CREATE TYPE institutional_status AS ENUM (
    'recebida', 'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
    'aprovada_para_execucao', 'em_execucao', 'concluida', 'nao_e_de_competencia',
    'encaminhada_ao_orgao_responsavel', 'aguardando_documentacao', 'nao_aprovada', 'suspensa', 'cancelada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "A resposta poderá informar" (slide 10) e as respostas à análise do Modelo
-- de Conexão §10 (solicitar documentos, reunião, análise técnica e recusar com
-- motivo; banco existente: migração 030, que também cria as colunas deles).
DO $$ BEGIN
  CREATE TYPE institutional_response_type AS ENUM (
    'recebimento', 'analise_em_andamento', 'orgao_ou_setor_responsavel', 'encaminhamento_realizado',
    'programa_publico_relacionado', 'acao_prevista', 'informacoes_adicionais',
    'impossibilidade_com_encaminhamento', 'solicitacao_de_documentos', 'solicitacao_de_reuniao',
    'solicitacao_de_analise_tecnica', 'recusa_com_motivo'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Recursos e formas de apoio" (slide 12).
DO $$ BEGIN
  CREATE TYPE institutional_support_type AS ENUM (
    'recursos_publicos', 'servicos_publicos', 'programas_e_politicas_publicas', 'infraestrutura',
    'equipamentos', 'espacos_publicos', 'equipes', 'conhecimento_tecnico',
    'encaminhamentos_administrativos', 'articulacao_institucional', 'parcerias'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Linha do tempo: o Poder Público passa a ser um ator (antes: agente, gestão, sistema).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_events'::regclass AND conname = 'demand_events_actor_type_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%poder_publico%') THEN
    ALTER TABLE demand_events DROP CONSTRAINT demand_events_actor_type_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_events'::regclass AND conname = 'demand_events_actor_type_check') THEN
    ALTER TABLE demand_events ADD CONSTRAINT demand_events_actor_type_check
      CHECK (actor_type IN ('agente', 'gestao', 'sistema', 'poder_publico'));
  END IF;
END $$;

-- O acompanhamento é a análise do órgão antes da formalização (decisão 13); o
-- Processo de Conexão com protocolo DM-AAAA-NNNNNN é `connection_processes`
-- (migração 026), que grava `process_id` aqui quando o órgão formaliza.
CREATE TABLE IF NOT EXISTS demand_institutional_tracks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id          UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Órgão do Poder Público (user_db.organizations.id, `poder_publico`
  -- `validada` na abertura; outra base, sem FK) e retrato da identificação
  -- pública do órgão na abertura (o nome aparece na página da demanda).
  organization_id    UUID NOT NULL,
  organization_name  VARCHAR(255) NOT NULL CHECK (btrim(organization_name) <> ''),
  government_sphere  VARCHAR(20) CHECK (government_sphere IS NULL OR government_sphere IN ('municipal', 'estadual', 'federal')),
  department         VARCHAR(255),
  municipality       VARCHAR(120),
  uf                 CHAR(2) CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  -- Representante que abriu (auth_db.users.id) e quem fez a última mudança de status.
  opened_by          UUID NOT NULL,
  opened_by_name     VARCHAR(255),
  status             institutional_status NOT NULL DEFAULT 'recebida',
  status_note        TEXT CHECK (status_note IS NULL OR char_length(status_note) <= 2000),
  status_changed_by  UUID,
  -- Responsável pelo acompanhamento no órgão (nome e cargo). Privado. Setor e
  -- data limite (Modelo de Conexão §14) entram na migração 028.
  responsible_name   VARCHAR(255),
  responsible_role   VARCHAR(255),
  received_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluded_at       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_institutional_tracks_unique UNIQUE (demand_id, organization_id),
  -- Alvo das FKs compostas (respostas, ofertas e encaminhamentos da T14).
  CONSTRAINT demand_institutional_tracks_ref UNIQUE (id, demand_id, organization_id),
  CONSTRAINT demand_institutional_tracks_concluded CHECK ((status = 'concluida') = (concluded_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_institutional_tracks_org
  ON demand_institutional_tracks(organization_id, status, status_changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_institutional_tracks_demand
  ON demand_institutional_tracks(demand_id, received_at);

CREATE TABLE IF NOT EXISTS demand_institutional_responses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id            UUID NOT NULL,
  demand_id           UUID NOT NULL,
  organization_id     UUID NOT NULL,
  response_type       institutional_response_type NOT NULL,
  body                TEXT NOT NULL CHECK (btrim(body) <> '' AND char_length(body) <= 5000),
  -- Órgão ou setor responsável (obrigatório no tipo `orgao_ou_setor_responsavel`).
  responsible_sector  VARCHAR(255),
  -- Programa ou serviço público informado (obrigatório em `programa_publico_relacionado`).
  program_name        VARCHAR(255),
  program_url         VARCHAR(1000) CHECK (program_url IS NULL OR program_url ~ '^https://[^[:space:]]+$'),
  -- Data prevista da ação (tipo `acao_prevista`, opcional).
  planned_for         DATE,
  -- Status do acompanhamento quando a resposta foi registrada (gravado pelo trigger).
  track_status        institutional_status NOT NULL,
  -- Representante que respondeu (auth_db.users.id). Privado: o público vê o órgão.
  author_id           UUID NOT NULL,
  author_name         VARCHAR(255),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_institutional_responses_track FOREIGN KEY (track_id, demand_id, organization_id)
    REFERENCES demand_institutional_tracks(id, demand_id, organization_id) ON DELETE RESTRICT,
  CONSTRAINT demand_institutional_responses_sector CHECK (
    response_type <> 'orgao_ou_setor_responsavel' OR coalesce(btrim(responsible_sector), '') <> ''),
  CONSTRAINT demand_institutional_responses_program CHECK (
    response_type <> 'programa_publico_relacionado' OR coalesce(btrim(program_name), '') <> '')
);

CREATE INDEX IF NOT EXISTS idx_institutional_responses_demand
  ON demand_institutional_responses(demand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_institutional_responses_track
  ON demand_institutional_responses(track_id, created_at);

CREATE TABLE IF NOT EXISTS demand_institutional_offers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id         UUID NOT NULL,
  demand_id        UUID NOT NULL,
  organization_id  UUID NOT NULL,
  support_types    institutional_support_type[] NOT NULL
                     CHECK (cardinality(support_types) BETWEEN 1 AND 11),
  description      TEXT NOT NULL CHECK (btrim(description) <> '' AND char_length(description) <= 3000),
  -- Conexão solicitada ao Agente pelas rotas de conexões do user-service.
  connection_id    UUID,
  author_id        UUID NOT NULL,
  author_name      VARCHAR(255),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_institutional_offers_track FOREIGN KEY (track_id, demand_id, organization_id)
    REFERENCES demand_institutional_tracks(id, demand_id, organization_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_institutional_offers_demand
  ON demand_institutional_offers(demand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_institutional_offers_track
  ON demand_institutional_offers(track_id, created_at);

-- ---------------------------------------------------------------------------
-- Transições do status institucional (espelha TRANSITIONS em
-- src/institutional/state-machine.js). Concluída e Cancelada são finais; "Não
-- é de competência", "Encaminhada ao órgão responsável" e "Não aprovada" podem
-- voltar à análise (fato novo, retorno do encaminhamento, reconsideração);
-- Aguardando documentação e Suspensa retomam o fluxo. Compara texto (ver o
-- comentário do enum acima).
CREATE OR REPLACE FUNCTION institutional_status_transition_allowed(
  from_status institutional_status, to_status institutional_status
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE from_status::text
    WHEN 'recebida' THEN to_status::text IN ('em_analise', 'solicitacao_de_informacoes', 'encaminhada',
                                             'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel')
    WHEN 'em_analise' THEN to_status::text IN ('solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
                                               'aprovada_para_execucao', 'em_execucao', 'nao_e_de_competencia',
                                               'encaminhada_ao_orgao_responsavel', 'aguardando_documentacao',
                                               'nao_aprovada', 'suspensa', 'cancelada')
    WHEN 'solicitacao_de_informacoes' THEN to_status::text IN ('em_analise', 'encaminhada', 'em_articulacao',
                                                               'aguardando_documentacao', 'nao_e_de_competencia',
                                                               'nao_aprovada', 'cancelada')
    WHEN 'encaminhada' THEN to_status::text IN ('em_analise', 'solicitacao_de_informacoes', 'em_articulacao',
                                                'aprovada_para_execucao', 'em_execucao', 'nao_e_de_competencia',
                                                'encaminhada_ao_orgao_responsavel', 'nao_aprovada')
    WHEN 'em_articulacao' THEN to_status::text IN ('solicitacao_de_informacoes', 'encaminhada',
                                                   'aprovada_para_execucao', 'em_execucao',
                                                   'encaminhada_ao_orgao_responsavel', 'nao_aprovada', 'suspensa',
                                                   'cancelada')
    WHEN 'aprovada_para_execucao' THEN to_status::text IN ('em_articulacao', 'em_execucao', 'suspensa', 'cancelada')
    WHEN 'em_execucao' THEN to_status::text IN ('concluida', 'suspensa')
    WHEN 'nao_e_de_competencia' THEN to_status::text IN ('em_analise')
    WHEN 'encaminhada_ao_orgao_responsavel' THEN to_status::text IN ('em_analise')
    WHEN 'aguardando_documentacao' THEN to_status::text IN ('em_analise', 'nao_aprovada', 'cancelada')
    WHEN 'nao_aprovada' THEN to_status::text IN ('em_analise')
    WHEN 'suspensa' THEN to_status::text IN ('em_analise', 'em_articulacao', 'aprovada_para_execucao', 'em_execucao',
                                             'cancelada')
    ELSE false
  END
$$;

-- Status que exigem justificativa na mudança (fonte: "impossibilidade de
-- atendimento dentro daquela competência, com o devido encaminhamento";
-- Modelo de Conexão §10: "recusar a demanda informando o motivo").
CREATE OR REPLACE FUNCTION institutional_status_requires_note(to_status institutional_status) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT to_status::text IN ('nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel', 'nao_aprovada', 'suspensa',
                             'cancelada')
$$;

-- A atuação institucional vale para demanda publicada em diante, fora `arquivada`.
CREATE OR REPLACE FUNCTION institutional_assert_demand_open(target UUID) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  st demand_status;
BEGIN
  SELECT status INTO st FROM demands WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF st IN ('em_analise', 'arquivada') THEN
    RAISE EXCEPTION 'atuação institucional só em demanda publicada (estado: %)', st
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION institutional_tracks_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê a atuação institucional' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'acompanhamentos institucionais não são excluídos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM institutional_assert_demand_open(NEW.demand_id);
    IF NEW.status <> 'recebida' OR NEW.status_note IS NOT NULL THEN
      RAISE EXCEPTION 'acompanhamento institucional nasce recebida (recebido: %)', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.received_at := NOW();
    NEW.status_changed_at := NOW();
    NEW.status_changed_by := NEW.opened_by;
    NEW.concluded_at := NULL;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.demand_id, NEW.organization_id, NEW.organization_name, NEW.government_sphere,
      NEW.department, NEW.municipality, NEW.uf, NEW.opened_by, NEW.opened_by_name,
      NEW.received_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.demand_id, OLD.organization_id, OLD.organization_name, OLD.government_sphere,
      OLD.department, OLD.municipality, OLD.uf, OLD.opened_by, OLD.opened_by_name,
      OLD.received_at, OLD.created_at) THEN
    RAISE EXCEPTION 'identidade e abertura do acompanhamento institucional não mudam'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM institutional_assert_demand_open(NEW.demand_id);

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Com Processo de Conexão, o status do acompanhamento espelha o do processo
    -- (decisão 16): o trigger do processo (migração 026) liga `dm.process_mirror`
    -- na própria transação e o salto do processo vale aqui.
    IF NOT institutional_status_transition_allowed(OLD.status, NEW.status)
       AND coalesce(current_setting('dm.process_mirror', true), '') <> 'on' THEN
      RAISE EXCEPTION 'transição institucional não permitida: % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF institutional_status_requires_note(NEW.status) AND coalesce(btrim(NEW.status_note), '') = '' THEN
      RAISE EXCEPTION 'justificativa (status_note) é obrigatória para %', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status_changed_by IS NULL THEN
      RAISE EXCEPTION 'status_changed_by é obrigatório na mudança de status' USING ERRCODE = 'check_violation';
    END IF;
    NEW.status_changed_at := NOW();
    NEW.concluded_at := CASE WHEN NEW.status = 'concluida' THEN NOW() END;
  ELSIF (NEW.status_note, NEW.status_changed_by, NEW.status_changed_at, NEW.concluded_at)
        IS DISTINCT FROM (OLD.status_note, OLD.status_changed_by, OLD.status_changed_at, OLD.concluded_at) THEN
    RAISE EXCEPTION 'nota, autor e datas do status mudam só junto de uma transição'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;


-- Linha do tempo da atuação institucional. payload->'public' é o que a rota
-- pública mostra (órgão, tipo e status; nunca o representante nem ids).
CREATE OR REPLACE FUNCTION institutional_tracks_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'acompanhamento_institucional_aberto', 'poder_publico', NEW.opened_by::text,
      jsonb_build_object(
        'track_id', NEW.id, 'organization_id', NEW.organization_id, 'institutional_status', NEW.status,
        'public', jsonb_build_object(
          'organizationName', NEW.organization_name, 'governmentSphere', NEW.government_sphere,
          'institutionalStatus', NEW.status)),
      true, clock_timestamp());
    RETURN NULL;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'status_institucional_alterado', 'poder_publico', NEW.status_changed_by::text,
      NEW.status_note,
      jsonb_build_object(
        'track_id', NEW.id, 'organization_id', NEW.organization_id,
        'from_institutional_status', OLD.status, 'institutional_status', NEW.status,
        'public', jsonb_build_object(
          'organizationName', NEW.organization_name, 'fromInstitutionalStatus', OLD.status,
          'institutionalStatus', NEW.status, 'note', NEW.status_note)),
      true, clock_timestamp());
  ELSIF (NEW.responsible_name, NEW.responsible_role) IS DISTINCT FROM (OLD.responsible_name, OLD.responsible_role)
        OR to_jsonb(NEW) -> 'responsible_sector' IS DISTINCT FROM to_jsonb(OLD) -> 'responsible_sector'
        OR to_jsonb(NEW) -> 'responsible_due_on' IS DISTINCT FROM to_jsonb(OLD) -> 'responsible_due_on' THEN
    -- Responsável é dado interno do órgão: evento privado (autor e gestão).
    -- Setor e data limite são da migração 028 (lidos por to_jsonb, porque
    -- este arquivo é reaplicado antes dela).
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'responsavel_institucional_definido', 'poder_publico',
      coalesce(nullif(current_setting('dm.actor', true), ''), NEW.status_changed_by::text),
      jsonb_build_object('track_id', NEW.id, 'organization_id', NEW.organization_id),
      false, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

-- Respostas e ofertas: nascem num acompanhamento de demanda publicada; a gestão
-- não escreve; depois de gravadas não mudam nem são excluídas.
CREATE OR REPLACE FUNCTION institutional_entries_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  current_status institutional_status;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê a atuação institucional' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% é somente inserção', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM institutional_assert_demand_open(NEW.demand_id);
  SELECT status INTO current_status FROM demand_institutional_tracks
   WHERE id = NEW.track_id AND demand_id = NEW.demand_id AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acompanhamento institucional inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF TG_TABLE_NAME = 'demand_institutional_responses' THEN
    NEW.track_status := current_status;
  ELSIF TG_TABLE_NAME = 'demand_institutional_offers' THEN
    IF cardinality(NEW.support_types) <> (SELECT count(DISTINCT t) FROM unnest(NEW.support_types) AS t) THEN
      RAISE EXCEPTION 'forma de apoio repetida' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION institutional_entries_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é somente inserção', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

CREATE OR REPLACE FUNCTION institutional_entries_record_event() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  org_name VARCHAR(255);
BEGIN
  SELECT organization_name INTO org_name FROM demand_institutional_tracks WHERE id = NEW.track_id;
  IF TG_TABLE_NAME = 'demand_institutional_responses' THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'resposta_institucional', 'poder_publico', NEW.author_id::text,
      jsonb_build_object(
        'response_id', NEW.id, 'track_id', NEW.track_id, 'organization_id', NEW.organization_id,
        'response_type', NEW.response_type,
        'public', jsonb_build_object(
          'organizationName', org_name, 'responseType', NEW.response_type,
          'institutionalStatus', NEW.track_status, 'programName', NEW.program_name,
          'excerpt', left(NEW.body, 280))),
      true, clock_timestamp());
  ELSE
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (
      NEW.demand_id, 'apoio_institucional_oferecido', 'poder_publico', NEW.author_id::text,
      jsonb_build_object(
        'offer_id', NEW.id, 'track_id', NEW.track_id, 'organization_id', NEW.organization_id,
        'connection_id', NEW.connection_id,
        'public', jsonb_build_object(
          'organizationName', org_name, 'supportTypes', to_jsonb(NEW.support_types))),
      true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS institutional_tracks_guard ON demand_institutional_tracks;
CREATE TRIGGER institutional_tracks_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_institutional_tracks
  FOR EACH ROW EXECUTE FUNCTION institutional_tracks_guard();

DROP TRIGGER IF EXISTS institutional_tracks_block_truncate ON demand_institutional_tracks;
CREATE TRIGGER institutional_tracks_block_truncate
  BEFORE TRUNCATE ON demand_institutional_tracks
  FOR EACH STATEMENT EXECUTE FUNCTION institutional_entries_no_truncate();

DROP TRIGGER IF EXISTS institutional_tracks_record_event ON demand_institutional_tracks;
CREATE TRIGGER institutional_tracks_record_event
  AFTER INSERT OR UPDATE ON demand_institutional_tracks
  FOR EACH ROW EXECUTE FUNCTION institutional_tracks_record_event();

DROP TRIGGER IF EXISTS institutional_responses_guard ON demand_institutional_responses;
CREATE TRIGGER institutional_responses_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_institutional_responses
  FOR EACH ROW EXECUTE FUNCTION institutional_entries_guard();

DROP TRIGGER IF EXISTS institutional_responses_block_truncate ON demand_institutional_responses;
CREATE TRIGGER institutional_responses_block_truncate
  BEFORE TRUNCATE ON demand_institutional_responses
  FOR EACH STATEMENT EXECUTE FUNCTION institutional_entries_no_truncate();

DROP TRIGGER IF EXISTS institutional_responses_record_event ON demand_institutional_responses;
CREATE TRIGGER institutional_responses_record_event
  AFTER INSERT ON demand_institutional_responses
  FOR EACH ROW EXECUTE FUNCTION institutional_entries_record_event();

DROP TRIGGER IF EXISTS institutional_offers_guard ON demand_institutional_offers;
CREATE TRIGGER institutional_offers_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_institutional_offers
  FOR EACH ROW EXECUTE FUNCTION institutional_entries_guard();

DROP TRIGGER IF EXISTS institutional_offers_block_truncate ON demand_institutional_offers;
CREATE TRIGGER institutional_offers_block_truncate
  BEFORE TRUNCATE ON demand_institutional_offers
  FOR EACH STATEMENT EXECUTE FUNCTION institutional_entries_no_truncate();

DROP TRIGGER IF EXISTS institutional_offers_record_event ON demand_institutional_offers;
CREATE TRIGGER institutional_offers_record_event
  AFTER INSERT ON demand_institutional_offers
  FOR EACH ROW EXECUTE FUNCTION institutional_entries_record_event();

-- ---------------------------------------------------------------------------
-- Índices pedidos pela leitura do dm-gestao (fila, recortes por lugar e por
-- território, eventos por tipo, apoios confirmados por post). Parciais: só
-- demanda já enviada entra nos recortes da gestão.
CREATE INDEX IF NOT EXISTS idx_demands_submitted
  ON demands(submitted_at) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demands_place
  ON demands(municipality, territory, submitted_at) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demands_territory
  ON demands(territory) WHERE submitted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_demand_events_type_created
  ON demand_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_supports_post_confirmed
  ON supports(post_id) WHERE status = 'confirmed';
