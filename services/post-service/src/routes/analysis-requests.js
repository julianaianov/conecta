// Respostas à análise (T-05-05; Modelo de Conexão §10 e §12). Montada em
// /demands no post-service, antes das rotas da demanda; público em
// /api/posts/demands/... (o Caddy tira /api/posts).
//
// Parceiro ou Poder Público validado (token; nunca o autor da demanda):
//   POST /demands/:id/analysis-requests              { kind, body, requestedDocumentTypes?,
//                                                    meetingProposedAt?, meetingMode? }
//                                                    kind: informacoes_adicionais | documentos |
//                                                    reuniao | analise_tecnica | recusa (motivo
//                                                    obrigatório; com processo aberto, ele vai a
//                                                    Não aprovada)
//   GET  /demands/:id/analysis-requests/mine         as solicitações da conta (ou do órgão)
// Agente autor:
//   GET  /demands/mine/:id/analysis-requests         "Solicitações recebidas" (Parceiros e o
//                                                    espelho das respostas do Poder Público)
//   POST /demands/mine/:id/analysis-requests/:rid/answer  { body, documentIds[] } (documentos da
//                                                    demanda ou do processo; resposta única)
//
// O Poder Público também solicita pela resposta institucional
// (routes/institutional.js), que grava o espelho aqui. Avisos pela central de
// notificações (T-05-16): "Solicitação de análise" ao Agente, "respondida" a
// quem pediu. A linha do tempo recebe `solicitacao_registrada` e
// `solicitacao_respondida` (trigger da migração 030).

const express = require('express');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const { PUBLIC_STATUSES } = require('../demand/constants');
const demandStore = require('../demand/store');
const { requireDemandAuthorRole } = require('../demand/gate');
const { INTEREST_OPEN_STATUSES } = require('../interest/constants');
const { validateRequest, validateAnswer } = require('../analysis');
const store = require('../analysis/store');
const processStore = require('../process/store');
const { checkTransition: checkProcessTransition } = require('../process');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction, sendError } = demandStore;
const { validationError } = listHelpers;

module.exports = ({ pool, auth, validatedAgent, institutionStatus }) => {
  if (typeof auth !== 'function' || typeof validatedAgent !== 'function') {
    throw new Error('analysis-requests routes exigem auth e requireValidatedAgent');
  }
  const router = express.Router();
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Demanda não encontrada' })));
  router.param('requestId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Solicitação não encontrada' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, store.mapAnalysisError(err) ?? processStore.mapProcessSpecific(err) ?? err);
    }
  };
  const requireAgent = requireDemandAuthorRole(institutionStatus);

  /** Quem pede: a conta do Parceiro ou o órgão do Poder Público validado (próprio ou por vínculo). */
  async function requesterOf(req) {
    const organizationId = await processStore.governmentOrganizationOf(req, institutionStatus);
    const role = normalizeRole(req.user?.role, req.user?.profileType);
    const person = { userId: req.user.userId, name: req.user.name || null, profileType: req.user.profileType || null };
    if (organizationId) return { ...person, category: 'poder_publico', organizationId };
    if (role === 'government') {
      throw new HttpError(403, {
        error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
        code: 'institution_not_validated',
      });
    }
    if (role === 'partner') return { ...person, category: 'parceiro', organizationId: null };
    throw new HttpError(403, {
      error: 'Solicitar análise ou recusar a demanda é uma ação de Parceiros e do Poder Público',
      code: 'analysis_request_forbidden',
    });
  }

  // ── Parceiro e Poder Público ──────────────────────────────────────────────
  router.post('/:id/analysis-requests', auth, handle(async (req, res) => {
    const { value, errors } = validateRequest(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const requester = await requesterOf(req);
    const created = await withTransaction(pool, async (client) => {
      const { rows } = await client.query(
        `SELECT id, author_id, title, status::text AS status FROM demands
          WHERE id = $1 AND status = ANY($2::demand_status[]) FOR SHARE`,
        [req.params.id, PUBLIC_STATUSES],
      );
      const demand = rows[0];
      if (!demand) throw new HttpError(404, { error: 'Demanda não encontrada' });
      if (demand.author_id === req.user.userId) {
        throw new HttpError(403, { error: 'O autor não solicita análise da própria demanda', code: 'own_demand' });
      }
      if (!INTEREST_OPEN_STATUSES.includes(demand.status)) {
        throw new HttpError(409, { error: 'A demanda não recebe solicitações neste estado', code: 'demand_not_open' });
      }
      if (requester.organizationId) {
        const { rows: track } = await client.query(
          'SELECT organization_name FROM demand_institutional_tracks WHERE demand_id = $1 AND organization_id = $2',
          [demand.id, requester.organizationId],
        );
        requester.organizationName = track[0]?.organization_name ?? null;
      }
      const process = await store.openProcessFor(client, demand.id, requester);
      const id = await store.insertRequest(client, { demandId: demand.id, processId: process?.id, requester, value });
      // Recusa com processo aberto: o processo vai a Não aprovada (§16), quando a transição cabe.
      if (value.kind === 'recusa' && process) {
        const check = checkProcessTransition(
          { status: process.status, previousStatus: process.previous_status, partyKind: process.party_kind },
          'nao_aprovada', value.body, 'parte',
        );
        if (check.ok) {
          await client.query("SELECT set_config('dm.process_actor_kind', 'parte', true)");
          await client.query(
            `UPDATE connection_processes
                SET status = 'nao_aprovada', status_note = $2, status_changed_by = $3, status_changed_by_kind = 'parte'
              WHERE id = $1`,
            [process.id, value.body.slice(0, 2000), req.user.userId],
          );
        }
      }
      await store.notifyAuthor(client, { demand, kind: value.kind, requesterCategory: requester.category, processId: process?.id });
      const list = await store.listRequests(client, 'r.id = $1', [id], 'requester');
      return list[0];
    });
    res.status(201).json({ request: created });
  }));

  router.get('/:id/analysis-requests/mine', auth, handle(async (req, res) => {
    const { rows } = await pool.query('SELECT 1 FROM demands WHERE id = $1 AND status = ANY($2::demand_status[])',
      [req.params.id, PUBLIC_STATUSES]);
    if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    const organizationId = await processStore.governmentOrganizationOf(req, institutionStatus);
    const requests = organizationId
      ? await store.listRequests(pool, 'r.demand_id = $1 AND r.requester_organization_id = $2', [req.params.id, organizationId], 'requester')
      : await store.listRequests(pool, 'r.demand_id = $1 AND r.requester_user_id = $2 AND r.requester_organization_id IS NULL',
        [req.params.id, req.user.userId], 'requester');
    res.json({ requests });
  }));

  // ── Agente autor ──────────────────────────────────────────────────────────
  router.get('/mine/:id/analysis-requests', auth, requireAgent, handle(async (req, res) => {
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const requests = await store.listRequests(pool, 'r.demand_id = $1', [req.params.id], 'agent');
    res.json({ requests, open: requests.filter((r) => r.status === 'aberta').length });
  }));

  router.post('/mine/:id/analysis-requests/:requestId/answer', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, errors } = validateAnswer(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const answered = await withTransaction(pool, async (client) => {
      const demand = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      const row = await store.answerRequest(client, {
        demandId: demand.id, requestId: req.params.requestId, userId: req.user.userId, value,
      });
      await store.notifyRequester(client, row, demand);
      const list = await store.listRequests(client, 'r.id = $1', [row.id], 'agent');
      return list[0];
    });
    res.json({ request: answered });
  }));

  return router;
};
