// Validação da prestação de contas (T18). Erros por campo, no formato das
// demais rotas da demanda.
//
// Duas camadas, como a fonte pede no slide 24 ("obrigatoriamente quando
// aplicável"):
// - `validateAccountabilityDraft`: o rascunho aceita campo a campo, sem exigir
//   nada (o Agente monta aos poucos);
// - `checkRequirements` + `assertConcludable`: na conclusão, diz exatamente o
//   que é obrigatório **sempre** e o que é obrigatório **condicionalmente**
//   (execução física declarada; apoio financeiro declarado).

const {
  DOCUMENT_KINDS, REQUIREMENTS, MAX_EXECUTION_REPORT, MAX_ACTIONS_RECORD, MAX_SCHEDULE_SUMMARY,
  MAX_IMPACT_INDICATORS, MAX_FINANCIAL_SUMMARY, MAX_BENEFICIARIES_NOTE, MAX_RESULT_NOTE,
  MAX_MEASURED_VALUE, MAX_MEASUREMENT_METHOD, MAX_DOCUMENT_TITLE, MAX_DOCUMENT_DESCRIPTION,
  MAX_BENEFICIARIES, MAX_AMOUNT_CENTS,
} = require('./constants');

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

function requiredText(body, field, errors, max, message) {
  const value = optionalText(body, field, errors, max);
  if (!value && !errors[field]) errors[field] = message;
  return value;
}

function optionalUuid(body, field, errors) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return null;
  if (typeof body[field] !== 'string' || !UUID_RE.test(body[field].trim())) {
    errors[field] = 'Identificador inválido';
    return null;
  }
  return body[field].trim();
}

function optionalInteger(body, field, errors, max, message) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return null;
  const value = typeof body[field] === 'number' ? body[field] : Number(body[field]);
  if (!Number.isSafeInteger(value) || value < 0) {
    errors[field] = message;
    return null;
  }
  if (value > max) {
    errors[field] = 'Valor acima do limite registrável';
    return null;
  }
  return value;
}

function optionalBoolean(body, field, errors) {
  if (body[field] === undefined || body[field] === null) return null;
  if (typeof body[field] !== 'boolean') {
    errors[field] = 'Use verdadeiro ou falso';
    return null;
  }
  return body[field];
}

/** Data ISO `YYYY-MM-DD`; `future: false` recusa data no futuro. */
function optionalDate(body, field, errors, { future = true, today = new Date() } = {}) {
  if (body[field] === undefined || body[field] === null || body[field] === '') return null;
  const raw = text(body[field]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) {
    errors[field] = 'Use uma data no formato AAAA-MM-DD';
    return null;
  }
  if (!future && raw > today.toISOString().slice(0, 10)) {
    errors[field] = 'A data do comprovante não fica no futuro';
    return null;
  }
  return raw;
}

/**
 * Rascunho da prestação: só os campos enviados são considerados (`*Sent`), do
 * mesmo jeito que o `PUT /demands/:id` da T07.
 */
function validateAccountabilityDraft(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const value = {
    executionReport: optionalText(body, 'executionReport', errors, MAX_EXECUTION_REPORT),
    actionsRecord: optionalText(body, 'actionsRecord', errors, MAX_ACTIONS_RECORD),
    scheduleSummary: optionalText(body, 'scheduleSummary', errors, MAX_SCHEDULE_SUMMARY),
    beneficiariesReached: optionalInteger(body, 'beneficiariesReached', errors, MAX_BENEFICIARIES,
      'Informe o número de pessoas alcançadas (inteiro, não negativo)'),
    beneficiariesNote: optionalText(body, 'beneficiariesNote', errors, MAX_BENEFICIARIES_NOTE),
    impactIndicators: optionalText(body, 'impactIndicators', errors, MAX_IMPACT_INDICATORS),
    financialSupport: optionalBoolean(body, 'financialSupport', errors),
    financialSummary: optionalText(body, 'financialSummary', errors, MAX_FINANCIAL_SUMMARY),
    executedAmountCents: optionalInteger(body, 'executedAmountCents', errors, MAX_AMOUNT_CENTS,
      'Valor em centavos inteiros, não negativo'),
  };
  const sent = {};
  for (const field of Object.keys(value)) sent[field] = body[field] !== undefined;
  return { value, sent, errors };
}

/**
 * Resultado alcançado de uma meta (slide 15): `{ measuredValue,
 * measurementMethod, achieved, note?, evidenceId? }`. A meta vem da rota
 * (`:goalId`); o vínculo é conferido no banco.
 */
function validateAccountabilityResult(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const measuredValue = requiredText(body, 'measuredValue', errors, MAX_MEASURED_VALUE,
    'Informe o valor medido do indicador');
  const measurementMethod = requiredText(body, 'measurementMethod', errors, MAX_MEASUREMENT_METHOD,
    'Diga como o resultado foi mensurado');
  const achieved = optionalBoolean(body, 'achieved', errors);
  if (achieved === null && !errors.achieved) errors.achieved = 'Diga se a meta foi cumprida';
  const note = optionalText(body, 'note', errors, MAX_RESULT_NOTE);
  const evidenceId = optionalUuid(body, 'evidenceId', errors);
  return { value: { measuredValue, measurementMethod, achieved, note, evidenceId }, errors };
}

/**
 * Anexo da prestação: `{ kind, title, reference, description?, issuedOn?,
 * amountCents? }`. A referência é conferida contra `uploads` na rota.
 */
function validateAccountabilityDocument(input, { today = new Date() } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};

  const kind = typeof body.kind === 'string' ? body.kind : '';
  if (!DOCUMENT_KINDS.includes(kind)) errors.kind = `Tipos aceitos: ${DOCUMENT_KINDS.join(', ')}`;

  const title = requiredText(body, 'title', errors, MAX_DOCUMENT_TITLE, 'Dê um título ao documento');
  const description = optionalText(body, 'description', errors, MAX_DOCUMENT_DESCRIPTION);
  const reference = text(body.reference);
  if (!reference) errors.reference = 'Envie o arquivo do documento';
  const issuedOn = optionalDate(body, 'issuedOn', errors, { future: false, today });
  const amountCents = optionalInteger(body, 'amountCents', errors, MAX_AMOUNT_CENTS,
    'Valor em centavos inteiros, não negativo');
  if (kind === 'comprovante_financeiro' && amountCents === null && !errors.amountCents) {
    errors.amountCents = 'Informe o valor do comprovante financeiro';
  }
  if (kind === 'comprovante_financeiro' && !issuedOn && !errors.issuedOn) {
    errors.issuedOn = 'Informe a data do comprovante financeiro';
  }

  return { value: { kind, title, description, reference, issuedOn, amountCents }, errors };
}

/**
 * O que a conclusão exige, com o motivo de cada exigência condicional.
 *
 * `state`:
 * - `accountability`: a linha atual (campos já gravados);
 * - `hasPhysicalExecution` e `recordWaived`: da demanda (T06/T17);
 * - `milestones`: `{ antes, acompanhamento, depois }`, quantas evidências há (T17);
 * - `plannedMonitoring`: alguma etapa do cronograma previu o registro do
 *   acompanhamento (T-02-04);
 * - `goalsTotal` e `resultsTotal`: metas declaradas × resultados informados;
 * - `financialReceipts`: quantos comprovantes financeiros foram anexados.
 *
 * Devolve `[{ key, label, condition, applies, satisfied, informative, reason }]`.
 * A exigência `informative` nunca bloqueia a conclusão.
 */
function checkRequirements(state = {}) {
  const a = state.accountability ?? {};
  const physical = state.hasPhysicalExecution === true && state.recordWaived !== true;
  const financial = a.financialSupport === true;
  const milestones = state.milestones ?? {};
  const has = (value) => typeof value === 'string' && value.trim() !== '';

  const satisfiedBy = {
    execution_report: has(a.executionReport),
    actions_record: has(a.actionsRecord),
    schedule_summary: has(a.scheduleSummary),
    beneficiaries_reached: Number.isInteger(a.beneficiariesReached) && a.beneficiariesReached >= 0,
    impact_indicators: has(a.impactIndicators),
    results: Number(state.goalsTotal ?? 0) > 0
      ? Number(state.resultsTotal ?? 0) >= Number(state.goalsTotal ?? 0)
      : true,
    evidence_antes: Number(milestones.antes ?? 0) > 0,
    evidence_depois: Number(milestones.depois ?? 0) > 0,
    evidence_acompanhamento: Number(milestones.acompanhamento ?? 0) > 0,
    financial_summary: has(a.financialSummary),
    financial_receipt: Number(state.financialReceipts ?? 0) > 0,
  };
  const monitoring = state.plannedMonitoring === true;
  const applies = {
    sempre: true, execucao_fisica: physical, apoio_financeiro: financial, previsto_no_cronograma: monitoring,
  };
  const reasons = {
    sempre: null,
    execucao_fisica: physical
      ? 'A demanda declarou execução física e não há justificativa de ausência de registro.'
      : 'A demanda não tem execução física a registrar.',
    apoio_financeiro: financial
      ? 'O Agente declarou apoio financeiro recebido nesta demanda.'
      : 'Nenhum apoio financeiro foi declarado nesta prestação.',
    previsto_no_cronograma: monitoring
      ? 'O cronograma previu o registro do acompanhamento; é informativo e não bloqueia a conclusão.'
      : 'Nenhuma etapa do cronograma previu o registro do acompanhamento.',
  };

  return REQUIREMENTS.map((requirement) => ({
    key: requirement.key,
    label: requirement.label,
    condition: requirement.condition,
    applies: applies[requirement.condition] === true,
    satisfied: satisfiedBy[requirement.key] === true,
    informative: requirement.informative === true,
    reason: reasons[requirement.condition],
  }));
}

/** Exigências que se aplicam, bloqueiam e ainda não foram atendidas. */
function missingRequirements(state) {
  return checkRequirements(state).filter((r) => r.applies && !r.satisfied && !r.informative);
}

/** Erros por campo para a conclusão (422 `accountability_incomplete`). */
const REQUIREMENT_FIELD = {
  execution_report: 'executionReport',
  actions_record: 'actionsRecord',
  schedule_summary: 'scheduleSummary',
  beneficiaries_reached: 'beneficiariesReached',
  impact_indicators: 'impactIndicators',
  results: 'results',
  evidence_antes: 'evidences.antes',
  evidence_depois: 'evidences.depois',
  financial_summary: 'financialSummary',
  financial_receipt: 'documents.comprovante_financeiro',
  evidence_acompanhamento: 'evidences.acompanhamento',
};

const REQUIREMENT_MESSAGE = {
  execution_report: 'Escreva o relatório de execução',
  actions_record: 'Registre as ações realizadas',
  schedule_summary: 'Atualize o cronograma com o que foi de fato executado',
  beneficiaries_reached: 'Informe quantas pessoas foram alcançadas',
  impact_indicators: 'Informe os indicadores de impacto',
  results: 'Informe o resultado alcançado de cada meta declarada',
  evidence_antes: 'Registre a foto ou a filmagem do "antes" (aba Execução)',
  evidence_depois: 'Registre a foto ou a filmagem do "depois" (aba Execução)',
  financial_summary: 'Descreva como o apoio financeiro foi aplicado',
  financial_receipt: 'Anexe ao menos um comprovante financeiro',
  evidence_acompanhamento: 'Registre a foto ou a filmagem do acompanhamento previsto no cronograma (aba Execução)',
};

function conclusionErrors(state) {
  const errors = {};
  for (const requirement of missingRequirements(state)) {
    errors[REQUIREMENT_FIELD[requirement.key]] = REQUIREMENT_MESSAGE[requirement.key];
  }
  return errors;
}

module.exports = {
  validateAccountabilityDraft,
  validateAccountabilityResult,
  validateAccountabilityDocument,
  checkRequirements,
  missingRequirements,
  conclusionErrors,
  REQUIREMENT_FIELD,
  REQUIREMENT_MESSAGE,
};
