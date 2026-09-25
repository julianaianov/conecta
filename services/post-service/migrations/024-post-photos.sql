-- Migração 024: foto e ponto obrigatórios para aparecer no mapa.
--
-- Regra do produto (Apresentação, slide 19: o mapa é a leitura do território):
-- um sinal do feed só entra no mapa com fotografia e localização. Até aqui o
-- feed não tinha upload de foto e a demanda podia ser enviada sem coordenada.
--
-- 1. `uploads` ganha a finalidade `post_photo` (foto do sinal do feed) e a
--    coluna de vínculo `post_id`. A foto é confirmada ANTES do post existir
--    (vínculo adiado): a confirmação grava `object_key` em
--    `posts/<owner_id>/photo/<id>.<ext>` e o POST /posts preenche `post_id`.
--    Por isso a regra `uploads_confirmed_complete` aceita `post_photo`
--    confirmada sem alvo.
-- 2. `demand_assert_submittable` passa a exigir latitude e longitude (a
--    validação por campo em src/demand/validation.js espelha).
-- 3. Índice da camada do feed no mapa restrito a posts com foto.
--
-- Idempotente: pode rodar de novo.

ALTER TABLE uploads ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES posts(id);
CREATE INDEX IF NOT EXISTS idx_uploads_post ON uploads(post_id) WHERE post_id IS NOT NULL;

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_purpose_check;
ALTER TABLE uploads ADD CONSTRAINT uploads_purpose_check CHECK (purpose IN (
  'demand_photo', 'demand_evidence_photo', 'demand_evidence_video', 'demand_document',
  'demand_dossier', 'demand_accountability_document', 'post_photo')) NOT VALID; -- NOT VALID: ver 009

ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_confirmed_complete;
ALTER TABLE uploads ADD CONSTRAINT uploads_confirmed_complete CHECK (
  status = 'pendente'
  OR (object_key IS NOT NULL AND size_bytes IS NOT NULL AND confirmed_at IS NOT NULL
      AND (demand_id IS NOT NULL OR post_id IS NOT NULL OR purpose = 'post_photo'))
);

-- Foto do sinal: só uma finalidade vincula a post, e nunca as duas colunas.
ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_single_target;
ALTER TABLE uploads ADD CONSTRAINT uploads_single_target CHECK (
  NOT (demand_id IS NOT NULL AND post_id IS NOT NULL)
  AND (post_id IS NULL OR purpose = 'post_photo')
);

-- Camada de conteúdos do feed (T20): só sinal com ponto e foto.
DROP INDEX IF EXISTS idx_posts_map_points;
CREATE INDEX IF NOT EXISTS idx_posts_map_points
  ON posts(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND cardinality(images) > 0;

-- Envio da demanda: o ponto no mapa passa a ser obrigatório (cópia integral da
-- função da migração 007 com a conferência de latitude/longitude).
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
