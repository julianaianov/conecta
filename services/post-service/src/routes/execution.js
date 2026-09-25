// Execução, evidências do antes/depois e acompanhamento da demanda (T17).
// Montada em `/demands` no post-service ANTES das rotas da demanda (o `/:id`
// de lá só aceita UUID); público em `/api/posts/demands`.
//
// Fonte: Fluxo 2, slide 11 (o registro documenta a situação inicial e o
// resultado, como evidência de acompanhamento, transparência e comprovação),
// slide 12 (o que o registro deve contemplar), slide 14 (os momentos de
// registro previstos no cronograma físico-financeiro), slide 23 (execução e
// acompanhamento: etapas concluídas e em andamento, cumprimento do cronograma,
// alterações de prazo, execução orçamentária, resultados parciais e
// evidências) e slide 24 (os registros de antes e depois ficam vinculados à
// demanda e compõem o histórico visual).
//
// Público:
//   GET  /:id/execution                  histórico visual (pares antes/depois),
//                                        andamento, execução orçamentária e
//                                        situação do cronograma
// Agente autor:
//   GET  /mine/:id/execution             o mesmo, com nota interna e pendências
//   POST /mine/:id/evidences             registra foto ou vídeo (upload da T08)
//   PUT  /mine/:id/evidences/:evidenceId legenda e pareamento antes↔depois
//   POST /mine/:id/progress              atualização de andamento e execução
//                                        orçamentária (só inserção)
//   POST /mine/:id/record-waiver         justifica a ausência de execução física
//   POST /mine/:id/incidents             registra ocorrência (Modelo §19)
//   POST /mine/:id/incidents/:incidentId/resolve   resolução, gravada uma vez
//
// Status da etapa (Modelo §18): `schedule[].stageProgress` é Não iniciada, Em
// andamento, Concluída, Atrasada ou Bloqueada; o atraso é gravado
// (`demand_stage_delays`, migração 034) e `summary` traz o percentual de
// execução, etapas atrasadas/bloqueadas e ocorrências em aberto.
//
// A evidência vale da publicação em diante (o "antes" precede o início da
// execução); o andamento, do início da execução em diante. `em_execucao` exige
// evidência "antes" e `concluida` exige "depois", salvo justificativa — a
// regra vive no trigger `demand_execution_guard` e é repetida em
// `src/routes/demands.js` para dar erro por campo.

const express = require('express');
const { isUuid } = require('../security');
const { requireDemandAuthorRole } = require('../demand/gate');
const demandStore = require('../demand/store');
const { PUBLIC_STATUSES } = require('../demand/constants');
const { findUsableUpload, parseUploadRef, formatUploadRef } = require('../uploads');
const {
  EVIDENCE_PURPOSE_BY_MEDIA, EVIDENCE_OPEN_STATUSES, PROGRESS_OPEN_STATUSES, WAIVER_OPEN_STATUSES,
  RECORD_MILESTONES,
} = require('../execution/constants');
const {
  validateEvidence, validateEvidenceUpdate, validateProgressUpdate, validateRecordWaiver,
  validateIncident, validateIncidentResolution,
} = require('../execution/validation');
const store = require('../execution/store');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction, sendError } = demandStore;
const { validationError } = listHelpers;

/** Erros dos triggers da migração 014 → HTTP. */
function mapExecutionDbError(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514' && /registre a situação inicial|registre o resultado/.test(message)) {
    return new HttpError(409, { error: message, code: 'evidence_required' });
  }
  if (err?.code === '23514' && /resolução da ocorrência é gravada uma vez/.test(message)) {
    return new HttpError(409, { error: message, code: 'incident_resolved' });
  }
  if (err?.code === '23514' && /só o Agente autor|justificativa de ausência|o andamento é registrado|a execução só é registrada/.test(message)) {
    return new HttpError(409, { error: message, code: 'invalid_state' });
  }
  if (err?.code === '23514' && /o par da evidência|o "depois" é pareado|o par antes\/depois|não é pareada consigo/.test(message)) {
    return new HttpError(422, { error: message, code: 'validation_failed', fields: { pairEvidenceId: message } });
  }
  if (err?.code === '23514' && /arquivo da evidência|arquivo já confirmado|demand_evidence_photo/.test(message)) {
    return new HttpError(422, { error: message, code: 'validation_failed', fields: { reference: message } });
  }
  if (err?.code === '23505' && /idx_demand_evidences_pair/.test(message)) {
    return new HttpError(409, {
      error: 'Este registro do "antes" já está pareado com outro "depois"',
      code: 'pair_taken',
    });
  }
  if (err?.code === '23505' && /demand_evidences_upload/.test(message)) {
    return new HttpError(409, { error: 'Este arquivo já foi registrado como evidência', code: 'evidence_exists' });
  }
  if (err?.code === '42501') {
    return new HttpError(409, { error: message, code: 'invalid_state' });
  }
  return err;
}

module.exports = ({ pool, auth, validatedAgent, institutionStatus = null }) => {
  if (typeof auth !== 'function' || typeof validatedAgent !== 'function') {
    throw new Error('execution routes exigem auth e requireValidatedAgent');
  }
  const router = express.Router();
  const notFound = (res) => res.status(404).json({ error: 'Demanda não encontrada' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));
  router.param('evidenceId', (req, res, next, id) => (
    isUuid(id) ? next() : res.status(404).json({ error: 'Evidência não encontrada' })));
  router.param('incidentId', (req, res, next, id) => (
    isUuid(id) ? next() : res.status(404).json({ error: 'Ocorrência não encontrada' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, mapExecutionDbError(err));
    }
  };

  // Agente, ou conta que age como Agente por delegação (T29).
  const requireAgent = requireDemandAuthorRole(institutionStatus);

  /** Demanda pública (publicada em diante, fora `arquivada`). */
  async function loadPublicDemand(db, demandId) {
    const { rows } = await db.query(
      `SELECT d.id, d.status::text AS status, d.has_physical_execution,
              d.record_waiver_reason, d.record_waiver_at
         FROM demands d WHERE d.id = $1 AND d.status = ANY($2::demand_status[])`,
      [demandId, PUBLIC_STATUSES],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    return rows[0];
  }

  function assertOpen(demand, statuses, message) {
    if (!statuses.includes(demand.status)) {
      throw new HttpError(409, { error: message, code: 'demand_not_open', status: demand.status });
    }
  }

  /** Arquivo da evidência: upload confirmado do Agente, desta demanda, da finalidade do tipo. */
  async function checkEvidenceUpload(db, reference, mediaKind, ownerId, demandId) {
    const id = parseUploadRef(reference);
    const purpose = EVIDENCE_PURPOSE_BY_MEDIA[mediaKind];
    const row = id && purpose
      ? await findUsableUpload(db, { id, ownerId, purpose, targetColumn: 'demand_id', targetId: demandId })
      : null;
    if (!row) {
      throw validationError({
        reference: mediaKind === 'video'
          ? 'Envie e confirme o vídeo desta demanda (finalidade "vídeo do antes/depois")'
          : 'Envie e confirme a foto desta demanda (finalidade "foto do antes/depois")',
      });
    }
    return { id: row.id, ref: formatUploadRef(row.id) };
  }

  /** Visão completa da execução, para o público e para o autor. */
  async function executionView(db, demandId, { owner, status }) {
    const [rawEvidences, progress, budget, schedule, rawIncidents] = await Promise.all([
      store.listEvidences(db, demandId),
      store.listProgress(db, demandId),
      store.budgetExecution(db, demandId),
      store.scheduleStatus(db, demandId, { running: status === 'em_execucao' }),
      store.listIncidents(db, demandId),
    ]);
    const evidences = rawEvidences.map(owner ? store.serializeEvidence : store.serializePublicEvidence);
    const incidents = rawIncidents.map(owner ? store.serializeIncident : store.serializePublicIncident);
    return {
      evidences,
      pairs: store.pairsOf(evidences),
      milestones: store.milestoneCounts(evidences),
      progress: progress.map(({ row, expenses }) => (owner
        ? store.serializeProgress(row, expenses)
        : store.serializePublicProgress(row, expenses))),
      budgetExecution: budget,
      schedule,
      incidents,
      summary: store.executionSummary(schedule, budget, incidents),
    };
  }

  // ── Histórico visual e acompanhamento públicos (slides 23 e 24) ───────────
  router.get('/:id/execution', handle(async (req, res) => {
    const demand = await loadPublicDemand(pool, req.params.id);
    const view = await executionView(pool, demand.id, { owner: false, status: demand.status });
    res.json({
      ...view,
      status: demand.status,
      hasPhysicalExecution: demand.has_physical_execution === true,
      recordWaiverReason: demand.record_waiver_reason ?? null,
    });
  }));

  // ── Agente autor ──────────────────────────────────────────────────────────
  router.get('/mine/:id/execution', auth, requireAgent, handle(async (req, res) => {
    const demand = await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const view = await executionView(pool, demand.id, { owner: true, status: demand.status });
    const waived = Boolean(demand.record_waiver_reason);
    res.json({
      ...view,
      status: demand.status,
      hasPhysicalExecution: demand.has_physical_execution === true,
      recordWaiverReason: demand.record_waiver_reason ?? null,
      recordWaiverAt: demand.record_waiver_at instanceof Date
        ? demand.record_waiver_at.toISOString()
        : demand.record_waiver_at ?? null,
      canRegisterEvidence: EVIDENCE_OPEN_STATUSES.includes(demand.status),
      canRegisterProgress: PROGRESS_OPEN_STATUSES.includes(demand.status),
      canRegisterIncident: PROGRESS_OPEN_STATUSES.includes(demand.status),
      canWaiveRecord: !waived && WAIVER_OPEN_STATUSES.includes(demand.status),
      // Pendências das transições (`iniciar_execucao` e `concluir`).
      pending: {
        antes: !waived && view.milestones.antes === 0,
        depois: !waived && view.milestones.depois === 0,
      },
    });
  }));

  router.post('/mine/:id/evidences', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, errors } = validateEvidence(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const evidence = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      assertOpen(demand, EVIDENCE_OPEN_STATUSES,
        'A evidência da execução é registrada com a demanda publicada');
      const upload = await checkEvidenceUpload(client, value.reference, value.mediaKind, req.user.userId, demand.id);
      if (value.scheduleItemId) {
        const { rowCount } = await client.query(
          'SELECT 1 FROM demand_schedule_items WHERE id = $1 AND demand_id = $2',
          [value.scheduleItemId, demand.id],
        );
        if (!rowCount) throw validationError({ scheduleItemId: 'Escolha uma etapa do cronograma desta demanda' });
      }
      const { rows: [position] } = await client.query(
        'SELECT COALESCE(max(position), -1) + 1 AS next FROM demand_evidences WHERE demand_id = $1 AND milestone = $2::demand_record_milestone',
        [demand.id, value.milestone],
      );
      const { rows: [row] } = await client.query(
        `INSERT INTO demand_evidences
           (demand_id, schedule_item_id, milestone, media_kind, upload_ref, upload_id, caption,
            recorded_on, author_id, author_name, pair_evidence_id, position)
         VALUES ($1, $2, $3::demand_record_milestone, $4::demand_evidence_media, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING id`,
        [
          demand.id, value.scheduleItemId, value.milestone, value.mediaKind, upload.ref, upload.id,
          value.caption, value.recordedOn, req.user.userId, req.user.name || null,
          value.pairEvidenceId, Number(position?.next ?? 0),
        ],
      );
      return store.loadEvidence(client, demand.id, row.id);
    });
    res.status(201).json({ evidence: store.serializeEvidence(evidence) });
  }));

  // Legenda e pareamento antes↔depois (histórico visual, slide 24).
  router.put('/mine/:id/evidences/:evidenceId', auth, requireAgent, handle(async (req, res) => {
    const { value, errors } = validateEvidenceUpdate(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const evidence = await withTransaction(pool, async (client) => {
      await demandStore.loadOwnDemand(client, req.params.id, req.user.userId);
      const row = await store.loadEvidence(client, req.params.id, req.params.evidenceId, { forUpdate: true });
      if (value.pairSent && value.pairEvidenceId && row.milestone !== 'depois') {
        throw validationError({ pairEvidenceId: 'O pareamento é feito no registro do "depois"' });
      }
      if (value.pairSent && !value.pairEvidenceId && row.pair_evidence_id) {
        throw new HttpError(409, {
          error: 'O par antes/depois já registrado não é desfeito',
          code: 'pair_locked',
        });
      }
      await client.query(
        `UPDATE demand_evidences
            SET caption = CASE WHEN $2 THEN $3 ELSE caption END,
                pair_evidence_id = CASE WHEN $4 THEN COALESCE($5::uuid, pair_evidence_id) ELSE pair_evidence_id END
          WHERE id = $1`,
        [row.id, value.captionSent, value.caption, value.pairSent, value.pairEvidenceId],
      );
      return store.loadEvidence(client, req.params.id, row.id);
    });
    res.json({ evidence: store.serializeEvidence(evidence) });
  }));

  // Atualização de andamento: etapas, cronograma, prazo, orçamento executado e
  // resultados parciais (slide 23). Só inserção — nada é editado depois.
  router.post('/mine/:id/progress', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, errors } = validateProgressUpdate(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const update = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      assertOpen(demand, PROGRESS_OPEN_STATUSES,
        'O andamento é registrado a partir do início da execução');
      const stageIds = new Set([
        value.scheduleItemId,
        ...value.expenses.map((e) => e.scheduleItemId),
      ].filter(Boolean));
      for (const stageId of stageIds) {
        const { rowCount } = await client.query(
          'SELECT 1 FROM demand_schedule_items WHERE id = $1 AND demand_id = $2',
          [stageId, demand.id],
        );
        if (!rowCount) throw validationError({ scheduleItemId: 'Escolha uma etapa do cronograma desta demanda' });
      }
      for (const [index, expense] of value.expenses.entries()) {
        if (!expense.budgetItemId) continue;
        const { rowCount } = await client.query(
          'SELECT 1 FROM demand_budget_items WHERE id = $1 AND demand_id = $2',
          [expense.budgetItemId, demand.id],
        );
        if (!rowCount) {
          throw validationError({ [`expenses.${index}.budgetItemId`]: 'Escolha um item do orçamento desta demanda' });
        }
      }
      const { rows: [row] } = await client.query(
        `INSERT INTO demand_progress_updates
           (demand_id, author_id, author_name, schedule_item_id, stage_progress, block_reason, on_schedule,
            new_ends_on, deadline_reason, partial_results, note)
         VALUES ($1, $2, $3, $4, $5::demand_stage_progress, $6, $7, $8, $9, $10, $11)
         RETURNING id`,
        [
          demand.id, req.user.userId, req.user.name || null, value.scheduleItemId, value.stageProgress,
          value.blockReason, value.onSchedule, value.newEndsOn, value.deadlineReason, value.partialResults,
          value.note,
        ],
      );
      for (const expense of value.expenses) {
        await client.query(
          `INSERT INTO demand_progress_expenses
             (progress_update_id, demand_id, budget_item_id, schedule_item_id, description, executed_amount_cents)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [row.id, demand.id, expense.budgetItemId, expense.scheduleItemId,
            expense.description, expense.executedAmountCents],
        );
      }
      const { rows: [saved] } = await client.query(
        `SELECT ${store.PROGRESS_SQL} FROM demand_progress_updates u WHERE u.id = $1`, [row.id],
      );
      const { rows: expenses } = await client.query(
        `SELECT ${store.EXPENSE_SQL} FROM demand_progress_expenses x
          WHERE x.progress_update_id = $1 ORDER BY x.created_at, x.id`,
        [row.id],
      );
      return store.serializeProgress(saved, expenses.map(store.serializeExpense));
    });
    res.status(201).json({ progress: update });
  }));

  // "Sempre que houver execução física ou intervenção que permita o registro"
  // (slide 12): quando não houver, o Agente justifica, e a justificativa entra
  // na linha do tempo pública.
  router.post('/mine/:id/record-waiver', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, errors } = validateRecordWaiver(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const waiver = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      if (demand.record_waiver_reason) {
        throw new HttpError(409, {
          error: 'A justificativa de ausência de registro já foi dada e não muda',
          code: 'record_waiver_exists',
        });
      }
      assertOpen(demand, WAIVER_OPEN_STATUSES,
        'A justificativa de ausência de registro é dada antes da conclusão');
      const { rows: [row] } = await client.query(
        'UPDATE demands SET record_waiver_reason = $2 WHERE id = $1 RETURNING record_waiver_reason, record_waiver_at',
        [demand.id, value.reason],
      );
      return row;
    });
    res.json({
      recordWaiverReason: waiver.record_waiver_reason,
      recordWaiverAt: waiver.record_waiver_at instanceof Date
        ? waiver.record_waiver_at.toISOString()
        : waiver.record_waiver_at ?? null,
    });
  }));

  // Ocorrências da execução (Modelo de Conexão §19): só inserção; entram na
  // linha do tempo pública com tipo, etapa, data e impacto.
  router.post('/mine/:id/incidents', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, errors } = validateIncident(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const incident = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      assertOpen(demand, PROGRESS_OPEN_STATUSES,
        'As ocorrências são registradas a partir do início da execução');
      if (value.scheduleItemId) {
        const { rowCount } = await client.query(
          'SELECT 1 FROM demand_schedule_items WHERE id = $1 AND demand_id = $2',
          [value.scheduleItemId, demand.id],
        );
        if (!rowCount) throw validationError({ scheduleItemId: 'Escolha uma etapa do cronograma desta demanda' });
      }
      if (value.processId) {
        // O Processo de Conexão (decisão 13) precisa ser desta demanda.
        const { rows: [table] } = await client.query(
          "SELECT to_regclass('public.connection_processes') IS NOT NULL AS ok",
        );
        const { rowCount } = table?.ok
          ? await client.query('SELECT 1 FROM connection_processes WHERE id = $1 AND demand_id = $2',
            [value.processId, demand.id])
          : { rowCount: 0 };
        if (!rowCount) throw validationError({ processId: 'Escolha um processo desta demanda' });
      }
      const { rows: [row] } = await client.query(
        `INSERT INTO demand_execution_incidents
           (demand_id, process_id, schedule_item_id, kind, description, occurred_on, impact,
            author_id, author_name)
         VALUES ($1, $2, $3, $4::demand_incident_kind, $5, $6, $7::demand_incident_impact, $8, $9)
         RETURNING id`,
        [
          demand.id, value.processId, value.scheduleItemId, value.kind, value.description,
          value.occurredOn, value.impact, req.user.userId, req.user.name || null,
        ],
      );
      return store.loadIncident(client, demand.id, row.id);
    });
    res.status(201).json({ incident: store.serializeIncident(incident) });
  }));

  router.post('/mine/:id/incidents/:incidentId/resolve', auth, requireAgent, validatedAgent,
    handle(async (req, res) => {
      const { value, errors } = validateIncidentResolution(req.body ?? {});
      if (Object.keys(errors).length) throw validationError(errors);
      const incident = await withTransaction(pool, async (client) => {
        const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
        assertOpen(demand, PROGRESS_OPEN_STATUSES,
          'As ocorrências são resolvidas a partir do início da execução');
        const row = await store.loadIncident(client, demand.id, req.params.incidentId, { forUpdate: true });
        if (row.resolved_at) {
          throw new HttpError(409, {
            error: 'A resolução da ocorrência já foi registrada e não muda',
            code: 'incident_resolved',
          });
        }
        await client.query(
          'UPDATE demand_execution_incidents SET resolved_at = NOW(), resolution = $2 WHERE id = $1',
          [row.id, value.resolution],
        );
        return store.loadIncident(client, demand.id, row.id);
      });
      res.json({ incident: store.serializeIncident(incident) });
    }));

  return router;
};

module.exports.RECORD_MILESTONES = RECORD_MILESTONES;
