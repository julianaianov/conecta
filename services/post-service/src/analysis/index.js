// Respostas à análise (T-05-05; Modelo de Conexão §10 e §12): o Parceiro ou o
// Poder Público validado solicita ao Agente autor informações, documentos,
// reunião ou análise técnica, ou recusa a demanda informando o motivo; o
// Agente responde uma vez, com texto e documentos. Vocabulário e validação
// puros; o schema é a migração post-service/030-analysis-requests.sql
// (test/analysis-domain.test.js compara) e o acesso ao banco, ./store.js.

const { DOCUMENT_TYPES } = require('../demand/constants');
const { validateAnalysisFields } = require('../institutional/validation');

const REQUEST_KINDS = ['informacoes_adicionais', 'documentos', 'reuniao', 'analise_tecnica', 'recusa'];

const REQUEST_KIND_LABELS = {
  informacoes_adicionais: 'Solicitação de informações adicionais',
  documentos: 'Solicitação de documentos',
  reuniao: 'Solicitação de reunião',
  analise_tecnica: 'Solicitação de análise técnica',
  recusa: 'Recusa da demanda',
};

const REQUEST_STATUSES = ['aberta', 'respondida', 'encerrada'];
const REQUEST_STATUS_LABELS = { aberta: 'Aguardando resposta', respondida: 'Respondida', encerrada: 'Encerrada' };

const REQUESTER_CATEGORIES = ['parceiro', 'poder_publico'];

// Eventos gravados em demand_events pelo trigger da migração 030.
const REQUEST_EVENT_TYPES = ['solicitacao_registrada', 'solicitacao_respondida'];

const LIMITS = { body: 3000, answer: 5000, documents: 20 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function text(raw, field, max, errors, required) {
  if (raw === undefined || raw === null || (typeof raw === 'string' && !raw.trim())) {
    if (required) errors[field] = required;
    return null;
  }
  if (typeof raw !== 'string') {
    errors[field] = 'Texto inválido';
    return null;
  }
  const value = raw.trim();
  if (value.length > max) {
    errors[field] = `Use no máximo ${max} caracteres`;
    return null;
  }
  return value;
}

/**
 * Nova solicitação: `{ kind, body, requestedDocumentTypes?, meetingProposedAt?,
 * meetingMode? }`. Na recusa, `body` é o motivo (obrigatório).
 */
function validateRequest(input) {
  const body = isObject(input) ? input : {};
  const errors = {};
  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!REQUEST_KINDS.includes(kind)) errors.kind = 'Escolha o tipo da solicitação';
  const message = text(body.body, 'body', LIMITS.body, errors,
    kind === 'recusa' ? 'Informe o motivo da recusa' : 'Descreva o que precisa');
  const fields = validateAnalysisFields(body, kind === 'documentos', errors);
  return {
    value: {
      kind,
      body: message,
      requestedDocumentTypes: kind === 'documentos' ? fields.requestedDocumentTypes : [],
      meetingProposedAt: kind === 'reuniao' ? fields.meetingProposedAt : null,
      meetingMode: kind === 'reuniao' ? fields.meetingMode : null,
    },
    errors,
  };
}

/** Resposta do Agente: `{ body, documentIds? }` (documentos da demanda ou do processo). */
function validateAnswer(input) {
  const body = isObject(input) ? input : {};
  const errors = {};
  const answer = text(body.body, 'body', LIMITS.answer, errors, 'Escreva a resposta');
  let documentIds = [];
  if (body.documentIds !== undefined && body.documentIds !== null) {
    if (!Array.isArray(body.documentIds) || body.documentIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
      errors.documentIds = 'Documentos inválidos';
    } else if (body.documentIds.length > LIMITS.documents) {
      errors.documentIds = `No máximo ${LIMITS.documents} documentos`;
    } else {
      documentIds = [...new Set(body.documentIds.map((id) => id.toLowerCase()))];
    }
  }
  return { value: { body: answer, documentIds }, errors };
}

module.exports = {
  REQUEST_KINDS,
  REQUEST_KIND_LABELS,
  REQUEST_STATUSES,
  REQUEST_STATUS_LABELS,
  REQUESTER_CATEGORIES,
  REQUEST_EVENT_TYPES,
  DOCUMENT_TYPES,
  LIMITS,
  validateRequest,
  validateAnswer,
};
