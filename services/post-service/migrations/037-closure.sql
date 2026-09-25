-- Migração 037: encerramento do processo e da demanda (T-05-14).
--
-- Fonte: dm-docs/fonte-da-verdade/05 (Modelo de Conexão) — §22 "O processo não
-- termina simplesmente quando a execução acaba. O encerramento deve reunir …
-- Data de conclusão, Responsáveis, Registro final. O projeto passa então para:
-- CONCLUÍDO e permanece disponível no histórico"; §35 "Processo encerrado".
-- Decisão 16 (decisoes-de-implementacao.md): a demanda ganha o estado final
-- `encerrada` (rótulo "Concluído — encerrado"), alcançável pelo Agente só com a
-- prestação de contas concluída, com registro final e versão `encerramento` do
-- dossiê; `prestacao_de_contas` continua sendo a etapa em que o Agente monta a
-- prestação.
--
-- - `demand_status` ganha `encerrada` (último valor). Transição única:
--   `prestacao_de_contas` → `encerrada`, só pelo Agente autor
--   (`demand_status_transition_allowed`, espelho de ACTIONS.encerrar em
--   src/demand/state-machine.js). A gestão continua podendo arquivar.
-- - `demands.closed_at` (data de conclusão, gravada pelo trigger),
--   `closing_summary` (registro final, público) e `closing_responsibles`
--   (responsáveis pelo encerramento; texto livre, fora da rota pública porque
--   pode trazer nome de pessoa). Mudam só junto do encerramento
--   (`demands_closure_guard`); exigem a prestação de contas `concluida`.
-- - Linha do tempo: a mudança de status vira o evento público
--   `demanda_encerrada` (BEFORE INSERT em `demand_events`, sem reescrever
--   `demands_record_event`), com `payload->'public'` = data e registro final.
-- - Processos de Conexão da demanda ainda abertos vão, na mesma transação, ao
--   status final adequado (decisão 16, sem status novo no processo):
--   `em_execucao` → `concluida` → `prestacao_de_contas`, `concluida` →
--   `prestacao_de_contas`; os que não chegaram à execução (inclusive pausados)
--   → `cancelada`, com a justificativa do encerramento. Cada mudança grava
--   `processo_status_alterado` na linha do tempo do processo (026).
-- - Dossiê: `demand_dossiers.trigger_kind` aceita `encerramento` (integral e
--   pública), pedida pelo post-service depois do encerramento.
-- - A gestão lê as colunas novas pela concessão de SELECT em `demands` que já
--   existe (dm-infra gestao/007); não há objeto novo a conceder.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).
-- `ADD VALUE` não pode ser usado na mesma transação (o e2e aplica cada arquivo
-- numa transação implícita): aqui o valor novo só aparece comparado como texto
-- (`status::text = 'encerrada'`), nunca convertido para o enum.

ALTER TYPE demand_status ADD VALUE IF NOT EXISTS 'encerrada';

ALTER TABLE demands
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closing_summary TEXT,
  ADD COLUMN IF NOT EXISTS closing_responsibles TEXT;

DO $$ BEGIN
  ALTER TABLE demands ADD CONSTRAINT demands_closing_fields CHECK (
    (closing_summary IS NULL OR (btrim(closing_summary) <> '' AND char_length(closing_summary) <= 8000))
    AND (closing_responsibles IS NULL
         OR (btrim(closing_responsibles) <> '' AND char_length(closing_responsibles) <= 2000)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Encerrada ⇔ registro final completo (arquivada depois do encerramento
-- guarda o registro).
DO $$ BEGIN
  ALTER TABLE demands ADD CONSTRAINT demands_closed CHECK (
    status::text <> 'encerrada'
    OR (closed_at IS NOT NULL AND closing_summary IS NOT NULL AND closing_responsibles IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Transições de status fora da análise (espelha ACTIONS em state-machine.js;
-- substitui a da 007, que é reaplicada antes desta).
CREATE OR REPLACE FUNCTION demand_status_transition_allowed(
  from_status demand_status, to_status demand_status, actor TEXT
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN (from_status::text, to_status::text) = ('publicada', 'em_busca_de_parceiro')
      THEN actor IN ('agente', 'sistema')
    WHEN to_status::text = 'conectada' AND from_status::text IN ('publicada', 'em_busca_de_parceiro')
      THEN actor IN ('agente', 'sistema')
    WHEN (from_status::text, to_status::text) IN (
      ('conectada', 'em_execucao'),
      ('em_execucao', 'concluida'),
      ('concluida', 'prestacao_de_contas'),
      ('prestacao_de_contas', 'encerrada'))
      THEN actor = 'agente'
    ELSE false
  END
$$;

-- Registro final: grava-se só no encerramento, com a prestação concluída.
CREATE OR REPLACE FUNCTION demands_closure_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  closing BOOLEAN := NEW.status::text = 'encerrada' AND OLD.status::text <> 'encerrada';
BEGIN
  IF NOT closing THEN
    IF (NEW.closed_at, NEW.closing_summary, NEW.closing_responsibles)
       IS DISTINCT FROM (OLD.closed_at, OLD.closing_summary, OLD.closing_responsibles) THEN
      RAISE EXCEPTION 'o registro final é gravado só no encerramento da demanda'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF demand_actor_type() <> 'agente' OR OLD.status::text <> 'prestacao_de_contas' THEN
    RAISE EXCEPTION 'transição não permitida (%): % → encerrada', demand_actor_type(), OLD.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(btrim(NEW.closing_summary), '') = '' OR coalesce(btrim(NEW.closing_responsibles), '') = '' THEN
    RAISE EXCEPTION 'o encerramento exige o registro final e os responsáveis'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM demand_accountability
                  WHERE demand_id = NEW.id AND status = 'concluida') THEN
    RAISE EXCEPTION 'o encerramento exige a prestação de contas concluída'
      USING ERRCODE = 'check_violation';
  END IF;
  NEW.closed_at := NOW();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demands_closure_guard ON demands;
CREATE TRIGGER demands_closure_guard
  BEFORE UPDATE ON demands
  FOR EACH ROW EXECUTE FUNCTION demands_closure_guard();

-- Linha do tempo: a mudança para `encerrada` é o evento público
-- `demanda_encerrada`, com a data e o registro final (os responsáveis ficam
-- no payload privado). SECURITY DEFINER como `demands_record_event`.
CREATE OR REPLACE FUNCTION demand_events_closure() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d RECORD;
BEGIN
  IF NEW.event_type <> 'status_alterado' OR NEW.to_status::text IS DISTINCT FROM 'encerrada' THEN
    RETURN NEW;
  END IF;
  SELECT closed_at, closing_summary, closing_responsibles INTO d FROM demands WHERE id = NEW.demand_id;
  NEW.event_type := 'demanda_encerrada';
  NEW.is_public := true;
  NEW.payload := coalesce(NEW.payload, '{}'::jsonb) || jsonb_build_object(
    'closing_responsibles', d.closing_responsibles,
    'public', jsonb_strip_nulls(jsonb_build_object(
      'closedAt', d.closed_at,
      'closingSummary', d.closing_summary)));
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION demand_events_closure() FROM PUBLIC;

DROP TRIGGER IF EXISTS demand_events_closure ON demand_events;
CREATE TRIGGER demand_events_closure
  BEFORE INSERT ON demand_events
  FOR EACH ROW EXECUTE FUNCTION demand_events_closure();

-- Processos da demanda ao status final adequado, na mesma transação. O nome
-- ordena depois de `demands_record_event`: o evento da demanda vem primeiro.
CREATE OR REPLACE FUNCTION demands_settle_processes() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  p RECORD;
  closing_note CONSTANT TEXT := 'Demanda encerrada pelo Agente de Transformação (Modelo de Conexão §22).';
BEGIN
  IF NEW.status::text <> 'encerrada' OR OLD.status::text = 'encerrada' THEN
    RETURN NULL;
  END IF;
  FOR p IN SELECT id, status::text AS status FROM connection_processes
            WHERE demand_id = NEW.id AND closed_at IS NULL
            ORDER BY sequence_in_demand FOR UPDATE
  LOOP
    IF p.status = 'em_execucao' THEN
      UPDATE connection_processes
         SET status = 'concluida', status_note = closing_note,
             status_changed_by = NEW.author_id, status_changed_by_kind = 'agente'
       WHERE id = p.id;
      p.status := 'concluida';
    END IF;
    IF p.status = 'concluida' THEN
      UPDATE connection_processes
         SET status = 'prestacao_de_contas', status_note = closing_note,
             status_changed_by = NEW.author_id, status_changed_by_kind = 'agente'
       WHERE id = p.id;
    ELSE
      UPDATE connection_processes
         SET status = 'cancelada', status_note = closing_note || ' O processo não chegou à execução.',
             status_changed_by = NEW.author_id, status_changed_by_kind = 'agente'
       WHERE id = p.id;
    END IF;
  END LOOP;
  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS demands_settle_processes ON demands;
CREATE TRIGGER demands_settle_processes
  AFTER UPDATE OF status ON demands
  FOR EACH ROW EXECUTE FUNCTION demands_settle_processes();

-- ---------------------------------------------------------------------------
-- Dossiê: versão `encerramento` (integral e pública).
DO $$ BEGIN
  IF to_regclass('public.demand_dossiers') IS NULL THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_trigger_kind_check'
                AND pg_get_constraintdef(oid) NOT LIKE '%encerramento%') THEN
    ALTER TABLE demand_dossiers DROP CONSTRAINT demand_dossiers_trigger_kind_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_trigger_kind_check') THEN
    ALTER TABLE demand_dossiers ADD CONSTRAINT demand_dossiers_trigger_kind_check
      CHECK (trigger_kind IN ('envio', 'reenvio', 'publicacao', 'conclusao', 'prestacao_de_contas', 'encerramento'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_public_variant'
                AND pg_get_constraintdef(oid) NOT LIKE '%encerramento%') THEN
    ALTER TABLE demand_dossiers DROP CONSTRAINT demand_dossiers_public_variant;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_dossiers'::regclass AND conname = 'demand_dossiers_public_variant') THEN
    ALTER TABLE demand_dossiers ADD CONSTRAINT demand_dossiers_public_variant
      CHECK (variant = 'integral' OR trigger_kind IN ('publicacao', 'conclusao', 'prestacao_de_contas', 'encerramento'));
  END IF;
END $$;
