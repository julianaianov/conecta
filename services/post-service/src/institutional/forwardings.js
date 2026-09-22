// Encaminhamentos da demanda (T14): vocabulário, máquina de estados e
// validação. Fonte: 03-fluxo-cadastro-poder-publico.html, etapa 06 (slide 11):
// órgão responsável, setor de destino, data, responsável, status, providências
// e atualizações posteriores. Os valores são os mesmos dos enums da migração
// post-service/011-forwardings.sql; test/forwardings-domain.test.js confere.

const { LIMITS } = require('./constants');

// Para onde vai o encaminhamento: outro órgão validado na plataforma (abre o
// acompanhamento dele), setor do próprio órgão ou órgão fora da plataforma.
const DESTINATION_KINDS = ['orgao_plataforma', 'setor_interno', 'orgao_externo'];

const DESTINATION_KIND_LABELS = {
  orgao_plataforma: 'Órgão do Poder Público na plataforma',
  setor_interno: 'Setor do próprio órgão',
  orgao_externo: 'Órgão fora da plataforma',
};

const FORWARDING_STATUSES = ['enviado', 'recebido', 'aceito', 'devolvido'];

const FORWARDING_STATUS_LABELS = {
  enviado: 'Enviado',
  recebido: 'Recebido',
  aceito: 'Aceito',
  devolvido: 'Devolvido',
};

// Espelha forwarding_status_transition_allowed (migração 011). Aceito e
// devolvido são finais; devolver exige motivo.
const FORWARDING_TRANSITIONS = {
  enviado: ['recebido', 'aceito', 'devolvido'],
  recebido: ['aceito', 'devolvido'],
  aceito: [],
  devolvido: [],
};

// Registros de tramitação que o órgão escreve (o de status é do trigger).
const UPDATE_KINDS = ['providencia', 'atualizacao'];

const UPDATE_KIND_LABELS = {
  providencia: 'Providência realizada',
  atualizacao: 'Atualização',
  status: 'Mudança de status',
};

// Status institucional da origem ao encaminhar (decisão 4): setor interno →
// Encaminhada; outro órgão → Encaminhada ao órgão responsável (o órgão pode
// escolher Encaminhada quando continua articulando).
const ORIGIN_TRACK_STATUSES = ['encaminhada', 'encaminhada_ao_orgao_responsavel'];
const DEFAULT_ORIGIN_TRACK_STATUS = {
  orgao_plataforma: 'encaminhada_ao_orgao_responsavel',
  setor_interno: 'encaminhada',
  orgao_externo: 'encaminhada_ao_orgao_responsavel',
};

// Eventos de demand_events gravados pelos triggers da migração 011 (públicos:
// a linha do tempo expõe só payload->'public').
const FORWARDING_EVENT_TYPES = ['demanda_encaminhada', 'encaminhamento_status_alterado', 'encaminhamento_atualizado'];

const FORWARDING_DIRECTIONS = ['recebidos', 'enviados'];

const FORWARDING_LIMITS = { reason: 3000, update: 3000, note: LIMITS.note, name: LIMITS.name, municipality: 120 };

const SPHERES = ['municipal', 'estadual', 'federal'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function optionalText(raw, field, max, errors) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    errors[field] = 'Texto inválido';
    return null;
  }
  const value = raw.trim();
  if (!value) return null;
  if (value.length > max) {
    errors[field] = `Use no máximo ${max} caracteres`;
    return null;
  }
  return value;
}

function nextForwardingStatuses(status) {
  return FORWARDING_TRANSITIONS[status] ? [...FORWARDING_TRANSITIONS[status]] : [];
}

/** `{ ok: true }` ou `{ ok: false, code, error }` (`invalid_transition` → 409, `note_required` → 422). */
function checkForwardingTransition(from, to, note) {
  if (!FORWARDING_STATUSES.includes(to)) {
    return { ok: false, code: 'invalid_status', error: 'Status do encaminhamento desconhecido' };
  }
  if (!nextForwardingStatuses(from).includes(to)) {
    return {
      ok: false,
      code: 'invalid_transition',
      error: from === to ? 'O encaminhamento já está neste status' : 'Mudança não permitida a partir do status atual do encaminhamento',
    };
  }
  if (to === 'devolvido' && !(typeof note === 'string' && note.trim())) {
    return { ok: false, code: 'note_required', error: 'Informe o motivo da devolução' };
  }
  return { ok: true };
}

/**
 * Novo encaminhamento. `destinationOrganizationId` em `orgao_plataforma`;
 * `destinationSector` obrigatório em `setor_interno`; nome do órgão em
 * `orgao_externo`. `trackStatus` opcional (status da origem ao encaminhar).
 */
function validateForwarding(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const kind = typeof input.destinationKind === 'string' ? input.destinationKind : '';
  if (!DESTINATION_KINDS.includes(kind)) errors.destinationKind = 'Escolha para onde vai o encaminhamento';

  let destinationOrganizationId = null;
  if (kind === 'orgao_plataforma') {
    if (typeof input.destinationOrganizationId === 'string' && UUID_RE.test(input.destinationOrganizationId)) {
      destinationOrganizationId = input.destinationOrganizationId.toLowerCase();
    } else {
      errors.destinationOrganizationId = 'Escolha o órgão de destino';
    }
  }
  const destinationOrganizationName = kind === 'orgao_externo'
    ? optionalText(input.destinationOrganizationName, 'destinationOrganizationName', FORWARDING_LIMITS.name, errors)
    : null;
  if (kind === 'orgao_externo' && !destinationOrganizationName && !errors.destinationOrganizationName) {
    errors.destinationOrganizationName = 'Informe o órgão responsável';
  }
  const destinationSector = optionalText(input.destinationSector, 'destinationSector', FORWARDING_LIMITS.name, errors);
  if (kind === 'setor_interno' && !destinationSector && !errors.destinationSector) {
    errors.destinationSector = 'Informe o setor de destino';
  }

  let destinationSphere = null;
  let destinationMunicipality = null;
  let destinationUf = null;
  if (kind === 'orgao_externo') {
    if (input.destinationSphere !== undefined && input.destinationSphere !== null && input.destinationSphere !== '') {
      if (SPHERES.includes(input.destinationSphere)) destinationSphere = input.destinationSphere;
      else errors.destinationSphere = 'Esfera inválida';
    }
    destinationMunicipality = optionalText(input.destinationMunicipality, 'destinationMunicipality', FORWARDING_LIMITS.municipality, errors);
    const uf = optionalText(input.destinationUf, 'destinationUf', 2, errors);
    if (uf) {
      if (/^[A-Za-z]{2}$/.test(uf)) destinationUf = uf.toUpperCase();
      else errors.destinationUf = 'UF inválida';
    }
  }

  const reason = optionalText(input.reason, 'reason', FORWARDING_LIMITS.reason, errors);
  if (!reason && !errors.reason) errors.reason = 'Descreva o motivo e as providências do encaminhamento';
  const responsibleName = optionalText(input.responsibleName, 'responsibleName', FORWARDING_LIMITS.name, errors);
  const responsibleRole = optionalText(input.responsibleRole, 'responsibleRole', FORWARDING_LIMITS.name, errors);

  let trackStatus = null;
  if (input.trackStatus !== undefined && input.trackStatus !== null && input.trackStatus !== '') {
    if (ORIGIN_TRACK_STATUSES.includes(input.trackStatus)) trackStatus = input.trackStatus;
    else errors.trackStatus = 'Use Encaminhada ou Encaminhada ao órgão responsável';
  }
  if (!trackStatus && DESTINATION_KINDS.includes(kind)) trackStatus = DEFAULT_ORIGIN_TRACK_STATUS[kind];

  return {
    value: {
      destinationKind: kind, destinationOrganizationId, destinationOrganizationName, destinationSector,
      destinationSphere, destinationMunicipality, destinationUf, reason, responsibleName, responsibleRole, trackStatus,
    },
    errors,
  };
}

/** Mudança de status: `{ status, note }` (motivo obrigatório para devolver). */
function validateForwardingStatus(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const status = typeof input.status === 'string' ? input.status : '';
  if (!FORWARDING_STATUSES.includes(status) || status === 'enviado') errors.status = 'Escolha recebido, aceito ou devolvido';
  const note = optionalText(input.note, 'note', FORWARDING_LIMITS.note, errors);
  if (status === 'devolvido' && !note && !errors.note) errors.note = 'Informe o motivo da devolução';
  return { value: { status, note }, errors };
}

/** Providência realizada ou atualização posterior. */
function validateForwardingUpdate(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const kind = typeof input.kind === 'string' ? input.kind : '';
  if (!UPDATE_KINDS.includes(kind)) errors.kind = 'Escolha providência ou atualização';
  const text = optionalText(input.body, 'body', FORWARDING_LIMITS.update, errors);
  if (!text && !errors.body) errors.body = 'Descreva a providência ou a atualização';
  return { value: { kind, body: text }, errors };
}

module.exports = {
  DESTINATION_KINDS,
  DESTINATION_KIND_LABELS,
  FORWARDING_STATUSES,
  FORWARDING_STATUS_LABELS,
  FORWARDING_TRANSITIONS,
  UPDATE_KINDS,
  UPDATE_KIND_LABELS,
  ORIGIN_TRACK_STATUSES,
  DEFAULT_ORIGIN_TRACK_STATUS,
  FORWARDING_EVENT_TYPES,
  FORWARDING_DIRECTIONS,
  FORWARDING_LIMITS,
  nextForwardingStatuses,
  checkForwardingTransition,
  validateForwarding,
  validateForwardingStatus,
  validateForwardingUpdate,
};
