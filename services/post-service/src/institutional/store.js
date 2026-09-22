// Acesso ao banco da atuação institucional (T13): projeções, serialização,
// abertura do acompanhamento e tradução dos erros dos triggers da migração 010.
// As regras de estado e imutabilidade são dos triggers; aqui só se lê, grava e
// traduz para HTTP.

const { PUBLIC_STATUSES } = require('../demand/constants');
const { HttpError, mapDbError } = require('../demand/store');
const { nextStatuses } = require('./state-machine');

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

// ── Identificação pública do órgão (user-service) ───────────────────────────

/**
 * Identificação do órgão para o acompanhamento e o recorte territorial, lida
 * da projeção pública do user-service (GET /:userId/institution: só cadastro
 * validado, sem contatos). Cache curto por conta. Resolve `null` quando não há
 * cadastro validado e lança quando o user-service não responde.
 */
function createGovernmentProfileClient({ fetchInstitution, ttlMs = 60_000, now = () => Date.now(), maxEntries = 2_000 }) {
  const cache = new Map();
  return async function governmentProfile(userId) {
    const cached = cache.get(userId);
    if (cached && cached.expiresAt > now()) return cached.value;
    const raw = await fetchInstitution(userId);
    const value = raw && raw.institution_kind === 'poder_publico' ? {
      name: String(raw.trade_name || raw.legal_name || '').trim() || null,
      legalName: raw.legal_name ?? null,
      governmentSphere: raw.government_sphere ?? null,
      department: raw.department ?? null,
      competenceAreas: Array.isArray(raw.competence_areas) ? raw.competence_areas : [],
      territory: raw.territory ?? null,
      municipality: raw.municipality ?? null,
      uf: typeof raw.uf === 'string' ? raw.uf.toUpperCase() : null,
    } : null;
    if (value && !value.name) value.name = 'Órgão do Poder Público';
    if (cache.size >= maxEntries) cache.delete(cache.keys().next().value);
    cache.set(userId, { value, expiresAt: now() + ttlMs });
    return value;
  };
}

// ── Projeções ────────────────────────────────────────────────────────────────

// Visão do próprio órgão: tudo, inclusive responsável e autoria.
const TRACK_SQL = `
  t.id, t.demand_id, t.organization_id, t.organization_name, t.government_sphere, t.department,
  t.municipality, t.uf, t.opened_by, t.opened_by_name, t.status, t.status_note, t.status_changed_by,
  t.responsible_name, t.responsible_role, t.received_at, t.status_changed_at, t.concluded_at,
  t.created_at, t.updated_at`;

// Visão pública: órgão, status e datas (sem representante, responsável nem ids de conta).
const PUBLIC_TRACK_SQL = `
  t.id, t.organization_name, t.government_sphere, t.department, t.municipality, t.uf,
  t.status, t.status_note, t.received_at, t.status_changed_at, t.concluded_at`;

const RESPONSE_SQL = `
  r.id, r.track_id, r.demand_id, r.organization_id, r.response_type, r.body, r.responsible_sector,
  r.program_name, r.program_url, to_char(r.planned_for, 'YYYY-MM-DD') AS planned_for, r.track_status,
  r.author_id, r.author_name, r.created_at, t.organization_name`;

const OFFER_SQL = `
  o.id, o.track_id, o.demand_id, o.organization_id, o.support_types::text[] AS support_types,
  o.description, o.connection_id, o.author_id, o.author_name, o.created_at, t.organization_name`;

function serializeTrack(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    governmentSphere: row.government_sphere ?? null,
    department: row.department ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    openedBy: row.opened_by,
    openedByName: row.opened_by_name ?? null,
    status: row.status,
    statusNote: row.status_note ?? null,
    statusChangedBy: row.status_changed_by ?? null,
    responsibleName: row.responsible_name ?? null,
    responsibleRole: row.responsible_role ?? null,
    receivedAt: toIso(row.received_at),
    statusChangedAt: toIso(row.status_changed_at),
    concludedAt: toIso(row.concluded_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    availableStatuses: nextStatuses(row.status),
  };
}

function serializePublicTrack(row) {
  return {
    id: row.id,
    organizationName: row.organization_name,
    governmentSphere: row.government_sphere ?? null,
    department: row.department ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    status: row.status,
    statusNote: row.status_note ?? null,
    receivedAt: toIso(row.received_at),
    statusChangedAt: toIso(row.status_changed_at),
    concludedAt: toIso(row.concluded_at),
  };
}

function serializeResponse(row, { isPublic = false } = {}) {
  const base = {
    id: row.id,
    trackId: row.track_id,
    organizationName: row.organization_name,
    type: row.response_type,
    body: row.body,
    responsibleSector: row.responsible_sector ?? null,
    programName: row.program_name ?? null,
    programUrl: row.program_url ?? null,
    plannedFor: row.planned_for ?? null,
    institutionalStatus: row.track_status,
    createdAt: toIso(row.created_at),
  };
  return isPublic ? base : { ...base, authorId: row.author_id, authorName: row.author_name ?? null };
}

function serializeOffer(row, { isPublic = false } = {}) {
  const base = {
    id: row.id,
    trackId: row.track_id,
    organizationName: row.organization_name,
    supportTypes: Array.isArray(row.support_types) ? row.support_types : [],
    description: row.description,
    createdAt: toIso(row.created_at),
  };
  return isPublic ? base : {
    ...base, connectionId: row.connection_id ?? null, authorId: row.author_id, authorName: row.author_name ?? null,
  };
}

// ── Leitura e escrita ────────────────────────────────────────────────────────

/** Demanda aberta à atuação institucional (publicada em diante, fora `arquivada`); 404 senão. */
async function loadOpenDemand(db, demandId, { lock = false } = {}) {
  const { rows } = await db.query(
    `SELECT d.id, d.status, d.title, d.author_id FROM demands d
      WHERE d.id = $1 AND d.status = ANY($2::demand_status[])${lock ? ' FOR SHARE OF d' : ''}`,
    [demandId, PUBLIC_STATUSES],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
  return rows[0];
}

async function loadTrack(db, demandId, organizationId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${TRACK_SQL} FROM demand_institutional_tracks t
      WHERE t.demand_id = $1 AND t.organization_id = $2${forUpdate ? ' FOR UPDATE OF t' : ''}`,
    [demandId, organizationId],
  );
  return rows[0] ?? null;
}

/**
 * Acompanhamento do órgão na demanda, aberto como `recebida` quando ainda não
 * existe (o trigger grava o evento). Travado para escrita. Retorna `{ row, created }`.
 */
async function ensureTrack(db, { demandId, organizationId, profile, user }) {
  const existing = await loadTrack(db, demandId, organizationId, { forUpdate: true });
  if (existing) return { row: existing, created: false };
  const { rows } = await db.query(
    `INSERT INTO demand_institutional_tracks
       (demand_id, organization_id, organization_name, government_sphere, department, municipality, uf,
        opened_by, opened_by_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (demand_id, organization_id) DO NOTHING
     RETURNING id`,
    [
      demandId, organizationId, profile.name.slice(0, 255), profile.governmentSphere,
      profile.department ? String(profile.department).slice(0, 255) : null,
      profile.municipality ? String(profile.municipality).slice(0, 120) : null,
      profile.uf && /^[A-Z]{2}$/.test(profile.uf) ? profile.uf : null,
      user.userId, user.name || user.email || null,
    ],
  );
  const row = await loadTrack(db, demandId, organizationId, { forUpdate: true });
  return { row, created: rows.length > 0 };
}

/** Respostas e ofertas de uma demanda (todas ou só as de um órgão), em ordem cronológica. */
async function loadEntries(db, demandId, organizationId = null) {
  const params = organizationId ? [demandId, organizationId] : [demandId];
  const orgFilter = organizationId ? ' AND t.organization_id = $2' : '';
  const { rows: responses } = await db.query(
    `SELECT ${RESPONSE_SQL} FROM demand_institutional_responses r
       JOIN demand_institutional_tracks t ON t.id = r.track_id
      WHERE r.demand_id = $1${orgFilter}
      ORDER BY r.created_at, r.id`,
    params,
  );
  const { rows: offers } = await db.query(
    `SELECT ${OFFER_SQL} FROM demand_institutional_offers o
       JOIN demand_institutional_tracks t ON t.id = o.track_id
      WHERE o.demand_id = $1${orgFilter}
      ORDER BY o.created_at, o.id`,
    params,
  );
  return { responses, offers };
}

/** Erros dos triggers da migração 010 → HTTP; o resto segue a tradução da demanda. */
function mapInstitutionalError(err) {
  if (err instanceof HttpError) return err;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514') {
    if (/transição institucional não permitida/.test(message)) {
      return new HttpError(409, { error: 'Mudança de status não permitida a partir do status atual', code: 'invalid_transition' });
    }
    if (/só em demanda publicada/.test(message)) {
      return new HttpError(409, { error: 'A demanda não está aberta à atuação institucional', code: 'invalid_state' });
    }
    if (/justificativa/.test(message)) {
      return new HttpError(422, { error: 'Informe a justificativa', code: 'validation_failed', fields: { note: 'Informe a justificativa' } });
    }
    if (/forma de apoio repetida/.test(message)) {
      return new HttpError(422, { error: 'Forma de apoio repetida', code: 'validation_failed', fields: { supportTypes: 'Forma de apoio repetida' } });
    }
  }
  return mapDbError(err);
}

function sendInstitutionalError(res, err) {
  const mapped = mapInstitutionalError(err);
  if (mapped) return res.status(mapped.status).json(mapped.body);
  console.error(err);
  return res.status(500).json({ error: 'Erro interno' });
}

module.exports = {
  createGovernmentProfileClient,
  TRACK_SQL,
  PUBLIC_TRACK_SQL,
  RESPONSE_SQL,
  OFFER_SQL,
  serializeTrack,
  serializePublicTrack,
  serializeResponse,
  serializeOffer,
  loadOpenDemand,
  loadTrack,
  ensureTrack,
  loadEntries,
  mapInstitutionalError,
  sendInstitutionalError,
};
