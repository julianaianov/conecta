-- T-05-08: módulos específicos da demanda (Modelo de Conexão §29, com os
-- casos dos §23 Obra, §24 Restinga e §25 Projeto Social). Decisão 15: o
-- módulo é **derivado** da categoria, nunca escolhido; define documentos,
-- indicadores sugeridos, marcos do registro e informações específicas.
--
--   Obras                   obra ou melhoria de infraestrutura, revitalização de espaço
--   Ambiental               projeto ambiental, recuperação ambiental
--   Social                  projeto social
--   Apoio/Investimento      necessidade de patrocínio, apoio técnico, com serviços, com materiais
--   Articulação Pública     problema urbano, problema urgente, outras demandas territoriais
--
-- Espelhos: src/demand/modules.js (MODULE_BY_CATEGORY, documentos, indicadores,
-- marcos e campos), portal src/lib/app/demand-modules.ts e dm-gestao
-- (App\Support\DemandModule). test/demand-schema.test.js confere.
--
-- Idempotente. ADD VALUE com BEFORE mantém a sequência do §24
-- (ANTES → DIAGNÓSTICO → INTERVENÇÃO → MONITORAMENTO → RESULTADO) na ordem do
-- enum.

-- Documentos possíveis dos §23 e §25 e do plano/relatório do §24.
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'documento_do_imovel';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'projeto_arquitetonico';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'art_rrt';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'licencas_ou_autorizacoes';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'contratos';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'notas_fiscais';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'comprovantes';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'relatorio_de_execucao';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'plano_de_trabalho';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'metodologia';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'equipe';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'publico_alvo';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'plano_de_recuperacao';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'plano_de_monitoramento';
ALTER TYPE demand_document_type ADD VALUE IF NOT EXISTS 'relatorio_ambiental';

-- Marcos do módulo ambiental (§24, "Estrutura visual"), entre `antes` e
-- `acompanhamento`.
ALTER TYPE demand_record_milestone ADD VALUE IF NOT EXISTS 'diagnostico' BEFORE 'acompanhamento';
ALTER TYPE demand_record_milestone ADD VALUE IF NOT EXISTS 'intervencao' BEFORE 'acompanhamento';
ALTER TYPE demand_record_milestone ADD VALUE IF NOT EXISTS 'monitoramento' BEFORE 'acompanhamento';

-- Módulo da categoria (tabela do §29).
CREATE OR REPLACE FUNCTION demand_module(category TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE category
    WHEN 'obra_ou_melhoria_de_infraestrutura' THEN 'obras'
    WHEN 'revitalizacao_de_espaco' THEN 'obras'
    WHEN 'projeto_ambiental' THEN 'ambiental'
    WHEN 'recuperacao_ambiental' THEN 'ambiental'
    WHEN 'projeto_social' THEN 'social'
    WHEN 'necessidade_de_patrocinio' THEN 'apoio_investimento'
    WHEN 'apoio_tecnico' THEN 'apoio_investimento'
    WHEN 'apoio_com_servicos' THEN 'apoio_investimento'
    WHEN 'apoio_com_materiais' THEN 'apoio_investimento'
    WHEN 'problema_urbano' THEN 'articulacao_publica'
    WHEN 'problema_urgente' THEN 'articulacao_publica'
    WHEN 'outras_demandas_territoriais' THEN 'articulacao_publica'
  END
$$;

-- Informações específicas do módulo (§23: imóvel, área, responsável técnico;
-- §24: área, diagnóstico, situação atual, vegetação, metodologia, responsável
-- técnico, plano de monitoramento; §25: equipe, público-alvo, metodologia).
-- O formato de cada chave é validado em src/demand/validation.js; aqui só o
-- tipo (objeto) e um teto de tamanho.
ALTER TABLE demands ADD COLUMN IF NOT EXISTS module_details JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$ BEGIN
  ALTER TABLE demands ADD CONSTRAINT demands_module_details_object
    CHECK (jsonb_typeof(module_details) = 'object' AND pg_column_size(module_details) <= 65536);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
