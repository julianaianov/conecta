// Vocabulário da demanda (Fluxo 2 da fonte da verdade e decisões 4, 5 e 7).
// Os valores são os mesmos dos enums da migração post-service/007-demands.sql;
// test/demand-schema.test.js confere as duas listas.

// TODO(fonte-da-verdade): Modelo de Conexão §03 — faltam 7 tipos de demanda; ver TODO em services/post-service/migrations/007-demands.sql.
const CATEGORIES = [
  'projeto_social', 'projeto_ambiental', 'necessidade_de_patrocinio',
  'problema_urbano', 'problema_urgente',
];

const CATEGORY_LABELS = {
  projeto_social: 'Projeto Social',
  projeto_ambiental: 'Projeto Ambiental',
  necessidade_de_patrocinio: 'Necessidade de Patrocínio',
  problema_urbano: 'Problema Urbano',
  problema_urgente: 'Problema Urgente',
};

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
