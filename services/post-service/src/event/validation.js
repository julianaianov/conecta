// Validação do evento e da inscrição (T25).
//
// `validateEvent(input, { forPublication })` devolve `{ value, errors }`:
// - `errors` é campo → mensagem (vazio quando ok).
// - Rascunho (padrão): só o formato do que veio; campo ausente é permitido.
// - Publicação (`forPublication: true`): exige o que a T25 define como o
//   mínimo do evento — título, descrição, início e fim, local com CEP e
//   coordenada, público e a forma de cobrança (gratuito ou valor declarado).
//
// O banco repete as regras estruturais (CHECKs e trigger `events_guard`).

const {
  KINDS, PRICING, ACCESSIBILITY,
} = require('./constants');

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const LIMITS = {
  title: 200,
  description: 5_000,
  locationName: 200,
  street: 255,
  addressNumber: 30,
  addressComplement: 120,
  district: 120,
  municipality: 120,
  territory: 255,
  audience: 255,
  priceNote: 500,
  accessibilityNotes: 1_000,
  cancelReason: 1_000,
  note: 500,
  photoRef: 500,
};

const MAX_CAPACITY = 100_000;
const MAX_PRICE_CENTS = 100_000_000;
// Um evento não dura mais do que isso (protege agenda e mapa de dado absurdo).
const MAX_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

const REQUIRED_ON_PUBLICATION = [
  ['kind', 'Selecione o tipo de conteúdo (evento, oficina, mutirão, ação ambiental ou aula)'],
  ['title', 'Informe o título do evento'],
  ['description', 'Descreva o evento'],
  ['startsAt', 'Informe a data e a hora de início'],
  ['endsAt', 'Informe a data e a hora de término'],
  ['locationName', 'Informe o local do evento'],
  ['cep', 'A localização com CEP é obrigatória'],
  ['municipality', 'Informe o município'],
  ['uf', 'Informe a UF'],
  ['latitude', 'Marque o ponto do evento no mapa'],
  ['longitude', 'Marque o ponto do evento no mapa'],
  ['audience', 'Informe para quem é o evento'],
  ['pricing', 'Informe se o evento é gratuito ou pago'],
];

const isBlank = (value) => value === undefined || value === null
  || (typeof value === 'string' && value.trim() === '');

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function text(errors, key, raw, max, { multiline = false } = {}) {
  if (isBlank(raw)) return null;
  if (typeof raw !== 'string') {
    errors[key] = 'Valor inválido';
    return null;
  }
  const value = multiline ? raw.trim() : raw.trim().replace(/\s+/g, ' ');
  if (value.length > max) errors[key] = `Use no máximo ${max} caracteres`;
  return value;
}

function oneOf(errors, key, raw, allowed, message) {
  if (isBlank(raw)) return null;
  if (!allowed.includes(raw)) {
    errors[key] = message;
    return null;
  }
  return raw;
}

/** Data e hora com fuso (ISO 8601). Devolve a string ISO em UTC. */
function instant(errors, key, raw) {
  if (isBlank(raw)) return null;
  if (typeof raw !== 'string') {
    errors[key] = 'Use data e hora no formato ISO 8601 (com fuso)';
    return null;
  }
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) {
    errors[key] = 'Use data e hora no formato ISO 8601 (com fuso)';
    return null;
  }
  return value.toISOString();
}

function coordinate(errors, key, raw, max) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || Math.abs(value) > max) {
    errors[key] = 'Coordenada inválida';
    return null;
  }
  return value;
}

function integer(errors, key, raw, { min, max }) {
  if (raw === undefined || raw === null || raw === '') return null;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    errors[key] = `Informe um número inteiro entre ${min} e ${max}`;
    return null;
  }
  return value;
}

function boolean(errors, key, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'boolean') {
    errors[key] = 'Use verdadeiro ou falso';
    return null;
  }
  return raw;
}

function cepValue(errors, raw) {
  if (isBlank(raw)) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length !== 8) {
    errors.cep = 'Informe o CEP com 8 dígitos';
    return null;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function accessibilityList(errors, raw) {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) {
    errors.accessibility = 'Envie a lista de recursos de acessibilidade';
    return null;
  }
  const values = [...new Set(raw)];
  if (values.some((v) => !ACCESSIBILITY.includes(v))) {
    errors.accessibility = `Valores aceitos: ${ACCESSIBILITY.join(', ')}`;
    return null;
  }
  return values;
}

/**
 * Normaliza o evento. `forPublication` liga os obrigatórios; as regras que
 * cruzam campos (fim depois do início, valor só quando pago, fila de espera só
 * com vagas) valem sempre que os dois lados estiverem presentes.
 */
function validateEvent(input, { forPublication = false, current = null } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const value = {};

  value.kind = oneOf(errors, 'kind', raw.kind, KINDS, `Valores aceitos: ${KINDS.join(', ')}`);
  value.title = text(errors, 'title', raw.title, LIMITS.title);
  value.description = text(errors, 'description', raw.description, LIMITS.description, { multiline: true });
  value.startsAt = instant(errors, 'startsAt', raw.startsAt);
  value.endsAt = instant(errors, 'endsAt', raw.endsAt);
  value.locationName = text(errors, 'locationName', raw.locationName, LIMITS.locationName);
  value.cep = cepValue(errors, raw.cep);
  value.street = text(errors, 'street', raw.street, LIMITS.street);
  value.addressNumber = text(errors, 'addressNumber', raw.addressNumber, LIMITS.addressNumber);
  value.addressComplement = text(errors, 'addressComplement', raw.addressComplement, LIMITS.addressComplement);
  value.district = text(errors, 'district', raw.district, LIMITS.district);
  value.municipality = text(errors, 'municipality', raw.municipality, LIMITS.municipality);
  value.territory = text(errors, 'territory', raw.territory, LIMITS.territory);
  value.uf = isBlank(raw.uf)
    ? null
    : oneOf(errors, 'uf', String(raw.uf).trim().toUpperCase(), UFS, 'UF inválida');
  value.latitude = coordinate(errors, 'latitude', raw.latitude, 90);
  value.longitude = coordinate(errors, 'longitude', raw.longitude, 180);
  value.audience = text(errors, 'audience', raw.audience, LIMITS.audience);
  value.capacity = integer(errors, 'capacity', raw.capacity, { min: 1, max: MAX_CAPACITY });
  value.waitlistEnabled = boolean(errors, 'waitlistEnabled', raw.waitlistEnabled);
  value.pricing = oneOf(errors, 'pricing', raw.pricing, PRICING, `Valores aceitos: ${PRICING.join(', ')}`);
  value.priceCents = integer(errors, 'priceCents', raw.priceCents, { min: 1, max: MAX_PRICE_CENTS });
  value.priceNote = text(errors, 'priceNote', raw.priceNote, LIMITS.priceNote, { multiline: true });
  value.accessibility = accessibilityList(errors, raw.accessibility);
  value.accessibilityNotes = text(errors, 'accessibilityNotes', raw.accessibilityNotes, LIMITS.accessibilityNotes, { multiline: true });
  // Foto do evento: por enquanto só link https (o upload assinado da T08 tem
  // finalidades ligadas à demanda; a finalidade do evento é pendência da T25,
  // registrada em dm-docs/production-status.md).
  value.photoRef = text(errors, 'photoRef', raw.photoRef, LIMITS.photoRef);
  if (value.photoRef && !errors.photoRef) {
    let url;
    try {
      url = new URL(value.photoRef);
    } catch {
      url = null;
    }
    if (!url || url.protocol !== 'https:' || !url.hostname) errors.photoRef = 'Use um link https para a foto';
  }

  // Valores efetivos: o que veio agora, senão o que já está gravado.
  const effective = (key, column) => (has(raw, key) && value[key] !== null
    ? value[key]
    : (current ? current[column] : null));

  const startsAt = effective('startsAt', 'starts_at');
  const endsAt = effective('endsAt', 'ends_at');
  if (startsAt && endsAt) {
    const from = new Date(startsAt).getTime();
    const to = new Date(endsAt).getTime();
    if (to <= from) errors.endsAt = 'O término precisa ser depois do início';
    else if (to - from > MAX_DURATION_MS) errors.endsAt = 'O evento não pode durar mais de 90 dias';
  }

  const pricing = effective('pricing', 'pricing');
  const priceCents = has(raw, 'priceCents') ? value.priceCents : (current ? current.price_cents : null);
  if (pricing === 'gratuito' && priceCents !== null && priceCents !== undefined) {
    errors.priceCents = 'Evento gratuito não tem valor de inscrição';
  }
  if (pricing === 'pago' && (priceCents === null || priceCents === undefined)) {
    errors.priceCents = 'Informe o valor da inscrição (a plataforma não processa o pagamento)';
  }

  const capacity = has(raw, 'capacity') ? value.capacity : (current ? current.capacity : null);
  const waitlist = has(raw, 'waitlistEnabled') ? value.waitlistEnabled : (current ? current.waitlist_enabled : null);
  if (waitlist === true && (capacity === null || capacity === undefined)) {
    errors.waitlistEnabled = 'A fila de espera só existe quando há limite de vagas';
  }
  if (capacity !== null && capacity !== undefined && current
      && Number(current.signups_count) > capacity) {
    errors.capacity = `Já há ${current.signups_count} inscritos: as vagas não podem ser menos que isso`;
  }

  if (forPublication) {
    for (const [key, message] of REQUIRED_ON_PUBLICATION) {
      const column = {
        kind: 'kind', title: 'title', description: 'description', startsAt: 'starts_at',
        endsAt: 'ends_at', locationName: 'location_name', cep: 'cep', municipality: 'municipality',
        uf: 'uf', latitude: 'latitude', longitude: 'longitude', audience: 'audience', pricing: 'pricing',
      }[key];
      if (errors[key]) continue;
      const filled = effective(key, column);
      if (filled === null || filled === undefined || filled === '') errors[key] = message;
    }
  }

  for (const key of Object.keys(value)) if (value[key] === null && !has(raw, key)) delete value[key];
  return { value, errors };
}

/** Corpo da inscrição: observação opcional do participante. */
function validateSignup(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const note = text(errors, 'note', raw.note, LIMITS.note, { multiline: true });
  return { value: { note }, errors };
}

/** Motivo do cancelamento do evento (obrigatório: quem se inscreveu precisa saber). */
function validateCancellation(input) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const reason = text(errors, 'reason', raw.reason, LIMITS.cancelReason, { multiline: true });
  if (!errors.reason && !reason) errors.reason = 'Explique por que o evento foi cancelado';
  return { value: { reason }, errors };
}

module.exports = {
  validateEvent,
  validateSignup,
  validateCancellation,
  LIMITS,
  UFS,
  MAX_CAPACITY,
  MAX_PRICE_CENTS,
  MAX_DURATION_MS,
  REQUIRED_ON_PUBLICATION,
};
