// Validação da pauta (T28): erros por campo, no formato 422 `validation_failed`.

const { isUuid } = require('../security');
const {
  TARGET_KINDS, STATUSES, STATUS_TRANSITIONS, ANGLE_MAX, OUTLET_MAX, URL_MAX,
} = require('./constants');

const text = (value) => (typeof value === 'string' ? value.trim() : '');

function validateAngle(raw, errors) {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') { errors.angle = 'Texto inválido'; return undefined; }
  const angle = raw.trim();
  if (!angle) return null;
  if (angle.length > ANGLE_MAX) { errors.angle = `Use no máximo ${ANGLE_MAX} caracteres`; return undefined; }
  return angle;
}

/** POST /media/agenda: alvo e ângulo. */
function validateCreate(body = {}) {
  const errors = {};
  const targetKind = text(body.targetKind);
  if (!TARGET_KINDS.includes(targetKind)) errors.targetKind = 'Escolha demanda ou evento';
  const targetId = text(body.targetId).toLowerCase();
  if (!isUuid(targetId)) errors.targetId = 'Alvo inválido';
  const angle = validateAngle(body.angle, errors);
  return { errors, value: { targetKind, targetId, angle: angle ?? null } };
}

function validatePublishedOn(raw, errors) {
  const value = text(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) { errors.publishedOn = 'Informe a data no formato AAAA-MM-DD'; return null; }
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    errors.publishedOn = 'Data inválida';
    return null;
  }
  if (date.getTime() > Date.now() + 86_400_000) { errors.publishedOn = 'A data da divulgação não pode estar no futuro'; return null; }
  return value;
}

/**
 * PUT /media/agenda/:id: status (pela máquina de estados), ângulo e, para
 * `publicada`, veículo, URL https e data.
 */
function validateUpdate(body = {}, current) {
  const errors = {};
  const value = {};
  if (body.status !== undefined) {
    const status = text(body.status);
    if (!STATUSES.includes(status)) errors.status = 'Estado inválido';
    else if (status !== current.status && !STATUS_TRANSITIONS[current.status].includes(status)) {
      errors.status = `De "${current.status}" não é possível ir para "${status}"`;
    } else value.status = status;
  }
  const angle = validateAngle(body.angle, errors);
  if (angle !== undefined) value.angle = angle;

  const target = value.status ?? current.status;
  if (target === 'publicada' && current.status !== 'publicada') {
    const outletName = text(body.outletName ?? current.outlet_name);
    if (!outletName) errors.outletName = 'Informe o veículo que publicou';
    else if (outletName.length > OUTLET_MAX) errors.outletName = `Use no máximo ${OUTLET_MAX} caracteres`;
    else value.outletName = outletName;
    const publishedUrl = text(body.publishedUrl ?? current.published_url);
    if (!/^https:\/\/\S+$/.test(publishedUrl) || publishedUrl.length > URL_MAX) errors.publishedUrl = 'Informe o endereço https da divulgação';
    else value.publishedUrl = publishedUrl;
    const publishedOn = validatePublishedOn(body.publishedOn ?? current.published_on, errors);
    if (publishedOn) value.publishedOn = publishedOn;
  } else if (body.outletName !== undefined || body.publishedUrl !== undefined || body.publishedOn !== undefined) {
    // Fora da publicação, os dados da divulgação são ignorados (a fonte de
    // verdade da divulgação é o estado `publicada`).
    if (current.status === 'publicada') errors.status = 'Divulgação publicada não muda';
  }
  return { errors, value };
}

module.exports = { validateCreate, validateUpdate };
