-- Migração 034: status Atrasada e Bloqueada da etapa, atraso gravado,
-- percentual de execução e ocorrências (T-05-11).
--
-- Fonte: dm-docs/fonte-da-verdade/05 (Modelo de Conexão) — §18 "Cada etapa
-- poderá possuir um status: Não iniciada, Em andamento, Concluída, Atrasada,
-- Bloqueada" e §19 "Percentual de execução … Ocorrências". Decisão 16 de
-- dm-docs/fonte-da-verdade/decisoes-de-implementacao.md: "o atraso é gravado,
-- não só calculado na leitura".
--
-- - `demand_stage_progress` ganha `atrasada` e `bloqueada`. `bloqueada` é
--   declarada pelo Agente com o motivo (`demand_progress_updates.block_reason`,
--   obrigatório nesse caso e só nele).
-- - `demand_stage_status` (visão): a situação corrente de cada etapa — a última
--   situação declarada, o prazo corrente (última alteração justificada ou o
--   término do cronograma), o motivo do bloqueio e o atraso aberto. É a mesma
--   leitura para o portal (`src/execution/store.js`) e para a gestão
--   (`App\Support\ExecutionDelay`).
-- - `demand_stage_delays`: o atraso **gravado**. Uma linha por episódio de
--   atraso da etapa (prazo corrente vencido, etapa não concluída nem
--   bloqueada, demanda em execução), com o prazo vencido, o dia em que foi
--   gravado e o desfecho (`concluida`, `novo_prazo`, `bloqueada`,
--   `fim_da_execucao`). Quem grava é `demand_record_stage_delays(dia, demanda)`:
--   o laço do post-service (`src/execution/delays.js`,
--   `DM_EXECUTION_DELAY_INTERVAL_MS`) e cada atualização de andamento (trigger
--   diferido). O início do atraso entra na linha do tempo pública
--   (`etapa_atrasada`).
-- - `demand_execution_incidents`: ocorrências da execução (§19), só inserção;
--   a resolução é gravada uma vez. Linha do tempo pública
--   (`ocorrencia_registrada`, `ocorrencia_resolvida`) com tipo, etapa, data e
--   impacto.
--
-- `ALTER TYPE ... ADD VALUE` não pode ser usado como literal do enum na mesma
-- transação: os CHECKs e as funções abaixo comparam `stage_progress::text`.
--
-- A gestão só lê (grant no dm-infra,
-- db/migrations/gestao/031-gestao-app-post-execution.sql).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

ALTER TYPE demand_stage_progress ADD VALUE IF NOT EXISTS 'atrasada';
ALTER TYPE demand_stage_progress ADD VALUE IF NOT EXISTS 'bloqueada';

-- ── Motivo do bloqueio (§18) ─────────────────────────────────────────────────
ALTER TABLE demand_progress_updates ADD COLUMN IF NOT EXISTS block_reason TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_progress_updates'::regclass
                    AND conname = 'demand_progress_updates_block') THEN
    ALTER TABLE demand_progress_updates ADD CONSTRAINT demand_progress_updates_block CHECK (
      (block_reason IS NULL OR (btrim(block_reason) <> '' AND char_length(block_reason) <= 2000))
      AND ((coalesce(stage_progress::text, '') = 'bloqueada') = (block_reason IS NOT NULL)));
  END IF;
END $$;

-- O evento público do andamento passa a levar o motivo do bloqueio.
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
    'blockReason', NEW.block_reason,
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

-- ── Atraso gravado (decisão 16) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS demand_stage_delays (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id         UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  schedule_item_id  UUID NOT NULL,
  -- Prazo corrente que venceu (última alteração justificada ou o término do
  -- cronograma) e o dia em que o atraso foi gravado.
  due_on            DATE NOT NULL,
  detected_on       DATE NOT NULL,
  detected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Desfecho: a etapa foi concluída, ganhou prazo novo, foi declarada
  -- bloqueada ou a demanda saiu da execução.
  resolved_at       TIMESTAMPTZ,
  resolution        VARCHAR(20) CHECK (resolution IS NULL
                                       OR resolution IN ('concluida', 'novo_prazo', 'bloqueada', 'fim_da_execucao')),
  CONSTRAINT demand_stage_delays_resolution CHECK ((resolved_at IS NULL) = (resolution IS NULL)),
  CONSTRAINT demand_stage_delays_dates CHECK (detected_on > due_on),
  CONSTRAINT demand_stage_delays_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT
);

-- Um atraso em aberto por etapa.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demand_stage_delays_open
  ON demand_stage_delays(schedule_item_id) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_demand_stage_delays_demand
  ON demand_stage_delays(demand_id, detected_at DESC);

-- Situação corrente de cada etapa do cronograma.
CREATE OR REPLACE VIEW demand_stage_status AS
SELECT s.id AS schedule_item_id,
       s.demand_id,
       s.position,
       s.stage,
       s.starts_on,
       s.ends_on,
       COALESCE(deadline.new_ends_on, s.ends_on) AS current_ends_on,
       deadline.new_ends_on AS rescheduled_to,
       last.stage_progress::text AS declared_progress,
       last.block_reason,
       last.created_at AS progress_updated_at,
       delay.id AS open_delay_id,
       delay.due_on AS late_due_on,
       delay.detected_on AS late_since,
       CASE
         WHEN last.stage_progress::text IN ('concluida', 'bloqueada') THEN last.stage_progress::text
         WHEN delay.id IS NOT NULL THEN 'atrasada'
         ELSE COALESCE(last.stage_progress::text, 'nao_iniciada')
       END AS status
  FROM demand_schedule_items s
  LEFT JOIN LATERAL (
    SELECT u.stage_progress, u.block_reason, u.created_at FROM demand_progress_updates u
     WHERE u.schedule_item_id = s.id AND u.stage_progress IS NOT NULL
     ORDER BY u.created_at DESC, u.id DESC LIMIT 1) last ON true
  LEFT JOIN LATERAL (
    SELECT u.new_ends_on FROM demand_progress_updates u
     WHERE u.schedule_item_id = s.id AND u.new_ends_on IS NOT NULL
     ORDER BY u.created_at DESC, u.id DESC LIMIT 1) deadline ON true
  LEFT JOIN demand_stage_delays delay
    ON delay.schedule_item_id = s.id AND delay.resolved_at IS NULL;

CREATE OR REPLACE FUNCTION demand_stage_delays_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê o atraso das etapas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'o atraso gravado não é excluído' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'o atraso nasce em aberto' USING ERRCODE = 'check_violation';
    END IF;
    NEW.detected_at := NOW();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.demand_id, NEW.schedule_item_id, NEW.due_on, NEW.detected_on, NEW.detected_at)
     IS DISTINCT FROM (OLD.id, OLD.demand_id, OLD.schedule_item_id, OLD.due_on, OLD.detected_on, OLD.detected_at) THEN
    RAISE EXCEPTION 'a etapa, o prazo vencido e a data do atraso não mudam' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'o desfecho do atraso é gravado uma vez' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demand_stage_delays_guard ON demand_stage_delays;
CREATE TRIGGER demand_stage_delays_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_stage_delays
  FOR EACH ROW EXECUTE FUNCTION demand_stage_delays_guard();

DROP TRIGGER IF EXISTS demand_stage_delays_block_truncate ON demand_stage_delays;
CREATE TRIGGER demand_stage_delays_block_truncate
  BEFORE TRUNCATE ON demand_stage_delays
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

/*
 * Grava os atrasos: fecha os que deixaram de valer e abre os novos (etapa com
 * prazo corrente antes de `p_today`, não concluída nem bloqueada, demanda em
 * execução). `p_demand` restringe a uma demanda (atualização de andamento);
 * `NULL` percorre todas (laço do post-service). Devolve quantos atrasos novos
 * foram gravados.
 */
CREATE OR REPLACE FUNCTION demand_record_stage_delays(p_today DATE DEFAULT CURRENT_DATE, p_demand UUID DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  opened INTEGER := 0;
  r      RECORD;
BEGIN
  UPDATE demand_stage_delays d
     SET resolved_at = clock_timestamp(),
         resolution = CASE
           WHEN dm.status::text <> 'em_execucao' THEN 'fim_da_execucao'
           WHEN st.declared_progress = 'concluida' THEN 'concluida'
           WHEN st.declared_progress = 'bloqueada' THEN 'bloqueada'
           ELSE 'novo_prazo' END
    FROM demand_stage_status st, demands dm
   WHERE d.resolved_at IS NULL
     AND st.schedule_item_id = d.schedule_item_id
     AND dm.id = d.demand_id
     AND (p_demand IS NULL OR d.demand_id = p_demand)
     AND (dm.status::text <> 'em_execucao'
          OR coalesce(st.declared_progress, '') IN ('concluida', 'bloqueada')
          OR st.current_ends_on >= p_today);

  FOR r IN
    SELECT st.schedule_item_id, st.demand_id, st.stage, st.current_ends_on
      FROM demand_stage_status st
      JOIN demands dm ON dm.id = st.demand_id
     WHERE dm.status::text = 'em_execucao'
       AND (p_demand IS NULL OR st.demand_id = p_demand)
       AND st.current_ends_on < p_today
       AND coalesce(st.declared_progress, '') NOT IN ('concluida', 'bloqueada')
       AND st.open_delay_id IS NULL
  LOOP
    INSERT INTO demand_stage_delays (demand_id, schedule_item_id, due_on, detected_on)
    VALUES (r.demand_id, r.schedule_item_id, r.current_ends_on, p_today)
    ON CONFLICT DO NOTHING;
    IF FOUND THEN
      opened := opened + 1;
      INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
      VALUES (r.demand_id, 'etapa_atrasada', 'sistema', 'execucao:prazo',
              jsonb_build_object('schedule_item_id', r.schedule_item_id,
                'public', jsonb_build_object('stage', r.stage, 'dueOn', r.current_ends_on)),
              true, clock_timestamp());
    END IF;
  END LOOP;
  RETURN opened;
END
$$;
REVOKE ALL ON FUNCTION demand_record_stage_delays(DATE, UUID) FROM PUBLIC;

-- Cada atualização de andamento reavalia o atraso da demanda (conclusão, novo
-- prazo ou bloqueio fecham o atraso; andamento em etapa vencida o abre na hora).
CREATE OR REPLACE FUNCTION demand_progress_record_delays() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM demand_record_stage_delays(CURRENT_DATE, NEW.demand_id);
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_progress_record_delays() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_progress_record_delays ON demand_progress_updates;
CREATE CONSTRAINT TRIGGER demand_progress_record_delays
  AFTER INSERT ON demand_progress_updates
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION demand_progress_record_delays();

-- ── Ocorrências da execução (§19) ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE demand_incident_kind AS ENUM (
    'atraso', 'bloqueio', 'alteracao_de_escopo', 'problema_tecnico', 'seguranca', 'clima',
    'fornecedor', 'outra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE demand_incident_impact AS ENUM ('prazo', 'custo', 'escopo', 'nenhum');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS demand_execution_incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  demand_id         UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  -- Processo de Conexão (decisão 13) a que a ocorrência se refere, quando
  -- houver. A FK é criada abaixo quando `connection_processes` existe.
  process_id        UUID,
  schedule_item_id  UUID,
  kind              demand_incident_kind NOT NULL,
  description       TEXT NOT NULL CHECK (btrim(description) <> '' AND char_length(description) <= 4000),
  occurred_on       DATE NOT NULL,
  impact            demand_incident_impact NOT NULL DEFAULT 'nenhum',
  author_id         UUID NOT NULL,
  author_name       VARCHAR(255),
  resolved_at       TIMESTAMPTZ,
  resolution        TEXT CHECK (resolution IS NULL
                                OR (btrim(resolution) <> '' AND char_length(resolution) <= 4000)),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT demand_execution_incidents_demand_id UNIQUE (demand_id, id),
  CONSTRAINT demand_execution_incidents_resolution CHECK ((resolved_at IS NULL) = (resolution IS NULL)),
  CONSTRAINT demand_execution_incidents_schedule FOREIGN KEY (demand_id, schedule_item_id)
    REFERENCES demand_schedule_items(demand_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_demand_execution_incidents_demand
  ON demand_execution_incidents(demand_id, occurred_on DESC, created_at DESC);

DO $$ BEGIN
  IF to_regclass('public.connection_processes') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conrelid = 'demand_execution_incidents'::regclass
                        AND conname = 'demand_execution_incidents_process') THEN
    ALTER TABLE demand_execution_incidents ADD CONSTRAINT demand_execution_incidents_process
      FOREIGN KEY (process_id) REFERENCES connection_processes(id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION demand_execution_incidents_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê as ocorrências' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ocorrências não são excluídas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM demand_execution_assert_open(NEW.demand_id, NEW.author_id, true);
    IF NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'a ocorrência nasce em aberto' USING ERRCODE = 'check_violation';
    END IF;
    NEW.created_at := NOW();
    RETURN NEW;
  END IF;
  IF (NEW.id, NEW.demand_id, NEW.process_id, NEW.schedule_item_id, NEW.kind, NEW.description,
      NEW.occurred_on, NEW.impact, NEW.author_id, NEW.author_name, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.demand_id, OLD.process_id, OLD.schedule_item_id, OLD.kind, OLD.description,
      OLD.occurred_on, OLD.impact, OLD.author_id, OLD.author_name, OLD.created_at) THEN
    RAISE EXCEPTION 'a ocorrência registrada não muda (só a resolução é gravada)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.resolved_at IS NOT NULL THEN
    RAISE EXCEPTION 'a resolução da ocorrência é gravada uma vez' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.resolved_at IS NULL THEN
    RETURN NEW;
  END IF;
  PERFORM demand_execution_assert_open(NEW.demand_id, NEW.author_id, true);
  NEW.resolved_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION demand_execution_incidents_record_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  stage_name TEXT;
BEGIN
  SELECT stage INTO stage_name FROM demand_schedule_items WHERE id = NEW.schedule_item_id;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'ocorrencia_registrada', 'agente', NEW.author_id::text,
            jsonb_build_object('incident_id', NEW.id, 'public', jsonb_strip_nulls(jsonb_build_object(
              'kind', NEW.kind, 'stage', stage_name, 'occurredOn', NEW.occurred_on, 'impact', NEW.impact))),
            true, clock_timestamp());
  ELSIF NEW.resolved_at IS NOT NULL AND OLD.resolved_at IS NULL THEN
    INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, 'ocorrencia_resolvida', 'agente', NEW.author_id::text,
            jsonb_build_object('incident_id', NEW.id, 'public', jsonb_strip_nulls(jsonb_build_object(
              'kind', NEW.kind, 'stage', stage_name, 'occurredOn', NEW.occurred_on))),
            true, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_execution_incidents_record_event() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_execution_incidents_guard ON demand_execution_incidents;
CREATE TRIGGER demand_execution_incidents_guard
  BEFORE INSERT OR UPDATE OR DELETE ON demand_execution_incidents
  FOR EACH ROW EXECUTE FUNCTION demand_execution_incidents_guard();

DROP TRIGGER IF EXISTS demand_execution_incidents_block_truncate ON demand_execution_incidents;
CREATE TRIGGER demand_execution_incidents_block_truncate
  BEFORE TRUNCATE ON demand_execution_incidents
  FOR EACH STATEMENT EXECUTE FUNCTION demand_execution_no_truncate();

DROP TRIGGER IF EXISTS demand_execution_incidents_record_event ON demand_execution_incidents;
CREATE TRIGGER demand_execution_incidents_record_event
  AFTER INSERT OR UPDATE ON demand_execution_incidents
  FOR EACH ROW EXECUTE FUNCTION demand_execution_incidents_record_event();
