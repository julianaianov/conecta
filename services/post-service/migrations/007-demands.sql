-- Migração 007: demanda como entidade própria (T06).
--
-- Fonte: dm-docs/fonte-da-verdade/02-fluxo-cadastro-agente-de-transformacao.html
-- e decisões 1, 3, 4, 5 e 7 de decisoes-de-implementacao.md. Contrato com o
-- dm-gestao: dm-docs/gestao/04-modelagem-de-dados.md §3.
--
-- - `demands` é o dado canônico; o post do feed é só a vitrine (posts.demand_id),
--   criado por trigger quando a gestão publica.
-- - Estado: `status` (7 canônicos + `arquivada`) e, enquanto `em_analise`,
--   `review_state` (rascunho → aguardando_analise → devolvida/aprovada). A
--   devolução para ajustes mantém `em_analise` (decisão 7).
-- - Quem age: sessão `gestao_app` = gestão; as demais sessões são o portal, que
--   se declara `sistema` com `SET LOCAL dm.actor_type = 'sistema'` (padrão:
--   `agente`, o autor). As transições permitidas a cada um ficam no trigger
--   demands_guard e espelham services/post-service/src/demand/state-machine.js.
-- - Composição financeira em centavos inteiros: 4% (agente) e 6% (plataforma)
--   sobre o orçamento original, arredondamento meio para cima por parcela,
--   total = base + 4% + 6% (R$ 10.000,00 → R$ 11.000,00). Não há pagamento.
-- - Linha do tempo `demand_events`: só inserção (UPDATE, DELETE e TRUNCATE
--   recusados). As mudanças de estado são gravadas pelo trigger; a gestão não
--   tem INSERT em nenhuma tabela do portal.
-- - Demandas não são excluídas (decisão 7): a moderação arquiva com motivo.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- Os 5 primeiros tipos de demanda; os outros 7 do Modelo de Conexão §03 entram
-- na migração 031 (decisão 15), que também cria `demand_map_class`.
DO $$ BEGIN
  CREATE TYPE demand_category AS ENUM (
    'projeto_social', 'projeto_ambiental', 'necessidade_de_patrocinio',
    'problema_urbano', 'problema_urgente'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE demand_status AS ENUM (
    'em_analise', 'publicada', 'em_busca_de_parceiro', 'conectada',
    'em_execucao', 'concluida', 'prestacao_de_contas', 'arquivada'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE demand_review_state AS ENUM ('rascunho', 'aguardando_analise', 'devolvida', 'aprovada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- "Nível de prioridade conforme critérios definidos pela plataforma": a fonte
-- não lista os níveis; os quatro abaixo são a escolha registrada na T06.
DO $$ BEGIN
  CREATE TYPE demand_priority AS ENUM ('baixa', 'media', 'alta', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Momentos do registro fotográfico e audiovisual no cronograma (slide 14).
DO $$ BEGIN
  CREATE TYPE demand_record_milestone AS ENUM ('antes', 'acompanhamento', 'depois');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE demand_resource_kind AS ENUM ('necessario', 'contrapartida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Recursos necessários (9) e contrapartida (8), slide 16. Os valores comuns às
-- duas listas (materiais, serviços, equipamentos, estrutura) aparecem uma vez.
DO $$ BEGIN
  CREATE TYPE demand_resource_type AS ENUM (
    'recursos_financeiros', 'materiais', 'servicos', 'equipamentos', 'mao_de_obra',
    'estrutura', 'apoio_tecnico', 'conhecimento_especializado',
    'servicos_de_fotografia_e_filmagem',
    'equipe', 'espaco_fisico', 'recursos_proprios', 'conhecimento_tecnico'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Documentação comprobatória, slide 17.
DO $$ BEGIN
  CREATE TYPE demand_document_type AS ENUM (
    'documentos_institucionais', 'estatuto', 'documentos_de_representacao',
    'autorizacoes', 'orcamentos_e_cotacoes', 'projetos_tecnicos', 'fotografias', 'outros'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS demands (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Agente autor (auth_db.users.id) e instituição com CNPJ validada
  -- (user_db.organizations.id, outra base: sem FK). organization_id é fixado no
  -- envio para análise, que exige a instituição `validada` (T06a).
  author_id               UUID NOT NULL,
  organization_id         UUID,
  author_name             VARCHAR(255),
  author_avatar           VARCHAR(500),
  -- Classificação e conteúdo (slides 5 e 8). Colunas anuláveis porque o
  -- rascunho é parcial; o envio exige o conjunto completo (demands_guard).
  category                demand_category,
  title                   VARCHAR(200),
  -- "Problema identificado" e "Área de abrangência" (Modelo §04) são colunas
  -- próprias desde a migração 033 (problem_identified, coverage_area).
  description             TEXT,
  objective               TEXT,
  justification           TEXT,
  beneficiaries_estimate  INTEGER CHECK (beneficiaries_estimate IS NULL OR beneficiaries_estimate > 0),
  beneficiaries_profile   TEXT,
  priority                demand_priority,
  -- Fotografia da situação, local ou projeto: referência (URL https até o
  -- upload da T08).
  photo_ref               VARCHAR(1000),
  -- Localização com CEP e território de abrangência (slide 7).
  cep                     CHAR(8) CHECK (cep IS NULL OR cep ~ '^[0-9]{8}$'),
  street                  VARCHAR(255),
  address_number          VARCHAR(30),
  address_complement      VARCHAR(120),
  district                VARCHAR(120),
  municipality            VARCHAR(120),
  uf                      CHAR(2) CHECK (uf IS NULL OR uf ~ '^[A-Z]{2}$'),
  latitude                DECIMAL(10,8) CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude               DECIMAL(11,8) CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  territory               VARCHAR(255),
  -- Execução física ou intervenção que permita registro: exige item de
  -- fotografia/filmagem no orçamento e marcos antes/depois no cronograma.
  has_physical_execution  BOOLEAN NOT NULL DEFAULT true,
  -- Composição financeira gravada (decisão 5), em centavos inteiros.
  budget_amount_cents     BIGINT NOT NULL DEFAULT 0 CHECK (budget_amount_cents >= 0),
  agent_fee_bps           INTEGER NOT NULL DEFAULT 400,
  platform_fee_bps        INTEGER NOT NULL DEFAULT 600,
  agent_fee_cents         BIGINT NOT NULL DEFAULT 0,
  platform_fee_cents      BIGINT NOT NULL DEFAULT 0,
  total_amount_cents      BIGINT NOT NULL DEFAULT 0,
  -- Estado, análise e moderação.
  status                  demand_status NOT NULL DEFAULT 'em_analise',
  review_state            demand_review_state NOT NULL DEFAULT 'rascunho',
  review_note             TEXT,
  reviewed_by             VARCHAR(255),
  reviewed_at             TIMESTAMPTZ,
  submitted_at            TIMESTAMPTZ,
  published_at            TIMESTAMPTZ,
  archive_reason          TEXT,
  archived_at             TIMESTAMPTZ,
  archived_by             VARCHAR(255),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 4% e 6% são da fonte; mudar o percentual exige nova decisão e migração.
  CONSTRAINT demands_fee_rates CHECK (agent_fee_bps = 400 AND platform_fee_bps = 600),
  -- Modelo de Conexão §04 Obs. (decisão 14): 4% + 6% só se aplica a conexões com
  -- Parceiros/Investidores/Empresas, nunca ao Poder Público. Esta composição é a projeção
  -- "se apoiada por Parceiros/Empresas"; as taxas que valem são as de cada Processo de
  -- Conexão (connection_processes.*_fee_cents, migração 040). Espelhos: src/demand/finance.js,
  -- src/demand/store.js (projectionFor), src/routes/interests.js, src/dossier/ e, no portal,
  -- DemandParts.tsx, ViewerComposition.tsx e OpportunitiesClient.tsx.
  CONSTRAINT demands_financial_composition CHECK (
    agent_fee_cents = round(budget_amount_cents::numeric * agent_fee_bps / 10000)
    AND platform_fee_cents = round(budget_amount_cents::numeric * platform_fee_bps / 10000)
    AND total_amount_cents = budget_amount_cents + agent_fee_cents + platform_fee_cents
  ),
  CONSTRAINT demands_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT demands_review_state_by_status CHECK (
    (status = 'em_analise' AND review_state <> 'aprovada')
    OR (status = 'arquivada')
    OR (status NOT IN ('em_analise', 'arquivada') AND review_state = 'aprovada')
  )
);

CREATE INDEX IF NOT EXISTS idx_demands_author ON demands(author_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demands_organization ON demands(organization_id);
CREATE INDEX IF NOT EXISTS idx_demands_status ON demands(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_demands_category ON demands(category);
-- Fila de análise do dm-gestao.
CREATE INDEX IF NOT EXISTS idx_demands_review_queue
  ON demands(submitted_at) WHERE status = 'em_analise' AND review_state = 'aguardando_analise';

-- Cronograma de execução (slides 13 e 14): etapa, atividades, início, término,
-- responsável e os momentos de registro fotográfico/audiovisual.
-- Recursos necessários e valor associado da etapa (Modelo §05): migração 033;
-- o status da etapa é o da execução (migrações 014 e 034).
CREATE TABLE IF NOT EXISTS demand_schedule_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id         UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  position          INTEGER NOT NULL DEFAULT 0,
  stage             VARCHAR(255) NOT NULL CHECK (btrim(stage) <> ''),
  activities        TEXT NOT NULL CHECK (btrim(activities) <> ''),
  starts_on         DATE NOT NULL,
  ends_on           DATE NOT NULL,
  responsible       VARCHAR(255),
  record_milestones demand_record_milestone[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_schedule_items_dates CHECK (ends_on >= starts_on),
  CONSTRAINT demand_schedule_items_demand_id UNIQUE (demand_id, id)
);

CREATE INDEX IF NOT EXISTS idx_demand_schedule_items_demand ON demand_schedule_items(demand_id, position);

-- Orçamento detalhado (slides 9–12). O vínculo com a etapa do cronograma forma
-- o cronograma físico-financeiro; a FK composta garante que a etapa é da mesma
-- demanda. total_cents = round(quantidade × valor unitário), meio para cima.
-- Item e fornecedor/referência (Modelo §04): migração 033; importação da
-- planilha CSV em src/demand/budget-import.js.
CREATE TABLE IF NOT EXISTS demand_budget_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id              UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  position               INTEGER NOT NULL DEFAULT 0,
  description            VARCHAR(500) NOT NULL CHECK (btrim(description) <> ''),
  quantity               NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
  unit                   VARCHAR(30) NOT NULL CHECK (btrim(unit) <> ''),
  unit_price_cents       BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  total_cents            BIGINT NOT NULL,
  -- Registro fotográfico e audiovisual do antes e do depois (fotografia e filmagem).
  is_audiovisual_record  BOOLEAN NOT NULL DEFAULT false,
  schedule_item_id       UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_budget_items_total CHECK (total_cents = round(quantity * unit_price_cents)),
  CONSTRAINT demand_budget_items_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE SET NULL (schedule_item_id)
);

CREATE INDEX IF NOT EXISTS idx_demand_budget_items_demand ON demand_budget_items(demand_id, position);
CREATE INDEX IF NOT EXISTS idx_demand_budget_items_schedule ON demand_budget_items(schedule_item_id);

-- Metas e resultados esperados (slide 15).
CREATE TABLE IF NOT EXISTS demand_goals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id           UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL DEFAULT 0,
  goal                TEXT NOT NULL CHECK (btrim(goal) <> ''),
  expected_result     TEXT NOT NULL CHECK (btrim(expected_result) <> ''),
  indicator           TEXT NOT NULL CHECK (btrim(indicator) <> ''),
  measurement_method  TEXT NOT NULL CHECK (btrim(measurement_method) <> ''),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_goals_demand ON demand_goals(demand_id, position);

-- Recursos necessários e contrapartida (slide 16).
CREATE TABLE IF NOT EXISTS demand_resources (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id      UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  kind           demand_resource_kind NOT NULL,
  resource_type  demand_resource_type NOT NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_resources_unique UNIQUE (demand_id, kind, resource_type),
  CONSTRAINT demand_resources_type_by_kind CHECK (
    (kind = 'necessario' AND resource_type IN (
      'recursos_financeiros', 'materiais', 'servicos', 'equipamentos', 'mao_de_obra',
      'estrutura', 'apoio_tecnico', 'conhecimento_especializado',
      'servicos_de_fotografia_e_filmagem'))
    OR (kind = 'contrapartida' AND resource_type IN (
      'equipe', 'espaco_fisico', 'equipamentos', 'materiais', 'servicos',
      'estrutura', 'recursos_proprios', 'conhecimento_tecnico'))
  )
);

CREATE INDEX IF NOT EXISTS idx_demand_resources_demand ON demand_resources(demand_id, kind, position);

-- Documentação comprobatória, quando aplicável (slide 17). `reference`: URL
-- https até o upload da T08.
-- TODO(fonte-da-verdade): Modelo de Conexão §17 — documento sem versão, status, instituição e
-- permissão de acesso, e vinculado à demanda em vez do processo de conexão.
CREATE TABLE IF NOT EXISTS demand_documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id      UUID NOT NULL REFERENCES demands(id) ON DELETE CASCADE,
  position       INTEGER NOT NULL DEFAULT 0,
  document_type  demand_document_type NOT NULL,
  title          VARCHAR(255) NOT NULL CHECK (btrim(title) <> ''),
  reference      VARCHAR(1000) NOT NULL CHECK (btrim(reference) <> ''),
  description    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_documents_demand ON demand_documents(demand_id, position);

-- Histórico / linha do tempo (só inserção). `is_public`: entra na linha do
-- tempo pública (publicação em diante); criação, envio, devolução e
-- arquivamento são privados (autor e gestão). event_type é texto livre para
-- a T11 acrescentar interações, respostas, encaminhamentos e evidências.
CREATE TABLE IF NOT EXISTS demand_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id     UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  event_type    VARCHAR(60) NOT NULL CHECK (event_type ~ '^[a-z_]+$'),
  from_status   demand_status,
  to_status     demand_status,
  review_state  demand_review_state,
  actor_type    VARCHAR(20) NOT NULL CHECK (actor_type IN ('agente', 'gestao', 'sistema')),
  actor         VARCHAR(255),
  note          TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  is_public     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demand_events_demand ON demand_events(demand_id, created_at);

-- Vitrine no feed e no mapa (decisão 1): um post por demanda publicada.
ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS demand_id UUID REFERENCES demands(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_demand ON posts(demand_id);

-- ---------------------------------------------------------------------------
-- Quem age. `gestao_app` é a equipe da plataforma (dm-gestao); o portal se
-- declara `sistema` por transação (SET LOCAL dm.actor_type = 'sistema') e, sem
-- declaração, age como o agente autor.
CREATE OR REPLACE FUNCTION demand_actor_type() RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN session_user = 'gestao_app' THEN 'gestao'
    WHEN current_setting('dm.actor_type', true) = 'sistema' THEN 'sistema'
    ELSE 'agente'
  END
$$;

-- Transições de status fora da análise (espelha ACTIONS em state-machine.js).
CREATE OR REPLACE FUNCTION demand_status_transition_allowed(
  from_status demand_status, to_status demand_status, actor TEXT
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN (from_status, to_status) = ('publicada'::demand_status, 'em_busca_de_parceiro'::demand_status)
      THEN actor IN ('agente', 'sistema')
    WHEN to_status = 'conectada' AND from_status IN ('publicada', 'em_busca_de_parceiro')
      THEN actor IN ('agente', 'sistema')
    WHEN (from_status, to_status) IN (
      ('conectada'::demand_status, 'em_execucao'::demand_status),
      ('em_execucao'::demand_status, 'concluida'::demand_status),
      ('concluida'::demand_status, 'prestacao_de_contas'::demand_status))
      THEN actor = 'agente'
    ELSE false
  END
$$;

-- Conferência estrutural do envio para análise (a validação completa, com
-- mensagens por campo, é a de src/demand/validation.js; esta é a rede de
-- segurança do banco).
CREATE OR REPLACE FUNCTION demand_assert_submittable(d demands) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  missing TEXT[] := '{}';
  items_total BIGINT;
  items_count INTEGER;
BEGIN
  IF d.organization_id IS NULL THEN missing := array_append(missing, 'organization_id'); END IF;
  IF d.category IS NULL THEN missing := array_append(missing, 'category'); END IF;
  IF d.priority IS NULL THEN missing := array_append(missing, 'priority'); END IF;
  IF d.beneficiaries_estimate IS NULL THEN missing := array_append(missing, 'beneficiaries_estimate'); END IF;
  IF d.cep IS NULL THEN missing := array_append(missing, 'cep'); END IF;
  IF coalesce(btrim(d.title), '') = '' THEN missing := array_append(missing, 'title'); END IF;
  IF coalesce(btrim(d.description), '') = '' THEN missing := array_append(missing, 'description'); END IF;
  IF coalesce(btrim(d.objective), '') = '' THEN missing := array_append(missing, 'objective'); END IF;
  IF coalesce(btrim(d.justification), '') = '' THEN missing := array_append(missing, 'justification'); END IF;
  IF coalesce(btrim(d.beneficiaries_profile), '') = '' THEN missing := array_append(missing, 'beneficiaries_profile'); END IF;
  IF coalesce(btrim(d.photo_ref), '') = '' THEN missing := array_append(missing, 'photo_ref'); END IF;
  IF coalesce(btrim(d.municipality), '') = '' THEN missing := array_append(missing, 'municipality'); END IF;
  IF d.uf IS NULL THEN missing := array_append(missing, 'uf'); END IF;
  IF coalesce(btrim(d.territory), '') = '' THEN missing := array_append(missing, 'territory'); END IF;

  SELECT count(*), coalesce(sum(total_cents), 0) INTO items_count, items_total
    FROM demand_budget_items WHERE demand_id = d.id;
  IF items_count = 0 THEN missing := array_append(missing, 'budget_items'); END IF;
  IF NOT EXISTS (SELECT 1 FROM demand_schedule_items WHERE demand_id = d.id) THEN
    missing := array_append(missing, 'schedule_items');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM demand_goals WHERE demand_id = d.id) THEN
    missing := array_append(missing, 'goals');
  END IF;
  IF d.has_physical_execution THEN
    IF NOT EXISTS (SELECT 1 FROM demand_budget_items
                    WHERE demand_id = d.id AND is_audiovisual_record AND total_cents > 0) THEN
      missing := array_append(missing, 'budget_items.audiovisual_record');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM demand_schedule_items
                    WHERE demand_id = d.id AND 'antes' = ANY (record_milestones)) THEN
      missing := array_append(missing, 'schedule_items.antes');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM demand_schedule_items
                    WHERE demand_id = d.id AND 'depois' = ANY (record_milestones)) THEN
      missing := array_append(missing, 'schedule_items.depois');
    END IF;
  END IF;

  IF cardinality(missing) > 0 THEN
    RAISE EXCEPTION 'demanda incompleta para envio: %', array_to_string(missing, ', ')
      USING ERRCODE = 'check_violation';
  END IF;
  IF d.budget_amount_cents <= 0 OR d.budget_amount_cents <> items_total THEN
    RAISE EXCEPTION 'orçamento da demanda (%) não confere com a soma dos itens (%)',
      d.budget_amount_cents, items_total USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- Regras de estado e de edição da demanda.
CREATE OR REPLACE FUNCTION demands_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  actor TEXT := demand_actor_type();
  editable BOOLEAN;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'demandas não são excluídas: a moderação arquiva com motivo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF actor = 'gestao' THEN
      RAISE EXCEPTION 'a gestão não cria demandas' USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status <> 'em_analise' OR NEW.review_state <> 'rascunho' THEN
      RAISE EXCEPTION 'demanda nasce em análise, como rascunho (recebido: %/%)', NEW.status, NEW.review_state
        USING ERRCODE = 'check_violation';
    END IF;
    IF num_nonnulls(NEW.review_note, NEW.reviewed_by, NEW.reviewed_at, NEW.submitted_at,
                    NEW.published_at, NEW.archive_reason, NEW.archived_at, NEW.archived_by) > 0 THEN
      RAISE EXCEPTION 'campos de análise são preenchidos só pela análise' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF NEW.id <> OLD.id OR NEW.author_id <> OLD.author_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'identidade e autoria da demanda não mudam' USING ERRCODE = 'check_violation';
  END IF;

  -- Campos que só a análise grava (ou que o próprio trigger deriva).
  IF actor <> 'gestao' AND (NEW.review_note, NEW.reviewed_by, NEW.reviewed_at, NEW.submitted_at,
      NEW.published_at, NEW.archive_reason, NEW.archived_at, NEW.archived_by)
      IS DISTINCT FROM (OLD.review_note, OLD.reviewed_by, OLD.reviewed_at, OLD.submitted_at,
      OLD.published_at, OLD.archive_reason, OLD.archived_at, OLD.archived_by) THEN
    RAISE EXCEPTION 'campos de análise e moderação são gravados só pela gestão'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF actor = 'gestao' AND (NEW.reviewed_at, NEW.submitted_at, NEW.published_at, NEW.archived_at, NEW.archived_by)
      IS DISTINCT FROM (OLD.reviewed_at, OLD.submitted_at, OLD.published_at, OLD.archived_at, OLD.archived_by) THEN
    RAISE EXCEPTION 'datas e autoria da análise são preenchidas pelo trigger' USING ERRCODE = 'check_violation';
  END IF;

  -- Conteúdo só muda em rascunho ou devolvida (o dossiê analisado não se altera).
  editable := OLD.status = 'em_analise' AND OLD.review_state IN ('rascunho', 'devolvida');
  IF NOT editable AND (
      NEW.organization_id, NEW.author_name, NEW.author_avatar, NEW.category, NEW.title,
      NEW.description, NEW.objective, NEW.justification, NEW.beneficiaries_estimate,
      NEW.beneficiaries_profile, NEW.priority, NEW.photo_ref, NEW.cep, NEW.street,
      NEW.address_number, NEW.address_complement, NEW.district, NEW.municipality, NEW.uf,
      NEW.latitude, NEW.longitude, NEW.territory, NEW.has_physical_execution,
      NEW.budget_amount_cents, NEW.agent_fee_cents, NEW.platform_fee_cents, NEW.total_amount_cents
    ) IS DISTINCT FROM (
      OLD.organization_id, OLD.author_name, OLD.author_avatar, OLD.category, OLD.title,
      OLD.description, OLD.objective, OLD.justification, OLD.beneficiaries_estimate,
      OLD.beneficiaries_profile, OLD.priority, OLD.photo_ref, OLD.cep, OLD.street,
      OLD.address_number, OLD.address_complement, OLD.district, OLD.municipality, OLD.uf,
      OLD.latitude, OLD.longitude, OLD.territory, OLD.has_physical_execution,
      OLD.budget_amount_cents, OLD.agent_fee_cents, OLD.platform_fee_cents, OLD.total_amount_cents
    ) THEN
    RAISE EXCEPTION 'a demanda só é editada em rascunho ou devolvida (estado: %/%)', OLD.status, OLD.review_state
      USING ERRCODE = 'check_violation';
  END IF;

  IF (NEW.status, NEW.review_state) IS NOT DISTINCT FROM (OLD.status, OLD.review_state) THEN
    IF actor = 'gestao' THEN
      RAISE EXCEPTION 'a gestão grava parecer, revisor e motivo junto de uma decisão (publicar, devolver ou arquivar)'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF actor = 'gestao' THEN
    IF coalesce(btrim(NEW.reviewed_by), '') = '' THEN
      RAISE EXCEPTION 'reviewed_by é obrigatório na decisão da gestão' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'arquivada' AND OLD.status <> 'arquivada' AND NEW.review_state = OLD.review_state THEN
      IF coalesce(btrim(NEW.archive_reason), '') = '' THEN
        RAISE EXCEPTION 'motivo (archive_reason) é obrigatório para arquivar' USING ERRCODE = 'check_violation';
      END IF;
      NEW.archived_at := NOW();
      NEW.archived_by := NEW.reviewed_by;
    ELSIF OLD.status = 'em_analise' AND OLD.review_state = 'aguardando_analise'
          AND NEW.status = 'publicada' AND NEW.review_state IN ('aguardando_analise', 'aprovada') THEN
      NEW.review_state := 'aprovada';
      NEW.published_at := NOW();
    ELSIF OLD.status = 'em_analise' AND NEW.status = 'em_analise'
          AND OLD.review_state = 'aguardando_analise' AND NEW.review_state = 'devolvida' THEN
      IF coalesce(btrim(NEW.review_note), '') = '' THEN
        RAISE EXCEPTION 'parecer (review_note) é obrigatório na devolução' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'transição não permitida à gestão: %/% → %/%',
        OLD.status, OLD.review_state, NEW.status, NEW.review_state USING ERRCODE = 'check_violation';
    END IF;
    NEW.reviewed_at := NOW();
  ELSIF OLD.status = 'em_analise' AND NEW.status = 'em_analise'
        AND OLD.review_state IN ('rascunho', 'devolvida') AND NEW.review_state = 'aguardando_analise'
        AND actor = 'agente' THEN
    -- Envio (ou reenvio) para análise; o parecer anterior fica na linha do tempo.
    PERFORM demand_assert_submittable(NEW);
    NEW.submitted_at := NOW();
    NEW.review_note := NULL;
  ELSIF NEW.review_state IS DISTINCT FROM OLD.review_state
        OR NOT demand_status_transition_allowed(OLD.status, NEW.status, actor) THEN
    RAISE EXCEPTION 'transição não permitida (%): %/% → %/%',
      actor, OLD.status, OLD.review_state, NEW.status, NEW.review_state USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

-- Linha do tempo das mudanças de estado e vitrine no feed. SECURITY DEFINER:
-- o gestao_app não tem INSERT em demand_events nem em posts; o registro e o
-- post-vitrine são consequência da decisão gravada em demands.
CREATE OR REPLACE FUNCTION demands_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  actor_kind TEXT := demand_actor_type();
  actor_id   VARCHAR(255);
  kind       TEXT;
  note_text  TEXT;
  public_evt BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW.review_state) IS NOT DISTINCT FROM (OLD.status, OLD.review_state) THEN
    RETURN NULL;
  END IF;

  IF actor_kind = 'gestao' THEN
    actor_id := NEW.reviewed_by;
  ELSIF actor_kind = 'sistema' THEN
    actor_id := coalesce(nullif(current_setting('dm.actor', true), ''), 'sistema');
  ELSE
    actor_id := NEW.author_id::text;
  END IF;

  IF TG_OP = 'INSERT' THEN
    kind := 'criada';
  ELSIF NEW.status = 'arquivada' THEN
    kind := 'arquivada';
    note_text := NEW.archive_reason;
  ELSIF NEW.status = 'publicada' AND OLD.status = 'em_analise' THEN
    kind := 'publicada';
    note_text := NEW.review_note;
    public_evt := true;
  ELSIF NEW.review_state = 'devolvida' THEN
    kind := 'devolvida_para_ajustes';
    note_text := NEW.review_note;
  ELSIF NEW.review_state = 'aguardando_analise' THEN
    kind := 'enviada_para_analise';
  ELSE
    kind := 'status_alterado';
    public_evt := true;
  END IF;

  INSERT INTO demand_events (demand_id, event_type, from_status, to_status, review_state,
                             actor_type, actor, note, payload, is_public)
  VALUES (
    NEW.id, kind,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.status END,
    NEW.status, NEW.review_state, actor_kind, actor_id, note_text,
    CASE WHEN TG_OP = 'UPDATE' AND kind = 'enviada_para_analise'
         THEN jsonb_build_object('reenvio', OLD.review_state = 'devolvida',
                                 'budget_amount_cents', NEW.budget_amount_cents,
                                 'total_amount_cents', NEW.total_amount_cents)
         ELSE '{}'::jsonb END,
    public_evt
  );

  IF kind = 'publicada' THEN
    INSERT INTO posts (author_id, author_name, author_avatar, type, title, description, status,
                       latitude, longitude, neighborhood, city, state, zipcode, images, demand_id)
    VALUES (
      NEW.author_id, NEW.author_name, NEW.author_avatar,
      (CASE NEW.category
         WHEN 'necessidade_de_patrocinio' THEN 'need'
         WHEN 'problema_urbano' THEN 'problem'
         WHEN 'problema_urgente' THEN 'problem'
         ELSE 'project'
       END)::post_type,
      NEW.title, NEW.description, 'active',
      NEW.latitude, NEW.longitude, coalesce(NEW.territory, NEW.district), NEW.municipality,
      NEW.uf, NEW.cep, ARRAY[NEW.photo_ref], NEW.id
    )
    ON CONFLICT (demand_id) DO NOTHING;
  ELSIF kind = 'arquivada' THEN
    UPDATE posts
       SET visibility = 'hidden', moderation_reason = NEW.archive_reason,
           moderated_at = NOW(), moderated_by = NEW.archived_by
     WHERE demand_id = NEW.id;
  END IF;
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION demands_record_event() FROM PUBLIC;

-- Itens (orçamento, cronograma, metas, recursos, documentos) só mudam enquanto
-- a demanda está em rascunho ou devolvida.
CREATE OR REPLACE FUNCTION demand_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  target UUID;
  st     demand_status;
  rs     demand_review_state;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.demand_id <> OLD.demand_id THEN
    RAISE EXCEPTION 'item não muda de demanda' USING ERRCODE = 'check_violation';
  END IF;
  target := CASE WHEN TG_OP = 'DELETE' THEN OLD.demand_id ELSE NEW.demand_id END;
  SELECT status, review_state INTO st, rs FROM demands WHERE id = target;
  IF FOUND AND NOT (st = 'em_analise' AND rs IN ('rascunho', 'devolvida')) THEN
    RAISE EXCEPTION '% só muda com a demanda em rascunho ou devolvida (estado: %/%)', TG_TABLE_NAME, st, rs
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'demand_events é somente inserção' USING ERRCODE = 'insufficient_privilege';
END
$$;

-- O post-vitrine espelha a demanda: não é excluído nem tem o conteúdo editado
-- pelas rotas de posts (a moderação continua alternando `visibility`, e os
-- contadores de reação, comentário e visualização continuam mudando).
CREATE OR REPLACE FUNCTION posts_demand_showcase_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.demand_id IS NOT NULL THEN
      RAISE EXCEPTION 'post-vitrine de demanda não é excluído: a moderação arquiva a demanda'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.demand_id IS NOT NULL AND (
      NEW.demand_id, NEW.author_id, NEW.type, NEW.title, NEW.description, NEW.status, NEW.latitude,
      NEW.longitude, NEW.neighborhood, NEW.city, NEW.state, NEW.zipcode, NEW.images, NEW.videos
    ) IS DISTINCT FROM (
      OLD.demand_id, OLD.author_id, OLD.type, OLD.title, OLD.description, OLD.status, OLD.latitude,
      OLD.longitude, OLD.neighborhood, OLD.city, OLD.state, OLD.zipcode, OLD.images, OLD.videos
    ) THEN
    RAISE EXCEPTION 'post-vitrine de demanda: o conteúdo vem da demanda' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.demand_id IS NOT NULL AND NEW.visibility = 'visible' AND OLD.visibility <> 'visible'
     AND EXISTS (SELECT 1 FROM demands WHERE id = OLD.demand_id AND status = 'arquivada') THEN
    RAISE EXCEPTION 'demanda arquivada: o post-vitrine fica oculto' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.demand_id IS NULL AND NEW.demand_id IS NOT NULL THEN
    RAISE EXCEPTION 'post existente não vira vitrine de demanda (decisão 7)' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS posts_demand_showcase_guard ON posts;
CREATE TRIGGER posts_demand_showcase_guard
  BEFORE UPDATE OR DELETE ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_demand_showcase_guard();

DROP TRIGGER IF EXISTS demands_guard ON demands;
CREATE TRIGGER demands_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demands
  FOR EACH ROW EXECUTE FUNCTION demands_guard();

-- TODO(fonte-da-verdade): Modelo de Conexão §07 — na publicação (kind publicada) não se identificam
-- potenciais conexões (território, competência institucional, valor, público, programas, interesse
-- cadastrado) para mostrar ao Agente e aos apoiadores; ver TODO em src/interest/compatibility.js.
DROP TRIGGER IF EXISTS demands_record_event ON demands;
CREATE TRIGGER demands_record_event
  AFTER INSERT OR UPDATE ON demands
  FOR EACH ROW EXECUTE FUNCTION demands_record_event();

DROP TRIGGER IF EXISTS demand_schedule_items_guard ON demand_schedule_items;
CREATE TRIGGER demand_schedule_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_schedule_items
  FOR EACH ROW EXECUTE FUNCTION demand_items_guard();

DROP TRIGGER IF EXISTS demand_budget_items_guard ON demand_budget_items;
CREATE TRIGGER demand_budget_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_budget_items
  FOR EACH ROW EXECUTE FUNCTION demand_items_guard();

DROP TRIGGER IF EXISTS demand_goals_guard ON demand_goals;
CREATE TRIGGER demand_goals_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_goals
  FOR EACH ROW EXECUTE FUNCTION demand_items_guard();

DROP TRIGGER IF EXISTS demand_resources_guard ON demand_resources;
CREATE TRIGGER demand_resources_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_resources
  FOR EACH ROW EXECUTE FUNCTION demand_items_guard();

DROP TRIGGER IF EXISTS demand_documents_guard ON demand_documents;
CREATE TRIGGER demand_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_documents
  FOR EACH ROW EXECUTE FUNCTION demand_items_guard();

DROP TRIGGER IF EXISTS demand_events_block_changes ON demand_events;
CREATE TRIGGER demand_events_block_changes
  BEFORE UPDATE OR DELETE ON demand_events
  FOR EACH ROW EXECUTE FUNCTION demand_events_immutable();

DROP TRIGGER IF EXISTS demand_events_block_truncate ON demand_events;
CREATE TRIGGER demand_events_block_truncate
  BEFORE TRUNCATE ON demand_events
  FOR EACH STATEMENT EXECUTE FUNCTION demand_events_immutable();
