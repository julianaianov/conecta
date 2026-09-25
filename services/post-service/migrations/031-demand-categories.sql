-- T-05-07: os 12 tipos de demanda do Modelo de Conexão §03 e as 5 classes da
-- legenda do mapa (Apresentação Institucional, slide 19). Decisão 15 em
-- dm-docs/fonte-da-verdade/decisoes-de-implementacao.md.
--
-- Categoria = classificação única da demanda, com os 12 tipos literais do §03
-- na ordem da fonte. Os 5 valores da migração 007 continuam válidos (nenhum
-- dado muda); os 7 abaixo completam a lista.
--
-- Espelhos: src/demand/constants.js (CATEGORIES, CATEGORY_MAP_CLASS),
-- src/map/constants.js (LEGEND), user-service/src/partner-profile.js e a
-- migração user 015, portal src/lib/app/{types,demand,map}.ts e dm-gestao
-- (Demand::CATEGORIES, App\Support\MapLegend). test/demand-schema.test.js
-- confere a lista e o mapeamento.
--
-- Idempotente. `ALTER TYPE ... ADD VALUE` não pode ser usado na mesma
-- transação em que é criado; as funções abaixo comparam por texto e não usam
-- os valores novos como literais do enum.

ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'obra_ou_melhoria_de_infraestrutura';
ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'revitalizacao_de_espaco';
ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'recuperacao_ambiental';
ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'apoio_tecnico';
ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'apoio_com_servicos';
ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'apoio_com_materiais';
ALTER TYPE demand_category ADD VALUE IF NOT EXISTS 'outras_demandas_territoriais';

-- Classe da legenda do mapa (slide 19): "Problemas urgentes", "Problemas
-- urbanos", "Projetos sociais", "Ações ambientais", "Necessidades
-- (Oportunidades de patrocínio)". Os ids são os mesmos da legenda desde a T20.
CREATE OR REPLACE FUNCTION demand_map_class(category TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE category
    WHEN 'problema_urgente' THEN 'problemas_urgentes'
    WHEN 'problema_urbano' THEN 'problemas_urbanos'
    WHEN 'obra_ou_melhoria_de_infraestrutura' THEN 'problemas_urbanos'
    WHEN 'revitalizacao_de_espaco' THEN 'problemas_urbanos'
    WHEN 'projeto_social' THEN 'projetos_sociais'
    WHEN 'projeto_ambiental' THEN 'acoes_ambientais'
    WHEN 'recuperacao_ambiental' THEN 'acoes_ambientais'
    WHEN 'necessidade_de_patrocinio' THEN 'necessidades'
    WHEN 'apoio_tecnico' THEN 'necessidades'
    WHEN 'apoio_com_servicos' THEN 'necessidades'
    WHEN 'apoio_com_materiais' THEN 'necessidades'
    WHEN 'outras_demandas_territoriais' THEN 'necessidades'
  END
$$;

-- Tipo do post-vitrine criado na publicação. A 007 grava `need` para
-- patrocínio, `problem` para problema urbano/urgente e `project` para o resto;
-- os tipos novos seguem: obra, revitalização e recuperação → `project`;
-- apoios → `need`; outras demandas territoriais → `problem`.
CREATE OR REPLACE FUNCTION demand_post_type(category TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE category
    WHEN 'necessidade_de_patrocinio' THEN 'need'
    WHEN 'apoio_tecnico' THEN 'need'
    WHEN 'apoio_com_servicos' THEN 'need'
    WHEN 'apoio_com_materiais' THEN 'need'
    WHEN 'problema_urbano' THEN 'problem'
    WHEN 'problema_urgente' THEN 'problem'
    WHEN 'outras_demandas_territoriais' THEN 'problem'
    ELSE 'project'
  END
$$;

-- O post-vitrine é inserido por `demands_record_event` (007). Em vez de
-- reescrever aquela função inteira (outras migrações podem redefini-la), um
-- gatilho BEFORE INSERT em `posts` acerta o tipo pelo mapeamento acima quando
-- o post nasce de uma demanda.
CREATE OR REPLACE FUNCTION posts_demand_post_type() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  cat TEXT;
BEGIN
  IF NEW.demand_id IS NOT NULL THEN
    SELECT category::text INTO cat FROM demands WHERE id = NEW.demand_id;
    IF cat IS NOT NULL THEN
      NEW.type := demand_post_type(cat)::post_type;
    END IF;
  END IF;
  RETURN NEW;
END
$$;

REVOKE ALL ON FUNCTION posts_demand_post_type() FROM PUBLIC;

DROP TRIGGER IF EXISTS posts_demand_post_type ON posts;
CREATE TRIGGER posts_demand_post_type
  BEFORE INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION posts_demand_post_type();
