-- Migração 042: critérios de prioridade declarados pelo Agente (T-02-01).
--
-- Fonte: Fluxo de Cadastro do Agente de Transformação, slide 8 ("Nível de
-- prioridade conforme critérios definidos pela plataforma"). Decisão 17
-- (dm-docs/fonte-da-verdade/decisoes-de-implementacao.md): os quatro critérios
-- são risco à vida ou à segurança, número de pessoas afetadas, prazo ou
-- sazonalidade e recurso ou parceiro já disponível. O Agente declara a
-- prioridade e os critérios que a justificam; a análise na gestão confere; o
-- critério fica registrado na linha do tempo.
--
-- Decisões:
-- - `demands.priority_criteria TEXT[]`, subconjunto dos quatro identificadores
--   de `services/post-service/src/demand/priority.js` (CHECK). Opcional: o
--   envio avisa quando a prioridade é alta ou urgente sem critério declarado,
--   mas não bloqueia.
-- - Muda só quando o conteúdo da demanda é editável (rascunho ou devolvida),
--   como os demais campos; a gestão nunca grava (trigger próprio, para não
--   reescrever `demands_guard`).
-- - O registro `enviada_para_analise` em `demand_events` passa a levar
--   `priority` e `priority_criteria` no `payload` (trigger BEFORE INSERT em
--   `demand_events`, sem reescrever `demands_record_event`).
-- - A gestão lê pela concessão de SELECT na tabela `demands` que já existe
--   (dmconecta-infra/db/migrations/gestao/007): coluna nova não pede grant.
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

ALTER TABLE demands
  ADD COLUMN IF NOT EXISTS priority_criteria TEXT[] NOT NULL DEFAULT '{}';

DO $$ BEGIN
  ALTER TABLE demands ADD CONSTRAINT demands_priority_criteria_known CHECK (
    priority_criteria <@ ARRAY['risco_vida_seguranca', 'pessoas_afetadas',
                               'prazo_sazonalidade', 'recurso_disponivel']::TEXT[]
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION demands_priority_criteria_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.priority_criteria IS NOT DISTINCT FROM OLD.priority_criteria THEN
    RETURN NEW;
  END IF;
  IF demand_actor_type() = 'gestao' THEN
    RAISE EXCEPTION 'os critérios de prioridade são declarados pelo Agente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (OLD.status = 'em_analise' AND OLD.review_state IN ('rascunho', 'devolvida')) THEN
    RAISE EXCEPTION 'a demanda só é editada em rascunho ou devolvida (estado: %/%)', OLD.status, OLD.review_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demands_priority_criteria_guard ON demands;
CREATE TRIGGER demands_priority_criteria_guard
  BEFORE UPDATE OF priority_criteria ON demands
  FOR EACH ROW EXECUTE FUNCTION demands_priority_criteria_guard();

-- Linha do tempo: o envio registra a prioridade e os critérios declarados.
-- SECURITY DEFINER como `demands_record_event`, que faz o INSERT.
CREATE OR REPLACE FUNCTION demand_events_priority_criteria() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  d RECORD;
BEGIN
  IF NEW.event_type <> 'enviada_para_analise' THEN
    RETURN NEW;
  END IF;
  SELECT priority, priority_criteria INTO d FROM demands WHERE id = NEW.demand_id;
  IF FOUND THEN
    NEW.payload := coalesce(NEW.payload, '{}'::jsonb) || jsonb_build_object(
      'priority', d.priority::text,
      'priority_criteria', to_jsonb(coalesce(d.priority_criteria, '{}'::TEXT[]))
    );
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demand_events_priority_criteria ON demand_events;
CREATE TRIGGER demand_events_priority_criteria
  BEFORE INSERT ON demand_events
  FOR EACH ROW EXECUTE FUNCTION demand_events_priority_criteria();
