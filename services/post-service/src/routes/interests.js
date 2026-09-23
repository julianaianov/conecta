// Interesse, participação, conexão e oportunidades de apoio (T15). Montada em
// `/demands` no post-service ANTES das rotas da demanda (o `/:id` de lá só
// aceita UUID); público em `/api/posts/demands`.
//
// Fonte: Apresentação, slides 9–11 (permissões) e 15 (fluxo principal:
// Demanda → Conexão → Apoio); Fluxo 2, slide 22 (demanda publicada →
// interesse → conexão com o Agente → apoio).
//
// Parceiro e Poder Público ("filtrar oportunidades de apoio", "demonstrar
// interesse", "solicitar conexão"; o Poder Público só com cadastro validado):
//   GET  /opportunities                 demandas abertas com filtros (categoria,
//                                       prioridade, território, município, UF,
//                                       recurso necessário, faixa de valor) e
//                                       compatibilidade com o perfil de apoio
// Parceiro, Poder Público e Membro da Comunidade:
//   GET  /interests/mine                as próprias manifestações
//   GET  /:id/interests/mine            manifestações nesta demanda, tipos
//                                       permitidos e compatibilidade
//   POST /:id/interests                 { kind, offerTypes[], message?, eventId? }
//                                       (`eventId`: evento publicado desta
//                                       demanda ao qual o voluntariado ou a
//                                       participação se liga, T25)
//   POST /:id/interests/:iid/connection { type?, message } → conexão com o
//                                       Agente no user-service, vinculada à demanda
//   POST /:id/interests/:iid/withdraw   retira (e cancela o pedido pendente)
// Público:
//   GET  /:id/interests/summary         contagens (sem nome nem id)
// Agente autor:
//   GET  /mine/:id/interests            quem se interessou, oferta e conexão
//   POST /mine/:id/connections/:cid/accept   aceita no user-service; a demanda
//                                            vai para `conectada` como `sistema`
//   POST /mine/:id/connections/:cid/decline  recusa no user-service
//
// A conexão continua sendo a do user-service (routes/connections.js), com
// `demandId`: o post-service a cria e a responde com o token de quem pede, e
// confere de novo (destinatário = autor, demanda = esta) antes de mover a
// demanda. Aceitar pela tela de Conexões usa a mesma rota de aceite.

const express = require('express');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const { CATEGORIES, PRIORITIES, NEEDED_RESOURCE_TYPES, PUBLIC_STATUSES } = require('../demand/constants');
const demandStore = require('../demand/store');
const {
  ROLE_CATEGORY, KINDS_BY_ROLE, OPPORTUNITY_ROLES, INTEREST_OPEN_STATUSES,
  OPPORTUNITY_DEFAULT_STATUSES, CONNECTABLE_STATUSES,
} = require('../interest/constants');
const { validateInterest, validateConnectionRequest, connectionTypeFor } = require('../interest/validation');
const { computeCompatibility, profileHasCriteria } = require('../interest/compatibility');
const store = require('../interest/store');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction, sendError } = demandStore;
const { parseList, likePattern, validationError } = listHelpers;

const OPPORTUNITY_PAGE_DEFAULT = 20;
const OPPORTUNITY_PAGE_MAX = 50;
// Candidatas ordenadas pela compatibilidade: as mais recentes até este limite.
const OPPORTUNITY_CANDIDATES = 500;
const MAX_OFFSET = OPPORTUNITY_CANDIDATES;

const roleOf = (req) => normalizeRole(req.user?.role, req.user?.profileType);

/** Erros dos triggers da migração 012 → HTTP. */
function mapInterestDbError(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23505') {
    return new HttpError(409, { error: 'Você já registrou este interesse nesta demanda', code: 'interest_exists' });
  }
  if (err?.code === '23514' && /interesse e conexão só|conexão não permitido|resposta de conexão|retirado não muda/.test(message)) {
    return new HttpError(409, { error: message, code: 'invalid_state' });
  }
  if (err?.code === '23514' && /evento publicado desta demanda|se vinculam a um evento|evento da manifestação/.test(message)) {
    return new HttpError(422, { error: message, code: 'validation_failed', fields: { eventId: message } });
  }
  if (err?.code === '23514' && /autor não manifesta/.test(message)) {
    return new HttpError(403, { error: 'O autor não manifesta interesse na própria demanda', code: 'own_demand' });
  }
  return err;
}

/** Filtros de oportunidades → WHERE parametrizado (sem LIMIT: a ordenação é da compatibilidade). */
function opportunityQuery(query) {
  const fields = {};
  const params = [];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  const statuses = parseList(query.status, INTEREST_OPEN_STATUSES, 'status', fields);
  add('d.status = ANY(?::demand_status[])', statuses ?? OPPORTUNITY_DEFAULT_STATUSES);
  const categories = parseList(query.category, CATEGORIES, 'category', fields);
  if (categories) add('d.category = ANY(?::demand_category[])', categories);
  const priorities = parseList(query.priority, PRIORITIES, 'priority', fields);
  if (priorities) add('d.priority = ANY(?::demand_priority[])', priorities);
  const resources = parseList(query.resourceType, NEEDED_RESOURCE_TYPES, 'resourceType', fields);
  if (resources) {
    add(`EXISTS (SELECT 1 FROM demand_resources r
                  WHERE r.demand_id = d.id AND r.kind = 'necessario'
                    AND r.resource_type = ANY(?::demand_resource_type[]))`, resources);
  }
  for (const [param, column] of [['territory', 'd.territory'], ['municipality', 'd.municipality']]) {
    const value = typeof query[param] === 'string' ? query[param].trim() : '';
    if (value.length > 255) fields[param] = 'Use no máximo 255 caracteres';
    else if (value) add(`${column} ILIKE ? ESCAPE '\\'`, likePattern(value));
  }
  if (typeof query.uf === 'string' && query.uf.trim()) {
    const uf = query.uf.trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(uf)) add('d.uf = ?', uf);
    else fields.uf = 'UF inválida';
  }
  const text = typeof query.q === 'string' ? query.q.trim() : '';
  if (text.length > 200) fields.q = 'Use no máximo 200 caracteres';
  else if (text) add(`(d.title ILIKE ? ESCAPE '\\' OR d.description ILIKE ? ESCAPE '\\')`, likePattern(text));

  // Faixa de valor: total da demanda (orçamento + 4% + 6%), em centavos.
  const cents = (param) => {
    if (query[param] === undefined || query[param] === '') return null;
    const value = Number(query[param]);
    if (!Number.isSafeInteger(value) || value < 0) {
      fields[param] = 'Valor em centavos inteiros, não negativo';
      return null;
    }
    return value;
  };
  const min = cents('minTotalCents');
  const max = cents('maxTotalCents');
  if (min !== null && max !== null && min > max) fields.maxTotalCents = 'O valor máximo é menor que o mínimo';
  // TODO(fonte-da-verdade): Modelo de Conexão §04 Obs. — filtro pelo total com 4% + 6%, que não vale para o Poder Público; ver TODO em migrations/007-demands.sql.
  if (min !== null) add('d.total_amount_cents >= ?', min);
  if (max !== null) add('d.total_amount_cents <= ?', max);

  const sort = query.sort === undefined || query.sort === '' ? 'compatibilidade' : query.sort;
  if (!['compatibilidade', 'recentes'].includes(sort)) fields.sort = 'Use compatibilidade ou recentes';

  let limit = OPPORTUNITY_PAGE_DEFAULT;
  if (query.limit !== undefined && query.limit !== '') {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > OPPORTUNITY_PAGE_MAX) fields.limit = `Entre 1 e ${OPPORTUNITY_PAGE_MAX}`;
    else limit = parsed;
  }
  let offset = 0;
  if (query.offset !== undefined && query.offset !== '') {
    const parsed = Number(query.offset);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_OFFSET) fields.offset = `Entre 0 e ${MAX_OFFSET}`;
    else offset = parsed;
  }

  if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
  params.push(OPPORTUNITY_CANDIDATES);
  const sql = `SELECT ${demandStore.PUBLIC_SUMMARY_SQL}
                 FROM demands d
                WHERE ${where.join(' AND ')}
                ORDER BY d.published_at DESC, d.id DESC
                LIMIT $${params.length}`;
  return { sql, params, sort, limit, offset };
}

module.exports = ({
  pool, auth, validatedAgent, governmentGate, institutionStatus, partnerProfile, connections,
}) => {
  if (typeof auth !== 'function' || typeof validatedAgent !== 'function' || typeof governmentGate !== 'function') {
    throw new Error('interests routes exigem auth, requireValidatedAgent e o gate do Poder Público');
  }
  const router = express.Router();
  const notFound = (res) => res.status(404).json({ error: 'Demanda não encontrada' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));
  router.param('interestId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Manifestação não encontrada' })));
  router.param('connectionId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Conexão não encontrada' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, mapInterestDbError(err));
    }
  };

  function requireOpportunityRole(req, res, next) {
    if (!OPPORTUNITY_ROLES.includes(roleOf(req))) {
      return res.status(403).json({
        error: 'Filtrar oportunidades de apoio é uma ação de Parceiros e do Poder Público',
        code: 'opportunities_not_allowed',
      });
    }
    return next();
  }

  function requireInterestRole(req, res, next) {
    if (!(KINDS_BY_ROLE[roleOf(req)] ?? []).length) {
      return res.status(403).json({
        error: 'Seu perfil não registra interesse em demandas',
        code: 'interest_not_allowed',
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

  /** Perfil de apoio; `undefined` quando o user-service não respondeu. */
  async function loadProfile(req) {
    if (!partnerProfile) return undefined;
    try {
      return await partnerProfile.get(req);
    } catch (err) {
      console.error(`[interests] perfil de apoio indisponível: ${err.message}`);
      return undefined;
    }
  }

  /** Demanda pública (publicada em diante, fora arquivada) para interesse e conexão. */
  async function loadPublicDemand(db, demandId, { forUpdate = false } = {}) {
    const { rows } = await db.query(
      `SELECT d.id, d.author_id, d.title, d.status, d.territory, d.district, d.municipality, d.uf, d.category,
              (SELECT p.id FROM posts p WHERE p.demand_id = d.id AND p.visibility = 'visible') AS post_id
         FROM demands d WHERE d.id = $1 AND d.status = ANY($2::demand_status[])${forUpdate ? ' FOR UPDATE OF d' : ''}`,
      [demandId, PUBLIC_STATUSES],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    return rows[0];
  }

  function assertOpen(demand) {
    if (!INTEREST_OPEN_STATUSES.includes(demand.status)) {
      throw new HttpError(409, {
        error: 'A demanda não recebe novas manifestações neste estado',
        code: 'demand_not_open',
        status: demand.status,
      });
    }
  }

  // ── Oportunidades de apoio ────────────────────────────────────────────────
  router.get('/opportunities', auth, requireOpportunityRole, governmentGate, handle(async (req, res) => {
    const { sql, params, sort, limit, offset } = opportunityQuery(req.query);
    const [{ rows }, profile] = await Promise.all([pool.query(sql, params), loadProfile(req)]);
    const ids = rows.map((r) => r.id);
    const needed = await store.neededResourcesByDemand(pool, ids);
    const mine = await store.openInterestsByDemand(pool, req.user.userId, ids);
    const compatibilityAvailable = profile !== undefined;
    const items = rows.map((row) => {
      const neededResources = needed.get(row.id) ?? [];
      const demand = { ...demandStore.serializePublicSummary(row), neededResources };
      return {
        demand,
        compatibility: compatibilityAvailable ? computeCompatibility(profile, { ...demand, category: row.category }) : null,
        myInterests: mine.get(row.id) ?? [],
      };
    });
    if (sort === 'compatibilidade' && compatibilityAvailable) {
      // Estável: empate mantém a ordem de publicação (mais recentes primeiro).
      items.sort((a, b) => b.compatibility.score - a.compatibility.score);
    }
    const page = items.slice(offset, offset + limit);
    res.json({
      opportunities: page,
      total: items.length,
      truncated: rows.length === OPPORTUNITY_CANDIDATES,
      offset,
      limit,
      nextOffset: offset + limit < items.length ? offset + limit : null,
      sort: compatibilityAvailable ? sort : 'recentes',
      compatibilityAvailable,
      profile: compatibilityAvailable ? { exists: profile !== null, complete: profileHasCriteria(profile) } : null,
    });
  }));

  // ── Manifestações da conta ────────────────────────────────────────────────
  router.get('/interests/mine', auth, handle(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${store.INTEREST_SQL}, d.title AS demand_title, d.status::text AS demand_status
         FROM demand_interests i JOIN demands d ON d.id = i.demand_id
        WHERE i.user_id = $1 AND d.status = ANY($2::demand_status[])
        ORDER BY i.created_at DESC, i.id DESC LIMIT 200`,
      [req.user.userId, PUBLIC_STATUSES],
    );
    res.json({
      interests: rows.map((row) => ({
        ...store.serializeOwnInterest(row),
        demand: { id: row.demand_id, title: row.demand_title, status: row.demand_status },
      })),
    });
  }));

  router.get('/:id/interests/summary', handle(async (req, res) => {
    await loadPublicDemand(pool, req.params.id);
    res.json(await store.interestSummary(pool, req.params.id));
  }));

  router.get('/:id/interests/mine', auth, handle(async (req, res) => {
    const demand = await loadPublicDemand(pool, req.params.id);
    const role = roleOf(req);
    const { rows } = await pool.query(
      `SELECT ${store.INTEREST_SQL} FROM demand_interests i
        WHERE i.demand_id = $1 AND i.user_id = $2 ORDER BY i.created_at DESC, i.id DESC`,
      [req.params.id, req.user.userId],
    );
    let compatibility = null;
    if (OPPORTUNITY_ROLES.includes(role)) {
      const profile = await loadProfile(req);
      if (profile !== undefined) {
        const needed = await store.neededResourcesByDemand(pool, [demand.id]);
        compatibility = computeCompatibility(profile, { ...demand, neededResources: needed.get(demand.id) ?? [] });
      }
    }
    res.json({
      interests: rows.map(store.serializeOwnInterest),
      allowedKinds: demand.author_id === req.user.userId ? [] : KINDS_BY_ROLE[role] ?? [],
      isAuthor: demand.author_id === req.user.userId,
      open: INTEREST_OPEN_STATUSES.includes(demand.status),
      compatibility,
    });
  }));

  router.post('/:id/interests', auth, requireInterestRole, governmentGate, handle(async (req, res) => {
    const role = roleOf(req);
    const { value, errors } = validateInterest(req.body ?? {}, role);
    if (Object.keys(errors).length) throw validationError(errors);
    const demand = await loadPublicDemand(pool, req.params.id);
    if (demand.author_id === req.user.userId) {
      throw new HttpError(403, { error: 'O autor não manifesta interesse na própria demanda', code: 'own_demand' });
    }
    assertOpen(demand);
    let organizationId = null;
    if (role === 'government' && institutionStatus) {
      organizationId = (await institutionStatus(req)).organizationId ?? null;
    }
    const { rows } = await pool.query(
      `INSERT INTO demand_interests
         (demand_id, user_id, user_name, user_avatar, user_category, profile_type, organization_id, kind, offer_types, message, event_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::demand_interest_offer[], $10, $11)
       RETURNING id`,
      [
        req.params.id, req.user.userId, req.user.name || req.user.email || null, req.user.avatarUrl || null,
        ROLE_CATEGORY[role], req.user.profileType || null, organizationId, value.kind, value.offerTypes, value.message,
        value.eventId,
      ],
    );
    const interest = await store.loadOwnInterest(pool, req.params.id, rows[0].id, req.user.userId);
    res.status(201).json({ interest: store.serializeOwnInterest(interest) });
  }));

  router.post('/:id/interests/:interestId/connection', auth, requireInterestRole, governmentGate, handle(async (req, res) => {
    const interest = await store.loadOwnInterest(pool, req.params.id, req.params.interestId, req.user.userId);
    if (interest.withdrawn_at) throw new HttpError(409, { error: 'Esta manifestação foi retirada', code: 'interest_withdrawn' });
    if (interest.connection_status === 'pendente' || interest.connection_status === 'aceita') {
      throw new HttpError(409, {
        error: interest.connection_status === 'aceita' ? 'A conexão já foi aceita' : 'A conexão já foi solicitada e aguarda resposta',
        code: 'connection_exists',
        connectionId: interest.connection_id,
      });
    }
    const { value, errors } = validateConnectionRequest(req.body ?? {}, connectionTypeFor(interest.kind, interest.offer_types));
    if (Object.keys(errors).length) throw validationError(errors);
    const demand = await loadPublicDemand(pool, req.params.id);
    assertOpen(demand);

    const connection = await connections.create(req, {
      toUserId: demand.author_id,
      type: value.type,
      message: value.message,
      postId: demand.post_id ?? null,
      postTitle: demand.title,
      demandId: demand.id,
    });
    const { rows } = await pool.query(
      `UPDATE demand_interests SET connection_id = $2, connection_status = 'pendente'
        WHERE id = $1 AND withdrawn_at IS NULL
          AND (connection_status IS NULL OR connection_status IN ('recusada', 'cancelada'))
        RETURNING id`,
      [interest.id, connection.id],
    );
    if (!rows.length) {
      throw new HttpError(409, { error: 'A manifestação mudou enquanto a conexão era pedida; recarregue', code: 'interest_changed' });
    }
    const updated = await store.loadOwnInterest(pool, req.params.id, interest.id, req.user.userId);
    res.status(201).json({ interest: store.serializeOwnInterest(updated), connection });
  }));

  router.post('/:id/interests/:interestId/withdraw', auth, handle(async (req, res) => {
    const interest = await store.loadOwnInterest(pool, req.params.id, req.params.interestId, req.user.userId);
    if (interest.withdrawn_at) return res.json({ interest: store.serializeOwnInterest(interest) });
    // Pedido pendente: cancela no user-service (só o remetente cancela) e espelha
    // o desfecho, se o Agente respondeu antes.
    let connectionStatus = interest.connection_status;
    if (connectionStatus === 'pendente') {
      const current = await connections.get(req, interest.connection_id);
      let status = current?.status ?? 'canceled';
      if (status === 'pending') status = (await connections.update(req, interest.connection_id, 'canceled')).status;
      connectionStatus = status === 'accepted' || status === 'done' ? 'aceita' : status === 'declined' ? 'recusada' : 'cancelada';
    }
    await pool.query(
      `UPDATE demand_interests
          SET withdrawn_at = NOW(),
              connection_status = CASE WHEN connection_status = 'pendente'
                                       THEN $2::demand_interest_connection_status ELSE connection_status END
        WHERE id = $1 AND withdrawn_at IS NULL`,
      [interest.id, connectionStatus],
    );
    const updated = await store.loadOwnInterest(pool, req.params.id, interest.id, req.user.userId);
    res.json({ interest: store.serializeOwnInterest(updated) });
  }));

  // ── Agente autor ──────────────────────────────────────────────────────────
  router.get('/mine/:id/interests', auth, requireAgent, handle(async (req, res) => {
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const { rows } = await pool.query(
      `SELECT ${store.INTEREST_SQL} FROM demand_interests i
        WHERE i.demand_id = $1 ORDER BY i.created_at DESC, i.id DESC`,
      [req.params.id],
    );
    res.json({
      interests: rows.map(store.serializeAgentInterest),
      summary: await store.interestSummary(pool, req.params.id),
    });
  }));

  /** Confere a conexão no user-service: destinatário é o autor e a demanda é esta. */
  async function linkedConnection(req, demandId) {
    const connection = await connections.get(req, req.params.connectionId);
    if (!connection) throw new HttpError(404, { error: 'Conexão não encontrada' });
    const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
    if (!same(connection.toUserId, req.user.userId) || !same(connection.demandId, demandId)) {
      throw new HttpError(422, {
        error: 'Esta conexão não foi pedida a você a partir desta demanda',
        code: 'connection_not_linked',
      });
    }
    return connection;
  }

  router.post('/mine/:id/connections/:connectionId/accept', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    let connection = await linkedConnection(req, req.params.id);
    if (connection.status === 'pending') {
      connection = await connections.update(req, connection.id, 'accepted');
    } else if (connection.status !== 'accepted' && connection.status !== 'done') {
      throw new HttpError(409, { error: 'Esta conexão já foi encerrada', code: 'connection_closed', connectionStatus: connection.status });
    }
    const result = await withTransaction(pool, async (client) => {
      const row = await demandStore.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      await client.query(
        `UPDATE demand_interests SET connection_status = 'aceita'
          WHERE demand_id = $1 AND connection_id = $2 AND connection_status = 'pendente'`,
        [req.params.id, connection.id],
      );
      let transitioned = false;
      if (CONNECTABLE_STATUSES.includes(row.status)) {
        await demandStore.transitionDemand(client, row, 'conectar', { actor: 'sistema', actorRef: `conexao:${connection.id}` });
        transitioned = true;
      }
      const { rows: [current] } = await client.query('SELECT status::text AS status FROM demands WHERE id = $1', [req.params.id]);
      const { rows: interests } = await client.query(
        `SELECT ${store.INTEREST_SQL} FROM demand_interests i WHERE i.demand_id = $1 AND i.connection_id = $2`,
        [req.params.id, connection.id],
      );
      return { status: current.status, transitioned, interest: interests[0] ? store.serializeAgentInterest(interests[0]) : null };
    });
    res.json({
      demand: { id: req.params.id, status: result.status },
      transitioned: result.transitioned,
      connection,
      interest: result.interest,
    });
  }));

  router.post('/mine/:id/connections/:connectionId/decline', auth, requireAgent, handle(async (req, res) => {
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    let connection = await linkedConnection(req, req.params.id);
    if (connection.status === 'pending') {
      connection = await connections.update(req, connection.id, 'declined');
    } else if (connection.status !== 'declined') {
      throw new HttpError(409, { error: 'Esta conexão já foi respondida', code: 'connection_closed', connectionStatus: connection.status });
    }
    const { rows } = await pool.query(
      `UPDATE demand_interests SET connection_status = 'recusada'
        WHERE demand_id = $1 AND connection_id = $2 AND connection_status = 'pendente'
        RETURNING id`,
      [req.params.id, connection.id],
    );
    const { rows: interests } = rows.length
      ? await pool.query(`SELECT ${store.INTEREST_SQL} FROM demand_interests i WHERE i.id = $1`, [rows[0].id])
      : { rows: [] };
    res.json({ connection, interest: interests[0] ? store.serializeAgentInterest(interests[0]) : null });
  }));

  return router;
};

module.exports.opportunityQuery = opportunityQuery;
