// Projeções e leitura da execução da demanda (T17, migração post 014).
//
// Duas visões: a do Agente autor (com a nota interna da atualização) e a
// pública (histórico visual e transparência da execução, slides 23 e 24). O
// histórico visual é o pareamento antes↔depois: a evidência do "depois" guarda
// o id da evidência do "antes".

const { HttpError } = require('../demand/store');
const { publicMediaUrl } = require('../upload-policy');

const EVIDENCE_SQL = `
  e.id, e.demand_id, e.progress_update_id, e.schedule_item_id, e.milestone::text AS milestone,
  e.media_kind::text AS media_kind, e.upload_ref, e.upload_id, e.caption, e.recorded_on,
  e.author_id, e.author_name, e.pair_evidence_id, e.position, e.created_at, e.updated_at,
  (SELECT s.stage FROM demand_schedule_items s WHERE s.id = e.schedule_item_id) AS stage`;

const PROGRESS_SQL = `
  u.id, u.demand_id, u.author_id, u.author_name, u.schedule_item_id,
  u.stage_progress::text AS stage_progress, u.on_schedule, u.new_ends_on, u.deadline_reason,
  u.partial_results, u.note, u.created_at,
  (SELECT s.stage FROM demand_schedule_items s WHERE s.id = u.schedule_item_id) AS stage`;

const EXPENSE_SQL = `
  x.id, x.progress_update_id, x.budget_item_id, x.schedule_item_id, x.description,
  x.executed_amount_cents, x.created_at,
  (SELECT b.description FROM demand_budget_items b WHERE b.id = x.budget_item_id) AS budget_description,
  (SELECT s.stage FROM demand_schedule_items s WHERE s.id = x.schedule_item_id) AS stage`;

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const toDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null);
const toCents = (value) => (value === null || value === undefined ? 0 : Number(value));

/** Evidência vista pelo Agente autor. */
function serializeEvidence(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    progressUpdateId: row.progress_update_id ?? null,
    scheduleItemId: row.schedule_item_id ?? null,
    stage: row.stage ?? null,
    milestone: row.milestone,
    mediaKind: row.media_kind,
    reference: row.upload_ref,
    url: publicMediaUrl(row.upload_ref),
    caption: row.caption ?? null,
    recordedOn: toDate(row.recorded_on),
    author: { userId: row.author_id, name: row.author_name ?? null },
    pairEvidenceId: row.pair_evidence_id ?? null,
    position: Number(row.position ?? 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Evidência no histórico visual público: sem id do arquivo nem autor. */
function serializePublicEvidence(row) {
  return {
    id: row.id,
    scheduleItemId: row.schedule_item_id ?? null,
    stage: row.stage ?? null,
    milestone: row.milestone,
    mediaKind: row.media_kind,
    url: publicMediaUrl(row.upload_ref),
    caption: row.caption ?? null,
    recordedOn: toDate(row.recorded_on),
    pairEvidenceId: row.pair_evidence_id ?? null,
    createdAt: toIso(row.created_at),
  };
}

function serializeExpense(row) {
  return {
    id: row.id,
    progressUpdateId: row.progress_update_id,
    budgetItemId: row.budget_item_id ?? null,
    budgetDescription: row.budget_description ?? null,
    scheduleItemId: row.schedule_item_id ?? null,
    stage: row.stage ?? null,
    description: row.description ?? null,
    executedAmountCents: toCents(row.executed_amount_cents),
    createdAt: toIso(row.created_at),
  };
}

/** Atualização de andamento vista pelo Agente autor (com a nota interna). */
function serializeProgress(row, expenses = []) {
  return {
    id: row.id,
    demandId: row.demand_id,
    scheduleItemId: row.schedule_item_id ?? null,
    stage: row.stage ?? null,
    stageProgress: row.stage_progress ?? null,
    onSchedule: row.on_schedule === null || row.on_schedule === undefined ? null : row.on_schedule === true,
    newEndsOn: toDate(row.new_ends_on),
    deadlineReason: row.deadline_reason ?? null,
    partialResults: row.partial_results ?? null,
    note: row.note ?? null,
    author: { userId: row.author_id, name: row.author_name ?? null },
    expenses,
    executedAmountCents: expenses.reduce((sum, e) => sum + e.executedAmountCents, 0),
    createdAt: toIso(row.created_at),
  };
}

/** Atualização no acompanhamento público: sem nota interna e sem autor. */
function serializePublicProgress(row, expenses = []) {
  return {
    id: row.id,
    stage: row.stage ?? null,
    stageProgress: row.stage_progress ?? null,
    onSchedule: row.on_schedule === null || row.on_schedule === undefined ? null : row.on_schedule === true,
    newEndsOn: toDate(row.new_ends_on),
    deadlineReason: row.deadline_reason ?? null,
    partialResults: row.partial_results ?? null,
    executedAmountCents: expenses.reduce((sum, e) => sum + e.executedAmountCents, 0),
    createdAt: toIso(row.created_at),
  };
}

async function listEvidences(db, demandId) {
  const { rows } = await db.query(
    `SELECT ${EVIDENCE_SQL} FROM demand_evidences e
      WHERE e.demand_id = $1 ORDER BY e.milestone, e.position, e.created_at, e.id`,
    [demandId],
  );
  return rows;
}

async function listProgress(db, demandId) {
  const { rows } = await db.query(
    `SELECT ${PROGRESS_SQL} FROM demand_progress_updates u
      WHERE u.demand_id = $1 ORDER BY u.created_at DESC, u.id DESC`,
    [demandId],
  );
  const { rows: expenses } = await db.query(
    `SELECT ${EXPENSE_SQL} FROM demand_progress_expenses x
      WHERE x.demand_id = $1 ORDER BY x.created_at, x.id`,
    [demandId],
  );
  const byUpdate = new Map();
  for (const row of expenses) {
    const list = byUpdate.get(row.progress_update_id) ?? [];
    list.push(serializeExpense(row));
    byUpdate.set(row.progress_update_id, list);
  }
  return rows.map((row) => ({ row, expenses: byUpdate.get(row.id) ?? [] }));
}

/**
 * Pares antes↔depois do histórico visual (slide 24): cada par traz o registro
 * inicial e o resultado. Evidências sem par ficam de fora.
 */
function pairsOf(evidences) {
  const byId = new Map(evidences.map((e) => [e.id, e]));
  return evidences
    .filter((e) => e.milestone === 'depois' && e.pairEvidenceId && byId.has(e.pairEvidenceId))
    .map((after) => ({
      mediaKind: after.mediaKind,
      stage: after.stage ?? byId.get(after.pairEvidenceId).stage ?? null,
      before: byId.get(after.pairEvidenceId),
      after,
    }));
}

/**
 * Execução orçamentária: planejado × executado por item do orçamento, mais os
 * lançamentos ligados só a uma etapa e os totais da demanda.
 */
async function budgetExecution(db, demandId) {
  const { rows: items } = await db.query(
    `SELECT b.id, b.position, b.description, b.total_cents, b.is_audiovisual_record,
            COALESCE((SELECT sum(x.executed_amount_cents) FROM demand_progress_expenses x
                       WHERE x.budget_item_id = b.id), 0) AS executed_cents
       FROM demand_budget_items b WHERE b.demand_id = $1 ORDER BY b.position, b.id`,
    [demandId],
  );
  const { rows: stages } = await db.query(
    `SELECT s.id, s.position, s.stage,
            COALESCE(sum(x.executed_amount_cents), 0) AS executed_cents
       FROM demand_schedule_items s
       JOIN demand_progress_expenses x ON x.schedule_item_id = s.id AND x.budget_item_id IS NULL
      WHERE s.demand_id = $1 GROUP BY s.id, s.position, s.stage ORDER BY s.position, s.id`,
    [demandId],
  );
  const { rows: [totals] } = await db.query(
    `SELECT COALESCE((SELECT sum(b.total_cents) FROM demand_budget_items b WHERE b.demand_id = $1), 0) AS planned,
            COALESCE((SELECT sum(x.executed_amount_cents) FROM demand_progress_expenses x
                       WHERE x.demand_id = $1), 0) AS executed`,
    [demandId],
  );
  return {
    items: items.map((row) => ({
      budgetItemId: row.id,
      description: row.description,
      isAudiovisualRecord: row.is_audiovisual_record === true,
      plannedCents: toCents(row.total_cents),
      executedCents: toCents(row.executed_cents),
    })),
    stages: stages.map((row) => ({
      scheduleItemId: row.id,
      stage: row.stage,
      executedCents: toCents(row.executed_cents),
    })),
    plannedCents: toCents(totals?.planned),
    executedCents: toCents(totals?.executed),
  };
}

/** Situação corrente de cada etapa do cronograma: última atualização que a citou. */
async function scheduleStatus(db, demandId) {
  const { rows } = await db.query(
    `SELECT s.id, s.position, s.stage, s.starts_on, s.ends_on, s.record_milestones,
            last.stage_progress::text AS stage_progress, last.created_at AS updated_at,
            COALESCE(deadline.ends_on, s.ends_on) AS current_ends_on,
            deadline.ends_on AS rescheduled_to
       FROM demand_schedule_items s
       LEFT JOIN LATERAL (
         SELECT u.stage_progress, u.created_at FROM demand_progress_updates u
          WHERE u.schedule_item_id = s.id ORDER BY u.created_at DESC, u.id DESC LIMIT 1) last ON true
       LEFT JOIN LATERAL (
         SELECT u.new_ends_on AS ends_on FROM demand_progress_updates u
          WHERE u.schedule_item_id = s.id AND u.new_ends_on IS NOT NULL
          ORDER BY u.created_at DESC, u.id DESC LIMIT 1) deadline ON true
      WHERE s.demand_id = $1 ORDER BY s.position, s.id`,
    [demandId],
  );
  return rows.map((row) => ({
    scheduleItemId: row.id,
    stage: row.stage,
    startsOn: toDate(row.starts_on),
    endsOn: toDate(row.ends_on),
    currentEndsOn: toDate(row.current_ends_on),
    rescheduledTo: toDate(row.rescheduled_to),
    recordMilestones: Array.isArray(row.record_milestones) ? row.record_milestones : [],
    stageProgress: row.stage_progress ?? null,
    updatedAt: toIso(row.updated_at),
  }));
}

/** Quantas evidências há por marco (pendências das transições). */
function milestoneCounts(evidences) {
  return {
    antes: evidences.filter((e) => e.milestone === 'antes').length,
    acompanhamento: evidences.filter((e) => e.milestone === 'acompanhamento').length,
    depois: evidences.filter((e) => e.milestone === 'depois').length,
  };
}

/** Evidência da demanda; 404 quando é de outra demanda. */
async function loadEvidence(db, demandId, evidenceId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${EVIDENCE_SQL} FROM demand_evidences e
      WHERE e.id = $1 AND e.demand_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [evidenceId, demandId],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Evidência não encontrada' });
  return rows[0];
}

module.exports = {
  EVIDENCE_SQL,
  PROGRESS_SQL,
  EXPENSE_SQL,
  serializeEvidence,
  serializePublicEvidence,
  serializeExpense,
  serializeProgress,
  serializePublicProgress,
  listEvidences,
  listProgress,
  pairsOf,
  budgetExecution,
  scheduleStatus,
  milestoneCounts,
  loadEvidence,
};
