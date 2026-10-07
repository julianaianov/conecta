// Prestação de contas e prestação de resultados da demanda (T18).
// Montada em `/demands` no post-service ANTES das rotas da demanda (o `/:id`
// de lá só aceita UUID); pública em `/api/posts/demands`.
//
// Fonte: Fluxo 2, slide 24 ("Etapa 10 · Prestação de resultados": ao longo e ao
// final da execução deverão ser registrados documentos e evidências, incluindo,
// obrigatoriamente quando aplicável, fotos e filmagem do antes e depois,
// registros das ações realizadas, comprovantes financeiros quando aplicável,
// relatórios de execução, atualização do cronograma, número de beneficiários,
// resultados alcançados e indicadores de impacto), slide 15 (metas,
// indicadores e forma de mensuração, fechados aqui com o valor medido) e
// slide 25, passo 18.
//
// Público:
//   GET  /:id/accountability                    prestação concluída: relatório,
//                                               resultados por meta, pessoas
//                                               impactadas, metas cumpridas e
//                                               comprovantes (sem arquivo)
// Agente autor:
//   GET    /mine/:id/accountability             rascunho + exigências
//   PUT    /mine/:id/accountability             grava os campos enviados
//   PUT    /mine/:id/accountability/results/:goalId   resultado de uma meta
//   DELETE /mine/:id/accountability/results/:goalId
//   POST   /mine/:id/accountability/documents         anexo (upload da T08)
//   DELETE /mine/:id/accountability/documents/:documentId
//   POST   /mine/:id/accountability/conclude    conclui, publica e gera dossiê
//
// A prestação só existe com a demanda em `prestacao_de_contas` (decisão 4). A
// conclusão congela tudo (trigger `demand_accountability_guard`), entra na
// linha do tempo pública (`prestacao_de_contas_concluida`) e pede uma versão
// nova do dossiê (T10, `trigger_kind` `prestacao_de_contas`).

const express = require('express');
const { isUuid } = require('../security');
const { requireDemandAuthorRole } = require('../demand/gate');
const demandStore = require('../demand/store');
const { PUBLIC_STATUSES } = require('../demand/constants');
const { findUsableUpload, parseUploadRef, formatUploadRef } = require('../uploads');
const {
  ACCOUNTABILITY_UPLOAD_PURPOSE, ACCOUNTABILITY_OPEN_STATUSES, MAX_DOCUMENTS,
} = require('../accountability/constants');
const {
  validateAccountabilityDraft, validateAccountabilityResult, validateAccountabilityDocument,
  checkRequirements, conclusionErrors,
} = require('../accountability/validation');
const store = require('../accountability/store');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction, sendError } = demandStore;
const { validationError } = listHelpers;

/** Colunas do rascunho, na ordem em que o `PUT` as grava. */
const DRAFT_COLUMNS = {
  executionReport: 'execution_report',
  actionsRecord: 'actions_record',
  scheduleSummary: 'schedule_summary',
  beneficiariesReached: 'beneficiaries_reached',
  beneficiariesNote: 'beneficiaries_note',
  impactIndicators: 'impact_indicators',
  financialSupport: 'financial_support',
  financialSummary: 'financial_summary',
  executedAmountCents: 'executed_amount_cents',
  participants: 'participants',
  executedFrom: 'executed_from',
  executedTo: 'executed_to',
  locationSummary: 'location_summary',
  finalResult: 'final_result',
};

/** Erros dos triggers da migração 015 → HTTP. */
function mapAccountabilityDbError(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514' && /exige o registro do "antes"|exige o registro do "depois"/.test(message)) {
    return new HttpError(409, { error: message, code: 'evidence_required' });
  }
  if (err?.code === '23514' && /exige comprovante financeiro|resultado alcançado de cada meta|exige ao menos uma entrega/.test(message)) {
    return new HttpError(409, { error: message, code: 'accountability_incomplete' });
  }
  if (err?.code === '23514' && /só o Agente autor presta contas|com a demanda em prestação de contas|começa como rascunho/.test(message)) {
    return new HttpError(409, { error: message, code: 'invalid_state' });
  }
  if (err?.code === '23514' && /arquivo do anexo|arquivo já confirmado|demand_accountability_document/.test(message)) {
    return new HttpError(422, { error: message, code: 'validation_failed', fields: { reference: message } });
  }
  if (err?.code === '23505' && /demand_accountability_documents_upload/.test(message)) {
    return new HttpError(409, { error: 'Este arquivo já foi anexado à prestação', code: 'document_exists' });
  }
  if (err?.code === '23505' && /demand_accountability_demand_id|demand_accountability_demand_id_key/.test(message)) {
    return new HttpError(409, { error: 'Esta demanda já tem prestação de contas', code: 'accountability_exists' });
  }
  if (err?.code === '23514' && /demand_accountability_concluded/.test(message)) {
    return new HttpError(409, {
      error: 'A prestação de contas ainda não tem tudo o que a conclusão exige',
      code: 'accountability_incomplete',
    });
  }
  if (err?.code === '42501') {
    return new HttpError(409, { error: message, code: 'invalid_state' });
  }
  return err;
}

module.exports = ({ pool, auth, validatedAgent, dossiers = null, institutionStatus = null }) => {
  if (typeof auth !== 'function' || typeof validatedAgent !== 'function') {
    throw new Error('accountability routes exigem auth e requireValidatedAgent');
  }
  const router = express.Router();
  const notFound = (res) => res.status(404).json({ error: 'Demanda não encontrada' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));
  router.param('goalId', (req, res, next, id) => (
    isUuid(id) ? next() : res.status(404).json({ error: 'Meta não encontrada' })));
  router.param('documentId', (req, res, next, id) => (
    isUuid(id) ? next() : res.status(404).json({ error: 'Documento não encontrado' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, mapAccountabilityDbError(err));
    }
  };

  // Agente, ou conta que age como Agente por delegação (T29).
  const requireAgent = requireDemandAuthorRole(institutionStatus);

  function assertOpen(demand) {
    if (!ACCOUNTABILITY_OPEN_STATUSES.includes(demand.status)) {
      throw new HttpError(409, {
        error: 'A prestação de contas é registrada com a demanda em prestação de contas',
        code: 'demand_not_open',
        status: demand.status,
      });
    }
  }

  function assertDraft(row) {
    if (!row) throw new HttpError(404, { error: 'Prestação de contas não encontrada' });
    if (row.status !== 'rascunho') {
      throw new HttpError(409, {
        error: 'A prestação de contas concluída não muda mais',
        code: 'accountability_concluded',
      });
    }
    return row;
  }

  /** Cria a linha na primeira gravação; a demanda precisa estar no estado certo. */
  async function ensureAccountability(client, demand, user) {
    const existing = await store.loadAccountability(client, demand.id, { forUpdate: true });
    if (existing) return existing;
    assertOpen(demand);
    await client.query(
      'INSERT INTO demand_accountability (demand_id, author_id, author_name) VALUES ($1, $2, $3)',
      [demand.id, user.userId, user.name || null],
    );
    return store.loadAccountability(client, demand.id, { forUpdate: true });
  }

  /** Arquivo do anexo: upload confirmado do Agente, desta demanda, da finalidade. */
  async function checkDocumentUpload(db, reference, ownerId, demandId) {
    const id = parseUploadRef(reference);
    const row = id
      ? await findUsableUpload(db, {
        id, ownerId, purpose: ACCOUNTABILITY_UPLOAD_PURPOSE, targetColumn: 'demand_id', targetId: demandId,
      })
      : null;
    if (!row) {
      throw validationError({
        reference: 'Envie e confirme o arquivo desta demanda (finalidade "documento da prestação de contas")',
      });
    }
    return { id: row.id, ref: formatUploadRef(row.id) };
  }

  /** Visão do Agente autor: rascunho, metas, anexos e o que a conclusão exige. */
  async function ownerView(db, demand, row) {
    const monitoring = await store.plannedMonitoring(db, demand.id);
    // Entregas registradas na execução (Modelo de Conexão §22): a conclusão exige ao menos uma.
    const deliveriesTotal = await store.countDeliveries(db, demand.id);
    // Documentos anexados durante a execução (T-05-12), listados no resumo.
    const executionDocuments = await store.listExecutionDocuments(db, demand.id);
    if (!row) {
      const milestones = await store.evidenceMilestones(db, demand.id);
      const goals = await store.listGoalsWithResults(db, demand.id, null);
      return {
        accountability: null,
        results: [],
        documents: [],
        executionDocuments,
        deliveriesTotal,
        goals,
        summary: store.summarize([], []),
        status: demand.status,
        hasPhysicalExecution: demand.has_physical_execution === true,
        recordWaiverReason: demand.record_waiver_reason ?? null,
        milestones,
        requirements: checkRequirements({
          accountability: {},
          hasPhysicalExecution: demand.has_physical_execution === true,
          recordWaived: Boolean(demand.record_waiver_reason),
          milestones,
          plannedMonitoring: monitoring,
          goalsTotal: goals.length,
          resultsTotal: 0,
          deliveriesTotal,
          financialReceipts: 0,
        }),
        editable: ACCOUNTABILITY_OPEN_STATUSES.includes(demand.status),
        canConclude: false,
      };
    }
    // Em sequência: `db` pode ser o cliente da transação, que não aceita
    // consultas simultâneas.
    const resultRows = await store.listResults(db, row.id);
    const documentRows = await store.listDocuments(db, row.id);
    const goals = await store.listGoalsWithResults(db, demand.id, row.id);
    const milestones = await store.evidenceMilestones(db, demand.id);
    const accountability = store.serializeAccountability(row);
    const results = resultRows.map(store.serializeResult);
    const documents = documentRows.map(store.serializeDocument);
    const summary = store.summarize(results, documents);
    const requirements = checkRequirements({
      accountability,
      hasPhysicalExecution: demand.has_physical_execution === true,
      recordWaived: Boolean(demand.record_waiver_reason),
      milestones,
      plannedMonitoring: monitoring,
      goalsTotal: goals.length,
      resultsTotal: results.length,
      deliveriesTotal,
      financialReceipts: summary.financialReceipts,
    });
    return {
      accountability,
      results,
      documents,
      executionDocuments,
      deliveriesTotal,
      goals,
      summary,
      status: demand.status,
      hasPhysicalExecution: demand.has_physical_execution === true,
      recordWaiverReason: demand.record_waiver_reason ?? null,
      milestones,
      requirements,
      editable: accountability.status === 'rascunho' && ACCOUNTABILITY_OPEN_STATUSES.includes(demand.status),
      canConclude: accountability.status === 'rascunho'
        && ACCOUNTABILITY_OPEN_STATUSES.includes(demand.status)
        && requirements.every((r) => !r.applies || r.satisfied || r.informative),
    };
  }

  // ── Resultados e prestação de contas públicos (slide 24, T19 parcial) ─────
  router.get('/:id/accountability', handle(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT d.id, d.status::text AS status, d.beneficiaries_estimate
         FROM demands d WHERE d.id = $1 AND d.status = ANY($2::demand_status[])`,
      [req.params.id, PUBLIC_STATUSES],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    const view = await store.loadConcludedView(pool, rows[0].id);
    if (!view) {
      // Sem prestação concluída a seção pública não existe ainda.
      res.json({
        accountability: null, results: [], documents: [], executionDocuments: [], summary: store.summarize([], []),
        status: rows[0].status,
      });
      return;
    }
    res.json({ ...view, status: rows[0].status });
  }));

  // ── Agente autor ──────────────────────────────────────────────────────────
  router.get('/mine/:id/accountability', auth, requireAgent, handle(async (req, res) => {
    const demand = await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const row = await store.loadAccountability(pool, demand.id);
    res.json(await ownerView(pool, demand, row));
  }));

  router.put('/mine/:id/accountability', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, sent, errors } = validateAccountabilityDraft(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const view = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      assertOpen(demand);
      const row = assertDraft(await ensureAccountability(client, demand, req.user));
      const sets = [];
      const params = [row.id];
      for (const [field, column] of Object.entries(DRAFT_COLUMNS)) {
        if (!sent[field]) continue;
        // `financial_support` é NOT NULL: `null` vira `false`.
        params.push(field === 'financialSupport' ? value[field] === true : value[field]);
        sets.push(`${column} = $${params.length}`);
      }
      if (sets.length) {
        await client.query(`UPDATE demand_accountability SET ${sets.join(', ')} WHERE id = $1`, params);
      }
      return ownerView(client, demand, await store.loadAccountability(client, demand.id));
    });
    res.json(view);
  }));

  // Resultado alcançado de uma meta declarada na T06 (slide 15). Um por meta.
  router.put('/mine/:id/accountability/results/:goalId', auth, requireAgent, validatedAgent,
    handle(async (req, res) => {
      const { value, errors } = validateAccountabilityResult(req.body ?? {});
      if (Object.keys(errors).length) throw validationError(errors);
      const view = await withTransaction(pool, async (client) => {
        const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
        assertOpen(demand);
        const row = assertDraft(await ensureAccountability(client, demand, req.user));
        const { rows: goals } = await client.query(
          'SELECT id, position, goal, indicator FROM demand_goals WHERE id = $1 AND demand_id = $2',
          [req.params.goalId, demand.id],
        );
        if (!goals.length) throw new HttpError(404, { error: 'Meta não encontrada' });
        const goal = goals[0];
        if (value.evidenceId) {
          const { rowCount } = await client.query(
            'SELECT 1 FROM demand_evidences WHERE id = $1 AND demand_id = $2',
            [value.evidenceId, demand.id],
          );
          if (!rowCount) throw validationError({ evidenceId: 'Escolha uma evidência desta demanda' });
        }
        await client.query(
          `INSERT INTO demand_accountability_results
             (accountability_id, demand_id, goal_id, position, goal_snapshot, indicator_snapshot,
              measured_value, measurement_method, achieved, note, evidence_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (accountability_id, goal_id) DO UPDATE
             SET measured_value = EXCLUDED.measured_value,
                 measurement_method = EXCLUDED.measurement_method,
                 achieved = EXCLUDED.achieved,
                 note = EXCLUDED.note,
                 evidence_id = EXCLUDED.evidence_id`,
          [
            row.id, demand.id, goal.id, Number(goal.position ?? 0), goal.goal, goal.indicator,
            value.measuredValue, value.measurementMethod, value.achieved, value.note, value.evidenceId,
          ],
        );
        return ownerView(client, demand, await store.loadAccountability(client, demand.id));
      });
      res.json(view);
    }));

  router.delete('/mine/:id/accountability/results/:goalId', auth, requireAgent, validatedAgent,
    handle(async (req, res) => {
      const view = await withTransaction(pool, async (client) => {
        const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
        const row = assertDraft(await store.loadAccountability(client, demand.id, { forUpdate: true }));
        await client.query(
          'DELETE FROM demand_accountability_results WHERE accountability_id = $1 AND goal_id = $2',
          [row.id, req.params.goalId],
        );
        return ownerView(client, demand, await store.loadAccountability(client, demand.id));
      });
      res.json(view);
    }));

  // Comprovantes financeiros, relatórios e registros das ações (slide 24).
  router.post('/mine/:id/accountability/documents', auth, requireAgent, validatedAgent,
    handle(async (req, res) => {
      const { value, errors } = validateAccountabilityDocument(req.body ?? {});
      if (Object.keys(errors).length) throw validationError(errors);
      const view = await withTransaction(pool, async (client) => {
        const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
        assertOpen(demand);
        const row = assertDraft(await ensureAccountability(client, demand, req.user));
        const { rows: [count] } = await client.query(
          'SELECT count(*)::int AS total FROM demand_accountability_documents WHERE accountability_id = $1',
          [row.id],
        );
        if (Number(count?.total ?? 0) >= MAX_DOCUMENTS) {
          throw validationError({ reference: `Anexe no máximo ${MAX_DOCUMENTS} documentos na prestação` });
        }
        const upload = await checkDocumentUpload(client, value.reference, req.user.userId, demand.id);
        const { rows: [position] } = await client.query(
          `SELECT COALESCE(max(position), -1) + 1 AS next FROM demand_accountability_documents
            WHERE accountability_id = $1 AND kind = $2::demand_accountability_document_kind`,
          [row.id, value.kind],
        );
        await client.query(
          `INSERT INTO demand_accountability_documents
             (accountability_id, demand_id, kind, title, description, reference, upload_id,
              issued_on, amount_cents, position)
           VALUES ($1, $2, $3::demand_accountability_document_kind, $4, $5, $6, $7, $8, $9, $10)`,
          [
            row.id, demand.id, value.kind, value.title, value.description, upload.ref, upload.id,
            value.issuedOn, value.amountCents, Number(position?.next ?? 0),
          ],
        );
        return ownerView(client, demand, await store.loadAccountability(client, demand.id));
      });
      res.status(201).json(view);
    }));

  router.delete('/mine/:id/accountability/documents/:documentId', auth, requireAgent, validatedAgent,
    handle(async (req, res) => {
      const view = await withTransaction(pool, async (client) => {
        const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
        const row = assertDraft(await store.loadAccountability(client, demand.id, { forUpdate: true }));
        await store.loadDocument(client, row.id, req.params.documentId);
        await client.query('DELETE FROM demand_accountability_documents WHERE id = $1', [req.params.documentId]);
        return ownerView(client, demand, await store.loadAccountability(client, demand.id));
      });
      res.json(view);
    }));

  // Conclusão: valida o obrigatório sempre e o condicional, congela o registro,
  // publica na página da demanda e na linha do tempo, e gera o dossiê.
  router.post('/mine/:id/accountability/conclude', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const view = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      assertOpen(demand);
      const row = await store.loadAccountability(client, demand.id, { forUpdate: true });
      // Sem registro ainda, a resposta é a mesma da prestação incompleta: o
      // Agente vê o que falta, não um 404.
      if (row) assertDraft(row);
      const current = await ownerView(client, demand, row);
      const errors = conclusionErrors({
        accountability: current.accountability,
        hasPhysicalExecution: current.hasPhysicalExecution,
        recordWaived: Boolean(current.recordWaiverReason),
        milestones: current.milestones,
        goalsTotal: current.goals.length,
        resultsTotal: current.results.length,
        deliveriesTotal: current.deliveriesTotal,
        financialReceipts: current.summary.financialReceipts,
      });
      if (Object.keys(errors).length) {
        throw new HttpError(422, {
          error: 'A prestação de contas ainda não pode ser concluída: complete os itens destacados',
          code: 'accountability_incomplete',
          fields: errors,
          requirements: current.requirements,
        });
      }
      await client.query("UPDATE demand_accountability SET status = 'concluida' WHERE id = $1", [row.id]);
      return ownerView(client, demand, await store.loadAccountability(client, demand.id));
    });
    res.json(view);
    // Dossiê da Demanda (T10): a prestação concluída gera uma versão nova
    // (integral e pública), fora do caminho crítico; falha não desfaz nada.
    if (dossiers) void dossiers.request(req.params.id);
  }));

  return router;
};
