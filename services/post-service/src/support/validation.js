// Validação do registro de apoio realizado, da dupla confirmação e do
// consentimento de exibição (T16). Erros por campo, no formato das demais
// rotas da demanda.

const {
  SUPPORT_MODALITIES, DEMAND_SUPPORT_TYPES, MAX_DESCRIPTION, MAX_MESSAGE, MAX_NOTE,
  MAX_PUBLIC_NAME, MAX_AMOUNT_CENTS, MAX_EVIDENCE,
} = require('./constants');

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Centavos inteiros não negativos; `null` quando ausente. */
function parseAmountCents(value, errors, field = 'amountCents') {
  if (value === undefined || value === null || value === '') return null;
  const cents = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    errors[field] = 'Valor em centavos inteiros, não negativo';
    return null;
  }
  if (cents > MAX_AMOUNT_CENTS) {
    errors[field] = 'Valor acima do limite registrável';
    return null;
  }
  return cents;
}

function parseBoolean(value, field, errors, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'boolean') {
    errors[field] = 'Use verdadeiro ou falso';
    return fallback;
  }
  return value;
}

/** Data ISO `YYYY-MM-DD` no passado ou hoje; `null` quando ausente. */
function parseDate(value, errors, field = 'occurredOn', today = new Date()) {
  const raw = text(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    errors[field] = 'Use uma data no formato AAAA-MM-DD';
    return null;
  }
  const limit = today.toISOString().slice(0, 10);
  if (raw > limit) {
    errors[field] = 'A data do apoio não fica no futuro';
    return null;
  }
  return raw;
}

/**
 * Registro de apoio realizado:
 * `{ modality, supportType, description, amountCents?, amountPublic?, occurredOn?,
 *    message?, displayConsent?, publicName? }`.
 */
function validateSupport(input, { today = new Date() } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const modality = typeof body.modality === 'string' ? body.modality : '';
  if (!SUPPORT_MODALITIES.includes(modality)) errors.modality = `Modalidades aceitas: ${SUPPORT_MODALITIES.join(', ')}`;

  const supportType = typeof body.supportType === 'string' ? body.supportType : '';
  if (!DEMAND_SUPPORT_TYPES.includes(supportType)) errors.supportType = `Valores aceitos: ${DEMAND_SUPPORT_TYPES.join(', ')}`;

  const description = text(body.description);
  if (!description) errors.description = 'Descreva o que foi oferecido';
  else if (description.length > MAX_DESCRIPTION) errors.description = `Use no máximo ${MAX_DESCRIPTION} caracteres`;

  const amountCents = parseAmountCents(body.amountCents, errors);
  // O apoio financeiro é valor declarado (decisão 5: sem pagamento na plataforma).
  if (supportType === 'financial' && !errors.amountCents && !amountCents) {
    errors.amountCents = 'Informe o valor declarado do apoio financeiro';
  }
  const amountPublic = parseBoolean(body.amountPublic, 'amountPublic', errors);
  if (amountPublic && amountCents === null && !errors.amountCents) {
    errors.amountPublic = 'Só é possível tornar público um valor declarado';
  }

  const occurredOn = parseDate(body.occurredOn, errors, 'occurredOn', today);

  let message = null;
  if (body.message !== undefined && body.message !== null) {
    if (typeof body.message !== 'string') errors.message = 'Texto inválido';
    else if (text(body.message).length > MAX_MESSAGE) errors.message = `Use no máximo ${MAX_MESSAGE} caracteres`;
    else message = text(body.message) || null;
  }

  const consent = validateConsent(body, { partial: true });
  Object.assign(errors, consent.errors);

  return {
    value: {
      modality,
      supportType,
      description,
      amountCents,
      amountPublic,
      occurredOn,
      message,
      displayConsent: consent.value.displayConsent,
      publicName: consent.value.publicName,
    },
    errors,
  };
}

/**
 * Consentimento de exibição no histórico público (LGPD: o apoiador escolhe
 * aparecer, e pode voltar atrás). `{ displayConsent, publicName?, amountPublic? }`.
 */
function validateConsent(input, { partial = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const displayConsent = parseBoolean(body.displayConsent, 'displayConsent', errors);

  let publicName = null;
  if (body.publicName !== undefined && body.publicName !== null) {
    if (typeof body.publicName !== 'string') errors.publicName = 'Texto inválido';
    else if (text(body.publicName).length > MAX_PUBLIC_NAME) errors.publicName = `Use no máximo ${MAX_PUBLIC_NAME} caracteres`;
    else publicName = text(body.publicName) || null;
  }
  if (!displayConsent && publicName) publicName = null;

  const value = { displayConsent, publicName };
  if (!partial) {
    value.amountPublic = parseBoolean(body.amountPublic, 'amountPublic', errors);
  }
  return { value, errors };
}

/**
 * Confirmação do recebimento pelo Agente: `{ note?, evidence?: string[] }`.
 * As referências de evidência são conferidas contra `uploads` na rota.
 */
function validateReceipt(input, { requireNote = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  let note = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== 'string') errors.note = 'Texto inválido';
    else if (text(body.note).length > MAX_NOTE) errors.note = `Use no máximo ${MAX_NOTE} caracteres`;
    else note = text(body.note) || null;
  }
  if (requireNote && !note && !errors.note) errors.note = 'Diga por que o apoio está sendo contestado';

  let evidence = [];
  if (body.evidence !== undefined && body.evidence !== null) {
    if (!Array.isArray(body.evidence) || body.evidence.some((ref) => typeof ref !== 'string' || !text(ref))) {
      errors.evidence = 'Envie as referências dos arquivos de evidência';
    } else if (body.evidence.length > MAX_EVIDENCE) {
      errors.evidence = `Anexe no máximo ${MAX_EVIDENCE} arquivos`;
    } else {
      evidence = [...new Set(body.evidence.map((ref) => text(ref)))];
    }
  }
  return { value: { note, evidence }, errors };
}

module.exports = {
  validateSupport,
  validateConsent,
  validateReceipt,
  parseAmountCents,
  parseDate,
};
