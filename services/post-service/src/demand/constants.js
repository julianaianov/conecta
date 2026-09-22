// Vocabulário da demanda (Fluxo 2 da fonte da verdade e decisões 4, 5 e 7).
// Os valores são os mesmos dos enums da migração post-service/007-demands.sql;
// test/demand-schema.test.js confere as duas listas.

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

const DOCUMENT_TYPES = [
  'documentos_institucionais', 'estatuto', 'documentos_de_representacao',
  'autorizacoes', 'orcamentos_e_cotacoes', 'projetos_tecnicos', 'fotografias', 'outros',
];

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
  AGENT_FEE_BPS,
  PLATFORM_FEE_BPS,
  ACTORS,
};
