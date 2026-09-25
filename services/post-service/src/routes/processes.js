// Processo de Conexão (T-05-01). Montada na raiz do post-service, antes das
// rotas da demanda; público em /api/posts/... (o Caddy tira /api/posts).
// Fonte: Modelo de Conexão §11 (protocolo DM-AAAA-NNNNNN), §14 (responsável
// atual), §16 (status), §28 (vários processos por demanda), §35 (linha do
// tempo por conexão); decisões 13 e 16.
//
// Quem vê e age num processo: o Agente autor da demanda (`agente`) e a parte
// conectada (`parte`) — a conta do Parceiro ou o órgão do Poder Público
// (cadastro próprio validado ou vínculo T29). Para os demais, 404.
//
// Agente autor ou parte (token; `:ref` = id ou protocolo):
//   GET  /processes/mine                    processos em que a conta é autora ou parte
//   GET  /processes/by-connection/:cid      processo nascido desta conexão (ou null)
//   GET  /processes/:ref                    processo, ações possíveis e linha do tempo completa
//   POST /processes/:ref/status             { status, note } (Agente: execução, conclusão,
//                                           prestação de contas, pausas e cancelamento;
//                                           parte: análise, recusa, pausas e cancelamento)
//   PUT  /processes/:ref/responsible        responsável atual (§14)
//   PUT  /processes/:ref/contribution       { contributionKinds, contributionDescription,
//                                           contributionAmountCents }
//   GET  /processes/:ref/deadlines          prazos por etapa (§15, T-05-03; vigentes e histórico)
//   POST /processes/:ref/deadlines          { stage, stageLabel?, dueDays? | dueOn?, responsibleSide?, note? }
//                                           (sem prazo: a sugestão da fonte; só o lado responsável
//                                           pela etapa define; redefinir guarda o anterior)
//   POST /processes/:ref/deadlines/:did/fulfill  { note? } prazo cumprido (as duas partes)
//   GET  /processes/pending                 pendências de prazo de quem pede (processos, e para o
//                                           órgão, encaminhamentos e acompanhamentos com data limite)
// Agente autor:
//   GET  /demands/mine/:id/processes        processos da demanda
//   POST /demands/mine/:id/processes        formaliza a partir do interesse de apoio com a
//                                           conexão aceita ({ interestId }) ou da oferta do
//                                           órgão ({ offerId })
// Público (demanda publicada em diante, fora `arquivada`):
//   GET  /demands/:id/processes             protocolo, tipo de parte, contribuição e status
//   GET  /processes/:ref/timeline           o processo (visão pública) e os eventos públicos
//
// A formalização automática acontece no aceite da conexão
// (routes/interests.js) e na formalização pelo órgão (routes/institutional.js,
// POST /institutional/demands/:id/formalize). A demanda fica `conectada` no
// primeiro processo.

const express = require('express');
const { isUuid } = require('../security');
const { PUBLIC_STATUSES } = require('../demand/constants');
const demandStore = require('../demand/store');
const { requireDemandAuthorRole, evaluateDemandAuthor } = require('../demand/gate');
const {
  checkTransition, validateStatusChange, validateResponsible, validateContribution, validateFormalize,
  validateDeadline, validateFulfill, RESPONSIBLE_FIELDS, DEADLINE_STAGE_LABELS,
} = require('../process');
const store = require('../process/store');
const deadlines = require('../process/deadlines');
const { notify } = require('../notifications');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction } = demandStore;
const { validationError } = listHelpers;

module.exports = ({ pool, auth, validatedAgent, institutionStatus }) => {
  if (typeof auth !== 'function' || typeof validatedAgent !== 'function') {
    throw new Error('process routes exigem auth e requireValidatedAgent');
  }
  const router = express.Router();
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Demanda não encontrada' })));
  router.param('ref', (req, res, next, ref) => (store.isProcessRef(ref) ? next() : res.status(404).json({ error: 'Processo não encontrado' })));
  router.param('connectionId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Conexão não encontrada' })));
  router.param('deadlineId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Prazo não encontrado' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = store.mapProcessError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  const requireAgent = requireDemandAuthorRole(institutionStatus);

  /** O Agente escreve no processo com a instituição validada (como nas demais ações da demanda). */
  async function assertAgentCanWrite(req) {
    let access;
    try {
      access = await institutionStatus(req);
    } catch (err) {
      console.error(`[processes] ${err.message}`);
      throw new HttpError(503, { error: 'Não foi possível confirmar a validação institucional' });
    }
    const result = evaluateDemandAuthor(req.user, access);
    if (!result.allowed) throw new HttpError(result.httpStatus, { error: result.error, code: result.code });
  }

  async function detail(db, req, ref) {
    const { row, role } = await store.loadVisibleProcess(db, req, ref, institutionStatus);
    return {
      process: store.serializeProcess(row, { viewerRole: role }),
      deadlines: await deadlines.listDeadlines(db, row.id),
      timeline: await store.processTimeline(db, row.id, { full: true }),
    };
  }

  /** Aviso ao outro lado do processo (Agente autor ↔ parte), na transação da ação. */
  async function notifyOtherSide(client, row, actor, message) {
    const base = { demandId: row.demand_id, processId: row.id, href: `/processos/${row.protocol}`, ...message };
    if (actor === 'parte') return notify(client, { ...base, userId: row.demand_author_id });
    if (row.party_kind === 'poder_publico') return notify(client, { ...base, organizationId: row.party_organization_id });
    return row.party_user_id ? notify(client, { ...base, userId: row.party_user_id }) : null;
  }

  /** Escrita no processo: transação com o processo travado e o papel de quem escreve. */
  async function writeProcess(req, callback) {
    return withTransaction(pool, async (client) => {
      const { row, role } = await store.loadVisibleProcess(client, req, req.params.ref, institutionStatus, { forUpdate: true });
      if (role === 'agente') await assertAgentCanWrite(req);
      if (row.closed_at) throw new HttpError(409, { error: 'O processo foi encerrado', code: 'process_closed' });
      await client.query("SELECT set_config('dm.process_actor_kind', $1, true)", [role]);
      await callback(client, row, role);
      return detail(client, req, row.id);
    });
  }

  // ── Agente autor ou parte ─────────────────────────────────────────────────
  router.get('/processes/mine', auth, handle(async (req, res) => {
    const organizationId = await store.governmentOrganizationOf(req, institutionStatus);
    const { rows } = await pool.query(
      `SELECT ${store.PROCESS_SQL} FROM ${store.PROCESS_FROM}
        WHERE d.status = ANY($3::demand_status[])
          AND (d.author_id = $1
               OR (p.party_kind <> 'poder_publico' AND p.party_user_id = $1)
               OR ($2::uuid IS NOT NULL AND p.party_organization_id = $2::uuid))
        ORDER BY p.status_changed_at DESC, p.id DESC
        LIMIT 200`,
      [req.user.userId, organizationId, PUBLIC_STATUSES],
    );
    res.json({
      processes: rows.map((row) => ({
        ...store.serializeSummary(row),
        viewerRole: row.demand_author_id === req.user.userId ? 'agente' : 'parte',
      })),
    });
  }));

  // Pendências (§15): prazos em aberto e vencidos de quem pede, antes de `/processes/:ref`.
  router.get('/processes/pending', auth, handle(async (req, res) => {
    const organizationId = await store.governmentOrganizationOf(req, institutionStatus);
    const today = deadlines.saoPauloDay();
    res.json({ today, pending: await deadlines.pendingFor(pool, { userId: req.user.userId, organizationId, today }) });
  }));

  router.get('/processes/by-connection/:connectionId', auth, handle(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${store.PROCESS_SQL} FROM ${store.PROCESS_FROM}
        WHERE p.origin_connection_id = $1 ORDER BY p.formalized_at DESC LIMIT 5`,
      [req.params.connectionId],
    );
    for (const row of rows) {
      if (await store.viewerRoleFor(req, row, institutionStatus)) {
        return res.json({ process: store.serializeSummary(row) });
      }
    }
    return res.json({ process: null });
  }));

  router.get('/processes/:ref/timeline', handle(async (req, res) => {
    const row = await store.findProcess(pool, req.params.ref);
    if (!row || !PUBLIC_STATUSES.includes(row.demand_status)) throw new HttpError(404, { error: 'Processo não encontrado' });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ process: store.serializePublicProcess(row), events: await store.processTimeline(pool, row.id) });
  }));

  router.get('/processes/:ref', auth, handle(async (req, res) => {
    res.json(await detail(pool, req, req.params.ref));
  }));

  router.post('/processes/:ref/status', auth, handle(async (req, res) => {
    const { value, errors } = validateStatusChange(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const view = await writeProcess(req, async (client, row, role) => {
      const check = checkTransition(
        { status: row.status, previousStatus: row.previous_status, partyKind: row.party_kind }, value.status, value.note, role,
      );
      if (!check.ok) {
        const status = check.code === 'invalid_transition' ? 409 : check.code === 'forbidden_status' ? 403 : 422;
        throw new HttpError(status, {
          error: check.error,
          code: check.code === 'invalid_status' || check.code === 'note_required' ? 'validation_failed' : check.code,
          ...(status === 422 ? { fields: { [check.code === 'note_required' ? 'note' : 'status']: check.error } } : {}),
        });
      }
      await client.query(
        `UPDATE connection_processes
            SET status = $2, status_note = $3, status_changed_by = $4, status_changed_by_kind = $5
          WHERE id = $1`,
        [row.id, value.status, value.note, req.user.userId, role],
      );
    });
    res.json(view);
  }));

  router.put('/processes/:ref/responsible', auth, handle(async (req, res) => {
    const { value, errors } = validateResponsible(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const view = await writeProcess(req, async (client, row) => {
      const sets = ['responsible_updated_by = $2'];
      const params = [row.id, req.user.userId];
      for (const [key, column] of Object.entries(RESPONSIBLE_FIELDS)) {
        if (key in value) {
          params.push(value[key]);
          sets.push(`${column} = $${params.length}`);
        }
      }
      if ('dueOn' in value) {
        params.push(value.dueOn);
        sets.push(`responsible_due_on = $${params.length}::date`);
      }
      await client.query(`UPDATE connection_processes SET ${sets.join(', ')} WHERE id = $1`, params);
    });
    res.json(view);
  }));

  // ── Prazos por etapa (§15, T-05-03) ─────────────────────────────────────────
  router.get('/processes/:ref/deadlines', auth, handle(async (req, res) => {
    const { row } = await store.loadVisibleProcess(pool, req, req.params.ref, institutionStatus);
    res.json({ deadlines: await deadlines.listDeadlines(pool, row.id) });
  }));

  router.post('/processes/:ref/deadlines', auth, handle(async (req, res) => {
    const view = await writeProcess(req, async (client, row, role) => {
      const { value, errors, forbidden } = validateDeadline(req.body, role);
      if (value.dueOn && value.dueOn < deadlines.saoPauloDay()) errors.dueOn = 'A data limite não pode ser antes de hoje';
      if (Object.keys(errors).length) throw validationError(errors);
      if (forbidden) {
        throw new HttpError(403, {
          error: value.responsibleSide === 'agente'
            ? 'O prazo desta etapa é definido pelo Agente de Transformação'
            : 'O prazo desta etapa é definido pela parte conectada',
          code: 'deadline_forbidden',
        });
      }
      await deadlines.setDeadline(client, { processId: row.id, value, userId: req.user.userId, actor: role });
      await notifyOtherSide(client, row, role, {
        kind: 'atualizacao_de_processo',
        title: 'Prazo definido no processo',
        body: `${row.protocol} · ${value.stage === 'outra' ? value.stageLabel : DEADLINE_STAGE_LABELS[value.stage]}`,
      });
    });
    res.status(201).json(view);
  }));

  router.post('/processes/:ref/deadlines/:deadlineId/fulfill', auth, handle(async (req, res) => {
    const { value, errors } = validateFulfill(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const view = await writeProcess(req, async (client, row, role) => {
      const done = await deadlines.fulfillDeadline(client, {
        processId: row.id, deadlineId: req.params.deadlineId, userId: req.user.userId, actor: role, note: value.note,
      });
      if (!done) throw new HttpError(409, { error: 'Este prazo não está em aberto', code: 'deadline_closed' });
    });
    res.json(view);
  }));

  router.put('/processes/:ref/contribution', auth, handle(async (req, res) => {
    const { value, errors } = validateContribution(req.body, { partial: true });
    if (Object.keys(errors).length) throw validationError(errors);
    if (!Object.keys(value).length) throw validationError({ contributionKinds: 'Informe a contribuição' });
    const view = await writeProcess(req, async (client, row) => {
      const kinds = value.contributionKinds ?? row.contribution_kinds ?? [];
      const amountCents = 'contributionAmountCents' in value ? value.contributionAmountCents
        : row.contribution_amount_cents === null ? null : Number(row.contribution_amount_cents);
      if (amountCents !== null && !kinds.some((k) => k === 'apoio_financeiro' || k === 'patrocinio')) {
        throw validationError({ contributionAmountCents: 'Valor só em apoio financeiro ou patrocínio' });
      }
      await client.query(
        `UPDATE connection_processes
            SET contribution_kinds = $2::connection_contribution_kind[],
                contribution_description = $3, contribution_amount_cents = $4
          WHERE id = $1`,
        [
          row.id, kinds,
          'contributionDescription' in value ? value.contributionDescription : row.contribution_description ?? null,
          amountCents,
        ],
      );
    });
    res.json(view);
  }));

  // ── Agente autor ──────────────────────────────────────────────────────────
  router.get('/demands/mine/:id/processes', auth, requireAgent, handle(async (req, res) => {
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const { rows } = await pool.query(
      `SELECT ${store.PROCESS_SQL} FROM ${store.PROCESS_FROM}
        WHERE p.demand_id = $1 ORDER BY p.sequence_in_demand`,
      [req.params.id],
    );
    res.json({ processes: rows.map((row) => store.serializeProcess(row, { viewerRole: 'agente' })) });
  }));

  router.post('/demands/mine/:id/processes', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const { value, errors } = validateFormalize(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const result = await withTransaction(pool, async (client) => {
      await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      let source = null;
      if (value.interestId) {
        const { rows } = await client.query(
          `SELECT id, user_id, user_name, user_category, profile_type, organization_id, kind::text AS kind,
                  offer_types::text[] AS offer_types, message, connection_status::text AS connection_status, withdrawn_at
             FROM demand_interests WHERE id = $1 AND demand_id = $2`,
          [value.interestId, req.params.id],
        );
        const interest = rows[0];
        if (!interest) throw new HttpError(404, { error: 'Manifestação não encontrada' });
        if (interest.kind !== 'apoio' || interest.connection_status !== 'aceita' || interest.withdrawn_at) {
          throw new HttpError(409, {
            error: 'O processo nasce de um interesse de apoio com a conexão aceita',
            code: 'connection_not_accepted',
          });
        }
        source = store.fromInterest(interest);
        if (!source) {
          throw new HttpError(409, { error: 'O órgão desta manifestação não foi identificado', code: 'process_party_unknown' });
        }
      } else {
        const { rows } = await client.query(
          `SELECT o.id, o.author_id, o.description, o.support_types::text[] AS support_types,
                  t.id AS track_id, t.organization_id, t.organization_name, t.status::text AS track_status
             FROM demand_institutional_offers o JOIN demand_institutional_tracks t ON t.id = o.track_id
            WHERE o.id = $1 AND o.demand_id = $2`,
          [value.offerId, req.params.id],
        );
        const o = rows[0];
        if (!o) throw new HttpError(404, { error: 'Oferta não encontrada' });
        if (store.TRACK_CLOSED.includes(o.track_status)) {
          throw new HttpError(409, { error: 'O acompanhamento deste órgão foi encerrado', code: 'track_closed' });
        }
        source = store.fromTrack(
          { id: o.track_id, organization_id: o.organization_id, organization_name: o.organization_name, status: o.track_status },
          o,
        );
      }
      return store.formalize(client, {
        demandId: req.params.id, source, contribution: value.contribution, formalizedBy: req.user.userId,
        formalizedByKind: 'agente',
      });
    });
    res.status(result.created ? 201 : 200).json({
      process: store.serializeProcess(result.row, { viewerRole: 'agente' }),
      created: result.created,
    });
  }));

  // ── Público ───────────────────────────────────────────────────────────────
  router.get('/demands/:id/processes', handle(async (req, res) => {
    const { rows: found } = await pool.query(
      'SELECT 1 FROM demands WHERE id = $1 AND status = ANY($2::demand_status[])',
      [req.params.id, PUBLIC_STATUSES],
    );
    if (!found.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    const { rows } = await pool.query(
      `SELECT ${store.PROCESS_SQL} FROM ${store.PROCESS_FROM}
        WHERE p.demand_id = $1 ORDER BY p.sequence_in_demand`,
      [req.params.id],
    );
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ processes: rows.map(store.serializePublicProcess) });
  }));

  return router;
};
