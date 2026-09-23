// Acesso ao banco dos eventos e das inscrições (T25): projeções, serialização
// e leituras. As regras de estado, vaga e fila de espera são dos triggers da
// migração 021; aqui só se lê, se escreve o que a rota validou e se traduz o
// erro do banco para HTTP.

const { HttpError } = require('../demand/store');
const { publicMediaUrl } = require('../upload-policy');
const { EMAIL_NOTIFICATIONS } = require('./constants');

// camelCase da API ↔ coluna.
const SCALAR_COLUMNS = {
  kind: 'kind',
  title: 'title',
  description: 'description',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  locationName: 'location_name',
  cep: 'cep',
  street: 'street',
  addressNumber: 'address_number',
  addressComplement: 'address_complement',
  district: 'district',
  municipality: 'municipality',
  uf: 'uf',
  territory: 'territory',
  latitude: 'latitude',
  longitude: 'longitude',
  audience: 'audience',
  capacity: 'capacity',
  waitlistEnabled: 'waitlist_enabled',
  pricing: 'pricing',
  priceCents: 'price_cents',
  priceNote: 'price_note',
  accessibility: 'accessibility',
  accessibilityNotes: 'accessibility_notes',
  photoRef: 'photo_ref',
};

// Projeção pública. O endereço do **local do evento** é público de propósito
// (sem ele ninguém comparece); o que nunca sai é qualquer dado de inscrito.
const PUBLIC_EVENT_SQL = `
  e.id, e.demand_id, e.organizer_id, e.organizer_name, e.organizer_avatar,
  e.organizer_category, e.kind::text AS kind, e.title, e.description, e.starts_at, e.ends_at,
  e.location_name, e.cep, e.street, e.address_number, e.address_complement,
  e.district, e.municipality, e.uf, e.territory, e.latitude, e.longitude,
  e.audience, e.capacity, e.waitlist_enabled, e.pricing::text AS pricing, e.price_cents,
  e.price_note, e.accessibility::text[] AS accessibility, e.accessibility_notes, e.photo_ref,
  e.status::text AS status, e.published_at, e.canceled_at, e.cancel_reason,
  e.signups_count, e.waitlist_count, e.created_at, e.updated_at,
  (SELECT p.id FROM posts p WHERE p.event_id = e.id) AS post_id,
  (SELECT d.title FROM demands d WHERE d.id = e.demand_id) AS demand_title`;

// Visão do organizador: a pública + presença e organização interna.
const OWNER_EVENT_SQL = `${PUBLIC_EVENT_SQL}, e.attended_count, e.organization_id`;

const SIGNUP_SQL = `
  s.id, s.event_id, s.user_id, s.user_name, s.user_avatar, s.user_category,
  s.profile_type, s.status::text AS status, s.waitlist_position, s.note, s.attended, s.attended_at,
  s.signed_up_at, s.canceled_at, s.created_at, s.updated_at`;

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const num = (value) => (value === null || value === undefined ? null : Number(value));

/** Foto do evento: endereço público estável quando é um upload confirmado (T08). */
const photoUrl = (ref) => (ref ? publicMediaUrl(ref) ?? ref : null);

function serializeEvent(row, { owner = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    demandId: row.demand_id ?? null,
    demandTitle: row.demand_title ?? null,
    organizerId: row.organizer_id,
    organizerName: row.organizer_name ?? null,
    organizerAvatar: row.organizer_avatar ?? null,
    organizerCategory: row.organizer_category,
    kind: row.kind,
    title: row.title,
    description: row.description,
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    locationName: row.location_name,
    cep: row.cep ?? null,
    street: row.street ?? null,
    addressNumber: row.address_number ?? null,
    addressComplement: row.address_complement ?? null,
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    territory: row.territory ?? null,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    audience: row.audience,
    capacity: row.capacity ?? null,
    waitlistEnabled: row.waitlist_enabled === true,
    pricing: row.pricing,
    priceCents: row.price_cents ?? null,
    priceNote: row.price_note ?? null,
    accessibility: row.accessibility ?? [],
    accessibilityNotes: row.accessibility_notes ?? null,
    photoRef: row.photo_ref ?? null,
    photoUrl: photoUrl(row.photo_ref),
    status: row.status,
    publishedAt: iso(row.published_at),
    canceledAt: iso(row.canceled_at),
    cancelReason: row.cancel_reason ?? null,
    signupsCount: Number(row.signups_count ?? 0),
    waitlistCount: Number(row.waitlist_count ?? 0),
    seatsLeft: row.capacity === null || row.capacity === undefined
      ? null
      : Math.max(0, Number(row.capacity) - Number(row.signups_count ?? 0)),
    postId: row.post_id ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
  if (!owner) return base;
  return { ...base, attendedCount: Number(row.attended_count ?? 0), organizationId: row.organization_id ?? null };
}

/** Inscrição vista por quem se inscreveu: sem o retrato de ninguém. */
function serializeOwnSignup(row) {
  if (!row) return null;
  return {
    id: row.id,
    eventId: row.event_id,
    status: row.status,
    waitlistPosition: row.waitlist_position ?? null,
    note: row.note ?? null,
    attended: row.attended === true,
    attendedAt: iso(row.attended_at),
    signedUpAt: iso(row.signed_up_at),
    canceledAt: iso(row.canceled_at),
  };
}

/**
 * Inscrição vista pelo organizador (lista de presença). Minimização (LGPD): só
 * o nome público, a categoria da conta, o estado e a presença. Sem avatar, sem
 * e-mail, sem telefone e sem id de conta exposto além do necessário para
 * marcar a presença.
 */
function serializeAttendee(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.user_name ?? 'Participante',
    userCategory: row.user_category,
    profileType: row.profile_type ?? null,
    status: row.status,
    waitlistPosition: row.waitlist_position ?? null,
    note: row.note ?? null,
    attended: row.attended === true,
    attendedAt: iso(row.attended_at),
    signedUpAt: iso(row.signed_up_at),
    canceledAt: iso(row.canceled_at),
  };
}

/** Contagens públicas de um evento (nunca a lista). */
async function signupSummary(db, eventId) {
  const { rows } = await db.query(
    `SELECT e.capacity, e.waitlist_enabled, e.signups_count, e.waitlist_count
       FROM events e WHERE e.id = $1`,
    [eventId],
  );
  const row = rows[0];
  if (!row) return { capacity: null, signupsCount: 0, waitlistCount: 0, seatsLeft: null, full: false };
  const capacity = row.capacity ?? null;
  const signupsCount = Number(row.signups_count ?? 0);
  return {
    capacity,
    waitlistEnabled: row.waitlist_enabled === true,
    signupsCount,
    waitlistCount: Number(row.waitlist_count ?? 0),
    seatsLeft: capacity === null ? null : Math.max(0, capacity - signupsCount),
    full: capacity !== null && signupsCount >= capacity,
  };
}

async function loadEvent(db, id, { statuses = null, forUpdate = false } = {}) {
  const params = [id];
  let filter = '';
  if (statuses) {
    params.push(statuses);
    filter = ' AND e.status = ANY($2::event_status[])';
  }
  const { rows } = await db.query(
    `SELECT ${OWNER_EVENT_SQL} FROM events e WHERE e.id = $1${filter}${forUpdate ? ' FOR UPDATE OF e' : ''}`,
    params,
  );
  if (!rows.length) throw new HttpError(404, { error: 'Evento não encontrado' });
  return rows[0];
}

async function loadOwnEvent(db, id, organizerId, options = {}) {
  const row = await loadEvent(db, id, options);
  if (row.organizer_id !== organizerId) throw new HttpError(404, { error: 'Evento não encontrado' });
  return row;
}

/** Inscrição em aberto (não cancelada) da conta neste evento. */
async function loadOpenSignup(db, eventId, userId) {
  const { rows } = await db.query(
    `SELECT ${SIGNUP_SQL} FROM event_signups s
      WHERE s.event_id = $1 AND s.user_id = $2 AND s.canceled_at IS NULL`,
    [eventId, userId],
  );
  return rows[0] ?? null;
}

/** Erros dos triggers da migração 021 → HTTP. */
function mapEventDbError(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23505') {
    return new HttpError(409, { error: 'Você já está inscrito neste evento', code: 'signup_exists' });
  }
  if (err?.code === '23514') {
    if (/não há vagas/.test(message)) {
      return new HttpError(409, { error: 'Não há vagas neste evento', code: 'event_full' });
    }
    if (/já terminou|só em evento publicado|não se inscreve no próprio/.test(message)) {
      return new HttpError(409, { error: message, code: 'event_closed' });
    }
    if (/transição não permitida|não é editado|não mudam|lista de presença abre|fila de espera avança|presença só para/.test(message)) {
      return new HttpError(409, { error: message, code: 'invalid_state' });
    }
    if (/vincula a uma demanda|evento publicado desta demanda|se vinculam a um evento/.test(message)) {
      return new HttpError(422, { error: message, code: 'validation_failed', fields: { eventId: message } });
    }
    if (/inscritos: as vagas/.test(message)) {
      return new HttpError(422, { error: message, code: 'validation_failed', fields: { capacity: message } });
    }
    if (/exige o motivo/.test(message)) {
      return new HttpError(422, { error: message, code: 'validation_failed', fields: { reason: message } });
    }
  }
  return null;
}

module.exports = {
  SCALAR_COLUMNS,
  PUBLIC_EVENT_SQL,
  OWNER_EVENT_SQL,
  SIGNUP_SQL,
  EMAIL_NOTIFICATIONS,
  serializeEvent,
  serializeOwnSignup,
  serializeAttendee,
  signupSummary,
  loadEvent,
  loadOwnEvent,
  loadOpenSignup,
  mapEventDbError,
};
