-- T-05-07: as categorias de interesse do perfil de apoio (T15) passam a ser os
-- 12 tipos de demanda do Modelo de Conexão §03, os mesmos de post_db
-- demand_category (post-service/migrations/031-demand-categories.sql).
-- Decisão 15. Espelho: src/partner-profile.js (INTEREST_CATEGORIES);
-- test/partner-profile.test.js confere as duas listas.
--
-- Idempotente: recria o CHECK com a lista completa. As 5 categorias antigas
-- continuam na lista, então nenhum perfil gravado deixa de ser válido.

ALTER TABLE partner_profiles DROP CONSTRAINT IF EXISTS partner_profiles_categories;
ALTER TABLE partner_profiles ADD CONSTRAINT partner_profiles_categories CHECK (interest_categories <@ ARRAY[
  'projeto_social', 'projeto_ambiental', 'necessidade_de_patrocinio', 'problema_urbano', 'problema_urgente',
  'obra_ou_melhoria_de_infraestrutura', 'revitalizacao_de_espaco', 'recuperacao_ambiental',
  'apoio_tecnico', 'apoio_com_servicos', 'apoio_com_materiais', 'outras_demandas_territoriais'
]::text[]);
