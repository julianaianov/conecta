// Vocabulário do evento e da inscrição (T25). Os valores são os mesmos dos
// enums da migração post-service/021-events.sql; test/event-domain.test.js
// confere as duas listas, e src/lib/app/event.ts espelha este arquivo.
//
// Fonte: 01-apresentacao-institucional.html, slide 9 (Membros da Comunidade:
// "Inscrever-se em eventos", "Oferecer voluntariado"), slide 18 (conteúdos do
// território: Eventos, Oficinas culturais, Mutirões, Ações ambientais, Aulas
// esportivas), slide 19 (mapa com demandas e conteúdos) e slide 20
// ("Financiar eventos"). Decisão 5: sem processamento de pagamento.

const KINDS = ['evento', 'oficina_cultural', 'mutirao', 'acao_ambiental', 'aula_esportiva'];

const KIND_LABELS = {
  evento: 'Evento',
  oficina_cultural: 'Oficina cultural',
  mutirao: 'Mutirão',
  acao_ambiental: 'Ação ambiental',
  aula_esportiva: 'Aula esportiva',
};

const STATUSES = ['rascunho', 'publicado', 'cancelado'];

const STATUS_LABELS = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  cancelado: 'Cancelado',
};

// Só evento publicado aparece em rota pública.
const PUBLIC_STATUSES = ['publicado', 'cancelado'];

const PRICING = ['gratuito', 'pago'];

const PRICING_LABELS = {
  gratuito: 'Gratuito',
  // Decisão 5: a plataforma não processa pagamento; o valor é declarado e a
  // cobrança acontece fora da plataforma.
  pago: 'Pago (cobrança fora da plataforma)',
};

// A fonte pede "acessibilidade" sem listar os recursos; esta lista é a escolha
// da T25, como os níveis de prioridade da demanda.
const ACCESSIBILITY = [
  'acesso_para_cadeirantes', 'banheiro_acessivel', 'piso_tatil',
  'interprete_de_libras', 'audiodescricao', 'acompanhante_permitido',
  'transporte_acessivel', 'espaco_para_caes_guia',
];

const ACCESSIBILITY_LABELS = {
  acesso_para_cadeirantes: 'Acesso para cadeirantes',
  banheiro_acessivel: 'Banheiro acessível',
  piso_tatil: 'Piso tátil',
  interprete_de_libras: 'Intérprete de Libras',
  audiodescricao: 'Audiodescrição',
  acompanhante_permitido: 'Acompanhante permitido',
  transporte_acessivel: 'Transporte acessível',
  espaco_para_caes_guia: 'Espaço para cães-guia',
};

const SIGNUP_STATUSES = ['inscrito', 'lista_de_espera', 'cancelado'];

const SIGNUP_STATUS_LABELS = {
  inscrito: 'Inscrito',
  lista_de_espera: 'Lista de espera',
  cancelado: 'Cancelado',
};

// Quem publica evento: Agente de Transformação ("Publicar projetos", "Publicar
// demandas", slide 8) e Poder Público ("Informar programas, serviços ou
// oportunidades", "Divulgar ações", slide 11).
const ORGANIZER_ROLES = ['agent', 'government'];

const ROLE_ORGANIZER_CATEGORY = { agent: 'agente', government: 'poder_publico' };

// **Inscrever-se em eventos é uma permissão de Membros da Comunidade** (slide 9).
// Nenhuma outra categoria recebe essa permissão na fonte; enquanto a
// coordenação do produto não decidir o contrário, só `member` se inscreve
// (pendência registrada em dm-docs/production-status.md).
const SIGNUP_ROLES = ['member'];

// Categoria gravada em event_signups.user_category, por papel da conta.
const ROLE_CATEGORY = {
  member: 'comunidade', partner: 'parceiro', government: 'poder_publico',
  agent: 'agente', media: 'comunicacao',
};

// Eventos da linha do tempo da demanda (triggers da migração 021), públicos e
// com payload->'public'.
const DEMAND_EVENT_TYPES = ['evento_publicado', 'evento_atualizado', 'evento_cancelado'];

// Manifestações da T15 que podem apontar para um evento da mesma demanda.
const EVENT_INTEREST_KINDS = ['voluntariado', 'participacao'];

// A confirmação de inscrição por e-mail depende de um serviço de envio que a
// plataforma ainda não tem. Enquanto não houver, a interface mostra e a API
// declara "em desenvolvimento" (governança: funcionalidade em desenvolvimento
// aparece identificada como tal, slide 26).
const EMAIL_NOTIFICATIONS = {
  available: false,
  state: 'em_desenvolvimento',
  label: 'Confirmação por e-mail',
  note: 'A plataforma ainda não envia e-mail: a confirmação da inscrição aparece aqui e em "Minhas inscrições".',
};

const MAX_SIGNUPS_PAGE = 200;

module.exports = {
  KINDS,
  KIND_LABELS,
  STATUSES,
  STATUS_LABELS,
  PUBLIC_STATUSES,
  PRICING,
  PRICING_LABELS,
  ACCESSIBILITY,
  ACCESSIBILITY_LABELS,
  SIGNUP_STATUSES,
  SIGNUP_STATUS_LABELS,
  ORGANIZER_ROLES,
  ROLE_ORGANIZER_CATEGORY,
  SIGNUP_ROLES,
  ROLE_CATEGORY,
  DEMAND_EVENT_TYPES,
  EVENT_INTEREST_KINDS,
  EMAIL_NOTIFICATIONS,
  MAX_SIGNUPS_PAGE,
};
