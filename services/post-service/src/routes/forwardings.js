// Encaminhamentos da demanda (T14), registrados no router da atuação
// institucional (routes/institutional.js), com o mesmo gate do Poder Público
// validado. Fonte: 03-fluxo-cadastro-poder-publico.html, etapa 06 (slide 11).
//
//   GET  /institutional/organizations              diretório de órgãos validados para o destino
//                                                  (q, sphere, municipality, uf; sem o próprio órgão)
//   POST /institutional/demands/:id/forwardings    encaminha a demanda { destinationKind,
//                                                  destinationOrganizationId | destinationOrganizationName,
//                                                  destinationSector, destinationSphere,
//                                                  destinationMunicipality, destinationUf, reason,
//                                                  responsibleName, responsibleRole, trackStatus?,
//                                                  dueDays? | dueOn? } (prazo do §13: envio + N dias)
//   GET  /institutional/forwardings                 caixa do órgão: direction=recebidos|enviados, status
//   GET  /institutional/forwardings/:fid            um encaminhamento com a tramitação
//   POST /institutional/forwardings/:fid/status     { status: recebido|aceito|devolvido, note }
//   POST /institutional/forwardings/:fid/updates    { kind: providencia|atualizacao, body }
//
// Ao encaminhar (uma transação): o acompanhamento de origem vai para
// `encaminhada` (setor interno) ou `encaminhada_ao_orgao_responsavel` (outro
// órgão), salvo `trackStatus`; o órgão de destino na plataforma tem o
// acompanhamento aberto como `recebida`; o encaminhamento é gravado; a resposta
// institucional `encaminhamento_realizado` é registrada. Os triggers da
// migração 011 gravam a linha do tempo pública e o histórico de tramitação.
//
// Status: na plataforma, quem responde é o órgão de destino; para setor
// interno ou órgão externo, a própria origem registra o retorno. Providências
// e atualizações: os dois órgãos envolvidos.

const { isUuid } = require('../security');
const { PUBLIC_STATUSES } = require('../demand/constants');
const demandStore = require('../demand/store');
const { listHelpers } = require('./demands');
const {
  DESTINATION_KIND_LABELS, FORWARDING_STATUSES, FORWARDING_DIRECTIONS, INSTITUTIONAL_STATUS_LABELS,
  checkTransition, checkForwardingTransition, validateForwarding, validateForwardingStatus, validateForwardingUpdate,
} = require('../institutional');
const forwardingStore = require('../institutional/forwarding-store');
const { saoPauloDay } = require('../process/deadlines');

const { HttpError, withTransaction } = demandStore;
const { parseList, validationError } = listHelpers;

const authorName = (user) => user.name || user.email || null;

/** Rótulo do destino (resposta institucional e nota do status). */
function destinationLabel({ destinationKind, organizationName, destinationSector }) {
  if (destinationKind === 'setor_interno') return destinationSector;
  return destinationSector ? `${organizationName} — ${destinationSector}` : organizationName;
}

/**
 * @param router express.Router da atuação institucional
 * @param ctx { pool, store, gov, handle, profileOf, withTrack, changeStatus, governmentDirectory }
 */
function registerForwardingRoutes(router, ctx) {
  const { pool, store, gov, handle, profileOf, withTrack, changeStatus, governmentDirectory } = ctx;

  router.param('fid', (req, res, next, fid) => (isUuid(fid)
    ? next()
    : res.status(404).json({ error: 'Encaminhamento não encontrado' })));

  async function directoryCall(fn) {
    if (!governmentDirectory) {
      throw new HttpError(503, { error: 'Diretório de órgãos indisponível', code: 'directory_unavailable' });
    }
    try {
      return await fn(governmentDirectory);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error(`[forwardings] ${err.message}`);
      throw new HttpError(503, { error: 'Não foi possível consultar os órgãos do Poder Público agora', code: 'directory_unavailable' });
    }
  }

  /** Encaminhamento com a tramitação, na visão do órgão, e a demanda (resumo público). */
  async function forwardingView(db, forwardingId, organizationId) {
    const row = await forwardingStore.loadForwardingFor(db, forwardingId, organizationId);
    const updates = await forwardingStore.loadUpdates(db, [row.id]);
    const { rows: demands } = await db.query(
      `SELECT ${demandStore.PUBLIC_SUMMARY_SQL} FROM demands d WHERE d.id = $1`, [row.demand_id],
    );
    return {
      forwarding: forwardingStore.serializeForwarding(row, updates.get(row.id), { viewerOrganizationId: organizationId }),
      demand: demands[0] ? demandStore.serializePublicSummary(demands[0]) : null,
    };
  }

  // ── Diretório para escolher o destino ────────────────────────────────────
  router.get('/institutional/organizations', ...gov, handle(async (req, res) => {
    const fields = {};
    const text = (key, max) => {
      const value = typeof req.query[key] === 'string' ? req.query[key].trim() : '';
      if (value.length > max) fields[key] = `Use no máximo ${max} caracteres`;
      return value;
    };
    const filters = {
      q: text('q', 120), sphere: text('sphere', 20), municipality: text('municipality', 120), uf: text('uf', 2),
    };
    if (filters.sphere && !['municipal', 'estadual', 'federal'].includes(filters.sphere)) fields.sphere = 'Esfera inválida';
    if (filters.uf && !/^[A-Za-z]{2}$/.test(filters.uf)) fields.uf = 'UF inválida';
    if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
    const found = await directoryCall((dir) => dir.search(req, { ...filters, uf: filters.uf.toUpperCase(), limit: 21 }));
    res.json({
      organizations: found.filter((o) => o.organizationId !== req.government.organizationId).slice(0, 20),
    });
  }));

  // ── Encaminhar ───────────────────────────────────────────────────────────
  router.post('/institutional/demands/:id/forwardings', ...gov, handle(async (req, res) => {
    const { value, errors } = validateForwarding(req.body);
    if (value.dueOn && value.dueOn < saoPauloDay()) errors.dueOn = 'A data limite não pode ser antes de hoje';
    if (Object.keys(errors).length) throw validationError(errors);
    const organizationId = req.government.organizationId;
    if (value.destinationOrganizationId === organizationId) {
      throw validationError({ destinationOrganizationId: 'Escolha outro órgão: para o próprio órgão, use setor interno' });
    }
    const profile = await profileOf(req);
    let destination = null;
    if (value.destinationKind === 'orgao_plataforma') {
      destination = await directoryCall((dir) => dir.byId(req, value.destinationOrganizationId));
      if (!destination) {
        throw validationError({ destinationOrganizationId: 'Órgão não encontrado entre os órgãos validados na plataforma' });
      }
    }

    let createdId = null;
    const { view } = await withTrack(req, profile, async (client, track) => {
      const organizationName = destination?.name ?? value.destinationOrganizationName ?? track.organization_name;
      const label = destinationLabel({ ...value, organizationName });

      // 1. Status institucional da origem (a máquina de estados decide).
      if (track.status !== value.trackStatus) {
        const note = `Encaminhada a ${label}. ${value.reason}`.slice(0, 2000);
        const check = checkTransition(track.status, value.trackStatus, note);
        if (!check.ok) {
          throw new HttpError(409, {
            error: `Não é possível encaminhar com o acompanhamento em "${INSTITUTIONAL_STATUS_LABELS[track.status]}": ${check.error}`,
            code: 'invalid_transition',
          });
        }
        await changeStatus(client, track, value.trackStatus, note, req.user.userId);
      }

      // 2. Acompanhamento do órgão de destino, aberto como Recebida se preciso.
      let destinationTrackId = null;
      if (destination) {
        const opened = await store.ensureTrack(client, {
          demandId: track.demand_id,
          organizationId: destination.organizationId,
          profile: destination,
          user: { userId: req.user.userId, name: `Encaminhamento de ${track.organization_name}`.slice(0, 255) },
        });
        destinationTrackId = opened.row.id;
      }

      // 3. O encaminhamento (o trigger grava a linha do tempo).
      const { rows } = await client.query(
        `INSERT INTO demand_forwardings
           (track_id, demand_id, organization_id, origin_organization_name, destination_kind,
            destination_organization_id, destination_track_id, destination_organization_name, destination_sector,
            destination_sphere, destination_municipality, destination_uf, reason, forwarded_by, forwarded_by_name,
            responsible_name, responsible_role, due_on)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
                 coalesce($18::date, dm_today() + $19::int))
         RETURNING id`,
        [
          track.id, track.demand_id, organizationId, track.organization_name, value.destinationKind,
          destination?.organizationId ?? null, destinationTrackId, organizationName.slice(0, 255),
          value.destinationSector, value.destinationSphere, value.destinationMunicipality, value.destinationUf,
          value.reason, req.user.userId, authorName(req.user),
          value.responsibleName ?? authorName(req.user), value.responsibleRole,
          value.dueOn ?? null, value.dueDays ?? null,
        ],
      );
      createdId = rows[0].id;

      // 4. Resposta institucional "Encaminhamento realizado".
      await client.query(
        `INSERT INTO demand_institutional_responses
           (track_id, demand_id, organization_id, response_type, body, responsible_sector, author_id, author_name)
         VALUES ($1, $2, $3, 'encaminhamento_realizado', $4, $5, $6, $7)`,
        [
          track.id, track.demand_id, organizationId, value.reason, String(label).slice(0, 255),
          req.user.userId, authorName(req.user),
        ],
      );
    });
    res.status(201).json({ ...view, forwardingId: createdId });
  }));

  // ── Caixa do órgão ───────────────────────────────────────────────────────
  router.get('/institutional/forwardings', ...gov, handle(async (req, res) => {
    const fields = {};
    const direction = req.query.direction === undefined || req.query.direction === '' ? 'recebidos' : String(req.query.direction);
    if (!FORWARDING_DIRECTIONS.includes(direction)) fields.direction = `Valores aceitos: ${FORWARDING_DIRECTIONS.join(', ')}`;
    const statuses = parseList(req.query.status, FORWARDING_STATUSES, 'status', fields);
    if (Object.keys(fields).length) throw validationError(fields, 'Filtro inválido');
    const organizationId = req.government.organizationId;
    const params = [organizationId, PUBLIC_STATUSES];
    let filter = '';
    if (statuses) {
      params.push(statuses);
      filter = ' AND f.status = ANY($3::forwarding_status[])';
    }
    const column = direction === 'recebidos' ? 'f.destination_organization_id' : 'f.organization_id';
    const { rows } = await pool.query(
      `SELECT ${forwardingStore.FORWARDING_SQL}
         FROM demand_forwardings f
         JOIN demands d ON d.id = f.demand_id
        WHERE ${column} = $1 AND d.status = ANY($2::demand_status[])${filter}
        ORDER BY f.forwarded_at DESC, f.id DESC
        LIMIT 200`,
      params,
    );
    const updates = await forwardingStore.loadUpdates(pool, rows.map((r) => r.id));
    const { rows: demands } = rows.length ? await pool.query(
      `SELECT ${demandStore.PUBLIC_SUMMARY_SQL} FROM demands d WHERE d.id = ANY($1::uuid[])`,
      [[...new Set(rows.map((r) => r.demand_id))]],
    ) : { rows: [] };
    const byId = new Map(demands.map((d) => [d.id, demandStore.serializePublicSummary(d)]));
    res.json({
      direction,
      forwardings: rows.filter((r) => byId.has(r.demand_id)).map((r) => ({
        forwarding: forwardingStore.serializeForwarding(r, updates.get(r.id), { viewerOrganizationId: organizationId }),
        demand: byId.get(r.demand_id),
      })),
    });
  }));

  router.get('/institutional/forwardings/:fid', ...gov, handle(async (req, res) => {
    res.json(await forwardingView(pool, req.params.fid, req.government.organizationId));
  }));

  // ── Status (recebido, aceito, devolvido) ─────────────────────────────────
  router.post('/institutional/forwardings/:fid/status', ...gov, handle(async (req, res) => {
    const { value, errors } = validateForwardingStatus(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const organizationId = req.government.organizationId;
    const view = await withTransaction(pool, async (client) => {
      const row = await forwardingStore.loadForwardingFor(client, req.params.fid, organizationId, { forUpdate: true });
      if (forwardingStore.statusOwner(row) !== organizationId) {
        throw new HttpError(403, {
          error: row.destination_kind === 'orgao_plataforma'
            ? 'Quem registra o recebimento, o aceite ou a devolução é o órgão de destino'
            : 'Só o órgão que encaminhou registra o retorno deste encaminhamento',
          code: 'forwarding_forbidden',
        });
      }
      const check = checkForwardingTransition(row.status, value.status, value.note);
      if (!check.ok) {
        if (check.code === 'invalid_transition') throw new HttpError(409, { error: check.error, code: check.code });
        throw validationError({ note: check.error }, check.error);
      }
      await client.query("SELECT set_config('dm.actor_name', $1, true)", [authorName(req.user) ?? '']);
      await client.query(
        `UPDATE demand_forwardings
            SET status = $2, status_note = $3, status_changed_by = $4, status_changed_by_organization = $5
          WHERE id = $1`,
        [row.id, value.status, value.note, req.user.userId, organizationId],
      );
      return forwardingView(client, row.id, organizationId);
    });
    res.json(view);
  }));

  // ── Providências e atualizações posteriores ──────────────────────────────
  router.post('/institutional/forwardings/:fid/updates', ...gov, handle(async (req, res) => {
    const { value, errors } = validateForwardingUpdate(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const organizationId = req.government.organizationId;
    const view = await withTransaction(pool, async (client) => {
      // Só os dois órgãos envolvidos chegam aqui (404 para os demais).
      const row = await forwardingStore.loadForwardingFor(client, req.params.fid, organizationId, { forUpdate: true });
      // organization_name e side são gravados pelo trigger a partir do encaminhamento.
      await client.query(
        `INSERT INTO demand_forwarding_updates
           (forwarding_id, demand_id, organization_id, organization_name, side, kind, body, author_id, author_name)
         VALUES ($1, $2, $3, '', 'origem', $4, $5, $6, $7)`,
        [row.id, row.demand_id, organizationId, value.kind, value.body, req.user.userId, authorName(req.user)],
      );
      return forwardingView(client, row.id, organizationId);
    });
    res.status(201).json(view);
  }));

  return { forwardingView };
}

module.exports = { registerForwardingRoutes, destinationLabel, DESTINATION_KIND_LABELS };
