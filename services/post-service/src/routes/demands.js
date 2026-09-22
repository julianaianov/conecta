// API REST da demanda (T07). Montada em `/demands` no post-service, que o
// Caddy expõe em `/api/posts/demands` (handle_path /api/posts/* tira o prefixo).
//
// Contrato (JSON em camelCase, o mesmo formato de src/demand/validation.js):
//
// Público (sem login; só demandas da publicação em diante, fora `arquivada`):
//   GET  /                         lista (filtros e paginação keyset)
//   GET  /:id                      detalhe público (sem endereço fino, sem
//                                  dados da análise, documentos sem link)
//   GET  /:id/timeline             linha do tempo pública (demand_events.is_public;
//                                  eventos institucionais, de encaminhamento e
//                                  de interesse/conexão com `details`, T13–T15)
//
// Agente de Transformação autor (token; 404 para quem não é o autor):
//   GET  /mine                     as próprias demandas, em qualquer estado
//   GET  /mine/:id                 visão completa + ações disponíveis
//   GET  /mine/:id/events          linha do tempo completa (inclui privados)
//   GET  /mine/:id/review          parecer da devolução e histórico de devoluções
//   POST /composition/preview      composição 4%/6% de itens ainda não gravados
//   POST /                         cria rascunho (em_analise/rascunho)
//   PUT  /:id                      edita campos (só rascunho/devolvida)
//   POST|PUT|DELETE /:id/{budget-items|schedule-items|goals|resources|documents}[/:itemId]
//   POST /:id/validate             validação completa de envio, erros por campo
//   POST /:id/submit               envia para análise (instituição validada)
//   POST /:id/transitions          { action }: buscar_parceiro, conectar,
//                                  iniciar_execucao, concluir, prestar_contas
//
// Interesse, conexão e oportunidades de apoio (T15): src/routes/interests.js,
// montada antes desta.
//
// Dossiê da Demanda (T10): rotas em src/routes/dossiers.js; o envio pede a
// geração sem esperar (src/dossier/service.js).
//
// Arquivos (T08): `photoRef` e `documents[].reference` aceitam `upload:<id>`
// de upload confirmado desta demanda (rotas em /uploads, src/uploads.js); a
// visão do autor traz URL de leitura curta (`photoFile`, `documents[].file`),
// a pública, `photoUrl` estável (/api/posts/uploads/<id>/content).
//
// Erros: 422 `{ error, code, fields }` (fields: campo → mensagem), 403
// `institution_not_validated` / `demand_author_not_agent`, 409 estado inválido
// (`demand_not_editable`, `invalid_transition`, `invalid_state`), 404.
//
// Rascunho não exige instituição validada (o Agente prepara a demanda enquanto
// o cadastro está em análise); enviar e mover o status depois da publicação,
// sim (requireValidatedAgent, T06a). Tudo que escreve roda em transação com a
// demanda travada (FOR UPDATE); o trigger demands_guard repete as regras.

const express = require('express');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const {
  CATEGORIES, PRIORITIES, PUBLIC_STATUSES, STATUSES,
} = require('../demand/constants');
const { validateDemand, MAX_ITEMS } = require('../demand/validation');
const {
  compositionFromItems, computeComposition, lineTotalCents, MAX_BUDGET_CENTS,
} = require('../demand/finance');
const store = require('../demand/store');
const { INSTITUTIONAL_EVENT_TYPES } = require('../institutional/constants');
const { FORWARDING_EVENT_TYPES } = require('../institutional/forwardings');
const { INTEREST_EVENT_TYPES } = require('../interest/constants');

// Eventos com payload->'public' exposto como `details` (T13, encaminhamentos da
// T14 e interesse/conexão da T15).
const DETAILED_EVENT_TYPES = [...INSTITUTIONAL_EVENT_TYPES, ...FORWARDING_EVENT_TYPES, ...INTEREST_EVENT_TYPES];
const { assertDemandUpload, attachOwnerUploads } = require('../upload-policy');
const { parseUploadRef, describeUploads } = require('../uploads');

const { HttpError, withTransaction, sendError } = store;

const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
// published_at::text (ex.: 2026-09-22 13:04:05.123456+00).
const CURSOR_TS_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?([+-]\d{2}(:?\d{2})?|Z)?$/;

// Sub-recursos: caminho → chave de validation.js, tabela e colunas gravadas.
const ITEM_KINDS = {
  'budget-items': {
    key: 'budgetItems',
    table: 'demand_budget_items',
    affectsBudget: true,
    columns: (v) => ({
      description: v.description,
      quantity: String(v.quantity),
      unit: v.unit,
      unit_price_cents: v.unitPriceCents,
      total_cents: v.totalCents,
      is_audiovisual_record: v.isAudiovisualRecord,
      schedule_item_id: v.scheduleItemId,
    }),
  },
  'schedule-items': {
    key: 'scheduleItems',
    table: 'demand_schedule_items',
    columns: (v) => ({
      stage: v.stage,
      activities: v.activities,
      starts_on: v.startsOn,
      ends_on: v.endsOn,
      responsible: v.responsible,
      record_milestones: v.recordMilestones,
    }),
  },
  goals: {
    key: 'goals',
    table: 'demand_goals',
    columns: (v) => ({
      goal: v.goal,
      expected_result: v.expectedResult,
      indicator: v.indicator,
      measurement_method: v.measurementMethod,
    }),
  },
  resources: {
    key: 'resources',
    table: 'demand_resources',
    columns: (v) => ({ kind: v.kind, resource_type: v.type, description: v.description }),
  },
  documents: {
    key: 'documents',
    table: 'demand_documents',
    columns: (v) => ({
      document_type: v.type,
      title: v.title,
      reference: v.reference,
      description: v.description,
    }),
  },
};

const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function validationError(fields, error = 'Confira os campos destacados', extra = {}) {
  return new HttpError(422, { error, code: 'validation_failed', fields, ...extra });
}

/** Campos escalares presentes no corpo, validados (formato de rascunho). */
function scalarChanges(body) {
  const present = Object.keys(store.SCALAR_COLUMNS).filter((key) => has(body, key));
  const input = Object.fromEntries(present.map((key) => [key, body[key]]));
  const { value, errors } = validateDemand(input);
  if (Object.keys(errors).length) throw validationError(errors);
  return present.map((key) => [store.SCALAR_COLUMNS[key], value[key]]);
}

/** Valida um item isolado com as regras de validation.js (sem o prefixo da lista). */
function validateItem(kind, raw) {
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {};
  let scheduleItemId = null;
  const fields = {};
  if (kind.key === 'budgetItems') {
    // O vínculo com a etapa é conferido no banco (etapa da mesma demanda).
    scheduleItemId = body.scheduleItemId ?? null;
    delete body.scheduleItemId;
    if (scheduleItemId !== null && scheduleItemId !== '' && !isUuid(scheduleItemId)) {
      fields.scheduleItemId = 'A etapa vinculada não faz parte do cronograma desta demanda';
    }
    if (scheduleItemId === '') scheduleItemId = null;
  }
  const { value, errors } = validateDemand({ [kind.key]: [body] });
  const prefix = `${kind.key}[0].`;
  for (const [key, message] of Object.entries(errors)) {
    fields[key.startsWith(prefix) ? key.slice(prefix.length) : key] = message;
  }
  let position = null;
  if (body.position !== undefined && body.position !== null) {
    if (!Number.isSafeInteger(body.position) || body.position < 0 || body.position > 100_000) {
      fields.position = 'Posição inválida';
    } else {
      position = body.position;
    }
  }
  if (Object.keys(fields).length) throw validationError(fields);
  const item = value[kind.key][0];
  if (kind.key === 'budgetItems') item.scheduleItemId = scheduleItemId;
  return { item, position };
}

function requireAgent(req, res, next) {
  if (normalizeRole(req.user?.role, req.user?.profileType) !== 'agent') {
    return res.status(403).json({
      error: 'Só Agentes de Transformação publicam demandas',
      code: 'demand_author_not_agent',
    });
  }
  return next();
}

/** Lista separada por vírgula, cada valor dentro de `allowed`. */
function parseList(raw, allowed, field, fields) {
  if (raw === undefined || raw === '') return null;
  const values = String(raw).split(',').map((v) => v.trim()).filter(Boolean);
  if (!values.length || values.some((v) => !allowed.includes(v))) {
    fields[field] = `Valores aceitos: ${allowed.join(', ')}`;
    return null;
  }
  return [...new Set(values)];
}

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

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

/** Filtros da lista pública → WHERE parametrizado. */
function publicListQuery(query) {
  const fields = {};
  const params = [];
  const where = ['d.status = ANY($1::demand_status[])'];
  const statuses = parseList(query.status, PUBLIC_STATUSES, 'status', fields);
  params.push(statuses ?? PUBLIC_STATUSES);

  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  const categories = parseList(query.category, CATEGORIES, 'category', fields);
  if (categories) add('d.category = ANY(?::demand_category[])', categories);
  const priorities = parseList(query.priority, PRIORITIES, 'priority', fields);
  if (priorities) add('d.priority = ANY(?::demand_priority[])', priorities);

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

  // bbox=oeste,sul,leste,norte (longitude/latitude, ordem do GeoJSON).
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
  const sql = `SELECT ${store.PUBLIC_SUMMARY_SQL}
                 FROM demands d
                WHERE ${where.join(' AND ')}
                ORDER BY d.published_at DESC, d.id DESC
                LIMIT $${params.length}`;
  return { sql, params, limit };
}

module.exports = ({ pool, auth, validatedAgent, uploadStorage = null, dossiers = null }) => {
  if (typeof auth !== 'function' || typeof validatedAgent !== 'function') {
    throw new Error('demands routes exigem auth e requireValidatedAgent');
  }
  const router = express.Router();

  /** Visão do autor, com URL de leitura curta dos arquivos enviados (T08). */
  async function ownerView(db, demandId, userId) {
    const row = await store.loadOwnDemand(db, demandId, userId);
    const items = await store.loadItems(db, demandId);
    return attachOwnerUploads(db, uploadStorage, store.serializeOwnerDemand(row, items));
  }

  /** Referência de upload no corpo: confirmada, do autor e desta demanda. */
  const checkPhoto = (db, req, changes, demandId) => {
    const photo = changes.find(([col]) => col === 'photo_ref');
    return photo && assertDemandUpload(db, {
      ref: photo[1], ownerId: req.user.userId, demandId, purpose: 'demand_photo', field: 'photoRef',
    });
  };

  const notFound = (res) => res.status(404).json({ error: 'Demanda não encontrada' });
  router.param('id', (req, res, next, id) => (isUuid(id) ? next() : notFound(res)));
  router.param('itemId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Item não encontrado' })));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };

  // ── Agente autor: leitura ─────────────────────────────────────────────────
  router.get('/mine', auth, requireAgent, handle(async (req, res) => {
    const params = [req.user.userId];
    let filter = '';
    if (req.query.status !== undefined && req.query.status !== '') {
      const fields = {};
      const statuses = parseList(req.query.status, STATUSES, 'status', fields);
      if (!statuses) throw validationError(fields, 'Filtro inválido');
      params.push(statuses);
      filter = ' AND d.status = ANY($2::demand_status[])';
    }
    const { rows } = await pool.query(
      `SELECT ${store.OWNER_DEMAND_SQL} FROM demands d
        WHERE d.author_id = $1${filter}
        ORDER BY d.created_at DESC, d.id DESC LIMIT 200`,
      params,
    );
    const demands = rows.map((row) => store.serializeOwnerDemand(row));
    const photoIds = demands.map((d) => parseUploadRef(d.photoRef)).filter(Boolean);
    if (photoIds.length) {
      const files = await describeUploads(pool, uploadStorage, photoIds, 'demand_id');
      for (const demand of demands) {
        const id = parseUploadRef(demand.photoRef);
        if (id) demand.photoUrl = files.get(id)?.url ?? null;
      }
    }
    res.json({ demands });
  }));

  router.get('/mine/:id', auth, requireAgent, handle(async (req, res) => {
    res.json(await ownerView(pool, req.params.id, req.user.userId));
  }));

  router.get('/mine/:id/events', auth, requireAgent, handle(async (req, res) => {
    await store.loadOwnDemand(pool, req.params.id, req.user.userId);
    const { rows } = await pool.query(
      `SELECT id, event_type, from_status, to_status, review_state, actor_type, note, payload, is_public, created_at
         FROM demand_events WHERE demand_id = $1 ORDER BY created_at, id`,
      [req.params.id],
    );
    res.json({
      events: rows.map((e) => ({
        id: e.id,
        type: e.event_type,
        fromStatus: e.from_status ?? null,
        toStatus: e.to_status ?? null,
        reviewState: e.review_state ?? null,
        actorType: e.actor_type,
        note: e.note ?? null,
        payload: e.payload ?? {},
        isPublic: e.is_public,
        createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
      })),
    });
  }));

  router.get('/mine/:id/review', auth, requireAgent, handle(async (req, res) => {
    const row = await store.loadOwnDemand(pool, req.params.id, req.user.userId);
    const { rows } = await pool.query(
      `SELECT note, created_at FROM demand_events
        WHERE demand_id = $1 AND event_type = 'devolvida_para_ajustes'
        ORDER BY created_at DESC, id DESC`,
      [req.params.id],
    );
    res.json({
      status: row.status,
      reviewState: row.review_state,
      // Pendência atual: o parecer só vale enquanto a demanda está devolvida.
      reviewNote: row.review_state === 'devolvida' ? row.review_note ?? null : null,
      reviewedAt: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at ?? null,
      submittedAt: row.submitted_at instanceof Date ? row.submitted_at.toISOString() : row.submitted_at ?? null,
      returns: rows.map((e) => ({
        note: e.note ?? null,
        createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
      })),
    });
  }));

  // Composição de itens ainda não gravados (planilha do assistente).
  router.post('/composition/preview', auth, requireAgent, handle(async (req, res) => {
    const body = req.body ?? {};
    if (has(body, 'budgetAmountCents')) {
      const base = body.budgetAmountCents;
      if (!Number.isSafeInteger(base) || base < 0 || base > MAX_BUDGET_CENTS) {
        throw validationError({ budgetAmountCents: 'Valor em centavos inteiros, não negativo, dentro do limite da plataforma' });
      }
      return res.json({ items: [], composition: computeComposition(base) });
    }
    const { value, errors } = validateDemand({ budgetItems: body.budgetItems ?? [] });
    // O vínculo com a etapa não importa aqui.
    for (const key of Object.keys(errors)) if (key.endsWith('.scheduleItemId')) delete errors[key];
    if (Object.keys(errors).length) throw validationError(errors);
    const items = value.budgetItems.map((item) => ({ totalCents: lineTotalCents(item.quantity, item.unitPriceCents) }));
    res.json({ items, composition: compositionFromItems(value.budgetItems) });
  }));

  // ── Agente autor: rascunho ────────────────────────────────────────────────
  router.post('/', auth, requireAgent, handle(async (req, res) => {
    const changes = scalarChanges(req.body ?? {});
    const columns = ['author_id', 'author_name', 'author_avatar', ...changes.map(([col]) => col)];
    const values = [
      req.user.userId,
      req.user.name || req.user.email || null,
      req.user.avatarUrl || null,
      ...changes.map(([, value]) => value),
    ];
    const created = await withTransaction(pool, async (client) => {
      // Sem demanda ainda, não há upload vinculado: a foto entra depois do rascunho.
      await checkPhoto(client, req, changes, null);
      const { rows } = await client.query(
        `INSERT INTO demands (${columns.join(', ')})
         VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
        values,
      );
      return ownerView(client, rows[0].id, req.user.userId);
    });
    res.status(201).json(created);
  }));

  router.put('/:id', auth, requireAgent, handle(async (req, res) => {
    const changes = scalarChanges(req.body ?? {});
    const updated = await withTransaction(pool, async (client) => {
      const row = await store.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      store.assertEditable(row);
      await checkPhoto(client, req, changes, req.params.id);
      if (changes.length) {
        await client.query(
          `UPDATE demands SET ${changes.map(([col], i) => `${col} = $${i + 2}`).join(', ')} WHERE id = $1`,
          [req.params.id, ...changes.map(([, value]) => value)],
        );
      }
      return ownerView(client, req.params.id, req.user.userId);
    });
    res.json(updated);
  }));

  // ── Itens (orçamento, cronograma, metas, recursos, documentos) ────────────
  for (const [path, kind] of Object.entries(ITEM_KINDS)) {
    const itemResponse = async (client, demandId, itemId) => {
      const { rows } = await client.query(store.ITEM_SQL[kind.key], [demandId]);
      const row = rows.find((r) => r.id === itemId);
      const { rows: [demand] } = await client.query(
        `SELECT budget_amount_cents, agent_fee_bps, platform_fee_bps, agent_fee_cents,
                platform_fee_cents, total_amount_cents FROM demands WHERE id = $1`,
        [demandId],
      );
      const item = row ? store.ITEM_SERIALIZERS[kind.key](row, { isPublic: false }) : null;
      if (item && kind.key === 'documents') await attachOwnerUploads(client, uploadStorage, { documents: [item] });
      return { item, composition: store.serializeComposition(demand) };
    };

    const checkScheduleLink = async (client, demandId, item) => {
      if (kind.key !== 'budgetItems' || !item.scheduleItemId) return;
      const { rows } = await client.query(
        'SELECT 1 FROM demand_schedule_items WHERE id = $1 AND demand_id = $2',
        [item.scheduleItemId, demandId],
      );
      if (!rows.length) {
        throw validationError({ scheduleItemId: 'A etapa vinculada não faz parte do cronograma desta demanda' });
      }
    };

    const checkDocument = (client, req, item) => kind.key === 'documents' && assertDemandUpload(client, {
      ref: item.reference, ownerId: req.user.userId, demandId: req.params.id, purpose: 'demand_document', field: 'reference',
    });

    const writeGuard = async (client, req) => {
      const row = await store.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      store.assertEditable(row);
      return row;
    };

    const duplicate = (err) => {
      if (err?.code === '23505' && kind.key === 'resources') {
        throw validationError({ type: 'Recurso repetido' });
      }
      throw err;
    };

    router.post(`/:id/${path}`, auth, requireAgent, handle(async (req, res) => {
      const { item, position } = validateItem(kind, req.body);
      const result = await withTransaction(pool, async (client) => {
        await writeGuard(client, req);
        await checkDocument(client, req, item);
        const { rows: [count] } = await client.query(
          `SELECT count(*)::int AS n FROM ${kind.table} WHERE demand_id = $1`, [req.params.id],
        );
        if (count.n >= MAX_ITEMS) throw validationError({ [kind.key]: `No máximo ${MAX_ITEMS} itens` });
        await checkScheduleLink(client, req.params.id, item);
        const cols = Object.entries(kind.columns(item));
        const { rows } = await client.query(
          `INSERT INTO ${kind.table} (demand_id, position, ${cols.map(([c]) => c).join(', ')})
           VALUES ($1, coalesce($2, (SELECT coalesce(max(position) + 1, 0) FROM ${kind.table} WHERE demand_id = $1)),
                   ${cols.map((_, i) => `$${i + 3}`).join(', ')})
           RETURNING id`,
          [req.params.id, position, ...cols.map(([, v]) => v)],
        ).catch(duplicate);
        if (kind.affectsBudget) await store.recomputeComposition(client, req.params.id);
        return itemResponse(client, req.params.id, rows[0].id);
      });
      res.status(201).json(result);
    }));

    router.put(`/:id/${path}/:itemId`, auth, requireAgent, handle(async (req, res) => {
      const { item, position } = validateItem(kind, req.body);
      const result = await withTransaction(pool, async (client) => {
        await writeGuard(client, req);
        await checkDocument(client, req, item);
        await checkScheduleLink(client, req.params.id, item);
        const cols = Object.entries(kind.columns(item));
        const { rows } = await client.query(
          `UPDATE ${kind.table}
              SET ${cols.map(([c], i) => `${c} = $${i + 4}`).join(', ')}, position = coalesce($3, position)
            WHERE id = $2 AND demand_id = $1
            RETURNING id`,
          [req.params.id, req.params.itemId, position, ...cols.map(([, v]) => v)],
        ).catch(duplicate);
        if (!rows.length) throw new HttpError(404, { error: 'Item não encontrado' });
        if (kind.affectsBudget) await store.recomputeComposition(client, req.params.id);
        return itemResponse(client, req.params.id, rows[0].id);
      });
      res.json(result);
    }));

    router.delete(`/:id/${path}/:itemId`, auth, requireAgent, handle(async (req, res) => {
      const result = await withTransaction(pool, async (client) => {
        await writeGuard(client, req);
        const { rows } = await client.query(
          `DELETE FROM ${kind.table} WHERE id = $2 AND demand_id = $1 RETURNING id`,
          [req.params.id, req.params.itemId],
        );
        if (!rows.length) throw new HttpError(404, { error: 'Item não encontrado' });
        if (kind.affectsBudget) await store.recomputeComposition(client, req.params.id);
        const { composition } = await itemResponse(client, req.params.id, null);
        return { deleted: rows[0].id, composition };
      });
      res.json(result);
    }));
  }

  // ── Validação, envio e transições ─────────────────────────────────────────
  router.post('/:id/validate', auth, requireAgent, handle(async (req, res) => {
    const row = await store.loadOwnDemand(pool, req.params.id, req.user.userId);
    const items = await store.loadItems(pool, req.params.id);
    const { errors, warnings, composition } = validateDemand(store.toValidationInput(row, items), { forSubmission: true });
    res.json({ valid: Object.keys(errors).length === 0, fields: errors, warnings, composition });
  }));

  router.post('/:id/submit', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const submitted = await withTransaction(pool, async (client) => {
      const row = await store.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      store.assertEditable(row);
      const items = await store.loadItems(client, req.params.id);
      const { errors, warnings } = validateDemand(store.toValidationInput(row, items), { forSubmission: true });
      if (Object.keys(errors).length) {
        throw new HttpError(422, {
          error: 'A demanda ainda não pode ser enviada: complete os campos destacados',
          code: 'demand_incomplete',
          fields: errors,
          warnings,
        });
      }
      // Composição gravada = itens atuais (o trigger confere a soma no envio).
      await store.recomputeComposition(client, req.params.id);
      await client.query(
        `UPDATE demands
            SET organization_id = $2, author_name = coalesce($3, author_name),
                author_avatar = coalesce($4, author_avatar), review_state = 'aguardando_analise'
          WHERE id = $1`,
        [req.params.id, req.demandAuthor.organizationId, req.user.name || null, req.user.avatarUrl || null],
      );
      return ownerView(client, req.params.id, req.user.userId);
    });
    res.json(submitted);
    // Dossiê da Demanda (T10): gerado depois da resposta; falha não afeta o envio.
    if (dossiers) void dossiers.request(req.params.id);
  }));

  router.post('/:id/transitions', auth, requireAgent, validatedAgent, handle(async (req, res) => {
    const action = typeof req.body?.action === 'string' ? req.body.action : '';
    if (!action) throw validationError({ action: 'Informe a ação' });
    const updated = await withTransaction(pool, async (client) => {
      const row = await store.loadOwnDemand(client, req.params.id, req.user.userId, { forUpdate: true });
      await store.transitionDemand(client, row, action, { actor: 'agente' });
      return ownerView(client, req.params.id, req.user.userId);
    });
    res.json(updated);
  }));

  // ── Público ───────────────────────────────────────────────────────────────
  router.get('/', handle(async (req, res) => {
    const { sql, params, limit } = publicListQuery(req.query);
    const { rows } = await pool.query(sql, params);
    const page = rows.slice(0, limit);
    res.json({
      demands: page.map(store.serializePublicSummary),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
    });
  }));

  router.get('/:id', handle(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${store.PUBLIC_DEMAND_SQL} FROM demands d
        WHERE d.id = $1 AND d.status = ANY($2::demand_status[])`,
      [req.params.id, PUBLIC_STATUSES],
    );
    if (!rows.length) return notFound(res);
    const items = await store.loadItems(pool, req.params.id);
    res.json(store.serializePublicDemand(rows[0], items));
  }));

  router.get('/:id/timeline', handle(async (req, res) => {
    const { rows: found } = await pool.query(
      'SELECT 1 FROM demands WHERE id = $1 AND status = ANY($2::demand_status[])',
      [req.params.id, PUBLIC_STATUSES],
    );
    if (!found.length) return notFound(res);
    // Projeção pública: sem ator (nome da equipe ou id do autor), sem nota e sem
    // payload. Nos eventos da atuação institucional (T13), só payload->'public'
    // (órgão, tipo da resposta, status institucional), gravado para isso pelos
    // triggers da migração 010.
    const { rows } = await pool.query(
      `SELECT id, event_type, from_status, to_status, created_at,
              CASE WHEN event_type = ANY($2::text[]) THEN payload->'public' END AS details
         FROM demand_events WHERE demand_id = $1 AND is_public ORDER BY created_at, id`,
      [req.params.id, DETAILED_EVENT_TYPES],
    );
    res.json({
      events: rows.map((e) => ({
        id: e.id,
        type: e.event_type,
        fromStatus: e.from_status ?? null,
        toStatus: e.to_status ?? null,
        createdAt: e.created_at instanceof Date ? e.created_at.toISOString() : e.created_at,
        ...(e.details && typeof e.details === 'object' ? { details: e.details } : {}),
      })),
    });
  }));

  return router;
};

module.exports.ITEM_KINDS = ITEM_KINDS;
// Filtros e cursor da lista pública, reusados pela lista do Poder Público (T13).
module.exports.listHelpers = {
  parseList, likePattern, encodeCursor, decodeCursor, validationError, PAGE_DEFAULT, PAGE_MAX,
};
