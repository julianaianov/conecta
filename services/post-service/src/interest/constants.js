// Vocabulário do interesse, da participação e da compatibilidade (T15). Fonte:
// 01-apresentacao-institucional.html (slides 9–11 e 15) e
// 02-fluxo-cadastro-agente-de-transformacao.html (slide 22). Os valores são os
// mesmos dos enums da migração post-service/012-demand-interests.sql;
// test/interest-domain.test.js confere as listas, e
// services/user-service/src/partner-profile.js repete as do perfil de apoio.

const { CATEGORIES, NEEDED_RESOURCE_TYPES } = require('../demand/constants');

// Manifestações: `apoio` (Parceiro, Poder Público: "demonstrar interesse"),
// `participacao` e `voluntariado` (Membro da Comunidade: "demonstrar interesse
// em participar", "oferecer voluntariado").
// TODO(fonte-da-verdade): Modelo de Conexão §10 — faltam solicitar documentos, solicitar reunião, solicitar análise técnica e recusar com motivo (Parceiros e Poder Público); também em migrations/010 institutional_response_type.
const INTEREST_KINDS = ['apoio', 'participacao', 'voluntariado'];

const INTEREST_KIND_LABELS = {
  apoio: 'Interesse em apoiar',
  participacao: 'Interesse em participar',
  voluntariado: 'Oferta de voluntariado',
};

// "Recursos, produtos, serviços, conhecimento, estrutura ou investimento"
// (slide 10) e, pela migração 038 (T-05-15), o que faltava do Modelo de
// Conexão §27 ("Doar materiais, Fornecer equipamentos, Disponibilizar equipe,
// Executar determinada etapa, Patrocinar, Estabelecer parceria"), com os
// rótulos literais da fonte.
const OFFER_TYPES = [
  'recursos', 'produtos', 'servicos', 'conhecimento', 'estrutura', 'investimento',
  'materiais', 'equipamentos', 'equipe', 'execucao_de_etapa', 'patrocinio', 'parceria',
];

const OFFER_TYPE_LABELS = {
  recursos: 'Recursos',
  produtos: 'Produtos',
  servicos: 'Serviços',
  conhecimento: 'Conhecimento',
  estrutura: 'Estrutura',
  investimento: 'Investimento',
  materiais: 'Doar materiais',
  equipamentos: 'Fornecer equipamentos',
  equipe: 'Disponibilizar equipe',
  execucao_de_etapa: 'Executar determinada etapa',
  patrocinio: 'Patrocinar',
  parceria: 'Estabelecer parceria',
};

// "Executar determinada etapa" aponta a etapa do cronograma da demanda
// (`demand_interests.schedule_item_id`, obrigatória com esta oferta).
const SCHEDULE_ITEM_OFFER = 'execucao_de_etapa';

const CONNECTION_STATUSES = ['pendente', 'aceita', 'recusada', 'cancelada'];

// Categoria gravada em demand_interests.user_category, por papel da conta.
const ROLE_CATEGORY = { partner: 'parceiro', government: 'poder_publico', member: 'comunidade' };

// Tipos de manifestação por papel (slides 9–11). Agentes e Comunicação não
// manifestam interesse (Comunicação amplifica e solicita conexão direta).
const KINDS_BY_ROLE = {
  partner: ['apoio'],
  government: ['apoio'],
  member: ['participacao', 'voluntariado'],
  agent: [],
  media: [],
};

// "Filtrar oportunidades de apoio": Parceiros e Poder Público (slides 10 e 11).
const OPPORTUNITY_ROLES = ['partner', 'government'];

// Estados da demanda em que se manifesta interesse e se pede conexão (o
// trigger demand_interests_assert_open confere).
const INTEREST_OPEN_STATUSES = ['publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao'];

// Oportunidades de apoio: por padrão, demandas publicadas e em busca de parceiro.
const OPPORTUNITY_DEFAULT_STATUSES = ['publicada', 'em_busca_de_parceiro'];

// A conexão aceita leva a demanda a `conectada` só a partir destes estados.
const CONNECTABLE_STATUSES = ['publicada', 'em_busca_de_parceiro'];

// Potenciais parceiros para o Agente (T30): identificados enquanto a demanda
// ainda recebe interesse; teto de candidatos devolvidos.
const POTENTIAL_PARTNERS_STATUSES = INTEREST_OPEN_STATUSES;
const POTENTIAL_PARTNERS_MAX = 50;

// Linha do tempo (triggers da migração 012). Os públicos expõem só
// payload->'public' (tipo, categoria da conta e ofertas).
const INTEREST_EVENT_TYPES = [
  'interesse_registrado', 'interesse_retirado', 'conexao_solicitada', 'conexao_aceita',
];
const PRIVATE_INTEREST_EVENT_TYPES = ['conexao_recusada', 'conexao_cancelada'];

// Compatibilidade (sem IA): pesos de cada critério, somando 100.
const COMPATIBILITY_WEIGHTS = { territorio: 40, categoria: 30, recursos: 30 };

// Pontos do território conforme o nível do encontro (o maior vale).
const TERRITORY_POINTS = { territorio: 40, municipio: 30, uf: 20, nacional: 10 };

// Faixas da pontuação (0–100).
const COMPATIBILITY_LEVELS = [
  { level: 'alta', min: 70 },
  { level: 'media', min: 40 },
  { level: 'baixa', min: 1 },
  { level: 'nenhuma', min: 0 },
];

const COMPATIBILITY_LEVEL_LABELS = {
  alta: 'Alta compatibilidade',
  media: 'Média compatibilidade',
  baixa: 'Baixa compatibilidade',
  nenhuma: 'Sem critérios em comum',
};

// Perfil de apoio (user_db.partner_profiles, user-service): os mesmos
// vocabulários da demanda, para o encontro ser direto.
const PARTNER_INTEREST_CATEGORIES = CATEGORIES;
const PARTNER_OFFERED_RESOURCES = NEEDED_RESOURCE_TYPES;

module.exports = {
  INTEREST_KINDS,
  INTEREST_KIND_LABELS,
  OFFER_TYPES,
  OFFER_TYPE_LABELS,
  SCHEDULE_ITEM_OFFER,
  CONNECTION_STATUSES,
  ROLE_CATEGORY,
  KINDS_BY_ROLE,
  OPPORTUNITY_ROLES,
  INTEREST_OPEN_STATUSES,
  OPPORTUNITY_DEFAULT_STATUSES,
  CONNECTABLE_STATUSES,
  POTENTIAL_PARTNERS_STATUSES,
  POTENTIAL_PARTNERS_MAX,
  INTEREST_EVENT_TYPES,
  PRIVATE_INTEREST_EVENT_TYPES,
  COMPATIBILITY_WEIGHTS,
  TERRITORY_POINTS,
  COMPATIBILITY_LEVELS,
  COMPATIBILITY_LEVEL_LABELS,
  PARTNER_INTEREST_CATEGORIES,
  PARTNER_OFFERED_RESOURCES,
};
