// Projeções e leitura de demand_interests (T15, migração post 012).
//
// Três visões: a de quem manifestou (a própria manifestação), a do Agente
// autor (quem se interessou, com nome, perfil, oferta, mensagem e conexão) e a
// pública (só contagens). Nada daqui sai em rota pública com nome ou id.

const { HttpError } = require('../demand/store');

const INTEREST_SQL = `
  i.id, i.demand_id, i.user_id, i.user_name, i.user_avatar, i.user_category, i.profile_type,
  i.kind::text AS kind, i.offer_types::text[] AS offer_types, i.message, i.connection_id,
  i.connection_status::text AS connection_status, i.connection_requested_at,
  i.connection_answered_at, i.withdrawn_at, i.created_at, i.updated_at`;

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

/** Manifestação vista por quem a fez. */
function serializeOwnInterest(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    kind: row.kind,
    offerTypes: Array.isArray(row.offer_types) ? row.offer_types : [],
    message: row.message ?? null,
    connectionId: row.connection_id ?? null,
    connectionStatus: row.connection_status ?? null,
    connectionRequestedAt: toIso(row.connection_requested_at),
    connectionAnsweredAt: toIso(row.connection_answered_at),
    withdrawnAt: toIso(row.withdrawn_at),
    createdAt: toIso(row.created_at),
  };
}

/** Manifestação vista pelo Agente autor da demanda. */
function serializeAgentInterest(row) {
  return {
    ...serializeOwnInterest(row),
    user: {
      userId: row.user_id,
      name: row.user_name ?? null,
      avatarUrl: row.user_avatar ?? null,
      category: row.user_category,
      profileType: row.profile_type ?? null,
    },
  };
}

/** Contagens públicas das manifestações em aberto e das conexões aceitas. */
async function interestSummary(db, demandId) {
  const { rows: [row] } = await db.query(
    `SELECT count(*) FILTER (WHERE withdrawn_at IS NULL AND kind = 'apoio')::int AS apoio,
            count(*) FILTER (WHERE withdrawn_at IS NULL AND kind = 'participacao')::int AS participacao,
            count(*) FILTER (WHERE withdrawn_at IS NULL AND kind = 'voluntariado')::int AS voluntariado,
            count(*) FILTER (WHERE connection_status = 'aceita')::int AS conexoes_aceitas
       FROM demand_interests WHERE demand_id = $1`,
    [demandId],
  );
  return {
    apoio: row?.apoio ?? 0,
    participacao: row?.participacao ?? 0,
    voluntariado: row?.voluntariado ?? 0,
    acceptedConnections: row?.conexoes_aceitas ?? 0,
  };
}

/** Manifestação da conta, travada quando `forUpdate`. 404 se for de outra conta. */
async function loadOwnInterest(db, demandId, interestId, userId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${INTEREST_SQL} FROM demand_interests i
      WHERE i.id = $1 AND i.demand_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [interestId, demandId],
  );
  const row = rows[0];
  if (!row || row.user_id !== userId) throw new HttpError(404, { error: 'Manifestação não encontrada' });
  return row;
}

/** Recursos necessários de cada demanda (para a compatibilidade). */
async function neededResourcesByDemand(db, demandIds) {
  const map = new Map();
  if (!demandIds.length) return map;
  const { rows } = await db.query(
    `SELECT demand_id, array_agg(resource_type::text ORDER BY position, resource_type) AS types
       FROM demand_resources
      WHERE kind = 'necessario' AND demand_id = ANY($1::uuid[])
      GROUP BY demand_id`,
    [demandIds],
  );
  for (const row of rows) map.set(row.demand_id, Array.isArray(row.types) ? row.types : []);
  return map;
}

/** Manifestações em aberto da conta nas demandas dadas: demandId → [{ id, kind, connectionStatus }]. */
async function openInterestsByDemand(db, userId, demandIds) {
  const map = new Map();
  if (!demandIds.length) return map;
  const { rows } = await db.query(
    `SELECT id, demand_id, kind::text AS kind, connection_status::text AS connection_status
       FROM demand_interests
      WHERE user_id = $1 AND withdrawn_at IS NULL AND demand_id = ANY($2::uuid[])
      ORDER BY created_at`,
    [userId, demandIds],
  );
  for (const row of rows) {
    const list = map.get(row.demand_id) ?? [];
    list.push({ id: row.id, kind: row.kind, connectionStatus: row.connection_status ?? null });
    map.set(row.demand_id, list);
  }
  return map;
}

module.exports = {
  INTEREST_SQL,
  serializeOwnInterest,
  serializeAgentInterest,
  interestSummary,
  loadOwnInterest,
  neededResourcesByDemand,
  openInterestsByDemand,
};
