-- Migração 036: registro de resultados — quem participou, quando, onde e o
-- resultado final (T-05-13).
--
-- Fonte: dm-docs/fonte-da-verdade/05 (Modelo de Conexão) — §21 "O que foi
-- realizado? Onde? Quando? Quem participou? Quantas pessoas? Quais metas?
-- Quais indicadores? Quais recursos? Quais evidências? Qual foi o resultado
-- final?" e §22 ("Data de conclusão, Responsáveis, Registro final").
--
-- - `demand_accountability` ganha `participants` (quem participou),
--   `executed_from`/`executed_to` (quando), `location_summary` (onde, além do
--   endereço da demanda) e `final_result` (qual foi o resultado final).
--   `participants` e `final_result` passam a ser obrigatórios na conclusão:
--   o CHECK `demand_accountability_concluded` é recriado `NOT VALID` (a
--   prestação concluída antes desta migração não muda e não é revalidada).
-- - A conclusão grava `resultados_registrados` na linha do tempo de cada
--   Processo de Conexão da demanda (decisão 13; `demand_events.process_id`,
--   migração 026), público, e o evento `prestacao_de_contas_concluida` passa a
--   levar o período e o resultado final.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

ALTER TABLE demand_accountability ADD COLUMN IF NOT EXISTS participants     TEXT;
ALTER TABLE demand_accountability ADD COLUMN IF NOT EXISTS executed_from    DATE;
ALTER TABLE demand_accountability ADD COLUMN IF NOT EXISTS executed_to      DATE;
ALTER TABLE demand_accountability ADD COLUMN IF NOT EXISTS location_summary TEXT;
ALTER TABLE demand_accountability ADD COLUMN IF NOT EXISTS final_result     TEXT;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_accountability'::regclass
                    AND conname = 'demand_accountability_results_fields') THEN
    ALTER TABLE demand_accountability ADD CONSTRAINT demand_accountability_results_fields CHECK (
      (participants IS NULL OR (btrim(participants) <> '' AND char_length(participants) <= 4000))
      AND (location_summary IS NULL OR (btrim(location_summary) <> '' AND char_length(location_summary) <= 2000))
      AND (final_result IS NULL OR (btrim(final_result) <> '' AND char_length(final_result) <= 8000))
      AND (executed_from IS NULL OR executed_to IS NULL OR executed_from <= executed_to));
  END IF;
  -- O obrigatório da conclusão ganha "quem participou" e "resultado final".
  IF EXISTS (SELECT 1 FROM pg_constraint
              WHERE conrelid = 'demand_accountability'::regclass AND conname = 'demand_accountability_concluded'
                AND pg_get_constraintdef(oid) NOT LIKE '%final_result%') THEN
    ALTER TABLE demand_accountability DROP CONSTRAINT demand_accountability_concluded;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'demand_accountability'::regclass AND conname = 'demand_accountability_concluded') THEN
    ALTER TABLE demand_accountability ADD CONSTRAINT demand_accountability_concluded CHECK (
      status <> 'concluida' OR (
        execution_report IS NOT NULL
        AND actions_record IS NOT NULL
        AND schedule_summary IS NOT NULL
        AND beneficiaries_reached IS NOT NULL
        AND impact_indicators IS NOT NULL
        AND participants IS NOT NULL
        AND final_result IS NOT NULL
        AND (financial_support = FALSE OR financial_summary IS NOT NULL))) NOT VALID;
  END IF;
END $$;

-- Linha do tempo: a conclusão leva o período e o resultado final, e cada
-- Processo de Conexão da demanda recebe `resultados_registrados`.
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
              'impactIndicators', NEW.impact_indicators,
              'executedFrom', NEW.executed_from,
              'executedTo', NEW.executed_to,
              'finalResult', NEW.final_result))),
          true, clock_timestamp());

  IF to_regclass('public.connection_processes') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO demand_events (demand_id, process_id, event_type, actor_type, actor, payload, is_public, created_at)
      SELECT $1, p.id, 'resultados_registrados', 'agente', $2,
             jsonb_build_object('accountability_id', $3, 'process_id', p.id,
               'public', jsonb_strip_nulls(jsonb_build_object(
                 'beneficiariesReached', $4::integer, 'goalsTotal', $5::integer, 'goalsAchieved', $6::integer,
                 'executedFrom', $7::date, 'executedTo', $8::date))),
             true, clock_timestamp()
        FROM connection_processes p WHERE p.demand_id = $1
    $sql$ USING NEW.demand_id, NEW.author_id::text, NEW.id, NEW.beneficiaries_reached, goals_total,
                goals_achieved, NEW.executed_from, NEW.executed_to;
  END IF;
  RETURN NULL;
END
$$;
REVOKE ALL ON FUNCTION demand_accountability_record_event() FROM PUBLIC;
