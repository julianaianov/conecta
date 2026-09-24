// Eventos do território e inscrição da comunidade (T25). Montada em `/events`
// no post-service; público em `/api/posts/events` (o Caddy tira `/api/posts`).
//
// Fonte: Apresentação, slide 9 (Membros da Comunidade: "Inscrever-se em
// eventos", "Oferecer voluntariado"), slide 18 (conteúdos do território:
// eventos, oficinas culturais, mutirões, ações ambientais, aulas esportivas),
// slide 19 (mapa com demandas e conteúdos) e slide 20 ("Financiar eventos").
// Decisão 5: a plataforma não processa pagamento — evento pago declara o valor.
//
// Público (sem login; só evento publicado ou cancelado):
//   GET  /                        agenda com filtros (kind, territory,
//                                 municipality, uf, demandId, from, to, q,
//                                 when=proximos|passados, status) e keyset
//   GET  /territories             agenda agregada por território
//   GET  /reference               vocabulário, rótulos e o aviso do e-mail
//   GET  /:id                     o evento
//   GET  /:id/signups/summary     contagens (nunca a lista)
//
// Membro da Comunidade (slide 9; SIGNUP_ROLES em src/event/constants.js):
//   GET  /signups/mine            as próprias inscrições
//   GET  /:id/signups/mine        a inscrição nesta evento e o que é permitido
//   POST /:id/signups             inscreve-se (vaga ou fila de espera)
//   POST /:id/signups/cancel      cancela a própria inscrição
//
// Organizador (Agente de Transformação ou Poder Público validado):
//   GET  /mine                    os próprios eventos, em qualquer estado
//   GET  /mine/:id                o evento com presença e organização
//   POST /                        cria rascunho
//   PUT  /:id                     edita (rascunho ou publicado)
//   POST /:id/publish             publica (cria o post-vitrine do feed/mapa)
//   POST /:id/cancel              cancela, com motivo
//   GET  /mine/:id/signups        lista de presença (sem dado pessoal além do
//                                 necessário: nome público, categoria, estado)
//   PUT  /mine/:id/signups/:sid/attendance   marca ou desmarca a presença
//
// Confirmação por e-mail: a plataforma ainda não tem serviço de envio. A API
// declara `emailNotifications` como "em desenvolvimento" e a interface mostra
// isso; nada é prometido ao participante (governança, slide 26).

const express = require('express');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const { requireEffectiveRole, hasDelegatedPermission } = require('../delegation');
const demandStore = require('../demand/store');
const {
  KINDS, KIND_LABELS, STATUSES, STATUS_LABELS, PUBLIC_STATUSES, PRICING, PRICING_LABELS,
  ACCESSIBILITY, ACCESSIBILITY_LABELS, SIGNUP_STATUSES, SIGNUP_STATUS_LABELS,
  ORGANIZER_ROLES, ROLE_ORGANIZER_CATEGORY, SIGNUP_ROLES, ROLE_CATEGORY,
  EMAIL_NOTIFICATIONS, MAX_SIGNUPS_PAGE,
} = require('../event/constants');
const { validateEvent, validateSignup, validateCancellation, UFS } = require('../event/validation');
const store = require('../event/store');
const { listHelpers } = require('./demands');

const { HttpError, sendError, withTransaction } = demandStore;
const { parseList, likePattern, validationError } = listHelpers;

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
const MINE_MAX = 200;
const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)?$/;

const roleOf = (req) => normalizeRole(req.user?.role, req.user?.profileType);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function encodeCursor(row) {
  return Buffer.from(JSON.stringify([row.cursor_ts, row.id])).toString('base64url');
}

function decodeCursor(raw) {
  try {
    const [ts, id] = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    if (typeof ts !== 'string' || !CURSOR_TS_RE.test(ts) || !isUuid(id)) return null;
    return { ts, id };
  } catch {
    return null;
  }
}

/**
 * Filtros da agenda pública → WHERE parametrizado, com keyset por
 * (starts_at, id). `when=proximos` (padrão) ordena do próximo ao mais distante;
 * `passados`, do mais recente ao mais antigo.
 */
function agendaQuery(query) {
  const fields = {};
  const params = [];
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replaceAll('?', `$${params.length}`));
  };

  const statuses = parseList(query.status, PUBLIC_STATUSES, 'status', fields);
  add('e.status = ANY(?::event_status[])', statuses ?? ['publicado']);

  const kinds = parseList(query.kind, KINDS, 'kind', fields);
  if (kinds) add('e.kind = ANY(?::event_kind[])', kinds);

  for (const [param, column] of [['territory', 'e.territory'], ['municipality', 'e.municipality'], ['district', 'e.district']]) {
    const value = typeof query[param] === 'string' ? query[param].trim() : '';
    if (value.length > 255) fields[param] = 'Use no máximo 255 caracteres';
    else if (value) add(`${column} ILIKE ? ESCAPE '\\'`, likePattern(value));
  }
  if (typeof query.uf === 'string' && query.uf.trim()) {
    const uf = query.uf.trim().toUpperCase();
    if (UFS.includes(uf)) add('e.uf = ?', uf);
    else fields.uf = 'UF inválida';
  }
  if (query.demandId !== undefined && query.demandId !== '') {
    if (!isUuid(query.demandId)) fields.demandId = 'Demanda inválida';
    else add('e.demand_id = ?::uuid', query.demandId);
  }
  if (query.pricing !== undefined && query.pricing !== '') {
    if (!PRICING.includes(query.pricing)) fields.pricing = `Valores aceitos: ${PRICING.join(', ')}`;
    else add('e.pricing = ?::event_pricing', query.pricing);
  }
  if (query.accessibility !== undefined && query.accessibility !== '') {
    const list = parseList(query.accessibility, ACCESSIBILITY, 'accessibility', fields);
    if (list) add('e.accessibility @> ?::event_accessibility[]', list);
  }
  for (const [param, op] of [['from', '>='], ['to', '<=']]) {
    if (query[param] === undefined || query[param] === '') continue;
    const value = new Date(String(query[param]));
    if (Number.isNaN(value.getTime())) fields[param] = 'Data inválida';
    else add(`e.starts_at ${op} ?::timestamptz`, value.toISOString());
  }
  const text = typeof query.q === 'string' ? query.q.trim() : '';
  if (text.length > 200) fields.q = 'Use no máximo 200 caracteres';
  else if (text) {
    params.push(likePattern(text));
    const n = params.length;
    where.push(`(e.title ILIKE $${n} ESCAPE '\\' OR e.description ILIKE $${n} ESCAPE '\\'`
      + ` OR e.location_name ILIKE $${n} ESCAPE '\\')`);
  }

  const when = query.when === undefined || query.when === '' ? 'proximos' : query.when;
  if (!['proximos', 'passados', 'todos'].includes(when)) fields.when = 'Use proximos, passados ou todos';
  if (when === 'proximos') where.push('e.ends_at >= NOW()');
  if (when === 'passados') where.push('e.ends_at < NOW()');

  let limit = PAGE_DEFAULT;
  if (query.limit !== undefined && query.limit !== '') {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > PAGE_MAX) fields.limit = `Entre 1 e ${PAGE_MAX}`;
    else limit = parsed;
  }
  const ascending = when === 'proximos';
  if (query.cursor !== undefined && query.cursor !== '') {
    const cursor = decodeCursor(query.cursor);
    if (!cursor) {
      fields.cursor = 'Cursor inválido';
    } else {
      params.push(cursor.ts, cursor.id);
      const n = params.length;
      where.push(`(e.starts_at, e.id) ${ascending ? '>' : '<'} ($${n - 1}::timestamptz, $${n}::uuid)`);
    }
  }

  if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
  params.push(limit + 1);
  const order = ascending ? 'e.starts_at ASC, e.id ASC' : 'e.starts_at DESC, e.id DESC';
  const sql = `SELECT ${store.PUBLIC_EVENT_SQL}, e.starts_at::text AS cursor_ts
                 FROM events e
                WHERE ${where.join(' AND ')}
                ORDER BY ${order}
                LIMIT $${params.length}`;
  return { sql, params, limit };
}

module.exports = ({ pool, auth, institutionStatus = null, governmentGate = null }) => {
  if (typeof auth !== 'function') throw new Error('events routes exigem auth');
  const router = express.Router();
  const notFound = (res) => res.status(404).json({ error: 'Evento não encontrado' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));
  router.param('signupId', (req, res, next, id) => (
    isUuid(id) ? next() : res.status(404).json({ error: 'Inscrição não encontrada' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = store.mapEventDbError(err);
      sendError(res, mapped ?? err);
    }
  };

  // Agente e Poder Público, ou conta que age por delegação com
  // `publicar_eventos` (T29). Anota `req.effectiveRole` para a categoria do organizador.
  const requireOrganizerRole = requireEffectiveRole(institutionStatus, ORGANIZER_ROLES, {
    error: 'Publicar eventos é uma ação de Agentes de Transformação e do Poder Público',
    code: 'event_organizer_not_allowed',
  });
  const requireOrganizer = (req, res, next) => requireOrganizerRole(req, res, () => {
    if (req.institutionAccess && !hasDelegatedPermission(req.institutionAccess, 'publicar_eventos')) {
      return res.status(403).json({
        error: 'Seu vínculo com a instituição não inclui publicar eventos',
        code: 'event_organizer_not_allowed',
      });
    }
    return next();
  });
  const organizerRole = (req) => req.effectiveRole ?? roleOf(req);

  function requireSignupRole(req, res, next) {
    if (!SIGNUP_ROLES.includes(roleOf(req))) {
      return res.status(403).json({
        error: 'Inscrever-se em eventos é uma permissão de Membros da Comunidade',
        code: 'signup_not_allowed',
      });
    }
    return next();
  }

  /** Poder Público só age com o cadastro institucional validado (T04/T06a). */
  const governmentOnly = (req, res, next) => {
    if (organizerRole(req) !== 'government' || typeof governmentGate !== 'function') return next();
    return governmentGate(req, res, next);
  };

  // ── Vocabulário ───────────────────────────────────────────────────────────
  router.get('/reference', (_req, res) => {
    res.json({
      kinds: KINDS.map((value) => ({ value, label: KIND_LABELS[value] })),
      statuses: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
      pricing: PRICING.map((value) => ({ value, label: PRICING_LABELS[value] })),
      accessibility: ACCESSIBILITY.map((value) => ({ value, label: ACCESSIBILITY_LABELS[value] })),
      signupStatuses: SIGNUP_STATUSES.map((value) => ({ value, label: SIGNUP_STATUS_LABELS[value] })),
      organizerRoles: ORGANIZER_ROLES,
      signupRoles: SIGNUP_ROLES,
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  });

  // ── Agenda pública ────────────────────────────────────────────────────────
  router.get('/', handle(async (req, res) => {
    const { sql, params, limit } = agendaQuery(req.query);
    const { rows } = await pool.query(sql, params);
    const page = rows.slice(0, limit);
    res.json({
      events: page.map((row) => store.serializeEvent(row)),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
      limit,
    });
  }));

  // Agenda por território: quantos eventos próximos em cada território.
  router.get('/territories', handle(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT coalesce(nullif(btrim(e.territory), ''), nullif(btrim(e.district), '')) AS territory,
              e.municipality, e.uf,
              count(*)::int AS upcoming_count,
              min(e.starts_at) AS next_starts_at
         FROM events e
        WHERE e.status = 'publicado' AND e.ends_at >= NOW()
          AND coalesce(nullif(btrim(e.territory), ''), nullif(btrim(e.district), '')) IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY upcoming_count DESC, 1 ASC
        LIMIT 500`,
    );
    res.json({
      territories: rows.map((row) => ({
        territory: row.territory,
        municipality: row.municipality ?? null,
        uf: row.uf ?? null,
        upcomingCount: row.upcoming_count,
        nextStartsAt: row.next_starts_at instanceof Date ? row.next_starts_at.toISOString() : row.next_starts_at,
      })),
    });
  }));

  // ── Inscrições da conta ───────────────────────────────────────────────────
  router.get('/signups/mine', auth, handle(async (req, res) => {
    // Duas consultas: as colunas de `event_signups` e de `events` têm nomes em
    // comum (id, status, created_at…) e não podem sair no mesmo SELECT.
    const { rows } = await pool.query(
      `SELECT ${store.SIGNUP_SQL} FROM event_signups s
        JOIN events e ON e.id = s.event_id
        WHERE s.user_id = $1
        ORDER BY e.starts_at DESC, s.id DESC LIMIT $2`,
      [req.user.userId, MINE_MAX],
    );
    const eventIds = [...new Set(rows.map((row) => row.event_id))];
    const { rows: events } = eventIds.length
      ? await pool.query(`SELECT ${store.PUBLIC_EVENT_SQL} FROM events e WHERE e.id = ANY($1::uuid[])`, [eventIds])
      : { rows: [] };
    const byId = new Map(events.map((row) => [row.id, store.serializeEvent(row)]));
    res.json({
      signups: rows.map((row) => ({
        ...store.serializeOwnSignup(row),
        event: byId.get(row.event_id) ?? null,
      })),
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  // ── Eventos do organizador ────────────────────────────────────────────────
  router.get('/mine', auth, requireOrganizer, handle(async (req, res) => {
    const fields = {};
    const statuses = parseList(req.query.status, STATUSES, 'status', fields);
    if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
    const params = [req.user.userId];
    let filter = '';
    if (statuses) {
      params.push(statuses);
      filter = ' AND e.status = ANY($2::event_status[])';
    }
    params.push(MINE_MAX);
    const { rows } = await pool.query(
      `SELECT ${store.OWNER_EVENT_SQL} FROM events e
        WHERE e.organizer_id = $1${filter}
        ORDER BY e.starts_at DESC, e.id DESC LIMIT $${params.length}`,
      params,
    );
    res.json({ events: rows.map((row) => store.serializeEvent(row, { owner: true })) });
  }));

  router.get('/mine/:id', auth, requireOrganizer, handle(async (req, res) => {
    const row = await store.loadOwnEvent(pool, req.params.id, req.user.userId);
    res.json({
      event: store.serializeEvent(row, { owner: true }),
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  // Lista de presença: minimização (LGPD). Sem avatar, sem contato, sem id de
  // conta; o organizador marca presença pelo id da inscrição.
  router.get('/mine/:id/signups', auth, requireOrganizer, handle(async (req, res) => {
    await store.loadOwnEvent(pool, req.params.id, req.user.userId);
    const fields = {};
    const statuses = parseList(req.query.status, SIGNUP_STATUSES, 'status', fields);
    if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
    const params = [req.params.id];
    let filter = '';
    if (statuses) {
      params.push(statuses);
      filter = ' AND s.status = ANY($2::event_signup_status[])';
    }
    params.push(MAX_SIGNUPS_PAGE);
    const { rows } = await pool.query(
      `SELECT ${store.SIGNUP_SQL} FROM event_signups s
        WHERE s.event_id = $1${filter}
        ORDER BY s.status, coalesce(s.waitlist_position, 0), s.signed_up_at, s.id
        LIMIT $${params.length}`,
      params,
    );
    res.json({
      attendees: rows.map(store.serializeAttendee),
      summary: await store.signupSummary(pool, req.params.id),
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  router.put('/mine/:id/signups/:signupId/attendance', auth, requireOrganizer, handle(async (req, res) => {
    const attended = req.body?.attended;
    if (typeof attended !== 'boolean') throw validationError({ attended: 'Use verdadeiro ou falso' });
    await store.loadOwnEvent(pool, req.params.id, req.user.userId);
    const { rows } = await pool.query(
      `UPDATE event_signups SET attended = $3, attendance_by = $4
        WHERE id = $1 AND event_id = $2
        RETURNING id`,
      [req.params.signupId, req.params.id, attended, req.user.userId],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Inscrição não encontrada' });
    const { rows: updated } = await pool.query(
      `SELECT ${store.SIGNUP_SQL} FROM event_signups s WHERE s.id = $1`, [rows[0].id],
    );
    res.json({
      attendee: store.serializeAttendee(updated[0]),
      summary: await store.signupSummary(pool, req.params.id),
    });
  }));

  router.post('/', auth, requireOrganizer, governmentOnly, handle(async (req, res) => {
    const body = req.body ?? {};
    const { value, errors } = validateEvent(body);
    if (Object.keys(errors).length) throw validationError(errors);

    let demandId = null;
    if (body.demandId !== undefined && body.demandId !== null && body.demandId !== '') {
      if (!isUuid(body.demandId)) throw validationError({ demandId: 'Demanda inválida' });
      const { rows } = await pool.query(
        'SELECT id FROM demands WHERE id = $1 AND author_id = $2', [body.demandId, req.user.userId],
      );
      if (!rows.length) {
        throw validationError({ demandId: 'O evento só se vincula a uma demanda da qual você é o autor' });
      }
      demandId = rows[0].id;
    }

    let organizationId = null;
    if (institutionStatus) {
      try {
        organizationId = (await institutionStatus(req)).organizationId ?? null;
      } catch {
        organizationId = null;
      }
    }

    const columns = ['demand_id', 'organizer_id', 'organizer_name', 'organizer_avatar',
      'organizer_category', 'organizer_profile_type', 'organization_id'];
    const values = [demandId, req.user.userId, req.user.name || req.user.email || null,
      req.user.avatarUrl || null, ROLE_ORGANIZER_CATEGORY[organizerRole(req)], req.user.profileType || null,
      organizationId];
    for (const [key, column] of Object.entries(store.SCALAR_COLUMNS)) {
      if (!has(body, key) || value[key] === undefined) continue;
      columns.push(column);
      values.push(value[key]);
    }
    const placeholders = columns.map((_c, i) => `$${i + 1}`).join(', ');
    const { rows } = await pool.query(
      `INSERT INTO events (${columns.join(', ')}) VALUES (${placeholders}) RETURNING id`, values,
    );
    const row = await store.loadOwnEvent(pool, rows[0].id, req.user.userId);
    res.status(201).json({ event: store.serializeEvent(row, { owner: true }) });
  }));

  router.put('/:id', auth, requireOrganizer, governmentOnly, handle(async (req, res) => {
    const body = req.body ?? {};
    const result = await withTransaction(pool, async (client) => {
      const current = await store.loadOwnEvent(client, req.params.id, req.user.userId, { forUpdate: true });
      if (current.status === 'cancelado') {
        throw new HttpError(409, { error: 'Evento cancelado não é editado', code: 'invalid_state' });
      }
      const { value, errors } = validateEvent(body, {
        current, forPublication: current.status === 'publicado',
      });
      if (Object.keys(errors).length) throw validationError(errors);
      const changes = Object.entries(store.SCALAR_COLUMNS)
        .filter(([key]) => has(body, key) && value[key] !== undefined)
        .map(([key, column]) => [column, value[key]]);
      if (changes.length) {
        const set = changes.map(([column], i) => `${column} = $${i + 2}`).join(', ');
        await client.query(
          `UPDATE events SET ${set} WHERE id = $1`, [req.params.id, ...changes.map(([, v]) => v)],
        );
      }
      return store.loadOwnEvent(client, req.params.id, req.user.userId);
    });
    res.json({ event: store.serializeEvent(result, { owner: true }) });
  }));

  router.post('/:id/publish', auth, requireOrganizer, governmentOnly, handle(async (req, res) => {
    const result = await withTransaction(pool, async (client) => {
      const current = await store.loadOwnEvent(client, req.params.id, req.user.userId, { forUpdate: true });
      if (current.status === 'publicado') return current;
      if (current.status !== 'rascunho') {
        throw new HttpError(409, { error: 'Só um rascunho é publicado', code: 'invalid_state', status: current.status });
      }
      const { errors } = validateEvent({}, { current, forPublication: true });
      if (Object.keys(errors).length) {
        throw validationError(errors, 'Complete o evento antes de publicar', { code: 'event_incomplete' });
      }
      await client.query("UPDATE events SET status = 'publicado' WHERE id = $1", [req.params.id]);
      return store.loadOwnEvent(client, req.params.id, req.user.userId);
    });
    res.json({
      event: store.serializeEvent(result, { owner: true }),
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  router.post('/:id/cancel', auth, requireOrganizer, handle(async (req, res) => {
    const { value, errors } = validateCancellation(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const result = await withTransaction(pool, async (client) => {
      const current = await store.loadOwnEvent(client, req.params.id, req.user.userId, { forUpdate: true });
      if (current.status === 'cancelado') return current;
      await client.query(
        "UPDATE events SET status = 'cancelado', cancel_reason = $2 WHERE id = $1",
        [req.params.id, value.reason],
      );
      return store.loadOwnEvent(client, req.params.id, req.user.userId);
    });
    res.json({ event: store.serializeEvent(result, { owner: true }) });
  }));

  // ── Evento público ────────────────────────────────────────────────────────
  router.get('/:id', handle(async (req, res) => {
    const row = await store.loadEvent(pool, req.params.id, { statuses: PUBLIC_STATUSES });
    res.json({
      event: store.serializeEvent(row),
      signups: await store.signupSummary(pool, req.params.id),
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  router.get('/:id/signups/summary', handle(async (req, res) => {
    await store.loadEvent(pool, req.params.id, { statuses: PUBLIC_STATUSES });
    res.json(await store.signupSummary(pool, req.params.id));
  }));

  router.get('/:id/signups/mine', auth, handle(async (req, res) => {
    const event = await store.loadEvent(pool, req.params.id, { statuses: PUBLIC_STATUSES });
    const signup = await store.loadOpenSignup(pool, req.params.id, req.user.userId);
    const summary = await store.signupSummary(pool, req.params.id);
    const open = event.status === 'publicado' && new Date(event.ends_at).getTime() > Date.now();
    res.json({
      signup: store.serializeOwnSignup(signup),
      summary,
      canSignUp: open && SIGNUP_ROLES.includes(roleOf(req)) && event.organizer_id !== req.user.userId
        && !signup && (!summary.full || summary.waitlistEnabled === true),
      allowed: SIGNUP_ROLES.includes(roleOf(req)),
      isOrganizer: event.organizer_id === req.user.userId,
      open,
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  router.post('/:id/signups', auth, requireSignupRole, handle(async (req, res) => {
    const { value, errors } = validateSignup(req.body ?? {});
    if (Object.keys(errors).length) throw validationError(errors);
    const event = await store.loadEvent(pool, req.params.id, { statuses: PUBLIC_STATUSES });
    if (event.status !== 'publicado') {
      throw new HttpError(409, { error: 'Este evento foi cancelado', code: 'event_closed' });
    }
    const { rows } = await pool.query(
      `INSERT INTO event_signups (event_id, user_id, user_name, user_avatar, user_category, profile_type, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [req.params.id, req.user.userId, req.user.name || req.user.email || null, req.user.avatarUrl || null,
        ROLE_CATEGORY[roleOf(req)], req.user.profileType || null, value.note],
    );
    const signup = await store.loadOpenSignup(pool, req.params.id, req.user.userId);
    res.status(201).json({
      signup: store.serializeOwnSignup(signup ?? { id: rows[0].id, event_id: req.params.id, status: 'inscrito' }),
      summary: await store.signupSummary(pool, req.params.id),
      emailNotifications: EMAIL_NOTIFICATIONS,
    });
  }));

  router.post('/:id/signups/cancel', auth, handle(async (req, res) => {
    const signup = await store.loadOpenSignup(pool, req.params.id, req.user.userId);
    if (!signup) throw new HttpError(404, { error: 'Inscrição não encontrada' });
    await pool.query("UPDATE event_signups SET status = 'cancelado' WHERE id = $1", [signup.id]);
    const { rows } = await pool.query(`SELECT ${store.SIGNUP_SQL} FROM event_signups s WHERE s.id = $1`, [signup.id]);
    res.json({
      signup: store.serializeOwnSignup(rows[0]),
      summary: await store.signupSummary(pool, req.params.id),
    });
  }));

  return router;
};

module.exports.agendaQuery = agendaQuery;
