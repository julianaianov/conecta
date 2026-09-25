// Validação das entradas da atuação institucional (T13): resposta, mudança de
// status, responsável e oferta de apoio. Puro: devolve `{ value, errors }`
// (errors: campo → mensagem, em camelCase como na API). O banco repete as
// regras estruturais (CHECKs e triggers da migração 010).

const {
  INSTITUTIONAL_STATUSES, RESPONSE_TYPES, SUPPORT_TYPES, LIMITS, MEETING_MODES,
} = require('./constants');
const { DOCUMENT_TYPES } = require('../demand/constants');
const { requiresNote } = require('./state-machine');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/** Texto opcional: '' e null viram null; aparado; limite de tamanho. */
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

function requiredText(raw, field, max, errors, message) {
  const value = optionalText(raw, field, max, errors);
  if (!value && !errors[field]) errors[field] = message;
  return value;
}

function httpsUrl(raw, field, errors) {
  const value = optionalText(raw, field, LIMITS.url, errors);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || /\s/.test(value)) throw new Error('protocolo');
    return value;
  } catch {
    errors[field] = 'Informe um endereço que comece com https://';
    return null;
  }
}

function isoDate(raw, field, errors) {
  if (raw === undefined || raw === null || raw === '') return null;
  const match = typeof raw === 'string' ? DATE_RE.exec(raw) : null;
  if (!match) {
    errors[field] = 'Data no formato AAAA-MM-DD';
    return null;
  }
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) {
    errors[field] = 'Data inválida';
    return null;
  }
  return raw;
}

/** Mudança de status: `{ status, note }` (a transição é conferida contra o status atual). */
function validateStatusChange(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const status = typeof input.status === 'string' ? input.status : '';
  if (!INSTITUTIONAL_STATUSES.includes(status)) errors.status = 'Escolha um status institucional';
  const note = optionalText(input.note, 'note', LIMITS.note, errors);
  if (!errors.status && requiresNote(status) && !note && !errors.note) {
    errors.note = 'Informe a justificativa e, quando houver, o encaminhamento';
  }
  return { value: { status, note }, errors };
}

/**
 * Resposta institucional. `status`/`statusNote` opcionais: mudam o status no
 * mesmo registro (ex.: recebimento → Em análise).
 */
function validateResponse(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const type = typeof input.type === 'string' ? input.type : '';
  if (!RESPONSE_TYPES.includes(type)) errors.type = 'Escolha o tipo da resposta';
  // Respostas à análise (Modelo de Conexão §10, T-05-05).
  const analysis = validateAnalysisFields(input, type === 'solicitacao_de_documentos', errors);
  const refusalReason = type === 'recusa_com_motivo'
    ? requiredText(input.refusalReason ?? input.body, 'refusalReason', 3000, errors, 'Informe o motivo da recusa')
    : null;
  const text = type === 'recusa_com_motivo' && !input.body
    ? refusalReason
    : requiredText(input.body, 'body', LIMITS.body, errors, 'Escreva a resposta');
  const responsibleSector = optionalText(input.responsibleSector, 'responsibleSector', LIMITS.name, errors);
  if (type === 'orgao_ou_setor_responsavel' && !responsibleSector && !errors.responsibleSector) {
    errors.responsibleSector = 'Informe o órgão ou setor responsável';
  }
  const programName = optionalText(input.programName, 'programName', LIMITS.name, errors);
  if (type === 'programa_publico_relacionado' && !programName && !errors.programName) {
    errors.programName = 'Informe o programa ou serviço público';
  }
  const programUrl = httpsUrl(input.programUrl, 'programUrl', errors);
  const plannedFor = isoDate(input.plannedFor, 'plannedFor', errors);

  let status = null;
  let statusNote = null;
  if (input.status !== undefined && input.status !== null && input.status !== '') {
    const change = validateStatusChange({ status: input.status, note: input.statusNote });
    if (change.errors.status) errors.status = change.errors.status;
    if (change.errors.note) errors.statusNote = change.errors.note;
    status = change.value.status;
    statusNote = change.value.note;
  }
  return {
    value: {
      type, body: text, responsibleSector, programName, programUrl, plannedFor, status, statusNote,
      requestedDocumentTypes: type === 'solicitacao_de_documentos' ? analysis.requestedDocumentTypes : [],
      meetingProposedAt: type === 'solicitacao_de_reuniao' ? analysis.meetingProposedAt : null,
      meetingMode: type === 'solicitacao_de_reuniao' ? analysis.meetingMode : null,
      refusalReason,
    },
    errors,
  };
}

/**
 * Campos das solicitações (documentos pedidos, data e formato da reunião),
 * comuns à resposta institucional e à solicitação do Parceiro (T-05-05).
 */
function validateAnalysisFields(input, documentsRequired, errors) {
  let requestedDocumentTypes = [];
  const rawTypes = input.requestedDocumentTypes;
  if (rawTypes !== undefined && rawTypes !== null) {
    if (!Array.isArray(rawTypes) || rawTypes.some((t) => !DOCUMENT_TYPES.includes(t))) {
      errors.requestedDocumentTypes = 'Escolha os documentos da lista';
    } else {
      requestedDocumentTypes = DOCUMENT_TYPES.filter((t) => rawTypes.includes(t));
    }
  }
  if (documentsRequired && !requestedDocumentTypes.length && !errors.requestedDocumentTypes) {
    errors.requestedDocumentTypes = 'Escolha ao menos um documento';
  }
  let meetingProposedAt = null;
  if (input.meetingProposedAt !== undefined && input.meetingProposedAt !== null && input.meetingProposedAt !== '') {
    const d = typeof input.meetingProposedAt === 'string' ? new Date(input.meetingProposedAt) : null;
    if (!d || Number.isNaN(d.getTime()) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.meetingProposedAt)) {
      errors.meetingProposedAt = 'Data e hora no formato AAAA-MM-DDTHH:MM';
    } else {
      meetingProposedAt = d.toISOString();
    }
  }
  let meetingMode = null;
  if (input.meetingMode !== undefined && input.meetingMode !== null && input.meetingMode !== '') {
    if (MEETING_MODES.includes(input.meetingMode)) meetingMode = input.meetingMode;
    else errors.meetingMode = 'Presencial ou on-line';
  }
  return { requestedDocumentTypes, meetingProposedAt, meetingMode };
}

/**
 * Responsável pelo acompanhamento no órgão (Modelo de Conexão §14): nome,
 * cargo, setor e data limite da próxima ação. Campo ausente mantém o valor
 * gravado; vazio apaga.
 */
function validateResponsible(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const keys = ['responsibleName', 'responsibleRole', 'responsibleSector', 'responsibleDueOn'];
  if (!keys.some((k) => has(input, k))) errors.responsibleName = 'Informe o responsável';
  const value = {};
  if (has(input, 'responsibleName')) value.responsibleName = optionalText(input.responsibleName, 'responsibleName', LIMITS.name, errors);
  if (has(input, 'responsibleRole')) value.responsibleRole = optionalText(input.responsibleRole, 'responsibleRole', LIMITS.name, errors);
  if (has(input, 'responsibleSector')) {
    value.responsibleSector = optionalText(input.responsibleSector, 'responsibleSector', LIMITS.name, errors);
  }
  if (has(input, 'responsibleDueOn')) value.responsibleDueOn = isoDate(input.responsibleDueOn, 'responsibleDueOn', errors);
  return { value, errors };
}

/** Interesse em apoiar / oferta de recursos, com a conexão pedida ao Agente (opcional). */
function validateOffer(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  let supportTypes = [];
  if (!Array.isArray(input.supportTypes) || !input.supportTypes.length) {
    errors.supportTypes = 'Escolha ao menos uma forma de apoio';
  } else if (input.supportTypes.some((t) => !SUPPORT_TYPES.includes(t))) {
    errors.supportTypes = 'Forma de apoio desconhecida';
  } else if (new Set(input.supportTypes).size !== input.supportTypes.length) {
    errors.supportTypes = 'Forma de apoio repetida';
  } else {
    // Ordem canônica da fonte.
    supportTypes = SUPPORT_TYPES.filter((t) => input.supportTypes.includes(t));
  }
  const description = requiredText(input.description, 'description', LIMITS.description, errors,
    'Descreva o apoio oferecido e as condições');
  let connectionId = null;
  if (input.connectionId !== undefined && input.connectionId !== null && input.connectionId !== '') {
    if (typeof input.connectionId === 'string' && UUID_RE.test(input.connectionId)) connectionId = input.connectionId.toLowerCase();
    else errors.connectionId = 'Conexão inválida';
  }
  return { value: { supportTypes, description, connectionId }, errors };
}

module.exports = {
  validateStatusChange, validateResponse, validateResponsible, validateOffer, validateAnalysisFields,
};
