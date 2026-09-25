-- Migração 014: execução, evidências antes/depois e acompanhamento (T17).
--
-- Fonte: dm-docs/fonte-da-verdade/02-fluxo-cadastro-agente-de-transformacao.html
-- — slide 11 ("o registro deverá documentar visualmente a situação inicial e
-- os resultados obtidos após a execução, funcionando como evidência de
-- acompanhamento, transparência e comprovação"), slide 12 (o que o registro
-- deve contemplar: fotografia do "antes", fotografia do "depois", filmagem do
-- processo, registro audiovisual do resultado final e outros registros
-- necessários), slide 14 (o cronograma considera os momentos de registro:
-- situação inicial, acompanhamento e resultado final), slide 23 ("durante a
-- execução, o Agente poderá atualizar o andamento: etapas concluídas, etapas
-- em andamento, cumprimento do cronograma, alterações de prazo, execução
-- orçamentária, resultados parciais e evidências") e slide 24 ("os registros
-- de antes e depois deverão estar vinculados à demanda e poderão compor o
-- histórico visual do projeto"). Contrato com o dm-gestao:
-- dm-docs/gestao/04-modelagem-de-dados.md §3.12.
--
-- - `demand_evidences`: cada foto ou vídeo da execução, vinculado à demanda,
--   à etapa do cronograma (opcional) e ao marco `antes`/`acompanhamento`/
--   `depois` (o mesmo enum `demand_record_milestone` do cronograma, migração
--   007). O arquivo é um upload já confirmado da T08 (`demand_evidence_photo`
--   ou `demand_evidence_video`). Legenda, data do registro e autor ficam na
--   linha. O pareamento antes↔depois (histórico visual, slide 24) é a coluna
--   `pair_evidence_id` da evidência `depois`, apontando para a `antes`.
-- - `demand_progress_updates`: a atualização de andamento do slide 23, só
--   inserção. Traz a etapa e sua situação, o cumprimento do cronograma, a
--   alteração de prazo com justificativa e os resultados parciais.
-- - `demand_progress_expenses`: a execução orçamentária da atualização —
--   valor executado por item do orçamento e/ou por etapa do cronograma.
-- - `demands.record_waiver_reason`: a justificativa de que não há execução
--   física a registrar. Sem evidência `antes` e sem essa justificativa, a
--   demanda não entra em execução; sem evidência `depois` (ou a justificativa),
--   não é concluída — `demands_execution_guard`.
--
-- Imutabilidade: o andamento e a execução orçamentária são só inserção; a
-- evidência não é excluída e só aceita mudança de legenda, pareamento e ordem;
-- nada é apagado; a gestão só lê (grant no dm-infra,
-- db/migrations/gestao/014-gestao-app-post-execution.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

DO $$ BEGIN
  CREATE TYPE demand_evidence_media AS ENUM ('foto', 'video');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Situação da etapa do cronograma no momento da atualização (slide 23:
-- "etapas concluídas" e "etapas em andamento").
-- Modelo de Conexão §18: `atrasada` e `bloqueada` entram na migração 034
-- (espelho em src/execution/constants.js).
DO $$ BEGIN
  CREATE TYPE demand_stage_progress AS ENUM ('nao_iniciada', 'em_andamento', 'concluida');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Justificativa de ausência de registro físico (a demanda sem execução física
-- não tem "antes" e "depois" a fotografar; slide 12: "sempre que houver
-- execução física ou intervenção que permita o registro").
ALTER TABLE demands ADD COLUMN IF NOT EXISTS record_waiver_reason TEXT;
ALTER TABLE demands ADD COLUMN IF NOT EXISTS record_waiver_at     TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demands'::regclass AND conname = 'demands_record_waiver') THEN
    ALTER TABLE demands ADD CONSTRAINT demands_record_waiver CHECK (
      (record_waiver_reason IS NULL) = (record_waiver_at IS NULL)
      AND (record_waiver_reason IS NULL
           OR (btrim(record_waiver_reason) <> '' AND char_length(record_waiver_reason) <= 2000)));
  END IF;
END $$;

-- ── Atualização de andamento (slide 23) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS demand_progress_updates (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id         UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Autor da atualização: sempre o Agente autor da demanda (o trigger confere).
  author_id         UUID NOT NULL,
  author_name       VARCHAR(255),
  -- Etapa do cronograma e a sua situação (as duas juntas, ou nenhuma).
  schedule_item_id  UUID,
  stage_progress    demand_stage_progress,
  -- Cumprimento do cronograma, conforme declarado pelo Agente.
  on_schedule       BOOLEAN,
  -- Alteração de prazo, sempre com justificativa.
  new_ends_on       DATE,
  deadline_reason   TEXT CHECK (deadline_reason IS NULL
                                OR (btrim(deadline_reason) <> '' AND char_length(deadline_reason) <= 2000)),
  -- Resultados parciais (público) e nota interna da atualização.
  partial_results   TEXT CHECK (partial_results IS NULL
                                OR (btrim(partial_results) <> '' AND char_length(partial_results) <= 4000)),
  note              TEXT CHECK (note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 2000)),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_progress_updates_demand_id UNIQUE (demand_id, id),
  CONSTRAINT demand_progress_updates_stage CHECK ((schedule_item_id IS NULL) = (stage_progress IS NULL)),
  CONSTRAINT demand_progress_updates_deadline CHECK (
    (new_ends_on IS NULL AND deadline_reason IS NULL)
    OR (new_ends_on IS NOT NULL AND schedule_item_id IS NOT NULL AND deadline_reason IS NOT NULL)),
  -- Atualização vazia não entra na linha do tempo.
  CONSTRAINT demand_progress_updates_content CHECK (
    num_nonnulls(schedule_item_id, on_schedule, new_ends_on, partial_results, note) > 0),
  CONSTRAINT demand_progress_updates_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_progress_demand
  ON demand_progress_updates(demand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_demand_progress_stage
  ON demand_progress_updates(schedule_item_id, created_at DESC) WHERE schedule_item_id IS NOT NULL;

-- ── Execução orçamentária: valor executado por item e/ou por etapa ───────────
-- A FK composta por item do orçamento precisa da chave (demand_id, id), que a
-- migração 007 só tem no cronograma.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_budget_items'::regclass
                    AND conname = 'demand_budget_items_demand_id') THEN
    ALTER TABLE demand_budget_items ADD CONSTRAINT demand_budget_items_demand_id UNIQUE (demand_id, id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS demand_progress_expenses (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_update_id    UUID NOT NULL REFERENCES demand_progress_updates(id) ON DELETE RESTRICT,
  demand_id             UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  budget_item_id        UUID,
  schedule_item_id      UUID,
  description           VARCHAR(500) CHECK (description IS NULL OR btrim(description) <> ''),
  executed_amount_cents BIGINT NOT NULL CHECK (executed_amount_cents >= 0),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_progress_expenses_target CHECK (num_nonnulls(budget_item_id, schedule_item_id) >= 1),
  CONSTRAINT demand_progress_expenses_budget FOREIGN KEY (demand_id, budget_item_id)
    REFERENCES demand_budget_items(demand_id, id) ON DELETE RESTRICT,
  CONSTRAINT demand_progress_expenses_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_expenses_update ON demand_progress_expenses(progress_update_id);
CREATE INDEX IF NOT EXISTS idx_demand_expenses_demand ON demand_progress_expenses(demand_id, created_at);
CREATE INDEX IF NOT EXISTS idx_demand_expenses_budget
  ON demand_progress_expenses(budget_item_id) WHERE budget_item_id IS NOT NULL;

-- ── Evidências: fotos e vídeos do antes, do acompanhamento e do depois ───────
CREATE TABLE IF NOT EXISTS demand_evidences (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id          UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Atualização de andamento que trouxe a evidência (opcional).
  progress_update_id UUID REFERENCES demand_progress_updates(id) ON DELETE RESTRICT,
  -- Etapa do cronograma a que o registro se refere (slide 14).
  schedule_item_id   UUID,
  -- Marcos do módulo ambiental (§24: diagnóstico, intervenção, monitoramento)
  -- entram no enum pela migração 032 e na evidência desde a T-05-12.
  milestone          demand_record_milestone NOT NULL,
  media_kind         demand_evidence_media NOT NULL,
  -- Arquivo da T08: `upload:<id>` de um upload confirmado desta demanda.
  upload_ref         VARCHAR(80) NOT NULL CHECK (upload_ref ~ '^upload:[0-9a-f-]{36}$'),
  upload_id          UUID NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
  caption            VARCHAR(500) CHECK (caption IS NULL OR btrim(caption) <> ''),
  -- Data do registro (quando a foto ou o vídeo foi feito).
  recorded_on        DATE NOT NULL,
  author_id          UUID NOT NULL,
  author_name        VARCHAR(255),
  -- Pareamento antes↔depois: gravado na evidência `depois`, aponta a `antes`.
  pair_evidence_id   UUID,
  position           INTEGER NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_evidences_demand_id UNIQUE (demand_id, id),
  CONSTRAINT demand_evidences_upload UNIQUE (upload_id),
  CONSTRAINT demand_evidences_pair_milestone CHECK (pair_evidence_id IS NULL OR milestone = 'depois'),
  CONSTRAINT demand_evidences_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT,
  CONSTRAINT demand_evidences_pair FOREIGN KEY (demand_id, pair_evidence_id)
    REFERENCES demand_evidences(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_evidences_demand
  ON demand_evidences(demand_id, milestone, position, created_at);
CREATE INDEX IF NOT EXISTS idx_demand_evidences_update
  ON demand_evidences(progress_update_id) WHERE progress_update_id IS NOT NULL;
-- Cada "antes" é pareado com no máximo um "depois".
CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_evidences_pair
  ON demand_evidences(pair_evidence_id) WHERE pair_evidence_id IS NOT NULL;

-- ── Regras comuns ────────────────────────────────────────────────────────────

-- A execução é registrada da publicação em diante (o "antes" precede o início
-- da execução) e sempre pelo Agente autor.
CREATE OR REPLACE FUNCTION demand_execution_assert_open(target UUID, author UUID, only_running BOOLEAN)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  st     demand_status;
  owner  UUID;
BEGIN
  SELECT status, author_id INTO st, owner FROM demands WHERE id = target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demanda inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF owner IS DISTINCT FROM author THEN
    RAISE EXCEPTION 'só o Agente autor registra a execução da demanda' USING ERRCODE = 'check_violation';
  END IF;
  IF only_running THEN
    IF st NOT IN ('em_execucao', 'concluida', 'prestacao_de_contas') THEN
      RAISE EXCEPTION 'o andamento é registrado a partir do início da execução (estado: %)', st
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF st NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao',
                   'concluida', 'prestacao_de_contas') THEN
    RAISE EXCEPTION 'a execução só é registrada com a demanda publicada (estado: %)', st
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- ── Andamento: só inserção ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION demand_progress_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê o andamento da execução' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'o andamento registrado não muda nem é excluído (registre outra atualização)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM demand_execution_assert_open(NEW.demand_id, NEW.author_id, true);
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_expenses_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent UUID;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê a execução orçamentária' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'a execução orçamentária registrada não muda nem é excluída'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT demand_id INTO parent FROM demand_progress_updates WHERE id = NEW.progress_update_id;
  IF parent IS DISTINCT FROM NEW.demand_id THEN
    RAISE EXCEPTION 'a despesa executada pertence à demanda da atualização' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := NOW();
  RETURN NEW;
END
$$;

-- ── Evidências: sem exclusão; só legenda, pareamento e ordem mudam ───────────
CREATE OR REPLACE FUNCTION demand_evidences_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  up_purpose TEXT;
  up_demand  UUID;
  up_owner   UUID;
  up_status  TEXT;
  pair_row   demand_evidences%ROWTYPE;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as evidências' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'evidências não são excluídas (o histórico visual é permanente)'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM demand_execution_assert_open(NEW.demand_id, NEW.author_id, false);
    IF NEW.upload_ref <> 'upload:' || NEW.upload_id::text THEN
      RAISE EXCEPTION 'a referência do arquivo não corresponde ao upload' USING ERRCODE = 'check_violation';
    END IF;
    SELECT purpose, demand_id, owner_id, status INTO up_purpose, up_demand, up_owner, up_status
      FROM uploads WHERE id = NEW.upload_id;
    IF up_status IS DISTINCT FROM 'confirmado' THEN
      RAISE EXCEPTION 'a evidência usa um arquivo já confirmado' USING ERRCODE = 'check_violation';
    END IF;
    IF up_demand IS DISTINCT FROM NEW.demand_id OR up_owner IS DISTINCT FROM NEW.author_id THEN
      RAISE EXCEPTION 'o arquivo da evidência é desta demanda e de quem a registra' USING ERRCODE = 'check_violation';
    END IF;
    IF (NEW.media_kind = 'foto' AND up_purpose <> 'demand_evidence_photo')
       OR (NEW.media_kind = 'video' AND up_purpose <> 'demand_evidence_video') THEN
      RAISE EXCEPTION 'foto usa demand_evidence_photo e vídeo usa demand_evidence_video (recebido: %)', up_purpose
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
  ELSE
    IF (NEW.id, NEW.demand_id, NEW.progress_update_id, NEW.schedule_item_id, NEW.milestone,
        NEW.media_kind, NEW.upload_ref, NEW.upload_id, NEW.recorded_on, NEW.author_id,
        NEW.author_name, NEW.created_at)
       IS DISTINCT FROM
       (OLD.id, OLD.demand_id, OLD.progress_update_id, OLD.schedule_item_id, OLD.milestone,
        OLD.media_kind, OLD.upload_ref, OLD.upload_id, OLD.recorded_on, OLD.author_id,
        OLD.author_name, OLD.created_at) THEN
      RAISE EXCEPTION 'a demanda, a etapa, o marco, o arquivo, a data e o autor da evidência não mudam'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.updated_at := NOW();
  END IF;

  IF NEW.pair_evidence_id IS NOT NULL THEN
    IF NEW.pair_evidence_id = NEW.id THEN
      RAISE EXCEPTION 'a evidência não é pareada consigo mesma' USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO pair_row FROM demand_evidences WHERE id = NEW.pair_evidence_id;
    IF NOT FOUND OR pair_row.demand_id <> NEW.demand_id THEN
      RAISE EXCEPTION 'o par da evidência é outra evidência da mesma demanda' USING ERRCODE = 'check_violation';
    END IF;
    IF pair_row.milestone <> 'antes' THEN
      RAISE EXCEPTION 'o "depois" é pareado com um registro do "antes"' USING ERRCODE = 'check_violation';
    END IF;
    IF pair_row.media_kind <> NEW.media_kind THEN
      RAISE EXCEPTION 'o par antes/depois usa o mesmo tipo de registro (foto com foto, vídeo com vídeo)'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_execution_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% não é apagada', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END
$$;

-- ── Linha do tempo (eventos públicos) ────────────────────────────────────────
-- `payload->'public'` é o que a rota pública mostra. `note` da atualização e o
-- id do arquivo ficam fora do público.
CREATE OR REPLACE FUNCTION demand_progress_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stage_name  TEXT;
  executed    BIGINT;
  public_part JSONB;
BEGIN
  SELECT stage INTO stage_name FROM demand_schedule_items WHERE id = NEW.schedule_item_id;
  SELECT coalesce(sum(executed_amount_cents), 0) INTO executed
    FROM demand_progress_expenses WHERE progress_update_id = NEW.id;

  public_part := jsonb_strip_nulls(jsonb_build_object(
    'stage', stage_name,
    'stageProgress', NEW.stage_progress,
    'onSchedule', NEW.on_schedule,
    'newEndsOn', NEW.new_ends_on,
    'deadlineReason', NEW.deadline_reason,
    'partialResults', NEW.partial_results,
    'executedAmountCents', executed));

  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (NEW.demand_id, 'andamento_registrado', 'agente', NEW.author_id::text,
          jsonb_build_object('progress_update_id', NEW.id, 'public', public_part),
          true, clock_timestamp());

  IF NEW.new_ends_on IS NOT NULL THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'prazo_alterado', 'agente', NEW.author_id::text, NEW.deadline_reason,
            jsonb_build_object('progress_update_id', NEW.id, 'public', jsonb_strip_nulls(jsonb_build_object(
              'stage', stage_name, 'newEndsOn', NEW.new_ends_on, 'deadlineReason', NEW.deadline_reason))),
            true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_progress_record_event() FROM PUBLIC;

CREATE OR REPLACE FUNCTION demand_evidences_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stage_name TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Só o pareamento entra na linha do tempo; legenda e ordem não são evento.
    IF NEW.pair_evidence_id IS NOT NULL AND OLD.pair_evidence_id IS NULL THEN
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (NEW.demand_id, 'registro_pareado', 'agente', NEW.author_id::text,
              jsonb_build_object('evidence_id', NEW.id, 'pair_evidence_id', NEW.pair_evidence_id,
                                 'public', jsonb_build_object('mediaKind', NEW.media_kind)),
              true, clock_timestamp());
    END IF;
    RETURN NULL;
  END IF;

  SELECT stage INTO stage_name FROM demand_schedule_items WHERE id = NEW.schedule_item_id;
  INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
  VALUES (NEW.demand_id, 'evidencia_registrada', 'agente', NEW.author_id::text,
          jsonb_build_object('evidence_id', NEW.id, 'upload_ref', NEW.upload_ref,
                             'public', jsonb_strip_nulls(jsonb_build_object(
                               'milestone', NEW.milestone, 'mediaKind', NEW.media_kind,
                               'caption', NEW.caption, 'recordedOn', NEW.recorded_on,
                               'stage', stage_name))),
          true, clock_timestamp());
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_evidences_record_event() FROM PUBLIC;

-- ── Reflexo na demanda: "antes" para executar, "depois" para concluir ────────
CREATE OR REPLACE FUNCTION demand_execution_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  waived BOOLEAN := coalesce(btrim(NEW.record_waiver_reason), '') <> '';
BEGIN
  -- A justificativa de ausência de registro é gravada uma vez, pelo Agente,
  -- antes da conclusão; depois disso não muda (append-only).
  IF (NEW.record_waiver_reason, NEW.record_waiver_at)
     IS DISTINCT FROM (OLD.record_waiver_reason, OLD.record_waiver_at) THEN
    IF demand_actor_type() <> 'agente' THEN
      RAISE EXCEPTION 'só o Agente justifica a ausência de registro fotográfico'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF OLD.record_waiver_reason IS NOT NULL THEN
      RAISE EXCEPTION 'a justificativa de ausência de registro não muda' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT waived THEN
      RAISE EXCEPTION 'a justificativa de ausência de registro não é removida' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status NOT IN ('publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao') THEN
      RAISE EXCEPTION 'a justificativa de ausência de registro é dada antes da conclusão (estado: %)', OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.record_waiver_at := NOW();
  END IF;

  IF NEW.status = 'em_execucao' AND OLD.status <> 'em_execucao' AND NOT waived THEN
    IF NOT EXISTS (SELECT 1 FROM demand_evidences
                    WHERE demand_id = NEW.id AND milestone = 'antes') THEN
      RAISE EXCEPTION 'registre a situação inicial ("antes") antes de iniciar a execução, ou justifique a ausência de execução física'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.status = 'concluida' AND OLD.status <> 'concluida' AND NOT waived THEN
    IF NOT EXISTS (SELECT 1 FROM demand_evidences
                    WHERE demand_id = NEW.id AND milestone = 'depois') THEN
      RAISE EXCEPTION 'registre o resultado ("depois") antes de concluir, ou justifique a ausência de execução física'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_waiver_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.record_waiver_reason IS NOT NULL AND OLD.record_waiver_reason IS NULL THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (NEW.id, 'registro_dispensado', 'agente', NEW.author_id::text, NEW.record_waiver_reason,
            jsonb_build_object('public', jsonb_build_object('reason', NEW.record_waiver_reason)),
            true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_waiver_record_event() FROM PUBLIC;

-- ── Triggers ─────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS demand_progress_guard ON demand_progress_updates;
CREATE TRIGGER demand_progress_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_progress_updates
  FOR EACH ROW EXECUTE FUNCTION demand_progress_guard();

DROP TRIGGER IF EXISTS demand_progress_block_truncate ON demand_progress_updates;
CREATE TRIGGER demand_progress_block_truncate
  BEFORE TRUNCATE ON demand_progress_updates
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

-- AFTER, e depois das despesas da mesma transação: o evento soma o executado.
DROP TRIGGER IF EXISTS demand_progress_record_event ON demand_progress_updates;
CREATE CONSTRAINT TRIGGER demand_progress_record_event
  AFTER INSERT ON demand_progress_updates
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION demand_progress_record_event();

DROP TRIGGER IF EXISTS demand_expenses_guard ON demand_progress_expenses;
CREATE TRIGGER demand_expenses_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_progress_expenses
  FOR EACH ROW EXECUTE FUNCTION demand_expenses_guard();

DROP TRIGGER IF EXISTS demand_expenses_block_truncate ON demand_progress_expenses;
CREATE TRIGGER demand_expenses_block_truncate
  BEFORE TRUNCATE ON demand_progress_expenses
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

DROP TRIGGER IF EXISTS demand_evidences_guard ON demand_evidences;
CREATE TRIGGER demand_evidences_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_evidences
  FOR EACH ROW EXECUTE FUNCTION demand_evidences_guard();

DROP TRIGGER IF EXISTS demand_evidences_block_truncate ON demand_evidences;
CREATE TRIGGER demand_evidences_block_truncate
  BEFORE TRUNCATE ON demand_evidences
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

DROP TRIGGER IF EXISTS demand_evidences_record_event ON demand_evidences;
CREATE TRIGGER demand_evidences_record_event
  AFTER INSERT OR UPDATE ON demand_evidences
  FOR EACH ROW EXECUTE FUNCTION demand_evidences_record_event();

DROP TRIGGER IF EXISTS demand_execution_guard ON demands;
CREATE TRIGGER demand_execution_guard
  BEFORE UPDATE ON demands
  FOR EACH ROW EXECUTE FUNCTION demand_execution_guard();

DROP TRIGGER IF EXISTS demand_waiver_record_event ON demands;
CREATE TRIGGER demand_waiver_record_event
  AFTER UPDATE ON demands
  FOR EACH ROW EXECUTE FUNCTION demand_waiver_record_event();

-- ── Dossiê: nova versão ao concluir (T10 reaproveitada) ──────────────────────
DO $$ BEGIN
  IF to_regclass('public.demand_dossiers') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_trigger_kind_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%conclusao%') THEN
    ALTER TABLE demand_dossiers DROP CONSTRAINT demand_dossiers_trigger_kind_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_trigger_kind_check') THEN
    ALTER TABLE demand_dossiers ADD CONSTRAINT demand_dossiers_trigger_kind_check
      CHECK (trigger_kind IN ('envio', 'reenvio', 'publicacao', 'conclusao'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_public_variant'
                AND pg_get_constraintdef(oid) NOT LIKE '%conclusao%') THEN
    ALTER TABLE demand_dossiers DROP CONSTRAINT demand_dossiers_public_variant;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_public_variant') THEN
    ALTER TABLE demand_dossiers ADD CONSTRAINT demand_dossiers_public_variant
      CHECK (variant = 'integral' OR trigger_kind IN ('publicacao', 'conclusao'));
  END IF;
END $$;
