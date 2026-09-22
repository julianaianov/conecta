// Acesso ao banco dos encaminhamentos (T14): projeções, serialização, leitura
// com o histórico de tramitação e tradução dos erros dos triggers da migração
// 011. As regras (status, imutabilidade, quem pode mudar) são dos triggers.

const { PUBLIC_STATUSES } = require('../demand/constants');
const { HttpError } = require('../demand/store');
const { mapInstitutionalError } = require('./store');
const { nextForwardingStatuses } = require('./forwardings');

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

// Visão dos órgãos envolvidos (origem e destino): tudo, inclusive responsável.
const FORWARDING_SQL = `
  f.id, f.track_id, f.demand_id, f.organization_id, f.origin_organization_name, f.destination_kind,
  f.destination_organization_id, f.destination_track_id, f.destination_organization_name,
  f.destination_sector, f.destination_sphere, f.destination_municipality, f.destination_uf, f.reason,
  f.forwarded_by, f.forwarded_by_name, f.responsible_name, f.responsible_role, f.status, f.status_note,
  f.status_changed_by, f.status_changed_by_organization, f.status_changed_at, f.forwarded_at,
  f.received_at, f.accepted_at, f.returned_at, f.created_at, f.updated_at`;

const UPDATE_SQL = `
  u.id, u.forwarding_id, u.demand_id, u.organization_id, u.organization_name, u.side, u.kind, u.body,
  u.from_status, u.to_status, u.author_id, u.author_name, u.created_at`;

/** Quem responde pelo status: o destino na plataforma; a origem fora dela. */
const statusOwner = (row) => (row.destination_kind === 'orgao_plataforma' ? row.destination_organization_id : row.organization_id);

function serializeUpdate(row, { isPublic = false } = {}) {
  const base = {
    id: row.id,
    forwardingId: row.forwarding_id,
    organizationName: row.organization_name,
    side: row.side,
    kind: row.kind,
    body: row.body ?? null,
    fromStatus: row.from_status ?? null,
    toStatus: row.to_status ?? null,
    createdAt: toIso(row.created_at),
  };
  return isPublic ? base : { ...base, authorId: row.author_id, authorName: row.author_name ?? null };
}

/** Encaminhamento na visão de um órgão envolvido (`viewerOrganizationId`) ou pública. */
function serializeForwarding(row, updates = [], { viewerOrganizationId = null, isPublic = false } = {}) {
  const base = {
    id: row.id,
    demandId: row.demand_id,
    originOrganizationName: row.origin_organization_name,
    destinationKind: row.destination_kind,
    destinationOrganizationName: row.destination_organization_name,
    destinationSector: row.destination_sector ?? null,
    destinationSphere: row.destination_sphere ?? null,
    destinationMunicipality: row.destination_municipality ?? null,
    destinationUf: row.destination_uf ?? null,
    reason: row.reason,
    status: row.status,
    statusNote: row.status_note ?? null,
    statusChangedAt: toIso(row.status_changed_at),
    forwardedAt: toIso(row.forwarded_at),
    receivedAt: toIso(row.received_at),
    acceptedAt: toIso(row.accepted_at),
    returnedAt: toIso(row.returned_at),
    updates: updates.map((u) => serializeUpdate(u, { isPublic })),
  };
  if (isPublic) return base;
  const canChangeStatus = viewerOrganizationId !== null && statusOwner(row) === viewerOrganizationId;
  return {
    ...base,
    trackId: row.track_id,
    organizationId: row.organization_id,
    destinationOrganizationId: row.destination_organization_id ?? null,
    destinationTrackId: row.destination_track_id ?? null,
    forwardedBy: row.forwarded_by,
    forwardedByName: row.forwarded_by_name ?? null,
    responsibleName: row.responsible_name ?? null,
    responsibleRole: row.responsible_role ?? null,
    statusChangedBy: row.status_changed_by ?? null,
    direction: viewerOrganizationId === row.organization_id ? 'enviado' : 'recebido',
    canChangeStatus,
    availableStatuses: canChangeStatus ? nextForwardingStatuses(row.status) : [],
  };
}

/** Atualizações de vários encaminhamentos, agrupadas por encaminhamento, em ordem cronológica. */
async function loadUpdates(db, forwardingIds) {
  const byForwarding = new Map(forwardingIds.map((id) => [id, []]));
  if (!forwardingIds.length) return byForwarding;
  const { rows } = await db.query(
    `SELECT ${UPDATE_SQL} FROM demand_forwarding_updates u
      WHERE u.forwarding_id = ANY($1::uuid[])
      ORDER BY u.created_at, u.id`,
    [forwardingIds],
  );
  for (const row of rows) byForwarding.get(row.forwarding_id)?.push(row);
  return byForwarding;
}

/**
 * Encaminhamentos de uma demanda: todos (visão pública) ou só os que envolvem
 * o órgão (origem ou destino). Ordem cronológica, com o histórico de tramitação.
 */
async function loadDemandForwardings(db, demandId, { organizationId = null } = {}) {
  const params = [demandId];
  let filter = '';
  if (organizationId) {
    params.push(organizationId);
    filter = ' AND (f.organization_id = $2 OR f.destination_organization_id = $2)';
  }
  const { rows } = await db.query(
    `SELECT ${FORWARDING_SQL} FROM demand_forwardings f
      WHERE f.demand_id = $1${filter}
      ORDER BY f.forwarded_at, f.id`,
    params,
  );
  const updates = await loadUpdates(db, rows.map((r) => r.id));
  return rows.map((row) => ({ row, updates: updates.get(row.id) ?? [] }));
}

/** Um encaminhamento que envolve o órgão, em demanda aberta; 404 senão. */
async function loadForwardingFor(db, forwardingId, organizationId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${FORWARDING_SQL} FROM demand_forwardings f
       JOIN demands d ON d.id = f.demand_id
      WHERE f.id = $1 AND (f.organization_id = $2 OR f.destination_organization_id = $2)
        AND d.status = ANY($3::demand_status[])${forUpdate ? ' FOR UPDATE OF f' : ''}`,
    [forwardingId, organizationId, PUBLIC_STATUSES],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Encaminhamento não encontrado' });
  return rows[0];
}

/** Erros dos triggers da migração 011 → HTTP; o resto segue a atuação institucional. */
function mapForwardingError(err) {
  if (err instanceof HttpError) return err;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514') {
    if (/transição do encaminhamento não permitida/.test(message)) {
      return new HttpError(409, { error: 'Mudança não permitida a partir do status atual do encaminhamento', code: 'invalid_transition' });
    }
    if (/motivo da devolução/.test(message)) {
      return new HttpError(422, { error: 'Informe o motivo da devolução', code: 'validation_failed', fields: { note: 'Informe o motivo da devolução' } });
    }
  }
  if (err?.code === '42501' && /sem permissão para mudar o status|fora deste encaminhamento/.test(message)) {
    return new HttpError(403, { error: 'O órgão não pode registrar isso neste encaminhamento', code: 'forwarding_forbidden' });
  }
  if (err?.code === '23505' && /uq_demand_forwardings_open_destination/.test(`${message} ${err?.constraint ?? ''}`)) {
    return new HttpError(409, {
      error: 'Já existe um encaminhamento em aberto desta demanda para esse órgão', code: 'duplicate_forwarding',
    });
  }
  return mapInstitutionalError(err);
}

module.exports = {
  FORWARDING_SQL,
  UPDATE_SQL,
  statusOwner,
  serializeForwarding,
  serializeUpdate,
  loadUpdates,
  loadDemandForwardings,
  loadForwardingFor,
  mapForwardingError,
};
