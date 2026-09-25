-- Migração 028: prazos do encaminhamento, responsável atual com setor e data
-- limite no acompanhamento do órgão, prazos por etapa do Processo de Conexão e
-- registro dos alertas de prazo (T-05-03).
--
-- Fonte: dm-docs/fonte-da-verdade/ (Modelo de Conexão) §13 (encaminhamento
-- interno, exemplo "Prazo: 10 dias"), §14 ("Setor … Data de recebimento … Data
-- limite … Quem está responsável pela próxima ação?") e §15 ("Cada etapa poderá
-- possuir prazo": Análise inicial 5 dias, Envio de documentação 3, Análise
-- técnica 10, Elaboração do plano 7, Execução 60; "O sistema pode gerar
-- alertas, lembretes, pendências, prazos próximos, prazos vencidos").
-- Decisões 13 e 16 de decisoes-de-implementacao.md.
--
-- - `demand_forwardings.due_on`: data limite do encaminhamento, gravada no
--   envio (`forwarded_at` + N dias ou a data informada) e imutável depois.
-- - `demand_institutional_tracks.responsible_sector` e `responsible_due_on`:
--   setor e data limite do responsável no órgão, antes da formalização (com
--   processo, vale o responsável atual de `connection_processes`, migração 026,
--   que já tem setor e data limite).
-- - `connection_process_deadlines`: um prazo por etapa do processo, com o
--   lado responsável pela próxima ação (`agente` ou `parte`), a sugestão de
--   dias do §15 usada, quem definiu, status `aberto` → `cumprido` | `vencido`
--   (`vencido` → `cumprido` quando cumprido com atraso). Redefinir o prazo de
--   uma etapa acrescenta outro registro e marca o anterior com `superseded_by`
--   (histórico). Um prazo em aberto por etapa × processo.
-- - `deadline_alerts`: um registro por alvo × tipo de alerta × data limite,
--   para o laço src/process/deadlines.js avisar uma vez só (`prazo_proximo`
--   até 3 dias antes; `prazo_vencido` depois da data), pela central de
--   notificações (T-05-16).
-- - Linha do tempo do processo: `prazo_definido`, `prazo_cumprido` e
--   `prazo_vencido` (privados: só as partes e a gestão).
-- - A gestão só lê (grant SELECT no dm-infra,
--   db/migrations/gestao/027-gestao-app-post-deadlines-requests.sql); nada é
--   excluído.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

-- ---------------------------------------------------------------------------
-- Encaminhamento (§13) e responsável do órgão (§14).
ALTER TABLE demand_forwardings ADD COLUMN IF NOT EXISTS due_on DATE;
ALTER TABLE demand_institutional_tracks ADD COLUMN IF NOT EXISTS responsible_sector VARCHAR(255);
ALTER TABLE demand_institutional_tracks ADD COLUMN IF NOT EXISTS responsible_due_on DATE;

-- Dia de hoje no horário de Brasília (datas limite são dias do calendário local).
CREATE OR REPLACE FUNCTION dm_today() RETURNS DATE
LANGUAGE sql STABLE AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date
$$;

-- A data limite do encaminhamento nasce com ele (não antes de hoje) e não muda.
CREATE OR REPLACE FUNCTION forwardings_due_on_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.due_on IS NOT NULL AND NEW.due_on < dm_today() THEN
      RAISE EXCEPTION 'prazo do encaminhamento antes de hoje' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.due_on IS DISTINCT FROM OLD.due_on THEN
    RAISE EXCEPTION 'o prazo do encaminhamento não muda' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS forwardings_due_on_guard ON demand_forwardings;
CREATE TRIGGER forwardings_due_on_guard
  BEFORE INSERT OR UPDATE ON demand_forwardings
  FOR EACH ROW EXECUTE FUNCTION forwardings_due_on_guard();

-- Pendências do órgão: encaminhamentos recebidos e acompanhamentos com prazo.
CREATE INDEX IF NOT EXISTS idx_forwardings_due
  ON demand_forwardings(status, due_on) WHERE due_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_institutional_tracks_due
  ON demand_institutional_tracks(responsible_due_on) WHERE responsible_due_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_connection_processes_due
  ON connection_processes(responsible_due_on) WHERE responsible_due_on IS NOT NULL AND closed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Prazos por etapa do processo (§15). Espelho: src/process/constants.js.
DO $$ BEGIN
  CREATE TYPE connection_deadline_stage AS ENUM (
    'analise_inicial', 'envio_de_documentacao', 'analise_tecnica', 'elaboracao_do_plano', 'execucao', 'outra'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE connection_deadline_status AS ENUM ('aberto', 'cumprido', 'vencido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS connection_process_deadlines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id         UUID NOT NULL REFERENCES connection_processes(id) ON DELETE RESTRICT,
  -- Retrato da demanda do processo (gravado pelo trigger).
  demand_id          UUID NOT NULL REFERENCES demands(id) ON DELETE RESTRICT,
  stage              connection_deadline_stage NOT NULL,
  -- Nome da etapa quando `outra`.
  stage_label        VARCHAR(120) CHECK (stage_label IS NULL OR btrim(stage_label) <> ''),
  -- Quem responde pela próxima ação: o Agente autor ou a parte conectada.
  responsible_side   VARCHAR(10) NOT NULL CHECK (responsible_side IN ('agente', 'parte')),
  -- Dias usados para calcular a data (a sugestão do §15 ou os informados).
  default_days       INT CHECK (default_days IS NULL OR default_days BETWEEN 1 AND 365),
  due_on             DATE NOT NULL,
  note               TEXT CHECK (note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 1000)),
  set_by             UUID NOT NULL,
  set_by_kind        VARCHAR(10) NOT NULL CHECK (set_by_kind IN ('agente', 'parte')),
  status             connection_deadline_status NOT NULL DEFAULT 'aberto',
  fulfilled_at       TIMESTAMPTZ,
  fulfilled_by       UUID,
  fulfilled_by_kind  VARCHAR(10) CHECK (fulfilled_by_kind IS NULL OR fulfilled_by_kind IN ('agente', 'parte')),
  fulfilled_note     TEXT CHECK (fulfilled_note IS NULL OR char_length(fulfilled_note) <= 1000),
  overdue_at         TIMESTAMPTZ,
  -- Prazo que substituiu este (redefinição da mesma etapa).
  superseded_by      UUID REFERENCES connection_process_deadlines(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  superseded_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT connection_process_deadlines_label CHECK (stage <> 'outra' OR stage_label IS NOT NULL),
  CONSTRAINT connection_process_deadlines_fulfilled CHECK (
    (status = 'cumprido') = (fulfilled_at IS NOT NULL AND fulfilled_by IS NOT NULL AND fulfilled_by_kind IS NOT NULL)),
  CONSTRAINT connection_process_deadlines_overdue CHECK (status <> 'vencido' OR overdue_at IS NOT NULL),
  CONSTRAINT connection_process_deadlines_superseded CHECK ((superseded_by IS NULL) = (superseded_at IS NULL))
);

-- Um prazo em aberto (aberto ou vencido, não substituído) por etapa × processo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_connection_process_deadlines_open
  ON connection_process_deadlines(process_id, stage, (coalesce(stage_label, '')))
  WHERE superseded_by IS NULL AND status <> 'cumprido';
CREATE INDEX IF NOT EXISTS idx_connection_process_deadlines_process
  ON connection_process_deadlines(process_id, created_at);
-- Laço de alertas e pendências: uma consulta por (status, due_on).
CREATE INDEX IF NOT EXISTS idx_connection_process_deadlines_due
  ON connection_process_deadlines(status, due_on) WHERE superseded_by IS NULL;

CREATE OR REPLACE FUNCTION connection_process_deadlines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
BEGIN
  IF session_user = 'gestao_app' THEN
    RAISE EXCEPTION 'a gestão só lê os prazos do processo' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'prazos do processo não são excluídos' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    SELECT demand_id, closed_at INTO p FROM connection_processes WHERE id = NEW.process_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'processo inexistente' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF p.closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'processo encerrado não recebe prazo' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status <> 'aberto' OR NEW.fulfilled_at IS NOT NULL OR NEW.superseded_by IS NOT NULL THEN
      RAISE EXCEPTION 'prazo nasce aberto' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.due_on < dm_today() THEN
      RAISE EXCEPTION 'prazo antes de hoje' USING ERRCODE = 'check_violation';
    END IF;
    NEW.demand_id := p.demand_id;
    NEW.overdue_at := NULL;
    NEW.superseded_at := NULL;
    NEW.created_at := NOW();
    NEW.updated_at := NOW();
    RETURN NEW;
  END IF;

  IF (NEW.id, NEW.process_id, NEW.demand_id, NEW.stage, NEW.stage_label, NEW.responsible_side, NEW.default_days,
      NEW.due_on, NEW.note, NEW.set_by, NEW.set_by_kind, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.process_id, OLD.demand_id, OLD.stage, OLD.stage_label, OLD.responsible_side, OLD.default_days,
      OLD.due_on, OLD.note, OLD.set_by, OLD.set_by_kind, OLD.created_at) THEN
    RAISE EXCEPTION 'etapa, data e autor do prazo não mudam (redefina com um novo prazo)'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.superseded_by IS NOT NULL OR OLD.status = 'cumprido' THEN
    RAISE EXCEPTION 'prazo encerrado não muda' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.superseded_by IS NOT NULL THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'prazo substituído não muda de status' USING ERRCODE = 'check_violation';
    END IF;
    NEW.superseded_at := NOW();
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT ((OLD.status = 'aberto' AND NEW.status IN ('cumprido', 'vencido'))
            OR (OLD.status = 'vencido' AND NEW.status = 'cumprido')) THEN
      RAISE EXCEPTION 'transição do prazo não permitida: % → %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.status = 'vencido' THEN
      -- O laço informa o dia da passada (`dm.deadline_today`); sem ele, hoje.
      IF OLD.due_on >= coalesce(nullif(current_setting('dm.deadline_today', true), '')::date, dm_today()) THEN
        RAISE EXCEPTION 'prazo ainda não venceu' USING ERRCODE = 'check_violation';
      END IF;
      NEW.overdue_at := NOW();
    ELSE
      NEW.fulfilled_at := NOW();
    END IF;
  ELSIF (NEW.fulfilled_at, NEW.fulfilled_by, NEW.fulfilled_by_kind, NEW.fulfilled_note, NEW.overdue_at,
         NEW.superseded_at)
        IS DISTINCT FROM (OLD.fulfilled_at, OLD.fulfilled_by, OLD.fulfilled_by_kind, OLD.fulfilled_note,
                          OLD.overdue_at, OLD.superseded_at) THEN
    RAISE EXCEPTION 'datas do prazo mudam só junto do status' USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION connection_process_deadlines_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'connection_process_deadlines não é apagada' USING ERRCODE = 'insufficient_privilege';
END
$$;

-- Linha do tempo do processo (eventos privados: prazos são das partes).
CREATE OR REPLACE FUNCTION connection_process_deadlines_after() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  party connection_party_kind;
  base JSONB;
BEGIN
  SELECT party_kind INTO party FROM connection_processes WHERE id = NEW.process_id;
  base := jsonb_build_object('process_id', NEW.process_id, 'deadline_id', NEW.id, 'stage', NEW.stage,
                             'stage_label', NEW.stage_label, 'due_on', NEW.due_on,
                             'responsible_side', NEW.responsible_side);
  IF TG_OP = 'INSERT' THEN
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (NEW.demand_id, NEW.process_id, 'prazo_definido', connection_process_actor_type(NEW.set_by_kind, party),
            NEW.set_by::text, NEW.note, base || jsonb_build_object('default_days', NEW.default_days), false,
            clock_timestamp());
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'cumprido' THEN
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, note, payload, is_public, created_at)
    VALUES (NEW.demand_id, NEW.process_id, 'prazo_cumprido',
            connection_process_actor_type(NEW.fulfilled_by_kind, party), NEW.fulfilled_by::text, NEW.fulfilled_note,
            base || jsonb_build_object('late', OLD.status = 'vencido'), false, clock_timestamp());
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'vencido' THEN
    INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
    VALUES (NEW.demand_id, NEW.process_id, 'prazo_vencido', 'sistema', 'prazos', base, false, clock_timestamp());
  END IF;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS connection_process_deadlines_guard ON connection_process_deadlines;
CREATE TRIGGER connection_process_deadlines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON connection_process_deadlines
  FOR EACH ROW EXECUTE FUNCTION connection_process_deadlines_guard();

DROP TRIGGER IF EXISTS connection_process_deadlines_block_truncate ON connection_process_deadlines;
CREATE TRIGGER connection_process_deadlines_block_truncate
  BEFORE TRUNCATE ON connection_process_deadlines
  FOR EACH STATEMENT EXECUTE FUNCTION connection_process_deadlines_no_truncate();

DROP TRIGGER IF EXISTS connection_process_deadlines_after ON connection_process_deadlines;
CREATE TRIGGER connection_process_deadlines_after
  AFTER INSERT OR UPDATE ON connection_process_deadlines
  FOR EACH ROW EXECUTE FUNCTION connection_process_deadlines_after();

-- ---------------------------------------------------------------------------
-- Alertas já enviados (um por alvo × tipo × data limite). Alvos:
-- `prazo_do_processo` (connection_process_deadlines), `responsavel_do_processo`
-- (connection_processes.responsible_due_on), `encaminhamento`
-- (demand_forwardings.due_on) e `acompanhamento`
-- (demand_institutional_tracks.responsible_due_on).
CREATE TABLE IF NOT EXISTS deadline_alerts (
  target_kind  VARCHAR(30) NOT NULL CHECK (target_kind IN (
                 'prazo_do_processo', 'responsavel_do_processo', 'encaminhamento', 'acompanhamento')),
  target_id    UUID NOT NULL,
  alert_kind   VARCHAR(20) NOT NULL CHECK (alert_kind IN ('prazo_proximo', 'prazo_vencido')),
  due_on       DATE NOT NULL,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (target_kind, target_id, alert_kind, due_on)
);

CREATE OR REPLACE FUNCTION deadline_alerts_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF session_user = 'gestao_app' OR TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'deadline_alerts é somente inserção pelo serviço' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.sent_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS deadline_alerts_guard ON deadline_alerts;
CREATE TRIGGER deadline_alerts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON deadline_alerts
  FOR EACH ROW EXECUTE FUNCTION deadline_alerts_guard();
