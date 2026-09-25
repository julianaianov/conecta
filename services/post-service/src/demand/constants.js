// Vocabulário da demanda (Fluxo 2 da fonte da verdade e decisões 4, 5 e 7).
// Os valores são os mesmos dos enums da migração post-service/007-demands.sql;
// test/demand-schema.test.js confere as duas listas.

// Os 12 tipos de demanda do Modelo de Conexão §03, na ordem e com o texto da
// fonte (decisão 15). As 5 primeiras são as da migração 007; as 7 seguintes
// vêm da migração 031. A categoria é a classificação única da demanda.
const CATEGORIES = [
  'projeto_social', 'projeto_ambiental', 'necessidade_de_patrocinio',
  'problema_urbano', 'problema_urgente',
  'obra_ou_melhoria_de_infraestrutura', 'revitalizacao_de_espaco', 'recuperacao_ambiental',
  'apoio_tecnico', 'apoio_com_servicos', 'apoio_com_materiais', 'outras_demandas_territoriais',
];

const CATEGORY_LABELS = {
  projeto_social: 'Projeto Social',
  projeto_ambiental: 'Projeto Ambiental',
  necessidade_de_patrocinio: 'Necessidade de Patrocínio',
  problema_urbano: 'Problema Urbano',
  problema_urgente: 'Problema Urgente',
  obra_ou_melhoria_de_infraestrutura: 'Obra ou melhoria de infraestrutura',
  revitalizacao_de_espaco: 'Revitalização de espaço',
  recuperacao_ambiental: 'Recuperação ambiental',
  apoio_tecnico: 'Apoio técnico',
  apoio_com_servicos: 'Apoio com serviços',
  apoio_com_materiais: 'Apoio com materiais',
  outras_demandas_territoriais: 'Outras demandas territoriais',
};

// Classes da legenda do mapa (Apresentação Institucional, slide 19), na ordem
// do slide. Cada categoria cai em exatamente uma classe; a função SQL
// `demand_map_class` (migração 031) repete este mapa e
// test/demand-schema.test.js confere.
const MAP_CLASSES = [
  'problemas_urgentes', 'problemas_urbanos', 'projetos_sociais', 'acoes_ambientais', 'necessidades',
];

const CATEGORY_MAP_CLASS = {
  problema_urgente: 'problemas_urgentes',
  problema_urbano: 'problemas_urbanos',
  obra_ou_melhoria_de_infraestrutura: 'problemas_urbanos',
  revitalizacao_de_espaco: 'problemas_urbanos',
  projeto_social: 'projetos_sociais',
  projeto_ambiental: 'acoes_ambientais',
  recuperacao_ambiental: 'acoes_ambientais',
  necessidade_de_patrocinio: 'necessidades',
  apoio_tecnico: 'necessidades',
  apoio_com_servicos: 'necessidades',
  apoio_com_materiais: 'necessidades',
  outras_demandas_territoriais: 'necessidades',
};

/** Classe da legenda do mapa de uma categoria (null para valor desconhecido). */
function mapClassOf(category) {
  return CATEGORY_MAP_CLASS[category] ?? null;
}

// Os 7 status canônicos do Agente (decisão 4) + `arquivada` (decisão 7).
const STATUSES = [
  'em_analise', 'publicada', 'em_busca_de_parceiro', 'conectada',
  'em_execucao', 'concluida', 'prestacao_de_contas', 'arquivada',
];

const STATUS_LABELS = {
  em_analise: 'Em análise',
  publicada: 'Publicada',
  em_busca_de_parceiro: 'Em busca de parceiro',
  conectada: 'Conectada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  prestacao_de_contas: 'Prestação de contas',
  arquivada: 'Arquivada',
};

// Status que aparecem em rota pública (da publicação em diante; `arquivada`
// fica fora do fluxo público).
const PUBLIC_STATUSES = [
  'publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao', 'concluida', 'prestacao_de_contas',
];

// Etapa da análise enquanto o status é `em_analise`. A devolução para ajustes
// mantém `em_analise` (decisão 7); `aprovada` acompanha a publicação.
const REVIEW_STATES = ['rascunho', 'aguardando_analise', 'devolvida', 'aprovada'];

// A fonte manda usar "critérios definidos pela plataforma" sem listar os
// níveis: estes quatro são a escolha da T06.
const PRIORITIES = ['baixa', 'media', 'alta', 'urgente'];

const RECORD_MILESTONES = ['antes', 'acompanhamento', 'depois'];

const RESOURCE_KINDS = ['necessario', 'contrapartida'];

const NEEDED_RESOURCE_TYPES = [
  'recursos_financeiros', 'materiais', 'servicos', 'equipamentos', 'mao_de_obra',
  'estrutura', 'apoio_tecnico', 'conhecimento_especializado', 'servicos_de_fotografia_e_filmagem',
];

const COUNTERPART_RESOURCE_TYPES = [
  'equipe', 'espaco_fisico', 'equipamentos', 'materiais', 'servicos',
  'estrutura', 'recursos_proprios', 'conhecimento_tecnico',
];

const RESOURCE_TYPES_BY_KIND = {
  necessario: NEEDED_RESOURCE_TYPES,
  contrapartida: COUNTERPART_RESOURCE_TYPES,
};

// TODO(fonte-da-verdade): Modelo de Conexão §29 — faltam módulos por tipo (Obras, Ambiental, Social, Apoio/Investimento, Articulação Pública) com documentos próprios (ART/RRT, documento do imóvel, licenças, projeto arquitetônico) e indicadores próprios.
const DOCUMENT_TYPES = [
  'documentos_institucionais', 'estatuto', 'documentos_de_representacao',
  'autorizacoes', 'orcamentos_e_cotacoes', 'projetos_tecnicos', 'fotografias', 'outros',
];

// Eixos temáticos do território (T26). Fonte: Apresentação Institucional,
// slide 26 ("Dados e inteligência territorial como ativo"), que lista os nove
// eixos na ordem abaixo. São o recorte temático da inteligência territorial, ao
// lado da categoria (classificação única da demanda) e do território (lugar).
// Os valores são os do enum `demand_theme` da migração post 023 e os rótulos
// são os do slide, palavra por palavra.
const THEMES = [
  'iluminacao', 'seguranca', 'saneamento', 'limpeza', 'esporte',
  'educacao', 'mobilidade', 'cultura', 'meio_ambiente',
];

const THEME_LABELS = {
  iluminacao: 'Iluminação',
  seguranca: 'Segurança',
  saneamento: 'Saneamento',
  limpeza: 'Limpeza',
  esporte: 'Esporte',
  educacao: 'Educação',
  mobilidade: 'Mobilidade',
  cultura: 'Cultura',
  meio_ambiente: 'Meio Ambiente',
};

// Uma demanda pode cruzar mais de um eixo; o teto é a própria lista.
const MAX_THEMES = THEMES.length;

// O eixo é **opcional**: a lista de obrigatórios do Fluxo 2 não o inclui, e a
// fonte não manda exigi-lo. A interface incentiva e a IA da T23 sugere; nada
// bloqueia o envio por falta de eixo.
const THEMES_REQUIRED = false;

// Composição financeira (decisão 5): pontos-base sobre o orçamento original.
const AGENT_FEE_BPS = 400;
const PLATFORM_FEE_BPS = 600;

// Quem age numa transição.
const ACTORS = ['agente', 'gestao', 'sistema'];

module.exports = {
  CATEGORIES,
  CATEGORY_LABELS,
  MAP_CLASSES,
  CATEGORY_MAP_CLASS,
  mapClassOf,
  STATUSES,
  STATUS_LABELS,
  PUBLIC_STATUSES,
  REVIEW_STATES,
  PRIORITIES,
  RECORD_MILESTONES,
  RESOURCE_KINDS,
  NEEDED_RESOURCE_TYPES,
  COUNTERPART_RESOURCE_TYPES,
  RESOURCE_TYPES_BY_KIND,
  DOCUMENT_TYPES,
  THEMES,
  THEME_LABELS,
  MAX_THEMES,
  THEMES_REQUIRED,
  AGENT_FEE_BPS,
  PLATFORM_FEE_BPS,
  ACTORS,
};
