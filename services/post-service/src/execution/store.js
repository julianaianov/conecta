// Projeções e leitura da execução da demanda (T17, migração post 014).
//
// Duas visões: a do Agente autor (com a nota interna da atualização) e a
// pública (histórico visual e transparência da execução, slides 23 e 24). O
// histórico visual é o pareamento antes↔depois: a evidência do "depois" guarda
// o id da evidência do "antes".

const { HttpError } = require('../demand/store');
const { publicMediaUrl } = require('../upload-policy');
const { stageStatus } = require('./constants');

const EVIDENCE_SQL = `
  e.id, e.demand_id, e.progress_update_id, e.schedule_item_id, e.milestone::text AS milestone,
  e.media_kind::text AS media_kind, e.upload_ref, e.upload_id, e.caption, e.recorded_on,
  e.author_id, e.author_name, e.pair_evidence_id, e.position, e.created_at, e.updated_at,
  (SELECT s.stage FROM demand_schedule_items s WHERE s.id = e.schedule_item_id) AS stage`;

const PROGRESS_SQL = `
  u.id, u.demand_id, u.author_id, u.author_name, u.schedule_item_id,
  u.stage_progress::text AS stage_progress, u.block_reason, u.on_schedule, u.new_ends_on, u.deadline_reason,
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
    blockReason: row.block_reason ?? null,
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
    blockReason: row.block_reason ?? null,
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

/**
 * Situação corrente de cada etapa do cronograma (visão `demand_stage_status`,
 * migração 034): a última situação declarada, o prazo corrente, o motivo do
 * bloqueio e o atraso gravado. `stageProgress` é o status do §18 — `atrasada`
 * quando há atraso gravado em aberto ou o prazo corrente venceu com a demanda
 * em execução (`isLate`), sem esperar a próxima passada do laço.
 */
async function scheduleStatus(db, demandId, { running = false, today = new Date() } = {}) {
  const { rows } = await db.query(
    `SELECT st.schedule_item_id, st.position, st.stage, st.starts_on, st.ends_on, st.current_ends_on,
            st.rescheduled_to, st.declared_progress, st.block_reason, st.progress_updated_at,
            st.open_delay_id, st.late_due_on, st.late_since, s.record_milestones::text[] AS record_milestones
       FROM demand_stage_status st
       JOIN demand_schedule_items s ON s.id = st.schedule_item_id
      WHERE st.demand_id = $1 ORDER BY st.position, st.schedule_item_id`,
    [demandId],
  );
  return rows.map((row) => {
    const currentEndsOn = toDate(row.current_ends_on);
    const declared = row.declared_progress ?? null;
    const status = stageStatus({
      declared, openDelay: Boolean(row.open_delay_id), currentEndsOn, running,
    }, today);
    return {
      scheduleItemId: row.schedule_item_id,
      stage: row.stage,
      startsOn: toDate(row.starts_on),
      endsOn: toDate(row.ends_on),
      currentEndsOn,
      rescheduledTo: toDate(row.rescheduled_to),
      recordMilestones: Array.isArray(row.record_milestones) ? row.record_milestones : [],
      stageProgress: status,
      declaredProgress: declared,
      blockReason: status === 'bloqueada' ? row.block_reason ?? null : null,
      late: status === 'atrasada',
      lateSince: row.open_delay_id ? toDate(row.late_since) : null,
      updatedAt: toIso(row.progress_updated_at),
    };
  });
}

const INCIDENT_SQL = `
  i.id, i.demand_id, i.process_id, i.schedule_item_id, i.kind::text AS kind, i.description,
  i.occurred_on, i.impact::text AS impact, i.author_id, i.author_name, i.resolved_at, i.resolution,
  i.created_at,
  (SELECT s.stage FROM demand_schedule_items s WHERE s.id = i.schedule_item_id) AS stage`;

/** Ocorrência vista pelo Agente autor. */
function serializeIncident(row) {
  return {
    id: row.id,
    processId: row.process_id ?? null,
    scheduleItemId: row.schedule_item_id ?? null,
    stage: row.stage ?? null,
    kind: row.kind,
    description: row.description,
    occurredOn: toDate(row.occurred_on),
    impact: row.impact,
    resolved: Boolean(row.resolved_at),
    resolvedAt: toIso(row.resolved_at),
    resolution: row.resolution ?? null,
    author: { userId: row.author_id, name: row.author_name ?? null },
    createdAt: toIso(row.created_at),
  };
}

/** Ocorrência no acompanhamento público: sem autor nem processo. */
function serializePublicIncident(row) {
  const { author, processId, ...rest } = serializeIncident(row);
  void author;
  void processId;
  return rest;
}

async function listIncidents(db, demandId) {
  const { rows } = await db.query(
    `SELECT ${INCIDENT_SQL} FROM demand_execution_incidents i
      WHERE i.demand_id = $1 ORDER BY i.occurred_on DESC, i.created_at DESC, i.id`,
    [demandId],
  );
  return rows;
}

async function loadIncident(db, demandId, incidentId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${INCIDENT_SQL} FROM demand_execution_incidents i
      WHERE i.id = $1 AND i.demand_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [incidentId, demandId],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Ocorrência não encontrada' });
  return rows[0];
}

const percent = (part, total) => (total > 0 ? Math.round((part / total) * 1000) / 10 : null);

/**
 * Percentual de execução (Modelo de Conexão §19): etapas concluídas sobre o
 * total do cronograma e, quando há orçamento, o executado sobre o planejado.
 * `null` quando não há base para o cálculo.
 */
function executionSummary(schedule = [], budget = null, incidents = []) {
  const stagesTotal = schedule.length;
  const stagesCompleted = schedule.filter((s) => s.stageProgress === 'concluida').length;
  const planned = Number(budget?.plannedCents ?? 0);
  const executed = Number(budget?.executedCents ?? 0);
  return {
    percentComplete: percent(stagesCompleted, stagesTotal),
    percentByAmount: percent(executed, planned),
    stagesTotal,
    stagesCompleted,
    stagesInProgress: schedule.filter((s) => s.stageProgress === 'em_andamento').length,
    stagesLate: schedule.filter((s) => s.stageProgress === 'atrasada').length,
    stagesBlocked: schedule.filter((s) => s.stageProgress === 'bloqueada').length,
    incidentsOpen: incidents.filter((i) => !i.resolved).length,
    incidentsTotal: incidents.length,
  };
}

/**
 * Registros previstos no cronograma e ainda não enviados (T-02-04; Fluxo 2,
 * slide 14): cada marco de `record_milestones` de uma etapa sem evidência
 * daquela etapa e daquele marco. Informativo: só a transição para execução
 * (`antes`) e a conclusão (`depois`) exigem registro, em nível de demanda.
 */
function pendingRecords(schedule = [], evidences = []) {
  const done = new Set(evidences
    .filter((e) => e.scheduleItemId)
    .map((e) => `${e.scheduleItemId}:${e.milestone}`));
  const pending = [];
  for (const stage of schedule) {
    for (const milestone of stage.recordMilestones ?? []) {
      if (!done.has(`${stage.scheduleItemId}:${milestone}`)) {
        pending.push({ scheduleItemId: stage.scheduleItemId, stage: stage.stage, milestone });
      }
    }
  }
  return pending;
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
  INCIDENT_SQL,
  serializeIncident,
  serializePublicIncident,
  listIncidents,
  loadIncident,
  executionSummary,
  milestoneCounts,
  pendingRecords,
  loadEvidence,
};
