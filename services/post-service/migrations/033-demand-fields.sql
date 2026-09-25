-- Migração 033: campos da demanda do Modelo de Conexão §04 e §05 (T-05-09).
--
-- Fonte: Modelo de Conexão §04 ("Problema identificado", "Área de
-- abrangência"; orçamento com "Item, Descrição, Quantidade, Unidade, Valor
-- unitário, Valor total, Fornecedor ou referência"; "O sistema pode receber
-- uma planilha detalhada") e §05 (cada etapa com "Prazo, Recursos
-- necessários, Valor associado, Status").
--
-- Decisões:
-- - `demands.problem_identified` e `demands.coverage_area`: texto, anuláveis
--   (o rascunho é parcial) e **obrigatórios no envio** — o banco confere em
--   `demand_assert_submittable` (cópia integral da função da 024 com as duas
--   conferências novas) e o domínio em `src/demand/validation.js`
--   (`REQUIRED_ON_SUBMIT`). Mudam só com a demanda em rascunho ou devolvida e
--   a gestão nunca grava (trigger próprio, para não reescrever `demands_guard`).
-- - `demand_budget_items.item` (nome curto do item, separado da descrição) e
--   `supplier_reference` (fornecedor ou referência do preço). Opcionais.
-- - `demand_schedule_items.resources_needed` e `amount_cents` (valor associado
--   à etapa, informativo: a composição continua sendo a soma dos itens do
--   orçamento, e o físico-financeiro mostra etapa × itens vinculados). O
--   "Prazo" é derivado (término − início + 1 dias, na projeção) e o status da
--   etapa é o da execução (T-05-11, `demand_stage_status`), não uma coluna aqui.
-- - Itens mudam só em rascunho/devolvida pelo `demand_items_guard` que já
--   existe; a gestão lê pelas concessões de SELECT da 007 (coluna nova não pede
--   grant).
--
-- Idempotente: pode rodar de novo (o deploy reaplica o manifesto inteiro).

ALTER TABLE demands
  ADD COLUMN IF NOT EXISTS problem_identified TEXT,
  ADD COLUMN IF NOT EXISTS coverage_area TEXT;

DO $$ BEGIN
  ALTER TABLE demands ADD CONSTRAINT demands_problem_identified_length
    CHECK (problem_identified IS NULL OR char_length(problem_identified) <= 5000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE demands ADD CONSTRAINT demands_coverage_area_length
    CHECK (coverage_area IS NULL OR char_length(coverage_area) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE demand_budget_items
  ADD COLUMN IF NOT EXISTS item VARCHAR(200),
  ADD COLUMN IF NOT EXISTS supplier_reference VARCHAR(500);

ALTER TABLE demand_schedule_items
  ADD COLUMN IF NOT EXISTS resources_needed TEXT,
  ADD COLUMN IF NOT EXISTS amount_cents BIGINT;

DO $$ BEGIN
  ALTER TABLE demand_schedule_items ADD CONSTRAINT demand_schedule_items_amount
    CHECK (amount_cents IS NULL OR (amount_cents >= 0 AND amount_cents <= 100000000000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE demand_schedule_items ADD CONSTRAINT demand_schedule_items_resources_length
    CHECK (resources_needed IS NULL OR char_length(resources_needed) <= 2000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Problema identificado e área de abrangência: conteúdo do Agente, editável só
-- em rascunho ou devolvida.
CREATE OR REPLACE FUNCTION demands_content_fields_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.problem_identified, NEW.coverage_area)
     IS NOT DISTINCT FROM (OLD.problem_identified, OLD.coverage_area) THEN
    RETURN NEW;
  END IF;
  IF demand_actor_type() = 'gestao' THEN
    RAISE EXCEPTION 'problema identificado e área de abrangência são informados pelo Agente'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (OLD.status = 'em_analise' AND OLD.review_state IN ('rascunho', 'devolvida')) THEN
    RAISE EXCEPTION 'a demanda só é editada em rascunho ou devolvida (estado: %/%)', OLD.status, OLD.review_state
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS demands_content_fields_guard ON demands;
CREATE TRIGGER demands_content_fields_guard
  BEFORE UPDATE OF problem_identified, coverage_area ON demands
  FOR EACH ROW EXECUTE FUNCTION demands_content_fields_guard();

-- Envio da demanda: cópia integral da função da migração 024 com as
-- conferências de problema identificado e área de abrangência (§04).
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
  IF d.latitude IS NULL OR d.longitude IS NULL THEN missing := array_append(missing, 'latitude'); END IF;
  IF coalesce(btrim(d.title), '') = '' THEN missing := array_append(missing, 'title'); END IF;
  IF coalesce(btrim(d.description), '') = '' THEN missing := array_append(missing, 'description'); END IF;
  IF coalesce(btrim(d.problem_identified), '') = '' THEN missing := array_append(missing, 'problem_identified'); END IF;
  IF coalesce(btrim(d.objective), '') = '' THEN missing := array_append(missing, 'objective'); END IF;
  IF coalesce(btrim(d.justification), '') = '' THEN missing := array_append(missing, 'justification'); END IF;
  IF coalesce(btrim(d.beneficiaries_profile), '') = '' THEN missing := array_append(missing, 'beneficiaries_profile'); END IF;
  IF coalesce(btrim(d.photo_ref), '') = '' THEN missing := array_append(missing, 'photo_ref'); END IF;
  IF coalesce(btrim(d.municipality), '') = '' THEN missing := array_append(missing, 'municipality'); END IF;
  IF d.uf IS NULL THEN missing := array_append(missing, 'uf'); END IF;
  IF coalesce(btrim(d.territory), '') = '' THEN missing := array_append(missing, 'territory'); END IF;
  IF coalesce(btrim(d.coverage_area), '') = '' THEN missing := array_append(missing, 'coverage_area'); END IF;

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
