-- Migração 010: perfil de apoio e conexão vinculada à demanda (T15).
--
-- Fonte: 01-apresentacao-institucional.html, slides 10 e 11 (Parceiros e Poder
-- Público: "filtrar oportunidades de apoio", "demonstrar interesse",
-- "solicitar conexão") e 02-fluxo-cadastro-agente-de-transformacao.html,
-- slides 20 e 22 (a demanda publicada é vista pelos parceiros "de acordo com
-- suas características e critérios de compatibilidade").
--
-- - `partner_profiles`: onde a conta atua (todo o país, UFs, municípios no
--   formato "Município/UF", bairros/territórios), as categorias de demanda de
--   interesse e os tipos de recurso que oferece (os mesmos vocabulários da
--   demanda no post_db). É a base do cálculo de compatibilidade do
--   post-service (src/interest/compatibility.js), sem IA. Privado: só a
--   própria conta lê e escreve (GET/PUT /me/partner-profile); a gestão lê
--   (SELECT padrão do gestao_app no user_db e grant explícito no dm-infra,
--   db/migrations/gestao/012-gestao-app-user-partner-profiles.sql).
-- - `connections.demand_id`: a demanda (post_db.demands.id, outra base, sem
--   FK) de onde saiu o pedido de conexão. O post-service confere o vínculo
--   antes de levar a demanda a `conectada`.
--
-- Idempotente: pode rodar de novo.

ALTER TABLE connections ADD COLUMN IF NOT EXISTS demand_id UUID;
CREATE INDEX IF NOT EXISTS idx_connections_demand ON connections(demand_id) WHERE demand_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS partner_profiles (
  user_id              UUID PRIMARY KEY REFERENCES profiles(user_id) ON DELETE CASCADE,
  nationwide           BOOLEAN NOT NULL DEFAULT false,
  ufs                  TEXT[] NOT NULL DEFAULT '{}',
  municipalities       TEXT[] NOT NULL DEFAULT '{}',
  territories          TEXT[] NOT NULL DEFAULT '{}',
  interest_categories  TEXT[] NOT NULL DEFAULT '{}',
  offered_resources    TEXT[] NOT NULL DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT partner_profiles_sizes CHECK (
    cardinality(ufs) <= 27 AND cardinality(municipalities) <= 30 AND cardinality(territories) <= 30),
  CONSTRAINT partner_profiles_ufs CHECK (array_to_string(ufs, ',') ~ '^([A-Z]{2}(,[A-Z]{2})*)?$'),
  CONSTRAINT partner_profiles_municipalities CHECK (
    array_to_string(municipalities, '|') ~ '^([^|/]{1,120}/[A-Z]{2}(\|[^|/]{1,120}/[A-Z]{2})*)?$'),
  CONSTRAINT partner_profiles_territories CHECK (
    array_to_string(territories, '|') ~ '^([^|]{1,120}(\|[^|]{1,120})*)?$'),
  -- Categorias da demanda (post_db demand_category).
  CONSTRAINT partner_profiles_categories CHECK (interest_categories <@ ARRAY[
    'projeto_social', 'projeto_ambiental', 'necessidade_de_patrocinio', 'problema_urbano', 'problema_urgente'
  ]::text[]),
  -- Recursos necessários da demanda (post_db demand_resource_type, lista `necessario`).
  CONSTRAINT partner_profiles_resources CHECK (offered_resources <@ ARRAY[
    'recursos_financeiros', 'materiais', 'servicos', 'equipamentos', 'mao_de_obra',
    'estrutura', 'apoio_tecnico', 'conhecimento_especializado', 'servicos_de_fotografia_e_filmagem'
  ]::text[])
);
