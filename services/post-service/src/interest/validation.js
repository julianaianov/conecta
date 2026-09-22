// Validação das manifestações de interesse e do pedido de conexão (T15).
// Erros por campo, no formato das demais rotas da demanda.

const { INTEREST_KINDS, OFFER_TYPES, KINDS_BY_ROLE } = require('./constants');

const MAX_MESSAGE = 2000;
// Espelha CONNECTION_TYPES do user-service (routes/connections.js).
const CONNECTION_TYPES = ['support', 'sponsorship', 'partnership', 'meeting', 'resources', 'outreach'];

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * `{ kind, offerTypes, message }` de quem tem o papel `role` (normalizado).
 * Retorna `{ value, errors }`.
 */
function validateInterest(input, role) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const allowed = KINDS_BY_ROLE[role] ?? [];
  const kind = typeof body.kind === 'string' ? body.kind : allowed.length === 1 ? allowed[0] : '';
  if (!INTEREST_KINDS.includes(kind)) errors.kind = `Tipos aceitos: ${INTEREST_KINDS.join(', ')}`;
  else if (!allowed.includes(kind)) errors.kind = 'Seu perfil não pode registrar este tipo de interesse';

  let offerTypes = [];
  if (body.offerTypes !== undefined && body.offerTypes !== null) {
    if (!Array.isArray(body.offerTypes) || body.offerTypes.some((t) => !OFFER_TYPES.includes(t))) {
      errors.offerTypes = `Valores aceitos: ${OFFER_TYPES.join(', ')}`;
    } else {
      offerTypes = [...new Set(body.offerTypes)];
    }
  }
  if (kind === 'apoio' && !errors.offerTypes && offerTypes.length === 0) {
    errors.offerTypes = 'Diga o que pretende oferecer';
  }
  if (kind && kind !== 'apoio' && offerTypes.length) {
    errors.offerTypes = 'Participação e voluntariado não têm oferta de recursos';
  }

  let message = null;
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== 'string') errors.message = 'Texto inválido';
    else if (text(body.message).length > MAX_MESSAGE) errors.message = `Use no máximo ${MAX_MESSAGE} caracteres`;
    else message = text(body.message) || null;
  }
  return { value: { kind, offerTypes, message }, errors };
}

/** Pedido de conexão com o Agente: `{ type?, message }`. */
function validateConnectionRequest(input, fallbackType = 'support') {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const type = body.type === undefined || body.type === null || body.type === '' ? fallbackType : body.type;
  if (!CONNECTION_TYPES.includes(type)) errors.type = `Tipos aceitos: ${CONNECTION_TYPES.join(', ')}`;
  const message = text(body.message);
  if (!message) errors.message = 'Escreva uma mensagem para o Agente de Transformação';
  else if (message.length > MAX_MESSAGE) errors.message = `Use no máximo ${MAX_MESSAGE} caracteres`;
  return { value: { type, message }, errors };
}

/** Tipo de conexão sugerido pela manifestação. */
function connectionTypeFor(kind, offerTypes = []) {
  if (kind !== 'apoio') return 'support';
  if (offerTypes.includes('investimento')) return 'sponsorship';
  if (offerTypes.includes('recursos') || offerTypes.includes('produtos') || offerTypes.includes('estrutura')) return 'resources';
  return 'partnership';
}

module.exports = {
  MAX_MESSAGE,
  CONNECTION_TYPES,
  validateInterest,
  validateConnectionRequest,
  connectionTypeFor,
};
