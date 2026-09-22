// Vocabulário da denúncia de conteúdo e de perfil (T6.3, migração post 018).
// Espelhado em src/lib/app/report.ts (src/lib/app/report.test.mjs compara).

/** Alvos que o portal aceita denunciar. */
const TARGET_KINDS = ['publicacao', 'comentario', 'demanda', 'perfil'];

const TARGET_LABELS = {
  publicacao: 'Publicação',
  comentario: 'Comentário',
  demanda: 'Demanda',
  perfil: 'Perfil',
};

/** Os seis motivos da tela; `outro` exige descrição. */
const REASONS = [
  'conteudo_improprio',
  'informacao_falsa',
  'spam',
  'discurso_de_odio',
  'dado_pessoal_indevido',
  'outro',
];

const REASON_LABELS = {
  conteudo_improprio: 'Conteúdo impróprio',
  informacao_falsa: 'Informação falsa',
  spam: 'Spam',
  discurso_de_odio: 'Discurso de ódio',
  dado_pessoal_indevido: 'Dado pessoal indevido',
  outro: 'Outro',
};

const REASON_REQUIRING_DESCRIPTION = 'outro';

/** Estados gravados; a gestão despacha, o portal só cria `pendente`. */
const STATUSES = ['pendente', 'em_analise', 'procedente', 'improcedente'];
const OPEN_STATUSES = ['pendente', 'em_analise'];
const RESOLVED_STATUSES = ['procedente', 'improcedente'];

const RESOLUTIONS = [
  'ocultar_publicacao',
  'advertencia_ao_autor',
  'outra_providencia',
  'conteudo_mantido',
];

/**
 * O que quem denunciou pode ver. O desfecho não é revelado (a denúncia não
 * pode virar canal de retaliação nem de confirmação de punição): em aberto é
 * "em apuração", despachada é "analisada".
 */
const REPORTER_STATES = ['em_apuracao', 'analisada'];

const REPORTER_STATE_OF = (status) => (OPEN_STATUSES.includes(status) ? 'em_apuracao' : 'analisada');

const DESCRIPTION_MAX = 2000;

/** Limite de taxa por conta (janela deslizante, conferido antes de gravar). */
const RATE_LIMIT = { perHour: 5, perDay: 20 };

/** Texto único mostrado depois de enviar: confirma o recebimento, nada mais. */
const CONFIRMATION_NOTICE = 'Denúncia recebida. A equipe de moderação analisa cada caso e o resultado'
  + ' não é divulgado a quem denunciou nem a quem foi denunciado.';

module.exports = {
  TARGET_KINDS,
  TARGET_LABELS,
  REASONS,
  REASON_LABELS,
  REASON_REQUIRING_DESCRIPTION,
  STATUSES,
  OPEN_STATUSES,
  RESOLVED_STATUSES,
  RESOLUTIONS,
  REPORTER_STATES,
  REPORTER_STATE_OF,
  DESCRIPTION_MAX,
  RATE_LIMIT,
  CONFIRMATION_NOTICE,
};
