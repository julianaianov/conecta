// Consultas do painel do Poder Público (T22): indicadores, priorização de
// áreas, medição de impacto e divulgação de ações.
//
// Toda consulta é recortada pelo órgão (competência/jurisdição) e pelo
// período, e servida pelos índices da migração 019. Uma requisição do painel
// faz uma consulta agregada (não uma por indicador) e o resultado fica 60 s no
// cache do processo (./cache.js).

const { PUBLIC_STATUSES, CATEGORIES } = require('../demand/constants');
const { HttpError, withTransaction, mapDbError } = require('../demand/store');
const { LIMITS } = require('./constants');
const { actionResponse } = require('./actions');
const institutionalStore = require('../institutional/store');

/** Monta a lista de parâmetros e os recortes comuns da consulta. */
function baseClauses({ organizationId, profile, filters }) {
  const params = [organizationId, PUBLIC_STATUSES, filters.period.to];
  const where = [
    'd.status = ANY($2::demand_status[])',
    'd.published_at IS NOT NULL',
    'd.published_at <= $3::timestamptz',
  ];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (filters.period.from) add('d.published_at >= ?::timestamptz', filters.period.from);

  if (filters.scope === 'competencia') {
    where.push('EXISTS (SELECT 1 FROM demand_institutional_tracks ct WHERE ct.demand_id = d.id AND ct.organization_id = $1)');
  } else if (filters.scope === 'jurisdicao' && profile) {
    // Mesmo recorte da lista da T13: municipal → município/UF, estadual → UF,
    // federal → todo o país.
    if (profile.governmentSphere === 'municipal' && profile.uf) {
      add('d.uf = ?', profile.uf);
      if (profile.municipality) add('lower(btrim(d.municipality)) = lower(btrim(?))', profile.municipality);
    } else if (profile.governmentSphere === 'estadual' && profile.uf) {
      add('d.uf = ?', profile.uf);
    }
  }
  if (filters.categories) add('d.category = ANY(?::demand_category[])', filters.categories);
  if (filters.priorities) add('d.priority = ANY(?::demand_priority[])', filters.priorities);
  if (filters.themes) {
    add(`EXISTS (SELECT 1 FROM demand_themes dt
                   WHERE dt.demand_id = d.id AND dt.theme = ANY(?::demand_theme[]))`, filters.themes);
  }
  if (filters.territory) add("d.territory ILIKE ('%' || ? || '%') ESCAPE '\\'", filters.territory.replace(/[\\%_]/g, '\\$&'));
  return { params, where };
}

// Colunas derivadas do recorte, calculadas uma vez na CTE `base` (FILTER de
// agregado não aceita subconsulta).
const BASE_FLAGS = `
    (d.priority = 'urgente' OR d.category = 'problema_urgente') AS urgent,
    (d.status = 'em_execucao' OR t.status = 'em_execucao') AS in_execution,
    (d.status IN ('concluida', 'prestacao_de_contas', 'encerrada') OR t.status = 'concluida') AS concluded,
    (t.status IN ('encaminhada', 'encaminhada_ao_orgao_responsavel')
      OR EXISTS (SELECT 1 FROM demand_forwardings f
                  WHERE f.demand_id = d.id AND f.organization_id = $1)) AS forwarded,
    EXISTS (SELECT 1 FROM supports s
             WHERE s.demand_id = d.id AND s.canceled_at IS NULL AND s.status <> 'rejected') AS supported,
    EXISTS (SELECT 1 FROM demand_institutional_responses r
             WHERE r.demand_id = d.id AND r.organization_id = $1) AS org_responded`;

const baseCte = (where) => `
  base AS (
    SELECT d.id, d.category, d.territory, d.municipality, d.uf, d.published_at,${BASE_FLAGS}
      FROM demands d
      LEFT JOIN demand_institutional_tracks t ON t.demand_id = d.id AND t.organization_id = $1
     WHERE ${where.join(' AND ')}
  )`;

const territoryLabel = "coalesce(nullif(btrim(b.territory), ''), nullif(btrim(b.municipality), ''), 'Não informado')";

/** Os 10 indicadores do slide 14, numa consulta agregada. */
async function loadIndicators(db, { organizationId, profile, filters }) {
  const { params, where } = baseClauses({ organizationId, profile, filters });
  params.push(LIMITS.groups);
  const groupLimit = `$${params.length}`;
  const { rows } = await db.query(`
    WITH ${baseCte(where)},
    totals AS (
      SELECT count(*)::int AS received,
             count(*) FILTER (WHERE b.urgent)::int AS urgent,
             count(*) FILTER (WHERE b.forwarded)::int AS forwarded,
             count(*) FILTER (WHERE b.in_execution)::int AS in_execution,
             count(*) FILTER (WHERE b.concluded)::int AS concluded,
             count(*) FILTER (WHERE b.supported)::int AS supported
        FROM base b
    ),
    terr AS (
      SELECT ${territoryLabel} AS label, b.uf,
             count(*)::int AS total,
             count(*) FILTER (WHERE b.urgent)::int AS urgent,
             count(*) FILTER (WHERE b.concluded)::int AS concluded
        FROM base b GROUP BY 1, 2 ORDER BY 3 DESC, 1 LIMIT ${groupLimit}
    ),
    cat AS (
      SELECT b.category::text AS category,
             count(*)::int AS total,
             count(*) FILTER (WHERE b.urgent)::int AS urgent,
             count(*) FILTER (WHERE b.concluded)::int AS concluded
        FROM base b GROUP BY 1
    ),
    acc AS (
      SELECT coalesce(sum(a.beneficiaries_reached), 0)::bigint AS beneficiaries,
             count(*)::int AS reports
        FROM demand_accountability a JOIN base b ON b.id = a.demand_id
       WHERE a.status = 'concluida'
    ),
    res AS (
      SELECT count(*)::int AS registered
        FROM demand_accountability_results r JOIN base b ON b.id = r.demand_id
    )
    SELECT (SELECT row_to_json(t) FROM totals t) AS totals,
           coalesce((SELECT json_agg(x) FROM terr x), '[]'::json) AS by_territory,
           coalesce((SELECT json_agg(x) FROM cat x), '[]'::json) AS by_category,
           (SELECT row_to_json(a) FROM acc a) AS accountability,
           (SELECT registered FROM res) AS results`, params);
  const row = rows[0] ?? {};
  const totals = row.totals ?? {};
  const byCategory = new Map((row.by_category ?? []).map((c) => [c.category, c]));
  return {
    indicators: {
      demandas_recebidas: totals.received ?? 0,
      demandas_urgentes: totals.urgent ?? 0,
      demandas_encaminhadas: totals.forwarded ?? 0,
      demandas_em_execucao: totals.in_execution ?? 0,
      demandas_concluidas: totals.concluded ?? 0,
      projetos_apoiados: totals.supported ?? 0,
      beneficiarios_alcancados: Number(row.accountability?.beneficiaries ?? 0),
      resultados_registrados: row.results ?? 0,
    },
    accountabilityReports: row.accountability?.reports ?? 0,
    byTerritory: (row.by_territory ?? []).map((t) => ({
      label: t.label, uf: t.uf ?? null, total: t.total, urgent: t.urgent, concluded: t.concluded,
    })),
    // As 5 categorias sempre aparecem, inclusive com zero: o painel mostra a
    // distribuição inteira, não só o que existe.
    byCategory: CATEGORIES.map((category) => {
      const found = byCategory.get(category);
      return {
        category,
        total: found?.total ?? 0,
        urgent: found?.urgent ?? 0,
        concluded: found?.concluded ?? 0,
      };
    }),
  };
}

/**
 * Priorização de áreas: por território e por categoria, com volume, urgência e
 * tempo sem resposta institucional **do próprio órgão**. Não compara órgãos.
 */
async function loadPriorityAreas(db, { organizationId, profile, filters }) {
  const { params, where } = baseClauses({ organizationId, profile, filters });
  const waiting = `
             count(*)::int AS total,
             count(*) FILTER (WHERE b.urgent)::int AS urgent,
             count(*) FILTER (WHERE NOT b.org_responded)::int AS without_response,
             coalesce(max(EXTRACT(EPOCH FROM ($3::timestamptz - b.published_at)) / 86400)
                        FILTER (WHERE NOT b.org_responded), 0)::float8 AS oldest_wait_days,
             coalesce(avg(EXTRACT(EPOCH FROM ($3::timestamptz - b.published_at)) / 86400)
                        FILTER (WHERE NOT b.org_responded), 0)::float8 AS average_wait_days`;
  const { rows } = await db.query(`
    WITH ${baseCte(where)},
    terr AS (
      SELECT 'territorio'::text AS kind, ${territoryLabel} AS label, b.uf,${waiting}
        FROM base b GROUP BY 1, 2, 3
    ),
    cat AS (
      SELECT 'categoria'::text AS kind, b.category::text AS label, NULL::char(2) AS uf,${waiting}
        FROM base b GROUP BY 1, 2, 3
    ),
    -- Priorização por eixo temático (T26): mesma fila de trabalho, recortada
    -- pelos nove eixos do slide 26. Demanda sem eixo não entra nesta lista.
    thm AS (
      SELECT 'eixo'::text AS kind, t.theme::text AS label, NULL::char(2) AS uf,${waiting}
        FROM base b JOIN demand_themes t ON t.demand_id = b.id GROUP BY 1, 2, 3
    )
    SELECT * FROM terr UNION ALL SELECT * FROM cat UNION ALL SELECT * FROM thm`, params);
  const map = (row) => ({
    label: row.label,
    uf: row.uf ?? null,
    total: row.total,
    urgent: row.urgent,
    withoutResponse: row.without_response,
    oldestWaitDays: Math.round(Number(row.oldest_wait_days) * 10) / 10,
    averageWaitDays: Math.round(Number(row.average_wait_days) * 10) / 10,
  });
  return {
    territories: rows.filter((r) => r.kind === 'territorio').map(map),
    categories: rows.filter((r) => r.kind === 'categoria').map(map),
    themes: rows.filter((r) => r.kind === 'eixo').map(map),
  };
}

/**
 * Medição de impacto: o que aconteceu nas demandas em que o órgão atuou
 * (prestação de contas da T18), mais o que o próprio órgão registrou no período.
 */
async function loadImpact(db, { organizationId, filters }) {
  const params = [organizationId, PUBLIC_STATUSES, filters.period.to, filters.period.from];
  const { rows } = await db.query(`
    WITH acted AS (
      SELECT d.id, d.status
        FROM demands d
        JOIN demand_institutional_tracks t ON t.demand_id = d.id AND t.organization_id = $1
       WHERE d.status = ANY($2::demand_status[]) AND d.published_at IS NOT NULL
         AND d.published_at <= $3::timestamptz
         AND ($4::timestamptz IS NULL OR d.published_at >= $4::timestamptz)
    ),
    reports AS (
      SELECT count(*)::int AS concluded_reports,
             coalesce(sum(a.beneficiaries_reached), 0)::bigint AS beneficiaries,
             coalesce(sum(a.executed_amount_cents), 0)::bigint AS executed_cents
        FROM demand_accountability a JOIN acted x ON x.id = a.demand_id
       WHERE a.status = 'concluida'
    ),
    results AS (
      SELECT count(*)::int AS registered,
             count(*) FILTER (WHERE r.achieved)::int AS achieved
        FROM demand_accountability_results r JOIN acted x ON x.id = r.demand_id
    ),
    own AS (
      SELECT
        (SELECT count(*)::int FROM demand_institutional_responses r
          WHERE r.organization_id = $1 AND r.created_at <= $3::timestamptz
            AND ($4::timestamptz IS NULL OR r.created_at >= $4::timestamptz)) AS responses,
        (SELECT count(*)::int FROM demand_institutional_offers o
          WHERE o.organization_id = $1 AND o.created_at <= $3::timestamptz
            AND ($4::timestamptz IS NULL OR o.created_at >= $4::timestamptz)) AS offers,
        (SELECT count(*)::int FROM demand_forwardings f
          WHERE f.organization_id = $1 AND f.forwarded_at <= $3::timestamptz
            AND ($4::timestamptz IS NULL OR f.forwarded_at >= $4::timestamptz)) AS forwardings,
        (SELECT count(*)::int FROM government_actions g
          WHERE g.organization_id = $1 AND g.published_at <= $3::timestamptz
            AND ($4::timestamptz IS NULL OR g.published_at >= $4::timestamptz)) AS actions
    )
    SELECT (SELECT count(*)::int FROM acted) AS demands_acted_on,
           (SELECT count(*)::int FROM acted
             WHERE status IN ('concluida', 'prestacao_de_contas', 'encerrada')) AS concluded,
           (SELECT count(*)::int FROM supports s JOIN acted x ON x.id = s.demand_id
             WHERE s.canceled_at IS NULL AND s.status <> 'rejected') AS supports,
           (SELECT row_to_json(r) FROM reports r) AS reports,
           (SELECT row_to_json(r) FROM results r) AS results,
           (SELECT row_to_json(o) FROM own o) AS own`, params);
  const row = rows[0] ?? {};
  return {
    demandsActedOn: row.demands_acted_on ?? 0,
    concluded: row.concluded ?? 0,
    accountabilityConcluded: row.reports?.concluded_reports ?? 0,
    beneficiariesReached: Number(row.reports?.beneficiaries ?? 0),
    executedAmountCents: Number(row.reports?.executed_cents ?? 0),
    resultsRecorded: row.results?.registered ?? 0,
    goalsAchieved: row.results?.achieved ?? 0,
    supports: row.supports ?? 0,
    offers: row.own?.offers ?? 0,
    responses: row.own?.responses ?? 0,
    forwardings: row.own?.forwardings ?? 0,
    actions: row.own?.actions ?? 0,
  };
}

// ── Divulgação de ações ─────────────────────────────────────────────────────

const ACTION_SQL = `
  g.id, g.organization_id, g.organization_name, g.department, g.post_id, g.demand_id, g.response_id,
  g.kind, g.title, g.summary, g.program_name, g.program_url, g.territory, g.municipality, g.uf,
  to_char(g.starts_on, 'YYYY-MM-DD') AS starts_on, to_char(g.ends_on, 'YYYY-MM-DD') AS ends_on,
  g.author_name, g.published_at`;

// Mesma projeção sem o alias, para o RETURNING do INSERT.
const ACTION_RETURNING = ACTION_SQL.replace(/\bg\./g, '');

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

function serializeAction(row, extra = {}) {
  return {
    id: row.id,
    organizationName: row.organization_name,
    department: row.department ?? null,
    postId: row.post_id,
    demandId: row.demand_id ?? null,
    demandTitle: extra.demandTitle ?? row.demand_title ?? null,
    responseId: row.response_id ?? null,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    programName: row.program_name ?? null,
    programUrl: row.program_url ?? null,
    territory: row.territory ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    startsOn: row.starts_on ?? null,
    endsOn: row.ends_on ?? null,
    publishedAt: toIso(row.published_at),
  };
}

/** Ações divulgadas pelo órgão, da mais recente para a mais antiga. */
async function listActions(db, organizationId, { limit = LIMITS.actions } = {}) {
  const { rows } = await db.query(
    `SELECT ${ACTION_SQL}, d.title AS demand_title
       FROM government_actions g
       LEFT JOIN demands d ON d.id = g.demand_id
      WHERE g.organization_id = $1
      ORDER BY g.published_at DESC, g.id DESC
      LIMIT $2`,
    [organizationId, Math.min(Number(limit) || LIMITS.actions, LIMITS.actions)],
  );
  return rows.map((row) => serializeAction(row));
}

/** Ações públicas ligadas a uma demanda (entram na página e na linha do tempo). */
async function listDemandActions(db, demandId) {
  const { rows } = await db.query(
    `SELECT ${ACTION_SQL} FROM government_actions g
      WHERE g.demand_id = $1 ORDER BY g.published_at, g.id`,
    [demandId],
  );
  return rows.map((row) => serializeAction(row));
}

/**
 * Publica a ação: post do feed (`message`), resposta institucional da T13
 * quando há demanda ligada (é ela que vai para a linha do tempo) e o vínculo
 * institucional. Tudo numa transação.
 */
async function createAction(pool, { value, organizationId, profile, user }) {
  return withTransaction(pool, async (client) => {
    let responseId = null;
    if (value.demandId) {
      await institutionalStore.loadOpenDemand(client, value.demandId, { lock: true });
      const { row: track } = await institutionalStore.ensureTrack(client, {
        demandId: value.demandId, organizationId, profile, user,
      });
      const response = actionResponse(value);
      const { rows } = await client.query(
        `INSERT INTO demand_institutional_responses
           (track_id, demand_id, organization_id, response_type, body, responsible_sector, program_name,
            program_url, planned_for, author_id, author_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [
          track.id, track.demand_id, track.organization_id, response.type, response.body,
          response.responsibleSector, response.programName, response.programUrl, response.plannedFor,
          user.userId, user.name || user.email || null,
        ],
      );
      responseId = rows[0].id;
    }

    const { rows: [post] } = await client.query(
      `INSERT INTO posts (author_id, author_name, author_avatar, type, title, description, neighborhood, city, state, tags)
       VALUES ($1, $2, $3, 'message', $4, $5, $6, $7, $8, $9) RETURNING id`,
      [
        user.userId, profile?.name || user.name || null, user.avatarUrl || null,
        value.title, value.summary, value.territory, value.municipality || profile?.municipality || null,
        value.uf || profile?.uf || null, [value.kind],
      ],
    );

    const { rows: [action] } = await client.query(
      `INSERT INTO government_actions
         (organization_id, organization_name, government_sphere, department, post_id, demand_id, response_id,
          kind, title, summary, program_name, program_url, territory, municipality, uf, starts_on, ends_on,
          author_id, author_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING ${ACTION_RETURNING}`,
      [
        organizationId, profile?.name || 'Órgão do Poder Público', profile?.governmentSphere ?? null,
        profile?.department ?? null, post.id, value.demandId, responseId, value.kind, value.title,
        value.summary, value.programName, value.programUrl, value.territory,
        value.municipality || profile?.municipality || null, value.uf || profile?.uf || null,
        value.startsOn, value.endsOn, user.userId, user.name || user.email || null,
      ],
    );
    return serializeAction(action);
  });
}

/** Erros dos gatilhos da migração 019 → HTTP. */
function mapActionError(err) {
  if (err instanceof HttpError) return err;
  const message = String(err?.message ?? '');
  if (err?.code === '23514' || err?.code === '0A000' || /divulgação de ação|ação só se liga/.test(message)) {
    return new HttpError(409, { error: message.replace(/^.*?: /, '') || 'Não foi possível publicar a ação', code: 'action_rejected' });
  }
  return mapDbError(err);
}

module.exports = {
  baseClauses,
  loadIndicators,
  loadPriorityAreas,
  loadImpact,
  listActions,
  listDemandActions,
  createAction,
  serializeAction,
  mapActionError,
  ACTION_SQL,
};
