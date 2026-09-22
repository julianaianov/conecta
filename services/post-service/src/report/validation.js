// Validação da denúncia de conteúdo e de perfil (T6.3). Erros por campo, no
// mesmo formato das demais rotas da demanda.

const { TARGET_KINDS, REASONS, REASON_REQUIRING_DESCRIPTION, DESCRIPTION_MAX } = require('./constants');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Denúncia: `{ targetKind, targetId, reason, description? }`.
 * Devolve `{ value, errors }`; `value` só serve quando `errors` está vazio.
 */
function validateReport(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const targetKind = text(body.targetKind);
  if (!TARGET_KINDS.includes(targetKind)) {
    errors.targetKind = 'Escolha o que está sendo denunciado';
  }

  const targetId = text(body.targetId);
  if (!UUID_RE.test(targetId)) errors.targetId = 'Conteúdo denunciado inválido';

  const reason = text(body.reason);
  if (!REASONS.includes(reason)) errors.reason = 'Escolha o motivo da denúncia';

  const description = text(body.description);
  if (description.length > DESCRIPTION_MAX) {
    errors.description = `A descrição tem no máximo ${DESCRIPTION_MAX} caracteres`;
  } else if (reason === REASON_REQUIRING_DESCRIPTION && !description) {
    errors.description = 'Descreva o que houve quando o motivo é "Outro"';
  }

  return {
    errors,
    value: {
      targetKind,
      targetId: targetId.toLowerCase(),
      reason,
      description: description || null,
    },
  };
}

/** Filtro de `GET /reports/context`: `{ targetKind, targetId }`. */
function validateTargetQuery(query) {
  const source = query && typeof query === 'object' ? query : {};
  const errors = {};
  const targetKind = text(source.targetKind);
  const targetId = text(source.targetId);
  if (!TARGET_KINDS.includes(targetKind)) errors.targetKind = 'Alvo inválido';
  if (!UUID_RE.test(targetId)) errors.targetId = 'Conteúdo denunciado inválido';
  return { errors, value: { targetKind, targetId: targetId.toLowerCase() } };
}

module.exports = { validateReport, validateTargetQuery };
