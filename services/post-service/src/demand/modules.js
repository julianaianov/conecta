// Módulos específicos da demanda (T-05-08). Fonte: Modelo de Conexão §29
// ("Estrutura Padronizada x Módulos Específicos": 70% a 80% do fluxo é o
// núcleo comum; o resto é adaptado por módulo), com os casos de aplicação
// §23 (Obra ou melhoria na sede), §24 (Revitalização ou recuperação de
// restinga) e §25 (Projeto social), e §40 ("o que muda são os módulos
// específicos, documentos, responsáveis, aprovações, indicadores e requisitos
// técnicos").
//
// Decisão 15: o módulo é **derivado** da categoria (12 tipos do §03) pela
// tabela do §29 — nunca é escolhido pelo usuário. A função SQL
// `demand_module` (migração post 032) repete MODULE_BY_CATEGORY e
// test/demand-schema.test.js confere. Espelhos: portal
// src/lib/app/demand-modules.ts e dm-gestao App\Support\DemandModule.
//
// Tudo aqui é declarativo. Os marcos do módulo ambiental (MODULE_MILESTONES)
// já são aceitos no cronograma da demanda; o uso deles nas evidências da
// execução (src/execution/*) fica para a frente de execução, que lê esta
// definição.

const MODULES = ['obras', 'ambiental', 'social', 'apoio_investimento', 'articulacao_publica'];

const MODULE_LABELS = {
  obras: 'Módulo de Obras',
  ambiental: 'Módulo Ambiental',
  social: 'Módulo Social',
  apoio_investimento: 'Módulo de Apoio/Investimento',
  articulacao_publica: 'Módulo de Articulação Pública',
};

/** §29: tipo de demanda → módulo. Cada uma das 12 categorias cai em um. */
const MODULE_BY_CATEGORY = {
  obra_ou_melhoria_de_infraestrutura: 'obras',
  revitalizacao_de_espaco: 'obras',
  projeto_ambiental: 'ambiental',
  recuperacao_ambiental: 'ambiental',
  projeto_social: 'social',
  necessidade_de_patrocinio: 'apoio_investimento',
  apoio_tecnico: 'apoio_investimento',
  apoio_com_servicos: 'apoio_investimento',
  apoio_com_materiais: 'apoio_investimento',
  problema_urbano: 'articulacao_publica',
  problema_urgente: 'articulacao_publica',
  outras_demandas_territoriais: 'articulacao_publica',
};

/** Módulo da categoria (null sem categoria ou com valor desconhecido). */
function moduleOf(category) {
  return MODULE_BY_CATEGORY[category] ?? null;
}

/**
 * Documentos possíveis por módulo, na ordem da fonte (§23 "Documentos
 * possíveis", §24 fluxo específico e informações, §25 "Documentos possíveis").
 * Cronograma e orçamento não aparecem porque já são partes da demanda. Os
 * módulos sem lista própria usam só a lista comum (DOCUMENT_TYPES).
 */
const MODULE_DOCUMENT_TYPES = {
  obras: [
    'documentos_institucionais', 'documento_do_imovel', 'autorizacoes', 'projeto_arquitetonico',
    'projetos_tecnicos', 'orcamentos_e_cotacoes', 'art_rrt', 'licencas_ou_autorizacoes', 'contratos',
    'notas_fiscais', 'comprovantes', 'relatorio_de_execucao',
  ],
  ambiental: [
    'fotografias', 'metodologia', 'plano_de_recuperacao', 'licencas_ou_autorizacoes',
    'plano_de_monitoramento', 'relatorio_ambiental',
  ],
  social: [
    'projetos_tecnicos', 'plano_de_trabalho', 'orcamentos_e_cotacoes', 'metodologia',
    'documentos_institucionais', 'equipe', 'publico_alvo', 'relatorio_de_execucao', 'comprovantes',
    'fotografias',
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

/**
 * Indicadores sugeridos por módulo, com o texto literal da fonte (§23
 * "Indicadores", §24 "Indicadores possíveis", §25 "Indicadores possíveis").
 * São atalhos para o campo "indicador" das metas; o indicador continua texto.
 */
const MODULE_INDICATORS = {
  obras: [
    'Área reformada', 'Etapas concluídas', 'Valor executado', 'Prazo', 'Número de beneficiários',
    'Melhorias realizadas',
  ],
  ambiental: [
    'Área recuperada', 'Número de mudas', 'Espécies utilizadas', 'Taxa de sobrevivência',
    'Área monitorada', 'Ações realizadas', 'Período de acompanhamento',
  ],
  social: [
    'Número de beneficiários', 'Número de atividades', 'Número de atendimentos', 'Frequência',
    'Horas de atividade', 'Capacitações realizadas', 'Metas alcançadas', 'Resultados sociais',
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

/**
 * Marcos do registro fotográfico e audiovisual por módulo. O ambiental segue
 * a "Estrutura visual" do §24 (ANTES → DIAGNÓSTICO → INTERVENÇÃO →
 * MONITORAMENTO → RESULTADO, com `depois` como resultado); os demais, os
 * três marcos do núcleo comum (slide 14 do Fluxo do Agente).
 */
const BASE_MILESTONES = ['antes', 'acompanhamento', 'depois'];

const MODULE_MILESTONES = {
  obras: BASE_MILESTONES,
  ambiental: ['antes', 'diagnostico', 'intervencao', 'monitoramento', 'depois'],
  social: BASE_MILESTONES,
  apoio_investimento: BASE_MILESTONES,
  articulacao_publica: BASE_MILESTONES,
};

/** Marcos aceitos para uma categoria (sem categoria: os três comuns). */
function milestonesFor(category) {
  return MODULE_MILESTONES[moduleOf(category)] ?? BASE_MILESTONES;
}

/**
 * Informações específicas (`demands.module_details`, JSONB). Chaves em
 * snake_case, iguais às gravadas. Tipos: `text` (texto de até `max`
 * caracteres), `number` (decimal ≥ 0) e `group` (objeto com subcampos de
 * texto). Nenhuma é obrigatória: a fonte lista o que o módulo "pode" pedir;
 * no envio, o que falta vira aviso.
 */
const PERSON_FIELDS = [
  { key: 'nome', label: 'Nome', max: 200 },
  { key: 'registro', label: 'Registro profissional (CREA, CAU, CRBio ou outro)', max: 120 },
];

const MODULE_FIELDS = {
  obras: [
    { key: 'area_m2', label: 'Área da obra ou reforma (m²)', type: 'number' },
    {
      key: 'imovel',
      label: 'Imóvel',
      type: 'group',
      fields: [
        { key: 'documento', label: 'Documento do imóvel (matrícula, escritura, cessão ou outro)', max: 500 },
        { key: 'autorizacao', label: 'Autorização para a obra (quem autoriza e como)', max: 500 },
      ],
    },
    { key: 'responsavel_tecnico', label: 'Responsável técnico', type: 'group', fields: PERSON_FIELDS },
  ],
  ambiental: [
    { key: 'area_m2', label: 'Área (m²)', type: 'number' },
    { key: 'diagnostico', label: 'Diagnóstico', type: 'text', max: 4000 },
    { key: 'situacao_atual', label: 'Situação atual', type: 'text', max: 4000 },
    { key: 'vegetacao', label: 'Vegetação', type: 'text', max: 2000 },
    { key: 'metodologia', label: 'Metodologia', type: 'text', max: 4000 },
    { key: 'responsavel_tecnico', label: 'Responsável técnico', type: 'group', fields: PERSON_FIELDS },
    { key: 'plano_de_monitoramento', label: 'Plano de monitoramento', type: 'text', max: 4000 },
  ],
  social: [
    { key: 'equipe', label: 'Equipe', type: 'text', max: 4000 },
    { key: 'publico_alvo', label: 'Público-alvo', type: 'text', max: 2000 },
    { key: 'metodologia', label: 'Metodologia', type: 'text', max: 4000 },
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

/** Maior área aceita em m² (100 km²). */
const MAX_AREA_M2 = 100_000_000;

/** Todas as chaves conhecidas (união dos módulos), com a definição. */
const FIELD_BY_KEY = Object.fromEntries(
  Object.values(MODULE_FIELDS).flat().map((field) => [field.key, field]),
);

/** Só as chaves do módulo da categoria (o que a leitura mostra). */
function detailsForCategory(category, details) {
  const fields = MODULE_FIELDS[moduleOf(category)] ?? [];
  const source = details && typeof details === 'object' && !Array.isArray(details) ? details : {};
  const out = {};
  for (const field of fields) {
    if (source[field.key] !== undefined && source[field.key] !== null) out[field.key] = source[field.key];
  }
  return out;
}

module.exports = {
  MODULES,
  MODULE_LABELS,
  MODULE_BY_CATEGORY,
  MODULE_DOCUMENT_TYPES,
  MODULE_INDICATORS,
  MODULE_MILESTONES,
  MODULE_FIELDS,
  BASE_MILESTONES,
  MAX_AREA_M2,
  FIELD_BY_KEY,
  moduleOf,
  milestonesFor,
  detailsForCategory,
};
