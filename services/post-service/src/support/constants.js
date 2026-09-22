// Vocabulário do apoio (T16). Fonte: 01-apresentacao-institucional.html,
// slide 20 (sistema de apoio: as 6 modalidades), slide 21 (transparência:
// histórico de apoio) e slides 10–11 (Parceiros registram apoio realizado e
// participam do ranking; o Poder Público apoia, sem ranking competitivo).
// Decisão 5: não há processamento de pagamento — o apoio financeiro é valor
// declarado.
//
// Os valores são os mesmos dos enums da migração
// post-service/013-support-modalities.sql; test/support-domain.test.js confere
// as listas, e src/lib/app/support.ts as repete no frontend.

// As 6 modalidades da fonte (slide 20).
const SUPPORT_MODALITIES = [
  'patrocinar_projeto', 'doar_recursos', 'financiar_evento',
  'adotar_espaco_publico', 'apoiar_acao_ambiental', 'contratar_servicos_locais',
];

const SUPPORT_MODALITY_LABELS = {
  patrocinar_projeto: 'Patrocinar projetos',
  doar_recursos: 'Doar recursos',
  financiar_evento: 'Financiar eventos',
  adotar_espaco_publico: 'Adotar espaços públicos',
  apoiar_acao_ambiental: 'Apoiar ações ambientais',
  contratar_servicos_locais: 'Contratar serviços locais',
};

// O que é oferecido (coluna `supports.type`, enum support_type do init.sql).
// `sharing` (divulgação) é amplificação, e não apoio a uma demanda.
const SUPPORT_TYPES = [
  'financial', 'materials', 'labor', 'volunteering',
  'equipment', 'space', 'food', 'transport', 'knowledge', 'sharing',
];

const DEMAND_SUPPORT_TYPES = SUPPORT_TYPES.filter((t) => t !== 'sharing');

const SUPPORT_TYPE_LABELS = {
  financial: 'Financeiro (valor declarado)',
  materials: 'Materiais',
  labor: 'Serviços e mão de obra',
  volunteering: 'Voluntariado',
  equipment: 'Equipamentos e ferramentas',
  space: 'Espaço físico',
  food: 'Alimentação',
  transport: 'Transporte e frete',
  knowledge: 'Conhecimento e mentoria',
  sharing: 'Divulgação e amplificação',
};

// Mapeamento dos tipos antigos de `supports` para as modalidades da fonte
// (aplicado pela migração 013 e repetido pelo trigger supports_guard no apoio
// do feed). `sharing` fica sem modalidade de propósito.
const LEGACY_TYPE_MODALITY = {
  financial: 'patrocinar_projeto',
  materials: 'doar_recursos',
  equipment: 'doar_recursos',
  food: 'doar_recursos',
  space: 'doar_recursos',
  volunteering: 'doar_recursos',
  labor: 'contratar_servicos_locais',
  transport: 'contratar_servicos_locais',
  knowledge: 'contratar_servicos_locais',
  sharing: null,
};

// Exceção do mapeamento: apoio financeiro em post de evento vira
// `financiar_evento`.
const LEGACY_EVENT_MODALITY = 'financiar_evento';

// Dupla confirmação do apoio realizado: o apoiador declara, o Agente confirma
// o recebimento (com evidência opcional) ou contesta.
const RECEIPT_STATUSES = ['declarado', 'confirmado', 'contestado'];

const RECEIPT_STATUS_LABELS = {
  declarado: 'Declarado pelo apoiador',
  confirmado: 'Confirmado pelo Agente',
  contestado: 'Contestado pelo Agente',
};

// declarado → confirmado | contestado; contestado → confirmado. Confirmado é final.
const RECEIPT_TRANSITIONS = {
  declarado: ['confirmado', 'contestado'],
  contestado: ['confirmado'],
  confirmado: [],
};

// Estado lido e escrito pelo dm-gestao (SupportController::updateStatus).
const GESTAO_STATUSES = ['pending', 'confirmed', 'rejected'];

const GESTAO_STATUS_LABELS = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  rejected: 'Rejeitado',
};

// Categorias que registram apoio realizado (slides 10 e 11).
const SUPPORTER_CATEGORIES = ['parceiro', 'poder_publico'];

const SUPPORT_ROLE_CATEGORY = { partner: 'parceiro', government: 'poder_publico' };

const SUPPORT_ROLES = ['partner', 'government'];

// "Poder Público e políticos não entram em ranking competitivo de apoiadores."
const RANKING_CATEGORIES = ['parceiro'];

// Estados da demanda que recebem registro de apoio (o trigger
// supports_assert_demand_open confere): da publicação em diante, fora
// `arquivada`. O apoio realizado também é registrado depois da conclusão.
const SUPPORT_OPEN_STATUSES = [
  'publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao', 'concluida', 'prestacao_de_contas',
];

// Evidência do recebimento: uploads já existentes da demanda (T08).
const EVIDENCE_PURPOSES = ['demand_evidence_photo', 'demand_evidence_video', 'demand_document'];
const MAX_EVIDENCE = 10;

const MAX_DESCRIPTION = 2000;
const MAX_MESSAGE = 2000;
const MAX_NOTE = 2000;
const MAX_PUBLIC_NAME = 160;
// R$ 99.999.999,99 (supports.amount é DECIMAL(10,2)).
const MAX_AMOUNT_CENTS = 9_999_999_999;

// Linha do tempo (triggers da migração 013). Os públicos expõem só
// payload->'public'.
const SUPPORT_EVENT_TYPES = ['apoio_declarado', 'apoio_confirmado', 'apoio_contestado'];
const PRIVATE_SUPPORT_EVENT_TYPES = ['apoio_cancelado', 'apoio_revisado_gestao'];

module.exports = {
  SUPPORT_MODALITIES,
  SUPPORT_MODALITY_LABELS,
  SUPPORT_TYPES,
  DEMAND_SUPPORT_TYPES,
  SUPPORT_TYPE_LABELS,
  LEGACY_TYPE_MODALITY,
  LEGACY_EVENT_MODALITY,
  RECEIPT_STATUSES,
  RECEIPT_STATUS_LABELS,
  RECEIPT_TRANSITIONS,
  GESTAO_STATUSES,
  GESTAO_STATUS_LABELS,
  SUPPORTER_CATEGORIES,
  SUPPORT_ROLE_CATEGORY,
  SUPPORT_ROLES,
  RANKING_CATEGORIES,
  SUPPORT_OPEN_STATUSES,
  EVIDENCE_PURPOSES,
  MAX_EVIDENCE,
  MAX_DESCRIPTION,
  MAX_MESSAGE,
  MAX_NOTE,
  MAX_PUBLIC_NAME,
  MAX_AMOUNT_CENTS,
  SUPPORT_EVENT_TYPES,
  PRIVATE_SUPPORT_EVENT_TYPES,
};
