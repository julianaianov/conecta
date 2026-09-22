// Registro de apoio realizado, dupla confirmação e histórico público de apoio
// (T16). Montada em `/demands` no post-service ANTES das rotas da demanda (o
// `/:id` de lá só aceita UUID); público em `/api/posts/demands`.
//
// Fonte: Apresentação, slide 20 (as 6 modalidades do sistema de apoio), slide
// 21 (transparência: histórico de apoio) e slides 10–11 ("apoiar projetos",
// "registrar apoio realizado", "acompanhar resultados"; o Poder Público apoia
// sem ranking competitivo). Decisão 5: a plataforma não processa pagamento —
// o apoio financeiro é valor declarado.
//
// Público:
//   GET  /:id/supports                      histórico de apoio e totais
// Parceiro e Poder Público validado:
//   GET  /supports/mine                     "Meus apoios", com o andamento das
//                                           demandas apoiadas
//   GET  /:id/supports/mine                 meus apoios nesta demanda e as
//                                           modalidades permitidas
//   POST /:id/supports                      registra o apoio realizado
//   PUT  /:id/supports/:sid/consent         consentimento de exibição e valor
//                                           público (revogável, LGPD)
//   POST /:id/supports/:sid/cancel          cancela o apoio ainda não confirmado
// Agente autor (dupla confirmação):
//   GET  /mine/:id/supports                 apoios declarados na demanda
//   POST /mine/:id/supports/:sid/confirm    confirma o recebimento, com
//                                           evidência opcional (uploads da T08)
//   POST /mine/:id/supports/:sid/contest    contesta, com justificativa
//
// O apoio continua em `supports`: `status` é a coluna que o dm-gestao confirma
// ou rejeita (SupportController), e `post_id` aponta para o post-vitrine, para
// a gestão seguir enxergando o apoio pelo feed.

const express = require('express');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const { PUBLIC_STATUSES } = require('../demand/constants');
const demandStore = require('../demand/store');
const { findUsableUpload, parseUploadRef, formatUploadRef } = require('../uploads');
const {
  SUPPORT_MODALITIES, DEMAND_SUPPORT_TYPES, SUPPORT_ROLES, SUPPORT_ROLE_CATEGORY,
  SUPPORT_OPEN_STATUSES, EVIDENCE_PURPOSES, RECEIPT_TRANSITIONS,
} = require('../support/constants');
const { validateSupport, validateConsent, validateReceipt } = require('../support/validation');
const store = require('../support/store');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction, sendError } = demandStore;
const { validationError } = listHelpers;

const MY_SUPPORTS_LIMIT = 200;
const HISTORY_LIMIT = 100;

const roleOf = (req) => normalizeRole(req.user?.role, req.user?.profileType);

/** Erros dos triggers da migração 013 → HTTP. */
function mapSupportDbError(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514' && /o apoio é registrado com a demanda publicada|não é cancelado|é final|não muda|transição de recebimento/.test(message)) {
    return new HttpError(409, { error: message, code: 'invalid_state' });
  }
  if (err?.code === '23514' && /autor não registra apoio/.test(message)) {
    return new HttpError(403, { error: 'O autor não registra apoio à própria demanda', code: 'own_demand' });
  }
  if (err?.code === '23514' && /não processa pagamento/.test(message)) {
    return new HttpError(422, { error: message, code: 'payment_not_supported' });
  }
  return err;
}

module.exports = ({ pool, auth, governmentGate, institutionStatus }) => {
  if (typeof auth !== 'function' || typeof governmentGate !== 'function') {
    throw new Error('supports routes exigem auth e o gate do Poder Público');
  }
  const router = express.Router();
  const notFound = (res) => res.status(404).json({ error: 'Demanda não encontrada' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));
  router.param('supportId', (req, res, next, id) => (
    isUuid(id) ? next() : res.status(404).json({ error: 'Apoio não encontrado' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, mapSupportDbError(err));
    }
  };

  function requireSupporterRole(req, res, next) {
    if (!SUPPORT_ROLES.includes(roleOf(req))) {
      return res.status(403).json({
        error: 'Registrar apoio realizado é uma ação de Parceiros e do Poder Público',
        code: 'support_not_allowed',
      });
    }
    return next();
  }

  function requireAgent(req, res, next) {
    if (roleOf(req) !== 'agent') {
      return res.status(403).json({ error: 'Só Agentes de Transformação publicam demandas', code: 'demand_author_not_agent' });
    }
    return next();
  }

  /** Demanda pública (publicada em diante, fora arquivada) com o post-vitrine. */
  async function loadPublicDemand(db, demandId) {
    const { rows } = await db.query(
      `SELECT d.id, d.author_id, d.title, d.status::text AS status,
              (SELECT p.id FROM posts p WHERE p.demand_id = d.id ORDER BY p.created_at LIMIT 1) AS post_id
         FROM demands d WHERE d.id = $1 AND d.status = ANY($2::demand_status[])`,
      [demandId, PUBLIC_STATUSES],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    return rows[0];
  }

  function assertOpen(demand) {
    if (!SUPPORT_OPEN_STATUSES.includes(demand.status)) {
      throw new HttpError(409, {
        error: 'A demanda não recebe registro de apoio neste estado',
        code: 'demand_not_open',
        status: demand.status,
      });
    }
  }

  /** Evidência: uploads confirmados do Agente, desta demanda, de finalidade de evidência. */
  async function checkEvidence(db, refs, ownerId, demandId) {
    const out = [];
    for (const ref of refs) {
      const id = parseUploadRef(ref);
      let row = null;
      for (const purpose of EVIDENCE_PURPOSES) {
        if (id) row = row ?? await findUsableUpload(db, { id, ownerId, purpose, targetColumn: 'demand_id', targetId: demandId });
      }
      if (!row) {
        throw validationError({ evidence: 'Envie e confirme o arquivo de evidência nesta demanda' });
      }
      out.push(formatUploadRef(row.id));
    }
    return out;
  }

  // ── Histórico público de apoio (slide 21) ────────────────────────────────
  router.get('/:id/supports', handle(async (req, res) => {
    await loadPublicDemand(pool, req.params.id);
    const [supports, totals] = await Promise.all([
      store.publicHistory(pool, req.params.id, { limit: HISTORY_LIMIT }),
      store.supportTotals(pool, req.params.id),
    ]);
    res.json({ supports, totals });
  }));

  // ── "Meus apoios": acompanhar resultados (slide 10) ──────────────────────
  router.get('/supports/mine', auth, handle(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${store.SUPPORT_SQL}, d.title AS demand_title, d.status::text AS demand_status,
              d.category::text AS demand_category, d.municipality, d.uf, d.territory
         FROM supports s JOIN demands d ON d.id = s.demand_id
        WHERE s.user_id = $1
        ORDER BY s.created_at DESC, s.id DESC LIMIT $2`,
      [req.user.userId, MY_SUPPORTS_LIMIT],
    );
    res.json({
      supports: rows.map((row) => ({
        ...store.serializeOwnSupport(row),
        demand: {
          id: row.demand_id,
          title: row.demand_title,
          status: row.demand_status,
          category: row.demand_category,
          municipality: row.municipality ?? null,
          uf: row.uf ?? null,
          territory: row.territory ?? null,
        },
      })),
    });
  }));

  router.get('/:id/supports/mine', auth, handle(async (req, res) => {
    const demand = await loadPublicDemand(pool, req.params.id);
    const { rows } = await pool.query(
      `SELECT ${store.SUPPORT_SQL} FROM supports s
        WHERE s.demand_id = $1 AND s.user_id = $2 ORDER BY s.created_at DESC, s.id DESC`,
      [req.params.id, req.user.userId],
    );
    const isAuthor = demand.author_id === req.user.userId;
    const allowed = SUPPORT_ROLES.includes(roleOf(req)) && !isAuthor;
    res.json({
      supports: rows.map(store.serializeOwnSupport),
      allowedModalities: allowed ? SUPPORT_MODALITIES : [],
      allowedSupportTypes: allowed ? DEMAND_SUPPORT_TYPES : [],
      isAuthor,
      open: SUPPORT_OPEN_STATUSES.includes(demand.status),
    });
  }));

  router.post('/:id/supports', auth, requireSupporterRole, governmentGate, handle(async (req, res) => {
    const { value, errors } = validateSupport(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const demand = await loadPublicDemand(pool, req.params.id);
    if (demand.author_id === req.user.userId) {
      throw new HttpError(403, { error: 'O autor não registra apoio à própria demanda', code: 'own_demand' });
    }
    assertOpen(demand);
    const role = roleOf(req);
    let organizationId = null;
    if (role === 'government' && institutionStatus) {
      organizationId = (await institutionStatus(req)).organizationId ?? null;
    }
    const { rows } = await pool.query(
      `INSERT INTO supports
         (post_id, demand_id, user_id, user_name, supporter_category, profile_type, organization_id,
          type, modality, description, amount, occurred_on, message, display_consent, public_name,
          amount_public, receipt_status, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::support_type, $9::support_modality, $10, $11, $12, $13,
               $14, $15, $16, 'declarado', 'pending')
       RETURNING id`,
      [
        demand.post_id ?? null, demand.id, req.user.userId, req.user.name || req.user.email || null,
        SUPPORT_ROLE_CATEGORY[role], req.user.profileType || null, organizationId,
        value.supportType, value.modality, value.description, store.centsToAmount(value.amountCents),
        value.occurredOn, value.message, value.displayConsent, value.publicName, value.amountPublic,
      ],
    );
    const support = await store.loadOwnSupport(pool, demand.id, rows[0].id, req.user.userId);
    res.status(201).json({ support: store.serializeOwnSupport(support) });
  }));

  // Consentimento de exibição: o apoiador decide aparecer — e pode voltar atrás.
  router.put('/:id/supports/:supportId/consent', auth, handle(async (req, res) => {
    const { value, errors } = validateConsent(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const support = await store.loadOwnSupport(pool, req.params.id, req.params.supportId, req.user.userId);
    if (support.canceled_at) throw new HttpError(409, { error: 'Este apoio foi cancelado', code: 'support_canceled' });
    if (value.amountPublic && store.amountToCents(support.amount) === null) {
      throw validationError({ amountPublic: 'Este apoio não tem valor declarado' });
    }
    await pool.query(
      'UPDATE supports SET display_consent = $2, public_name = $3, amount_public = $4 WHERE id = $1',
      [support.id, value.displayConsent, value.publicName, value.amountPublic],
    );
    const updated = await store.loadOwnSupport(pool, req.params.id, support.id, req.user.userId);
    res.json({ support: store.serializeOwnSupport(updated) });
  }));

  router.post('/:id/supports/:supportId/cancel', auth, handle(async (req, res) => {
    const support = await store.loadOwnSupport(pool, req.params.id, req.params.supportId, req.user.userId);
    if (support.canceled_at) return res.json({ support: store.serializeOwnSupport(support) });
    if (support.receipt_status === 'confirmado') {
      throw new HttpError(409, {
        error: 'Apoio confirmado pelo Agente não é cancelado', code: 'support_confirmed',
      });
    }
    await pool.query('UPDATE supports SET canceled_at = NOW() WHERE id = $1 AND canceled_at IS NULL', [support.id]);
    const updated = await store.loadOwnSupport(pool, req.params.id, support.id, req.user.userId);
    return res.json({ support: store.serializeOwnSupport(updated) });
  }));

  // ── Agente autor: confirmação do recebimento ─────────────────────────────
  router.get('/mine/:id/supports', auth, requireAgent, handle(async (req, res) => {
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const { rows } = await pool.query(
      `SELECT ${store.SUPPORT_SQL} FROM supports s
        WHERE s.demand_id = $1 ORDER BY s.created_at DESC, s.id DESC`,
      [req.params.id],
    );
    res.json({
      supports: rows.map(store.serializeAgentSupport),
      totals: await store.supportTotals(pool, req.params.id),
    });
  }));

  /** Confirma (`confirmado`) ou contesta (`contestado`) o apoio declarado. */
  const answer = (receiptStatus) => handle(async (req, res) => {
    const { value, errors } = validateReceipt(req.body ?? {}, { requireNote: receiptStatus === 'contestado' });
    if (Object.keys(errors).length) throw validationError(errors);
    if (receiptStatus === 'contestado' && value.evidence.length) {
      throw validationError({ evidence: 'A contestação não recebe evidência de recebimento' });
    }
    const support = await withTransaction(pool, async (client) => {
      await demandStore.loadOwnDemand(client, req.params.id, req.user.userId);
      const row = await store.loadDemandSupport(client, req.params.id, req.params.supportId, { forUpdate: true });
      if (row.canceled_at) throw new HttpError(409, { error: 'Este apoio foi cancelado pelo apoiador', code: 'support_canceled' });
      if (!RECEIPT_TRANSITIONS[row.receipt_status]?.includes(receiptStatus)) {
        throw new HttpError(409, {
          error: `Transição de recebimento não permitida (${row.receipt_status} → ${receiptStatus})`,
          code: 'invalid_transition',
          receiptStatus: row.receipt_status,
        });
      }
      const evidence = value.evidence.length
        ? await checkEvidence(client, value.evidence, req.user.userId, req.params.id)
        : [];
      await client.query(
        `UPDATE supports
            SET receipt_status = $2::support_receipt_status, receipt_note = $3,
                receipt_evidence = CASE WHEN cardinality($4::text[]) > 0 THEN $4::text[] ELSE receipt_evidence END
          WHERE id = $1`,
        [row.id, receiptStatus, value.note, evidence],
      );
      return store.loadDemandSupport(client, req.params.id, row.id);
    });
    res.json({ support: store.serializeAgentSupport(support) });
  });

  router.post('/mine/:id/supports/:supportId/confirm', auth, requireAgent, answer('confirmado'));
  router.post('/mine/:id/supports/:supportId/contest', auth, requireAgent, answer('contestado'));

  return router;
};
