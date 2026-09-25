// Validação da evidência, da atualização de andamento e da justificativa de
// ausência de registro (T17). Erros por campo, no formato das demais rotas da
// demanda.

const {
  EVIDENCE_MEDIA_KINDS, STAGE_PROGRESS, MAX_CAPTION, MAX_PARTIAL_RESULTS,
  MAX_NOTE, MAX_REASON, MAX_EXPENSE_DESCRIPTION, MAX_EXPENSES, MAX_EXECUTED_CENTS,
  INCIDENT_KINDS, INCIDENT_IMPACTS, MAX_INCIDENT_TEXT, EVIDENCE_MILESTONES,
} = require('./constants');
const { DOCUMENT_KINDS, MAX_DOCUMENT_TITLE, MAX_DOCUMENT_DESCRIPTION, MAX_AMOUNT_CENTS } = require('../accountability/constants');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Texto opcional com limite; grava `null` quando vazio. */
function optionalText(body, field, errors, max) {
  if (body[field] === undefined || body[field] === null) return null;
  if (typeof body[field] !== 'string') {
    errors[field] = 'Texto inválido';
    return null;
  }
  const value = text(body[field]);
  if (value.length > max) {
    errors[field] = `Use no máximo ${max} caracteres`;
    return null;
  }
  return value || null;
}

/** UUID opcional (etapa do cronograma, item do orçamento, evidência par). */
function optionalUuid(body, field, errors) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return null;
  if (typeof body[field] !== 'string' || !UUID_RE.test(body[field].trim())) {
    errors[field] = 'Identificador inválido';
    return null;
  }
  return body[field].trim();
}

/** Data ISO `YYYY-MM-DD`. `future: false` recusa data no futuro. */
function parseDate(value, errors, field, { required = false, future = true, today = new Date() } = {}) {
  const raw = text(value);
  if (!raw) {
    if (required) errors[field] = 'Informe a data';
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    errors[field] = 'Use uma data no formato AAAA-MM-DD';
    return null;
  }
  if (!future && raw > today.toISOString().slice(0, 10)) {
    errors[field] = 'A data do registro não fica no futuro';
    return null;
  }
  return raw;
}

function parseBoolean(value, field, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'boolean') {
    errors[field] = 'Use verdadeiro ou falso';
    return null;
  }
  return value;
}

function parseCents(value, errors, field) {
  const cents = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    errors[field] = 'Valor em centavos inteiros, não negativo';
    return null;
  }
  if (cents > MAX_EXECUTED_CENTS) {
    errors[field] = 'Valor acima do limite registrável';
    return null;
  }
  return cents;
}

/**
 * Evidência da execução:
 * `{ reference, milestone, mediaKind, caption?, recordedOn, scheduleItemId?, pairEvidenceId? }`.
 * A referência do arquivo é conferida contra `uploads` na rota.
 */
function validateEvidence(input, { today = new Date() } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const reference = text(body.reference);
  if (!reference) errors.reference = 'Envie a foto ou o vídeo do registro';

  // O marco do módulo da demanda é conferido na rota (`evidenceMilestonesFor`).
  const milestone = typeof body.milestone === 'string' ? body.milestone : '';
  if (!EVIDENCE_MILESTONES.includes(milestone)) {
    errors.milestone = `Marcos aceitos: ${EVIDENCE_MILESTONES.join(', ')}`;
  }

  const mediaKind = typeof body.mediaKind === 'string' ? body.mediaKind : '';
  if (!EVIDENCE_MEDIA_KINDS.includes(mediaKind)) {
    errors.mediaKind = `Tipos aceitos: ${EVIDENCE_MEDIA_KINDS.join(', ')}`;
  }

  const caption = optionalText(body, 'caption', errors, MAX_CAPTION);
  const recordedOn = parseDate(body.recordedOn, errors, 'recordedOn', { required: true, future: false, today });
  const scheduleItemId = optionalUuid(body, 'scheduleItemId', errors);
  const pairEvidenceId = optionalUuid(body, 'pairEvidenceId', errors);
  if (pairEvidenceId && milestone !== 'depois' && !errors.milestone) {
    errors.pairEvidenceId = 'O pareamento é feito no registro do "depois"';
  }

  return {
    value: { reference, milestone, mediaKind, caption, recordedOn, scheduleItemId, pairEvidenceId },
    errors,
  };
}

/** Legenda e pareamento da evidência já registrada: `{ caption?, pairEvidenceId? }`. */
function validateEvidenceUpdate(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const caption = optionalText(body, 'caption', errors, MAX_CAPTION);
  const pairEvidenceId = optionalUuid(body, 'pairEvidenceId', errors);
  return {
    value: {
      caption,
      captionSent: body.caption !== undefined,
      pairEvidenceId,
      pairSent: body.pairEvidenceId !== undefined,
    },
    errors,
  };
}

/**
 * Atualização de andamento (slide 23):
 * `{ scheduleItemId?, stageProgress?, blockReason?, onSchedule?, newEndsOn?, deadlineReason?,
 *    partialResults?, note?, expenses?: [{ budgetItemId?, scheduleItemId?, description?, executedAmountCents }] }`.
 */
function validateProgressUpdate(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const scheduleItemId = optionalUuid(body, 'scheduleItemId', errors);
  let stageProgress = null;
  if (body.stageProgress !== undefined && body.stageProgress !== null && body.stageProgress !== '') {
    if (!STAGE_PROGRESS.includes(body.stageProgress)) {
      errors.stageProgress = `Situações aceitas: ${STAGE_PROGRESS.join(', ')}`;
    } else {
      stageProgress = body.stageProgress;
    }
  }
  if (scheduleItemId && !stageProgress && !errors.stageProgress) {
    errors.stageProgress = 'Diga como está a etapa (não iniciada, em andamento, concluída, atrasada ou bloqueada)';
  }
  // Etapa bloqueada (Modelo de Conexão §18): sempre com o motivo.
  const blockReason = optionalText(body, 'blockReason', errors, MAX_REASON);
  if (stageProgress === 'bloqueada' && !blockReason && !errors.blockReason) {
    errors.blockReason = 'Explique o que bloqueia a etapa';
  }
  if (blockReason && stageProgress !== 'bloqueada' && !errors.blockReason) {
    errors.blockReason = 'O motivo do bloqueio só acompanha a situação "Bloqueada"';
  }
  if (!scheduleItemId && stageProgress && !errors.scheduleItemId) {
    errors.scheduleItemId = 'Escolha a etapa do cronograma';
  }

  const onSchedule = parseBoolean(body.onSchedule, 'onSchedule', errors);
  const newEndsOn = parseDate(body.newEndsOn, errors, 'newEndsOn');
  const deadlineReason = optionalText(body, 'deadlineReason', errors, MAX_REASON);
  if (newEndsOn && !scheduleItemId && !errors.scheduleItemId) {
    errors.scheduleItemId = 'A alteração de prazo é sempre de uma etapa do cronograma';
  }
  if (newEndsOn && !deadlineReason && !errors.deadlineReason) {
    errors.deadlineReason = 'Justifique a alteração de prazo';
  }
  if (!newEndsOn && deadlineReason && !errors.newEndsOn) {
    errors.newEndsOn = 'Informe a nova data de término';
  }

  const partialResults = optionalText(body, 'partialResults', errors, MAX_PARTIAL_RESULTS);
  const note = optionalText(body, 'note', errors, MAX_NOTE);

  const expenses = [];
  if (body.expenses !== undefined && body.expenses !== null) {
    if (!Array.isArray(body.expenses)) {
      errors.expenses = 'Envie a execução orçamentária como uma lista';
    } else if (body.expenses.length > MAX_EXPENSES) {
      errors.expenses = `Registre no máximo ${MAX_EXPENSES} lançamentos por atualização`;
    } else {
      body.expenses.forEach((raw, index) => {
        const item = raw && typeof raw === 'object' ? raw : {};
        const itemErrors = {};
        const budgetItemId = optionalUuid(item, 'budgetItemId', itemErrors);
        const stageId = optionalUuid(item, 'scheduleItemId', itemErrors);
        const description = optionalText(item, 'description', itemErrors, MAX_EXPENSE_DESCRIPTION);
        const executedAmountCents = parseCents(item.executedAmountCents, itemErrors, 'executedAmountCents');
        if (!budgetItemId && !stageId && !itemErrors.budgetItemId && !itemErrors.scheduleItemId) {
          itemErrors.budgetItemId = 'Diga a que item do orçamento ou etapa o valor executado se refere';
        }
        const field = Object.keys(itemErrors)[0];
        if (field) {
          errors[`expenses.${index}.${field}`] = itemErrors[field];
          return;
        }
        expenses.push({ budgetItemId, scheduleItemId: stageId, description, executedAmountCents });
      });
    }
  }

  if (!scheduleItemId && onSchedule === null && !newEndsOn && !partialResults && !note && !expenses.length
      && !Object.keys(errors).length) {
    errors.partialResults = 'Registre ao menos uma informação de andamento';
  }

  return {
    value: {
      scheduleItemId, stageProgress, blockReason, onSchedule, newEndsOn, deadlineReason,
      partialResults, note, expenses,
    },
    errors,
  };
}

/** Justificativa de que não há execução física a registrar: `{ reason }`. */
function validateRecordWaiver(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const reason = optionalText(body, 'reason', errors, MAX_REASON);
  if (!reason && !errors.reason) {
    errors.reason = 'Explique por que esta demanda não tem registro fotográfico do antes e do depois';
  }
  return { value: { reason }, errors };
}

/**
 * Ocorrência da execução (Modelo de Conexão §19):
 * `{ kind, description, occurredOn, impact?, scheduleItemId?, processId? }`.
 */
function validateIncident(input, { today = new Date() } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!INCIDENT_KINDS.includes(kind)) errors.kind = `Tipos aceitos: ${INCIDENT_KINDS.join(', ')}`;
  const description = optionalText(body, 'description', errors, MAX_INCIDENT_TEXT);
  if (!description && !errors.description) errors.description = 'Descreva o que aconteceu';
  const occurredOn = parseDate(body.occurredOn, errors, 'occurredOn', { required: true, future: false, today });
  if (errors.occurredOn === 'A data do registro não fica no futuro') {
    errors.occurredOn = 'A data da ocorrência não fica no futuro';
  }
  let impact = 'nenhum';
  if (body.impact !== undefined && body.impact !== null && body.impact !== '') {
    if (!INCIDENT_IMPACTS.includes(body.impact)) {
      errors.impact = `Impactos aceitos: ${INCIDENT_IMPACTS.join(', ')}`;
    } else {
      impact = body.impact;
    }
  }
  const scheduleItemId = optionalUuid(body, 'scheduleItemId', errors);
  const processId = optionalUuid(body, 'processId', errors);
  return { value: { kind, description, occurredOn, impact, scheduleItemId, processId }, errors };
}

/**
 * Documento da execução (T-05-12; Modelo de Conexão §20):
 * `{ kind, title, reference, description?, issuedOn?, amountCents?,
 *    scheduleItemId?, milestone?, progressUpdateId? }`. A referência é
 * conferida contra `uploads` na rota.
 */
function validateExecutionDocument(input, { today = new Date(), milestones = EVIDENCE_MILESTONES } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!DOCUMENT_KINDS.includes(kind)) errors.kind = `Tipos aceitos: ${DOCUMENT_KINDS.join(', ')}`;
  const title = optionalText(body, 'title', errors, MAX_DOCUMENT_TITLE);
  if (!title && !errors.title) errors.title = 'Dê um título ao documento';
  const description = optionalText(body, 'description', errors, MAX_DOCUMENT_DESCRIPTION);
  const reference = text(body.reference);
  if (!reference) errors.reference = 'Envie o arquivo do documento';
  const issuedOn = parseDate(body.issuedOn, errors, 'issuedOn', { future: false, today });
  if (errors.issuedOn === 'A data do registro não fica no futuro') errors.issuedOn = 'A data de emissão não fica no futuro';
  let amountCents = null;
  if (body.amountCents !== undefined && body.amountCents !== null && body.amountCents !== '') {
    const cents = typeof body.amountCents === 'number' ? body.amountCents : Number(body.amountCents);
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_AMOUNT_CENTS) {
      errors.amountCents = 'Valor em centavos inteiros, não negativo';
    } else {
      amountCents = cents;
    }
  }
  let milestone = null;
  if (body.milestone !== undefined && body.milestone !== null && body.milestone !== '') {
    if (!milestones.includes(body.milestone)) {
      errors.milestone = `Marcos aceitos: ${milestones.join(', ')}`;
    } else {
      milestone = body.milestone;
    }
  }
  const scheduleItemId = optionalUuid(body, 'scheduleItemId', errors);
  const progressUpdateId = optionalUuid(body, 'progressUpdateId', errors);
  return {
    value: {
      kind, title, description, reference, issuedOn, amountCents, milestone, scheduleItemId, progressUpdateId,
    },
    errors,
  };
}

/** Resolução da ocorrência, gravada uma vez: `{ resolution }`. */
function validateIncidentResolution(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const resolution = optionalText(body, 'resolution', errors, MAX_INCIDENT_TEXT);
  if (!resolution && !errors.resolution) errors.resolution = 'Diga como a ocorrência foi resolvida';
  return { value: { resolution }, errors };
}

module.exports = {
  validateExecutionDocument,
  validateIncident,
  validateIncidentResolution,
  validateEvidence,
  validateEvidenceUpdate,
  validateProgressUpdate,
  validateRecordWaiver,
  parseDate,
};
