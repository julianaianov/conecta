// Atuação institucional do Poder Público (T13). Montada na raiz do
// post-service, antes das rotas da demanda; público em /api/posts/... (o Caddy
// tira /api/posts). Fonte: 03-fluxo-cadastro-poder-publico.html, etapas 03 a 08.
//
// Poder Público com cadastro validado (token + requireGovernmentActor; 403
// `not_government` / `institution_not_validated`, 503 sem confirmação):
//   GET  /institutional/me                       órgão, recorte territorial e contagem por status
//   GET  /institutional/demands                  demandas publicadas com o acompanhamento do órgão
//                                                (filtros: category, priority, status, territory,
//                                                municipality, uf, q, bbox, institutionalStatus
//                                                com `sem_acompanhamento`, scope=jurisdicao|todas;
//                                                keyset por published_at, id)
//   GET  /institutional/tracks                   acompanhamentos do órgão (fila; filtro status)
//   GET  /institutional/demands/:id              demanda pública + acompanhamento, respostas e
//                                                ofertas do órgão + acompanhamentos públicos dos demais
//   POST /institutional/demands/:id/track        abre o acompanhamento (`recebida`); 201 ou 200 se já existe
//   PUT  /institutional/demands/:id/track        responsável (nome e cargo/setor)
//   POST /institutional/demands/:id/status       { status, note }
//   POST /institutional/demands/:id/responses    { type, body, responsibleSector, programName,
//                                                programUrl, plannedFor, status?, statusNote? }
//   POST /institutional/demands/:id/offers       { supportTypes[], description, connectionId? }
//
// Encaminhamentos (T14): routes/forwardings.js, registrado neste router
// (diretório de órgãos, encaminhar, caixa recebidos/enviados, status e
// providências). A visão do órgão sobre a demanda traz os encaminhamentos em
// que ele é origem ou destino.
//
// Público (sem login; só demanda publicada em diante, fora `arquivada`):
//   GET  /demands/:id/institutional              órgãos que acompanham (status e datas),
//                                                respostas, ofertas e tramitação dos
//                                                encaminhamentos, sem representante nem responsável
//
// Respostas, status e ofertas abrem o acompanhamento quando ele ainda não
// existe. A conexão com o Agente usa as rotas de conexões do user-service
// (`connectionId` guarda o pedido feito). Tudo que escreve roda em transação;
// os triggers da migração 010 repetem as regras e gravam a linha do tempo.
//
// Neutralidade: listas em ordem cronológica, sem pontuação nem comparação
// entre órgãos.

const express = require('express');
const { isUuid } = require('../security');
const { CATEGORIES, PRIORITIES, PUBLIC_STATUSES } = require('../demand/constants');
const demandStore = require('../demand/store');
const { listHelpers } = require('./demands');
const {
  INSTITUTIONAL_STATUSES, WITHOUT_TRACK, SCOPES,
  checkTransition, validateStatusChange, validateResponse, validateResponsible, validateOffer,
} = require('../institutional');
const store = require('../institutional/store');
const forwardingStore = require('../institutional/forwarding-store');
const { registerForwardingRoutes } = require('./forwardings');

const { HttpError, withTransaction } = demandStore;
const {
  parseList, likePattern, encodeCursor, decodeCursor, validationError, PAGE_DEFAULT, PAGE_MAX,
} = listHelpers;

function transitionError(result, field = 'status') {
  if (result.code === 'invalid_transition') return new HttpError(409, { error: result.error, code: result.code });
  return validationError({ [result.code === 'note_required' ? 'note' : field]: result.error }, result.error);
}

/** Recorte do território de atuação pela esfera: municipal → município/UF, estadual → UF, federal → tudo. */
function jurisdictionClause(profile, add) {
  if (!profile) return;
  if (profile.governmentSphere === 'municipal' && profile.uf) {
    add('d.uf = ?', profile.uf);
    if (profile.municipality) add('lower(btrim(d.municipality)) = lower(btrim(?))', profile.municipality);
  } else if (profile.governmentSphere === 'estadual' && profile.uf) {
    add('d.uf = ?', profile.uf);
  }
}

/** Lista do Poder Público → SQL parametrizado. */
function governmentListQuery(query, organizationId, profile) {
  const fields = {};
  const params = [organizationId];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  add('d.status = ANY(?::demand_status[])', parseList(query.status, PUBLIC_STATUSES, 'status', fields) ?? PUBLIC_STATUSES);
  const categories = parseList(query.category, CATEGORIES, 'category', fields);
  if (categories) add('d.category = ANY(?::demand_category[])', categories);
  const priorities = parseList(query.priority, PRIORITIES, 'priority', fields);
  if (priorities) add('d.priority = ANY(?::demand_priority[])', priorities);

  const institutional = parseList(query.institutionalStatus, [...INSTITUTIONAL_STATUSES, WITHOUT_TRACK], 'institutionalStatus', fields);
  if (institutional) {
    const statuses = institutional.filter((s) => s !== WITHOUT_TRACK);
    const withoutTrack = institutional.includes(WITHOUT_TRACK);
    params.push(statuses);
    const p = `$${params.length}`;
    where.push(withoutTrack
      ? `(t.id IS NULL OR t.status = ANY(${p}::institutional_status[]))`
      : `t.status = ANY(${p}::institutional_status[])`);
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
  if (text.length > 200) {
    fields.q = 'Use no máximo 200 caracteres';
  } else if (text) {
    params.push(likePattern(text));
    const p = `$${params.length}`;
    where.push(`(d.title ILIKE ${p} ESCAPE '\\' OR d.description ILIKE ${p} ESCAPE '\\' OR d.territory ILIKE ${p} ESCAPE '\\')`);
  }

  const scope = query.scope === undefined || query.scope === '' ? 'jurisdicao' : String(query.scope);
  if (!SCOPES.includes(scope)) fields.scope = `Valores aceitos: ${SCOPES.join(', ')}`;
  else if (scope === 'jurisdicao') jurisdictionClause(profile, add);

  if (query.bbox !== undefined && query.bbox !== '') {
    const parts = String(query.bbox).split(',').map((v) => Number(v.trim()));
    const [west, south, east, north] = parts;
    const valid = parts.length === 4 && parts.every(Number.isFinite)
      && Math.abs(south) <= 90 && Math.abs(north) <= 90 && Math.abs(west) <= 180 && Math.abs(east) <= 180
      && south <= north && west <= east;
    if (!valid) {
      fields.bbox = 'Use bbox=oeste,sul,leste,norte (longitude e latitude em graus)';
    } else {
      params.push(south, north, west, east);
      const n = params.length;
      where.push(`d.latitude BETWEEN $${n - 3} AND $${n - 2} AND d.longitude BETWEEN $${n - 1} AND $${n}`);
    }
  }

  let limit = PAGE_DEFAULT;
  if (query.limit !== undefined) {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > PAGE_MAX) fields.limit = `Entre 1 e ${PAGE_MAX}`;
    else limit = parsed;
  }
  if (query.cursor !== undefined && query.cursor !== '') {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) {
      fields.cursor = 'Cursor inválido';
    } else {
      params.push(cursor.ts, cursor.id);
      const n = params.length;
      where.push(`(d.published_at, d.id) < ($${n - 1}::timestamptz, $${n}::uuid)`);
    }
  }

  if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
  params.push(limit + 1);
  const sql = `SELECT ${demandStore.PUBLIC_SUMMARY_SQL},
                      t.id AS track_id, t.status AS track_status, t.status_changed_at AS track_status_changed_at
                 FROM demands d
                 LEFT JOIN demand_institutional_tracks t ON t.demand_id = d.id AND t.organization_id = $1
                WHERE ${where.join(' AND ')}
                ORDER BY d.published_at DESC, d.id DESC
                LIMIT $${params.length}`;
  return { sql, params, limit, scope };
}

const ownTrackSummary = (row) => (row.track_id ? {
  trackId: row.track_id,
  status: row.track_status,
  statusChangedAt: row.track_status_changed_at instanceof Date
    ? row.track_status_changed_at.toISOString() : row.track_status_changed_at ?? null,
} : null);

module.exports = ({ pool, auth, governmentActor, governmentProfile, governmentDirectory = null }) => {
  if (typeof auth !== 'function' || typeof governmentActor !== 'function' || typeof governmentProfile !== 'function') {
    throw new Error('institutional routes exigem auth, requireGovernmentActor e governmentProfile');
  }
  const router = express.Router();

  const notFound = (res) => res.status(404).json({ error: 'Demanda não encontrada' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = forwardingStore.mapForwardingError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  /** Identificação pública do órgão; sem ela não há como abrir acompanhamento. */
  async function profileOf(req) {
    let profile;
    try {
      profile = await governmentProfile(req.user.userId);
    } catch (err) {
      console.error(`[institutional] ${err.message}`);
      throw new HttpError(503, { error: 'Não foi possível confirmar o órgão do Poder Público', code: 'institution_unavailable' });
    }
    if (!profile) {
      throw new HttpError(403, {
        error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
        code: 'institution_not_validated',
      });
    }
    return profile;
  }

  /** Visão do órgão sobre uma demanda (dentro ou fora de transação). */
  async function organView(db, demandId, organizationId) {
    const { rows } = await db.query(
      `SELECT ${demandStore.PUBLIC_DEMAND_SQL} FROM demands d
        WHERE d.id = $1 AND d.status = ANY($2::demand_status[])`,
      [demandId, PUBLIC_STATUSES],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
    const items = await demandStore.loadItems(db, demandId);
    const track = await store.loadTrack(db, demandId, organizationId);
    const own = track ? await store.loadEntries(db, demandId, organizationId) : { responses: [], offers: [] };
    const { rows: others } = await db.query(
      `SELECT ${store.PUBLIC_TRACK_SQL} FROM demand_institutional_tracks t
        WHERE t.demand_id = $1 AND t.organization_id <> $2
        ORDER BY t.received_at, t.id`,
      [demandId, organizationId],
    );
    const forwardings = await forwardingStore.loadDemandForwardings(db, demandId, { organizationId });
    return {
      demand: demandStore.serializePublicDemand(rows[0], items),
      track: track ? store.serializeTrack(track) : null,
      responses: own.responses.map((r) => store.serializeResponse(r)),
      offers: own.offers.map((o) => store.serializeOffer(o)),
      otherOrganizations: others.map(store.serializePublicTrack),
      forwardings: forwardings.map(({ row, updates }) => forwardingStore.serializeForwarding(
        row, updates, { viewerOrganizationId: organizationId })),
    };
  }

  const gov = [auth, governmentActor];

  // ── Órgão ─────────────────────────────────────────────────────────────────
  router.get('/institutional/me', ...gov, handle(async (req, res) => {
    const profile = await profileOf(req);
    const { rows } = await pool.query(
      `SELECT status, count(*)::int AS n FROM demand_institutional_tracks
        WHERE organization_id = $1 GROUP BY status`,
      [req.government.organizationId],
    );
    const counts = Object.fromEntries(INSTITUTIONAL_STATUSES.map((s) => [s, 0]));
    for (const r of rows) counts[r.status] = r.n;
    // Encaminhamentos (T14): recebidos ainda sem resposta e enviados em aberto.
    const { rows: [pending] } = await pool.query(
      `SELECT count(*) FILTER (WHERE f.destination_organization_id = $1 AND f.status = 'enviado')::int AS received,
              count(*) FILTER (WHERE f.organization_id = $1 AND f.status IN ('enviado', 'recebido'))::int AS sent
         FROM demand_forwardings f
         JOIN demands d ON d.id = f.demand_id
        WHERE (f.destination_organization_id = $1 OR f.organization_id = $1)
          AND d.status = ANY($2::demand_status[])`,
      [req.government.organizationId, PUBLIC_STATUSES],
    );
    res.json({
      organizationId: req.government.organizationId,
      organization: profile,
      jurisdiction: {
        governmentSphere: profile.governmentSphere,
        municipality: profile.governmentSphere === 'municipal' ? profile.municipality : null,
        uf: profile.governmentSphere === 'federal' ? null : profile.uf,
      },
      counts,
      forwardings: { pendingReceived: pending?.received ?? 0, openSent: pending?.sent ?? 0 },
    });
  }));

  router.get('/institutional/demands', ...gov, handle(async (req, res) => {
    const profile = await profileOf(req);
    const { sql, params, limit, scope } = governmentListQuery(req.query, req.government.organizationId, profile);
    const { rows } = await pool.query(sql, params);
    const page = rows.slice(0, limit);
    res.json({
      scope,
      demands: page.map((row) => ({ ...demandStore.serializePublicSummary(row), institutional: ownTrackSummary(row) })),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    });
  }));

  router.get('/institutional/tracks', ...gov, handle(async (req, res) => {
    const fields = {};
    const statuses = parseList(req.query.status, INSTITUTIONAL_STATUSES, 'status', fields);
    if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
    const params = [req.government.organizationId, PUBLIC_STATUSES];
    let filter = '';
    if (statuses) {
      params.push(statuses);
      filter = ' AND t.status = ANY($3::institutional_status[])';
    }
    const { rows: tracks } = await pool.query(
      `SELECT ${store.TRACK_SQL}
         FROM demand_institutional_tracks t
         JOIN demands d ON d.id = t.demand_id
        WHERE t.organization_id = $1 AND d.status = ANY($2::demand_status[])${filter}
        ORDER BY t.status_changed_at DESC, t.id DESC
        LIMIT 200`,
      params,
    );
    const { rows: demands } = tracks.length ? await pool.query(
      `SELECT ${demandStore.PUBLIC_SUMMARY_SQL} FROM demands d WHERE d.id = ANY($1::uuid[])`,
      [tracks.map((t) => t.demand_id)],
    ) : { rows: [] };
    const byId = new Map(demands.map((d) => [d.id, demandStore.serializePublicSummary(d)]));
    res.json({
      tracks: tracks
        .filter((t) => byId.has(t.demand_id))
        .map((t) => ({ track: store.serializeTrack(t), demand: byId.get(t.demand_id) })),
    });
  }));

  router.get('/institutional/demands/:id', ...gov, handle(async (req, res) => {
    res.json(await organView(pool, req.params.id, req.government.organizationId));
  }));

  // ── Escrita ───────────────────────────────────────────────────────────────
  /** Transação com a demanda aberta e o acompanhamento do órgão (aberto se preciso). */
  async function withTrack(req, profile, callback) {
    return withTransaction(pool, async (client) => {
      await store.loadOpenDemand(client, req.params.id, { lock: true });
      const { row, created } = await store.ensureTrack(client, {
        demandId: req.params.id, organizationId: req.government.organizationId, profile, user: req.user,
      });
      await callback(client, row);
      return { created, view: await organView(client, req.params.id, req.government.organizationId) };
    });
  }

  async function changeStatus(client, track, status, note, userId) {
    const check = checkTransition(track.status, status, note);
    if (!check.ok) throw transitionError(check);
    await client.query(
      `UPDATE demand_institutional_tracks
          SET status = $2, status_note = $3, status_changed_by = $4
        WHERE id = $1`,
      [track.id, status, note, userId],
    );
  }

  router.post('/institutional/demands/:id/track', ...gov, handle(async (req, res) => {
    const profile = await profileOf(req);
    const { created, view } = await withTrack(req, profile, async () => {});
    res.status(created ? 201 : 200).json(view);
  }));

  router.put('/institutional/demands/:id/track', ...gov, handle(async (req, res) => {
    const { value, errors } = validateResponsible(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const profile = await profileOf(req);
    const { view } = await withTrack(req, profile, async (client, track) => {
      await client.query("SELECT set_config('dm.actor', $1, true)", [req.user.userId]);
      await client.query(
        'UPDATE demand_institutional_tracks SET responsible_name = $2, responsible_role = $3 WHERE id = $1',
        [track.id, value.responsibleName, value.responsibleRole],
      );
    });
    res.json(view);
  }));

  router.post('/institutional/demands/:id/status', ...gov, handle(async (req, res) => {
    const { value, errors } = validateStatusChange(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const profile = await profileOf(req);
    const { view } = await withTrack(req, profile, (client, track) => (
      changeStatus(client, track, value.status, value.note, req.user.userId)));
    res.json(view);
  }));

  router.post('/institutional/demands/:id/responses', ...gov, handle(async (req, res) => {
    const { value, errors } = validateResponse(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const profile = await profileOf(req);
    const { view } = await withTrack(req, profile, async (client, track) => {
      // A mudança de status vem antes: a resposta registra o status resultante.
      if (value.status && value.status !== track.status) {
        await changeStatus(client, track, value.status, value.statusNote, req.user.userId);
      }
      await client.query(
        `INSERT INTO demand_institutional_responses
           (track_id, demand_id, organization_id, response_type, body, responsible_sector, program_name,
            program_url, planned_for, author_id, author_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          track.id, track.demand_id, track.organization_id, value.type, value.body, value.responsibleSector,
          value.programName, value.programUrl, value.plannedFor, req.user.userId,
          req.user.name || req.user.email || null,
        ],
      );
    });
    res.status(201).json(view);
  }));

  router.post('/institutional/demands/:id/offers', ...gov, handle(async (req, res) => {
    const { value, errors } = validateOffer(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const profile = await profileOf(req);
    const { view } = await withTrack(req, profile, async (client, track) => {
      await client.query(
        `INSERT INTO demand_institutional_offers
           (track_id, demand_id, organization_id, support_types, description, connection_id, author_id, author_name)
         VALUES ($1, $2, $3, $4::institutional_support_type[], $5, $6, $7, $8)`,
        [
          track.id, track.demand_id, track.organization_id, value.supportTypes, value.description,
          value.connectionId, req.user.userId, req.user.name || req.user.email || null,
        ],
      );
    });
    res.status(201).json(view);
  }));

  // ── Encaminhamentos (T14) ─────────────────────────────────────────────────
  registerForwardingRoutes(router, {
    pool, store, gov, handle, profileOf, withTrack, changeStatus, governmentDirectory,
  });

  // ── Público ───────────────────────────────────────────────────────────────
  router.get('/demands/:id/institutional', handle(async (req, res) => {
    await store.loadOpenDemand(pool, req.params.id);
    const { rows: tracks } = await pool.query(
      `SELECT ${store.PUBLIC_TRACK_SQL} FROM demand_institutional_tracks t
        WHERE t.demand_id = $1 ORDER BY t.received_at, t.id`,
      [req.params.id],
    );
    const { responses, offers } = await store.loadEntries(pool, req.params.id);
    const forwardings = await forwardingStore.loadDemandForwardings(pool, req.params.id);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      organizations: tracks.map(store.serializePublicTrack),
      responses: responses.map((r) => store.serializeResponse(r, { isPublic: true })),
      offers: offers.map((o) => store.serializeOffer(o, { isPublic: true })),
      forwardings: forwardings.map(({ row, updates }) => forwardingStore.serializeForwarding(row, updates, { isPublic: true })),
    });
  }));

  return router;
};

module.exports.governmentListQuery = governmentListQuery;
