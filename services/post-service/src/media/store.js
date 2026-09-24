// Acesso ao banco das pautas da Comunicação (T28): projeções e a descoberta de
// pautas. Projeção explícita de colunas; nada de `SELECT *`.

const { CATEGORY_LABELS } = require('../demand/constants');
const { DISCOVER_WINDOW_DAYS, DISCOVER_LIMIT, MINE_LIMIT, SIGNAL_LABELS } = require('./constants');

const ITEM_SQL = `m.id, m.user_id, m.user_name, m.profile_type, m.target_kind, m.target_id, m.target_title,
                  m.angle, m.status, m.outlet_name, m.published_url,
                  to_char(m.published_on, 'YYYY-MM-DD') AS published_on, m.created_at, m.updated_at`;

function serializeItem(row) {
  return {
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    targetTitle: row.target_title ?? null,
    angle: row.angle ?? null,
    status: row.status,
    outletName: row.outlet_name ?? null,
    publishedUrl: row.published_url ?? null,
    publishedOn: row.published_on ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Cobertura pública: veículo, endereço, data e subperfil — nunca nome nem id da conta. */
function serializeCoverage(row) {
  return {
    id: row.id,
    outletName: row.outlet_name,
    publishedUrl: row.published_url,
    publishedOn: row.published_on,
    profileType: row.profile_type ?? null,
  };
}

async function listMine(db, userId, status = null) {
  const params = [userId];
  let where = 'm.user_id = $1';
  if (status) {
    params.push(status);
    where += ` AND m.status = $${params.length}`;
  }
  params.push(MINE_LIMIT);
  const { rows } = await db.query(
    `SELECT ${ITEM_SQL} FROM media_agenda_items m WHERE ${where} ORDER BY m.updated_at DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(serializeItem);
}

async function loadMine(db, id, userId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${ITEM_SQL} FROM media_agenda_items m WHERE m.id = $1 AND m.user_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** O alvo existe e é público? Devolve `{ title }` ou null. */
async function loadPublicTarget(db, targetKind, targetId) {
  if (targetKind === 'demanda') {
    const { rows } = await db.query(
      `SELECT title FROM demands WHERE id = $1 AND published_at IS NOT NULL AND status <> 'arquivada'`,
      [targetId],
    );
    return rows[0] ? { title: rows[0].title } : null;
  }
  const { rows } = await db.query(
    `SELECT title FROM events WHERE id = $1 AND status = 'publicado'`,
    [targetId],
  );
  return rows[0] ? { title: rows[0].title } : null;
}

async function listCoverage(db, targetKind, targetId) {
  const { rows } = await db.query(
    `SELECT m.id, m.outlet_name, m.published_url, to_char(m.published_on, 'YYYY-MM-DD') AS published_on, m.profile_type
       FROM media_agenda_items m
      WHERE m.target_kind = $1 AND m.target_id = $2 AND m.status = 'publicada'
      ORDER BY m.published_on DESC, m.id
      LIMIT 100`,
    [targetKind, targetId],
  );
  return rows.map(serializeCoverage);
}

const DEMAND_CANDIDATE_SQL = `d.id, d.title, d.category, d.priority, d.status, d.district, d.municipality, d.uf,
                              d.territory, d.published_at`;

function demandCandidate(row, signal) {
  return {
    targetKind: 'demanda',
    targetId: row.id,
    title: row.title,
    category: row.category,
    categoryLabel: CATEGORY_LABELS[row.category] ?? row.category,
    priority: row.priority,
    status: row.status,
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    territory: row.territory ?? null,
    publishedAt: row.published_at,
    startsAt: null,
    signals: [{ signal, label: SIGNAL_LABELS[signal], detail: row.detail ?? null }],
  };
}

/**
 * Descoberta de pautas: quatro consultas com LIMIT, cada uma um sinal; os
 * alvos repetidos são unidos (a pauta ganha vários sinais). Só dado que a rota
 * pública já expõe. `mine` marca o que a conta já identificou.
 */
async function discover(db, userId) {
  const [urgent, pairs, results, supported, events, mine] = await Promise.all([
    db.query(
      `SELECT ${DEMAND_CANDIDATE_SQL}, NULL::text AS detail
         FROM demands d
        WHERE d.published_at >= NOW() - ($1 || ' days')::interval
          AND d.status NOT IN ('em_analise', 'arquivada')
          AND (d.priority = 'urgente' OR d.category = 'problema_urgente')
        ORDER BY d.published_at DESC LIMIT $2`,
      [String(DISCOVER_WINDOW_DAYS), DISCOVER_LIMIT],
    ),
    db.query(
      `SELECT ${DEMAND_CANDIDATE_SQL}, (count(e.id) || ' registro(s) pareado(s)') AS detail
         FROM demands d
         JOIN demand_evidences e ON e.demand_id = d.id AND e.pair_evidence_id IS NOT NULL
        WHERE d.status IN ('em_execucao', 'concluida', 'prestacao_de_contas')
        GROUP BY d.id
        ORDER BY max(e.created_at) DESC LIMIT $1`,
      [DISCOVER_LIMIT],
    ),
    db.query(
      `SELECT ${DEMAND_CANDIDATE_SQL},
              (coalesce(a.beneficiaries_reached, 0) || ' pessoas alcançadas') AS detail
         FROM demands d
         JOIN demand_accountability a ON a.demand_id = d.id AND a.status = 'concluida'
        WHERE d.status <> 'arquivada'
        ORDER BY a.concluded_at DESC NULLS LAST LIMIT $1`,
      [DISCOVER_LIMIT],
    ),
    db.query(
      `SELECT ${DEMAND_CANDIDATE_SQL}, (count(s.id) || ' apoio(s) registrado(s)') AS detail
         FROM demands d
         JOIN supports s ON s.demand_id = d.id AND s.canceled_at IS NULL AND s.status <> 'rejected'
        WHERE d.published_at IS NOT NULL AND d.status <> 'arquivada'
        GROUP BY d.id
        HAVING count(s.id) > 0
        ORDER BY count(s.id) DESC, d.published_at DESC LIMIT $1`,
      [DISCOVER_LIMIT],
    ),
    db.query(
      `SELECT e.id, e.title, e.kind, e.starts_at, e.district, e.municipality, e.uf, e.territory, e.demand_id
         FROM events e
        WHERE e.status = 'publicado' AND e.starts_at >= NOW()
          AND e.starts_at <= NOW() + ($1 || ' days')::interval
        ORDER BY e.starts_at ASC LIMIT $2`,
      [String(DISCOVER_WINDOW_DAYS), DISCOVER_LIMIT],
    ),
    db.query(
      `SELECT m.target_kind, m.target_id, m.id, m.status FROM media_agenda_items m WHERE m.user_id = $1`,
      [userId],
    ),
  ]);

  const byKey = new Map();
  const add = (candidate) => {
    const key = `${candidate.targetKind}:${candidate.targetId}`;
    const existing = byKey.get(key);
    if (existing) existing.signals.push(...candidate.signals);
    else byKey.set(key, candidate);
  };
  urgent.rows.forEach((row) => add(demandCandidate(row, 'urgente')));
  pairs.rows.forEach((row) => add(demandCandidate(row, 'antes_e_depois')));
  results.rows.forEach((row) => add(demandCandidate(row, 'resultados')));
  supported.rows.forEach((row) => add(demandCandidate(row, 'mais_apoiada')));
  events.rows.forEach((row) => add({
    targetKind: 'evento',
    targetId: row.id,
    title: row.title,
    category: row.kind ?? null,
    categoryLabel: null,
    priority: null,
    status: 'publicado',
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    territory: row.territory ?? null,
    publishedAt: null,
    startsAt: row.starts_at,
    signals: [{ signal: 'evento_proximo', label: SIGNAL_LABELS.evento_proximo, detail: null }],
  }));

  const mineByKey = new Map(mine.rows.map((r) => [`${r.target_kind}:${r.target_id}`, { id: r.id, status: r.status }]));
  return [...byKey.values()].map((candidate) => ({
    ...candidate,
    agendaItem: mineByKey.get(`${candidate.targetKind}:${candidate.targetId}`) ?? null,
  }));
}

module.exports = {
  ITEM_SQL,
  serializeItem,
  serializeCoverage,
  listMine,
  loadMine,
  loadPublicTarget,
  listCoverage,
  discover,
};
