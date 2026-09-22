// Projeções e leitura da prestação de contas da demanda (T18, migração post
// 015).
//
// Duas visões: a do Agente autor (com nota interna dos resultados e o arquivo
// de cada anexo) e a pública, que é a seção "Resultados e prestação de contas"
// da página da demanda (T19 parcial): relatório, resultados por meta, pessoas
// impactadas, metas cumpridas e a existência dos comprovantes — nunca o
// arquivo do comprovante nem dado pessoal.

const { HttpError } = require('../demand/store');

const ACCOUNTABILITY_SQL = `
  a.id, a.demand_id, a.author_id, a.author_name, a.status::text AS status,
  a.execution_report, a.actions_record, a.schedule_summary, a.beneficiaries_reached,
  a.beneficiaries_estimate, a.beneficiaries_note, a.impact_indicators, a.financial_support,
  a.financial_summary, a.executed_amount_cents, a.concluded_at, a.created_at, a.updated_at`;

const RESULT_SQL = `
  r.id, r.accountability_id, r.demand_id, r.goal_id, r.position, r.goal_snapshot,
  r.indicator_snapshot, r.measured_value, r.measurement_method, r.achieved, r.note,
  r.evidence_id, r.created_at, r.updated_at,
  (SELECT g.expected_result FROM demand_goals g WHERE g.id = r.goal_id) AS expected_result,
  (SELECT g.measurement_method FROM demand_goals g WHERE g.id = r.goal_id) AS planned_measurement_method`;

const DOCUMENT_SQL = `
  x.id, x.accountability_id, x.demand_id, x.kind::text AS kind, x.title, x.description,
  x.reference, x.upload_id, x.issued_on, x.amount_cents, x.position, x.created_at, x.updated_at`;

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const toDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null);
const toInt = (value) => (value === null || value === undefined ? null : Number(value));

/** Registro final visto pelo Agente autor. */
function serializeAccountability(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    status: row.status,
    author: { userId: row.author_id, name: row.author_name ?? null },
    executionReport: row.execution_report ?? null,
    actionsRecord: row.actions_record ?? null,
    scheduleSummary: row.schedule_summary ?? null,
    beneficiariesReached: toInt(row.beneficiaries_reached),
    beneficiariesEstimate: toInt(row.beneficiaries_estimate),
    beneficiariesNote: row.beneficiaries_note ?? null,
    impactIndicators: row.impact_indicators ?? null,
    financialSupport: row.financial_support === true,
    financialSummary: row.financial_summary ?? null,
    executedAmountCents: toInt(row.executed_amount_cents),
    concludedAt: toIso(row.concluded_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Registro final na página pública: sem autor e sem nota do rascunho. */
function serializePublicAccountability(row) {
  return {
    id: row.id,
    status: row.status,
    executionReport: row.execution_report ?? null,
    actionsRecord: row.actions_record ?? null,
    scheduleSummary: row.schedule_summary ?? null,
    beneficiariesReached: toInt(row.beneficiaries_reached),
    beneficiariesEstimate: toInt(row.beneficiaries_estimate),
    beneficiariesNote: row.beneficiaries_note ?? null,
    impactIndicators: row.impact_indicators ?? null,
    financialSupport: row.financial_support === true,
    financialSummary: row.financial_summary ?? null,
    executedAmountCents: toInt(row.executed_amount_cents),
    concludedAt: toIso(row.concluded_at),
  };
}

function serializeResult(row) {
  return {
    id: row.id,
    goalId: row.goal_id,
    position: Number(row.position ?? 0),
    goal: row.goal_snapshot,
    indicator: row.indicator_snapshot,
    expectedResult: row.expected_result ?? null,
    plannedMeasurementMethod: row.planned_measurement_method ?? null,
    measuredValue: row.measured_value,
    measurementMethod: row.measurement_method,
    achieved: row.achieved === true,
    note: row.note ?? null,
    evidenceId: row.evidence_id ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Resultado no público: o mesmo, sem a nota interna do Agente. */
function serializePublicResult(row) {
  const { note, ...rest } = serializeResult(row);
  void note;
  return rest;
}

function serializeDocument(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description ?? null,
    reference: row.reference,
    issuedOn: toDate(row.issued_on),
    amountCents: toInt(row.amount_cents),
    position: Number(row.position ?? 0),
    createdAt: toIso(row.created_at),
  };
}

/**
 * Anexo na página pública: o comprovante financeiro e o relatório ficam com o
 * Agente e com a equipe de análise, como a documentação comprobatória da T06 —
 * o público vê que existe, o tipo, o título, a data e o valor declarado.
 */
function serializePublicDocument(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    issuedOn: toDate(row.issued_on),
    amountCents: toInt(row.amount_cents),
  };
}

async function loadAccountability(db, demandId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${ACCOUNTABILITY_SQL} FROM demand_accountability a
      WHERE a.demand_id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [demandId],
  );
  return rows[0] ?? null;
}

async function listResults(db, accountabilityId) {
  const { rows } = await db.query(
    `SELECT ${RESULT_SQL} FROM demand_accountability_results r
      WHERE r.accountability_id = $1 ORDER BY r.position, r.created_at, r.id`,
    [accountabilityId],
  );
  return rows;
}

async function listDocuments(db, accountabilityId) {
  const { rows } = await db.query(
    `SELECT ${DOCUMENT_SQL} FROM demand_accountability_documents x
      WHERE x.accountability_id = $1 ORDER BY x.kind, x.position, x.created_at, x.id`,
    [accountabilityId],
  );
  return rows;
}

/** Metas declaradas na T06, com o resultado já informado (quando houver). */
async function listGoalsWithResults(db, demandId, accountabilityId) {
  const { rows } = await db.query(
    `SELECT g.id, g.position, g.goal, g.expected_result, g.indicator, g.measurement_method,
            r.id AS result_id
       FROM demand_goals g
       LEFT JOIN demand_accountability_results r
         ON r.goal_id = g.id AND r.accountability_id = $2
      WHERE g.demand_id = $1 ORDER BY g.position, g.id`,
    [demandId, accountabilityId],
  );
  return rows.map((row) => ({
    goalId: row.id,
    position: Number(row.position ?? 0),
    goal: row.goal,
    expectedResult: row.expected_result,
    indicator: row.indicator,
    measurementMethod: row.measurement_method,
    answered: Boolean(row.result_id),
  }));
}

/** Quantas evidências há por marco (T17), para a exigência condicional. */
async function evidenceMilestones(db, demandId) {
  const { rows: [row] } = await db.query(
    `SELECT count(*) FILTER (WHERE milestone = 'antes')  AS antes,
            count(*) FILTER (WHERE milestone = 'depois') AS depois
       FROM demand_evidences WHERE demand_id = $1`,
    [demandId],
  );
  return { antes: Number(row?.antes ?? 0), depois: Number(row?.depois ?? 0) };
}

/** Totais que a página pública mostra: metas cumpridas e comprovantes. */
function summarize(results, documents) {
  const receipts = documents.filter((d) => d.kind === 'comprovante_financeiro');
  return {
    goalsTotal: results.length,
    goalsAchieved: results.filter((r) => r.achieved).length,
    documentsTotal: documents.length,
    financialReceipts: receipts.length,
    financialReceiptsCents: receipts.reduce((sum, d) => sum + (d.amountCents ?? 0), 0),
  };
}

/** Prestação concluída de uma demanda, para o dossiê e a página pública. */
async function loadConcludedView(db, demandId) {
  const row = await loadAccountability(db, demandId);
  if (!row || row.status !== 'concluida') return null;
  // Em sequência: `db` pode ser o cliente de uma transação (dossiê).
  const results = await listResults(db, row.id);
  const documents = await listDocuments(db, row.id);
  const publicResults = results.map(serializePublicResult);
  const publicDocuments = documents.map(serializePublicDocument);
  return {
    accountability: serializePublicAccountability(row),
    results: publicResults,
    documents: publicDocuments,
    summary: summarize(publicResults, publicDocuments),
  };
}

/** Anexo da prestação; 404 quando é de outra prestação. */
async function loadDocument(db, accountabilityId, documentId) {
  const { rows } = await db.query(
    `SELECT ${DOCUMENT_SQL} FROM demand_accountability_documents x
      WHERE x.id = $1 AND x.accountability_id = $2`,
    [documentId, accountabilityId],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Documento não encontrado' });
  return rows[0];
}

module.exports = {
  ACCOUNTABILITY_SQL,
  RESULT_SQL,
  DOCUMENT_SQL,
  serializeAccountability,
  serializePublicAccountability,
  serializeResult,
  serializePublicResult,
  serializeDocument,
  serializePublicDocument,
  loadAccountability,
  listResults,
  listDocuments,
  listGoalsWithResults,
  evidenceMilestones,
  summarize,
  loadConcludedView,
  loadDocument,
};
