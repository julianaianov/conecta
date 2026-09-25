-- Migração 015: prestação de contas e prestação de resultados (T18).
--
-- Fonte: dm-docs/fonte-da-verdade/02-fluxo-cadastro-agente-de-transformacao.html
-- — slide 24 ("Etapa 10 · Prestação de resultados": ao longo e ao final da
-- execução deverão ser registrados documentos e evidências, incluindo,
-- obrigatoriamente quando aplicável: fotos do antes e depois, filmagem do
-- antes e depois, registros das ações realizadas, comprovantes financeiros
-- quando aplicável, relatórios de execução, atualização do cronograma, número
-- de beneficiários, resultados alcançados e indicadores de impacto; "os
-- registros de antes e depois deverão estar vinculados à demanda"), slide 15
-- (cada demanda apresenta metas, resultados esperados, indicadores de
-- acompanhamento e a forma de mensuração dos resultados — a prestação fecha
-- cada um deles com o valor medido), slide 23 (acompanhamento e execução
-- orçamentária, que a T17 já registra) e slide 25, passo 18 ("Resultados +
-- prestação de contas"). Contrato com o dm-gestao:
-- dm-docs/gestao/04-modelagem-de-dados.md §3.13.
--
-- - `demand_accountability`: um registro final por demanda, criado com a
--   demanda no status `prestacao_de_contas`. Enquanto `rascunho` o Agente
--   monta; ao concluir (`concluida`) tudo congela, entra na linha do tempo
--   pública e gera uma versão nova do dossiê (T10, `trigger_kind`
--   `prestacao_de_contas`).
-- - `demand_accountability_results`: o resultado alcançado de cada meta
--   declarada na T06 (`demand_goals`), com o valor medido, a forma de
--   mensuração usada, se a meta foi cumprida e a evidência (T17) que comprova.
-- - `demand_accountability_documents`: comprovantes financeiros, relatórios de
--   execução e registros das ações, como uploads confirmados da T08
--   (finalidade `demand_accountability_document`).
--
-- Obrigatoriedade (slide 24, "obrigatoriamente quando aplicável"): o que é
-- sempre exigido (relatório de execução, atualização do cronograma, registro
-- das ações, número de beneficiários alcançados, indicadores de impacto e um
-- resultado por meta) fica no CHECK `demand_accountability_concluded`; o que é
-- condicional (evidência `antes`/`depois` quando há execução física sem
-- dispensa; comprovante financeiro e resumo financeiro quando há apoio
-- financeiro declarado) fica no trigger `demand_accountability_guard`, que lê a
-- demanda, as evidências da T17 e os documentos.
--
-- Imutabilidade: a prestação concluída não muda nem é excluída; nada aqui é
-- apagado; a gestão só lê (grant no dm-infra,
-- db/migrations/gestao/015-gestao-app-post-accountability.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

DO $$ BEGIN
  CREATE TYPE demand_accountability_status AS ENUM ('rascunho', 'concluida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipos de anexo da prestação (slide 24).
-- Laudos, certificados, notas fiscais e registros técnicos (Modelo de Conexão
-- §20) entram pela migração 035.
DO $$ BEGIN
  CREATE TYPE demand_accountability_document_kind AS ENUM (
    'comprovante_financeiro', 'relatorio_execucao', 'registro_acao', 'outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A FK composta do resultado por meta precisa da chave (demand_id, id), que a
-- migração 007 não criou em demand_goals.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_goals'::regclass AND conname = 'demand_goals_demand_id') THEN
    ALTER TABLE demand_goals ADD CONSTRAINT demand_goals_demand_id UNIQUE (demand_id, id);
  END IF;
END $$;

-- Finalidade de upload dos anexos da prestação (T08). A coluna `purpose` é
-- texto com CHECK (a migração 009 já a reescreveu para incluir o dossiê).
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
  'demand_photo', 'demand_evidence_photo', 'demand_evidence_video', 'demand_document',
  'demand_dossier', 'demand_accountability_document')) NOT VALID; -- NOT VALID: ver 009

-- ── Registro final da demanda ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demand_accountability (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id                UUID NOT NULL UNIQUE REFERENCES demands(id) ON DELETE RESTRICT,
  -- Sempre o Agente autor da demanda (o trigger confere).
  author_id                UUID NOT NULL,
  author_name              VARCHAR(255),
  status                   demand_accountability_status NOT NULL DEFAULT 'rascunho',
  -- Relatório de execução (texto estruturado) e registros das ações realizadas.
  execution_report         TEXT CHECK (execution_report IS NULL
                                       OR (btrim(execution_report) <> ''
                                           AND char_length(execution_report) <= 20000)),
  actions_record           TEXT CHECK (actions_record IS NULL
                                       OR (btrim(actions_record) <> ''
                                           AND char_length(actions_record) <= 8000)),
  -- Atualização final do cronograma (slide 24).
  schedule_summary         TEXT CHECK (schedule_summary IS NULL
                                       OR (btrim(schedule_summary) <> ''
                                           AND char_length(schedule_summary) <= 8000)),
  -- Número de beneficiários alcançados, contra a estimativa da T06 (congelada
  -- na conclusão para o dossiê não mudar de sentido depois).
  beneficiaries_reached    INTEGER CHECK (beneficiaries_reached IS NULL
                                          OR (beneficiaries_reached >= 0 AND beneficiaries_reached <= 100000000)),
  beneficiaries_estimate   INTEGER CHECK (beneficiaries_estimate IS NULL OR beneficiaries_estimate >= 0),
  beneficiaries_note       TEXT CHECK (beneficiaries_note IS NULL
                                       OR (btrim(beneficiaries_note) <> ''
                                           AND char_length(beneficiaries_note) <= 4000)),
  -- Indicadores de impacto (slide 24) — o efeito no território, além da meta.
  impact_indicators        TEXT CHECK (impact_indicators IS NULL
                                       OR (btrim(impact_indicators) <> ''
                                           AND char_length(impact_indicators) <= 8000)),
  -- Apoio financeiro declarado: liga a exigência de comprovante financeiro e
  -- de resumo financeiro ("comprovantes financeiros, quando aplicável").
  financial_support        BOOLEAN NOT NULL DEFAULT FALSE,
  financial_summary        TEXT CHECK (financial_summary IS NULL
                                       OR (btrim(financial_summary) <> ''
                                           AND char_length(financial_summary) <= 8000)),
  -- Total executado declarado pelo Agente; a T17 tem o executado lançado.
  executed_amount_cents    BIGINT CHECK (executed_amount_cents IS NULL
                                         OR (executed_amount_cents >= 0
                                             AND executed_amount_cents <= 9999999999)),
  concluded_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_accountability_demand_id UNIQUE (demand_id, id),
  CONSTRAINT demand_accountability_concluded_at CHECK (
    (status = 'concluida') = (concluded_at IS NOT NULL)),
  -- O que a fonte exige sempre na prestação concluída. O condicional
  -- (evidências, comprovante financeiro) fica no trigger, que lê outras tabelas.
  CONSTRAINT demand_accountability_concluded CHECK (
    status <> 'concluida' OR (
      execution_report IS NOT NULL
      AND actions_record IS NOT NULL
      AND schedule_summary IS NOT NULL
      AND beneficiaries_reached IS NOT NULL
      AND impact_indicators IS NOT NULL
      AND (financial_support = FALSE OR financial_summary IS NOT NULL)))
);

CREATE INDEX IF NOT EXISTS idx_demand_accountability_status
  ON demand_accountability(status, concluded_at DESC);

-- ── Resultado alcançado por meta/indicador declarado na T06 (slide 15) ───────
CREATE TABLE IF NOT EXISTS demand_accountability_results (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accountability_id   UUID NOT NULL REFERENCES demand_accountability(id) ON DELETE RESTRICT,
  demand_id           UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  goal_id             UUID NOT NULL,
  position            INTEGER NOT NULL DEFAULT 0,
  -- Retrato da meta no momento da prestação (a meta não muda mais, mas o
  -- dossiê precisa ser legível sozinho).
  goal_snapshot       TEXT NOT NULL CHECK (btrim(goal_snapshot) <> ''),
  indicator_snapshot  TEXT NOT NULL CHECK (btrim(indicator_snapshot) <> ''),
  -- Valor medido e a forma de mensuração efetivamente usada (slide 15).
  measured_value      TEXT NOT NULL CHECK (btrim(measured_value) <> ''
                                           AND char_length(measured_value) <= 500),
  measurement_method  TEXT NOT NULL CHECK (btrim(measurement_method) <> ''
                                           AND char_length(measurement_method) <= 2000),
  achieved            BOOLEAN NOT NULL,
  note                TEXT CHECK (note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 4000)),
  -- Evidência da T17 que comprova o resultado (opcional).
  evidence_id         UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_accountability_results_goal UNIQUE (accountability_id, goal_id),
  CONSTRAINT demand_accountability_results_parent FOREIGN KEY (demand_id, accountability_id)
    REFERENCES demand_accountability(demand_id, id) ON DELETE RESTRICT,
  CONSTRAINT demand_accountability_results_goal_fk FOREIGN KEY (demand_id, goal_id)
    REFERENCES demand_goals(demand_id, id) ON DELETE RESTRICT,
  CONSTRAINT demand_accountability_results_evidence FOREIGN KEY (demand_id, evidence_id)
    REFERENCES demand_evidences(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_accountability_results_parent
  ON demand_accountability_results(accountability_id, position, created_at);

-- ── Comprovantes, relatórios e registros anexados (slide 24) ────────────────
CREATE TABLE IF NOT EXISTS demand_accountability_documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  accountability_id  UUID NOT NULL REFERENCES demand_accountability(id) ON DELETE RESTRICT,
  demand_id          UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  kind               demand_accountability_document_kind NOT NULL,
  title              VARCHAR(200) NOT NULL CHECK (btrim(title) <> ''),
  description        TEXT CHECK (description IS NULL
                                 OR (btrim(description) <> '' AND char_length(description) <= 2000)),
  -- Arquivo da T08: `upload:<id>` de um upload confirmado desta demanda.
  reference          VARCHAR(80) NOT NULL CHECK (reference ~ '^upload:[0-9a-f-]{36}$'),
  upload_id          UUID NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
  -- Data e valor do comprovante financeiro (quando aplicável).
  issued_on          DATE,
  amount_cents       BIGINT CHECK (amount_cents IS NULL
                                   OR (amount_cents >= 0 AND amount_cents <= 9999999999)),
  position           INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_accountability_documents_upload UNIQUE (upload_id),
  CONSTRAINT demand_accountability_documents_parent FOREIGN KEY (demand_id, accountability_id)
    REFERENCES demand_accountability(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_accountability_documents_parent
  ON demand_accountability_documents(accountability_id, kind, position, created_at);

-- ── Regras ───────────────────────────────────────────────────────────────────

/*
 * A prestação de contas nasce e vive com a demanda em `prestacao_de_contas`
 * (decisão 4: é o último status canônico do fluxo do Agente) e sempre pelo
 * Agente autor.
 */
CREATE OR REPLACE FUNCTION demand_accountability_assert_open(target UUID, author UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  st    demand_status;
  owner UUID;
BEGIN
  SELECT status, author_id INTO st, owner FROM demands WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF owner IS DISTINCT FROM author THEN
    RAISE EXCEPTION 'só o Agente autor presta contas da demanda' USING ERRCODE = 'check_violation';
  END IF;
  IF st <> 'prestacao_de_contas' THEN
    RAISE EXCEPTION 'a prestação de contas é registrada com a demanda em prestação de contas (estado: %)', st
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

/** Prestação concluída congela: o item anexo não muda nem é excluído depois. */
CREATE OR REPLACE FUNCTION demand_accountability_assert_draft(parent UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  st demand_accountability_status;
BEGIN
  SELECT status INTO st FROM demand_accountability WHERE id = parent;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prestação de contas inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF st <> 'rascunho' THEN
    RAISE EXCEPTION 'a prestação de contas concluída não muda mais' USING ERRCODE = 'insufficient_privilege';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION demand_accountability_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  physical    BOOLEAN;
  waived      BOOLEAN;
  goals_total INTEGER;
  results_total INTEGER;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê a prestação de contas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a prestação de contas não é excluída' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM demand_accountability_assert_open(NEW.demand_id, NEW.author_id);
    IF NEW.status <> 'rascunho' THEN
      RAISE EXCEPTION 'a prestação de contas começa como rascunho' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.demand_id, NEW.author_id, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.demand_id, OLD.author_id, OLD.created_at) THEN
    RAISE EXCEPTION 'a demanda, o autor e a criação da prestação de contas não mudam'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.status = 'concluida' THEN
    RAISE EXCEPTION 'a prestação de contas concluída não muda mais' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.status = 'rascunho' THEN
    NEW.concluded_at := NULL;
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  -- ── Conclusão: o condicional da fonte ("obrigatoriamente quando aplicável")
  PERFORM demand_accountability_assert_open(NEW.demand_id, NEW.author_id);
  SELECT d.has_physical_execution, coalesce(btrim(d.record_waiver_reason), '') <> ''
    INTO physical, waived
    FROM demands d WHERE d.id = NEW.demand_id;

  -- Fotos e filmagem do antes e do depois: exigidas quando há execução física
  -- e o Agente não justificou a ausência de registro (T17).
  IF physical AND NOT waived THEN
    IF NOT EXISTS (SELECT 1 FROM demand_evidences
                    WHERE demand_id = NEW.demand_id AND milestone = 'antes') THEN
      RAISE EXCEPTION 'a prestação de contas exige o registro do "antes" (execução física declarada)'
        USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM demand_evidences
                    WHERE demand_id = NEW.demand_id AND milestone = 'depois') THEN
      RAISE EXCEPTION 'a prestação de contas exige o registro do "depois" (execução física declarada)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Comprovantes financeiros, quando há apoio financeiro declarado.
  IF NEW.financial_support AND NOT EXISTS (
       SELECT 1 FROM demand_accountability_documents
        WHERE accountability_id = NEW.id AND kind = 'comprovante_financeiro') THEN
    RAISE EXCEPTION 'a prestação de contas com apoio financeiro exige comprovante financeiro'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Um resultado alcançado por meta declarada na T06 (slide 15).
  SELECT count(*) INTO goals_total FROM demand_goals WHERE demand_id = NEW.demand_id;
  SELECT count(*) INTO results_total FROM demand_accountability_results WHERE accountability_id = NEW.id;
  IF results_total < goals_total THEN
    RAISE EXCEPTION 'informe o resultado alcançado de cada meta declarada (% de %)', results_total, goals_total
      USING ERRCODE = 'check_violation';
  END IF;

  -- A estimativa da T06 fica congelada junto com o número alcançado.
  IF NEW.beneficiaries_estimate IS NULL THEN
    SELECT beneficiaries_estimate INTO NEW.beneficiaries_estimate FROM demands WHERE id = NEW.demand_id;
  END IF;
  NEW.concluded_at := NOW();
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_accountability_items_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  row_record RECORD;
  up_purpose TEXT;
  up_demand  UUID;
  up_owner   UUID;
  up_status  TEXT;
  parent_author UUID;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê a prestação de contas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  row_record := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  PERFORM demand_accountability_assert_draft(row_record.accountability_id);
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT a.author_id INTO parent_author FROM demand_accountability a WHERE a.id = NEW.accountability_id;
  PERFORM demand_accountability_assert_open(NEW.demand_id, parent_author);

  IF TG_TABLE_NAME = 'demand_accountability_documents' THEN
    IF NEW.reference <> 'upload:' || NEW.upload_id::text THEN
      RAISE EXCEPTION 'a referência do arquivo não corresponde ao upload' USING ERRCODE = 'check_violation';
    END IF;
    SELECT u.purpose, u.demand_id, u.owner_id, u.status INTO up_purpose, up_demand, up_owner, up_status
      FROM uploads u WHERE u.id = NEW.upload_id;
    IF up_status IS DISTINCT FROM 'confirmado' THEN
      RAISE EXCEPTION 'o anexo da prestação usa um arquivo já confirmado' USING ERRCODE = 'check_violation';
    END IF;
    IF up_demand IS DISTINCT FROM NEW.demand_id OR up_owner IS DISTINCT FROM parent_author THEN
      RAISE EXCEPTION 'o arquivo do anexo é desta demanda e de quem presta contas' USING ERRCODE = 'check_violation';
    END IF;
    IF up_purpose <> 'demand_accountability_document' THEN
      RAISE EXCEPTION 'o anexo da prestação usa a finalidade demand_accountability_document (recebido: %)', up_purpose
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' THEN NEW.created_at := NOW(); END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_accountability_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% não é apagada', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

-- ── Linha do tempo: a conclusão é pública (slide 24) ─────────────────────────
-- `payload->'public'` é o que a rota pública mostra: números e resultados,
-- nunca arquivo, nota interna ou id do upload.
CREATE OR REPLACE FUNCTION demand_accountability_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  goals_total    INTEGER;
  goals_achieved INTEGER;
  documents      INTEGER;
BEGIN
  IF NEW.status <> 'concluida' OR OLD.status = 'concluida' THEN
    RETURN NULL;
  END IF;
  SELECT count(*), count(*) FILTER (WHERE achieved) INTO goals_total, goals_achieved
    FROM demand_accountability_results WHERE accountability_id = NEW.id;
  SELECT count(*) INTO documents
    FROM demand_accountability_documents WHERE accountability_id = NEW.id;

  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (NEW.demand_id, 'prestacao_de_contas_concluida', 'agente', NEW.author_id::text,
          jsonb_build_object('accountability_id', NEW.id, 'documents', documents,
            'public', jsonb_strip_nulls(jsonb_build_object(
              'beneficiariesReached', NEW.beneficiaries_reached,
              'beneficiariesEstimate', NEW.beneficiaries_estimate,
              'goalsTotal', goals_total,
              'goalsAchieved', goals_achieved,
              'executedAmountCents', NEW.executed_amount_cents,
              'impactIndicators', NEW.impact_indicators))),
          true, clock_timestamp());
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_accountability_record_event() FROM PUBLIC;

-- ── Triggers ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS demand_accountability_guard ON demand_accountability;
CREATE TRIGGER demand_accountability_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_accountability
  FOR EACH ROW EXECUTE FUNCTION demand_accountability_guard();

DROP TRIGGER IF EXISTS demand_accountability_block_truncate ON demand_accountability;
CREATE TRIGGER demand_accountability_block_truncate
  BEFORE TRUNCATE ON demand_accountability
  FOR EACH STATEMENT EXECUTE FUNCTION demand_accountability_no_truncate();

-- AFTER e diferido: o evento conta os resultados e anexos da mesma transação.
DROP TRIGGER IF EXISTS demand_accountability_record_event ON demand_accountability;
CREATE CONSTRAINT TRIGGER demand_accountability_record_event
  AFTER UPDATE ON demand_accountability
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION demand_accountability_record_event();

DROP TRIGGER IF EXISTS demand_accountability_results_guard ON demand_accountability_results;
CREATE TRIGGER demand_accountability_results_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_accountability_results
  FOR EACH ROW EXECUTE FUNCTION demand_accountability_items_guard();

DROP TRIGGER IF EXISTS demand_accountability_results_block_truncate ON demand_accountability_results;
CREATE TRIGGER demand_accountability_results_block_truncate
  BEFORE TRUNCATE ON demand_accountability_results
  FOR EACH STATEMENT EXECUTE FUNCTION demand_accountability_no_truncate();

DROP TRIGGER IF EXISTS demand_accountability_documents_guard ON demand_accountability_documents;
CREATE TRIGGER demand_accountability_documents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_accountability_documents
  FOR EACH ROW EXECUTE FUNCTION demand_accountability_items_guard();

DROP TRIGGER IF EXISTS demand_accountability_documents_block_truncate ON demand_accountability_documents;
CREATE TRIGGER demand_accountability_documents_block_truncate
  BEFORE TRUNCATE ON demand_accountability_documents
  FOR EACH STATEMENT EXECUTE FUNCTION demand_accountability_no_truncate();

-- ── Dossiê: nova versão ao concluir a prestação (T10 reaproveitada) ─────────
DO $$ BEGIN
  IF to_regclass('public.demand_dossiers') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_trigger_kind_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%prestacao_de_contas%') THEN
    ALTER TABLE demand_dossiers DROP CONSTRAINT demand_dossiers_trigger_kind_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_trigger_kind_check') THEN
    ALTER TABLE demand_dossiers ADD CONSTRAINT demand_dossiers_trigger_kind_check
      CHECK (trigger_kind IN ('envio', 'reenvio', 'publicacao', 'conclusao', 'prestacao_de_contas'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_public_variant'
                AND pg_get_constraintdef(oid) NOT LIKE '%prestacao_de_contas%') THEN
    ALTER TABLE demand_dossiers DROP CONSTRAINT demand_dossiers_public_variant;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_public_variant') THEN
    ALTER TABLE demand_dossiers ADD CONSTRAINT demand_dossiers_public_variant
      CHECK (variant = 'integral' OR trigger_kind IN ('publicacao', 'conclusao', 'prestacao_de_contas'));
  END IF;
END $$;
