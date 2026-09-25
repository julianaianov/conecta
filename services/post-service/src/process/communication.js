// Comunicação do Processo de Conexão (T-05-02). Fonte: Modelo de Conexão §12
// ("Cada interação poderá registrar: usuário, instituição, cargo/perfil, data,
// horário, destinatário, mensagem, documentos anexados, histórico") e §08
// ("Nova mensagem"); decisão 13. Puro: validação, lados e serialização. O
// schema é a migração post-service/027-process-messages.sql (guard e evento
// `mensagem_registrada`); as rotas estão em routes/processes.js.

const { parseUploadRef, formatUploadRef } = require('../uploads');

// Lado de quem escreve e destinatário.
const MESSAGE_SIDES = ['agente', 'conectado'];
const MESSAGE_RECIPIENTS = ['agente', 'conectado', 'todos'];
const MESSAGE_RECIPIENT_LABELS = {
  agente: 'Agente de Transformação',
  conectado: 'Parte conectada',
  todos: 'Todos do processo',
};

const MESSAGE_LIMITS = {
  body: 4000,
  attachments: 10,
  pageDefault: 50,
  pageMax: 100,
};

const ANONYMIZED_BODY = '[removido a pedido do titular]';

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

/** Papel de quem vê o processo (`agente` | `parte`) → lado na conversa. */
const sideOfRole = (role) => (role === 'agente' ? 'agente' : 'conectado');

/**
 * Nova mensagem: `{ body, recipient, attachments[] }`. `attachments` aceita
 * `upload:<id>` ou o id puro; devolve os ids (a rota confere se são anexos
 * confirmados deste processo e do autor).
 */
function validateMessage(input) {
  const body = isObject(input) ? input : {};
  const errors = {};
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!text) errors.body = 'Escreva a mensagem';
  else if (text.length > MESSAGE_LIMITS.body) errors.body = `A mensagem aceita até ${MESSAGE_LIMITS.body} caracteres`;

  const recipient = body.recipient === undefined || body.recipient === null || body.recipient === ''
    ? 'todos' : body.recipient;
  if (!MESSAGE_RECIPIENTS.includes(recipient)) errors.recipient = 'Escolha o destinatário: agente, conectado ou todos';

  let attachments = [];
  const raw = body.attachments ?? [];
  if (!Array.isArray(raw)) {
    errors.attachments = 'Anexos em lista';
  } else if (raw.length > MESSAGE_LIMITS.attachments) {
    errors.attachments = `No máximo ${MESSAGE_LIMITS.attachments} anexos por mensagem`;
  } else {
    attachments = raw.map(parseUploadRef);
    if (attachments.some((id) => !id)) errors.attachments = 'Anexo inválido: envie o arquivo antes';
    else if (new Set(attachments).size !== attachments.length) errors.attachments = 'Anexo repetido';
  }
  return { value: { body: text, recipient, attachments }, errors };
}

/** Paginação da conversa: `limit` (1–100) e `before` (ISO). */
function parseMessagesQuery(query = {}) {
  const errors = {};
  let limit = MESSAGE_LIMITS.pageDefault;
  if (query.limit !== undefined && query.limit !== '') {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n < 1 || n > MESSAGE_LIMITS.pageMax) errors.limit = `Entre 1 e ${MESSAGE_LIMITS.pageMax}`;
    else limit = n;
  }
  let before = null;
  if (typeof query.before === 'string' && query.before.trim()) {
    const d = new Date(query.before);
    if (Number.isNaN(d.getTime())) errors.before = 'Data inválida';
    else before = d.toISOString();
  }
  return { value: { limit, before }, errors };
}

/**
 * Quem recebe o aviso de nova mensagem: o outro lado do processo, quando a
 * mensagem é dirigida a ele ou a todos. `[{ userId } | { organizationId }]`.
 */
function messageRecipients(process, authorSide, recipient) {
  const other = authorSide === 'agente' ? 'conectado' : 'agente';
  if (recipient !== 'todos' && recipient !== other) return [];
  if (other === 'agente') return process.demand_author_id ? [{ userId: process.demand_author_id }] : [];
  if (process.party_kind === 'poder_publico') {
    return process.party_organization_id ? [{ organizationId: process.party_organization_id }] : [];
  }
  return process.party_user_id ? [{ userId: process.party_user_id }] : [];
}

/** Mensagem na visão das partes. `files`: Map id → arquivo (describeUploads). */
function serializeMessage(row, { viewerId = null, files = new Map() } = {}) {
  const ids = Array.isArray(row.attachments) ? row.attachments : [];
  return {
    id: row.id,
    processId: row.process_id,
    authorId: row.author_id,
    authorSide: row.author_side,
    authorName: row.author_name,
    authorOrganizationName: row.author_organization_name ?? null,
    authorRoleLabel: row.author_role_label ?? null,
    recipient: row.recipient_party,
    mine: Boolean(viewerId) && row.author_id === viewerId,
    body: row.body,
    anonymized: row.body === ANONYMIZED_BODY,
    attachments: ids.map((id) => {
      const file = files.get(id);
      return {
        id,
        ref: formatUploadRef(id),
        fileName: file?.fileName ?? null,
        contentType: file?.contentType ?? null,
        size: file?.size ?? null,
        url: file?.url ?? null,
      };
    }),
    createdAt: toIso(row.created_at),
  };
}

module.exports = {
  MESSAGE_SIDES,
  MESSAGE_RECIPIENTS,
  MESSAGE_RECIPIENT_LABELS,
  MESSAGE_LIMITS,
  ANONYMIZED_BODY,
  sideOfRole,
  validateMessage,
  parseMessagesQuery,
  messageRecipients,
  serializeMessage,
};
