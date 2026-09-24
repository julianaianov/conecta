// Consultas do mapa inteligente (T20).
//
// Todo recorte do mapa é limitado: a lista de pontos tem teto, o agrupamento
// devolve células e a contagem por camada usa agregação no banco. Nenhuma
// requisição varre a tabela inteira sem índice — a migração post 016 cria
// `idx_demands_map_points` (status + coordenadas) e `idx_demands_map_place`
// (status + UF/município/território), que atendem os dois recortes.

const { HttpError } = require('../demand/store');
const {
  CATEGORIES, PRIORITIES, PUBLIC_STATUSES, THEMES,
  CELLS_MAX, POINTS_MAX, TERRITORIES_MAX, ZOOM_MAX, ZOOM_MIN, cellSizeDegrees,
} = require('./constants');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validationError(fields) {
  return new HttpError(422, { error: 'Filtro inválido', code: 'validation_failed', fields });
}

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

function parseBbox(raw, fields) {
  if (raw === undefined || raw === '') return null;
  const parts = String(raw).split(',').map((v) => Number(v.trim()));
  const [west, south, east, north] = parts;
  const valid = parts.length === 4 && parts.every(Number.isFinite)
    && Math.abs(south) <= 90 && Math.abs(north) <= 90
    && Math.abs(west) <= 180 && Math.abs(east) <= 180
    && south <= north && west <= east;
  if (!valid) {
    fields.bbox = 'Use bbox=oeste,sul,leste,norte (longitude e latitude em graus)';
    return null;
  }
  return { west, south, east, north };
}

function parseZoom(raw, fields) {
  if (raw === undefined || raw === '') return 12;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < ZOOM_MIN || parsed > ZOOM_MAX) {
    fields.zoom = `Entre ${ZOOM_MIN} e ${ZOOM_MAX}`;
    return 12;
  }
  return parsed;
}

function parseLimit(raw, fields) {
  if (raw === undefined || raw === '') return POINTS_MAX;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > POINTS_MAX) {
    fields.limit = `Entre 1 e ${POINTS_MAX}`;
    return POINTS_MAX;
  }
  return parsed;
}

/**
 * Filtros do mapa → WHERE parametrizado. Sempre restrito aos status públicos e
 * a demandas com coordenada (`geo`), porque o mapa só mostra o que tem ponto.
 */
function mapFilter(query, { geo = true } = {}) {
  const fields = {};
  const params = [];
  const where = ['d.status = ANY($1::demand_status[])'];
  const statuses = parseList(query.status, PUBLIC_STATUSES, 'status', fields);
  params.push(statuses ?? PUBLIC_STATUSES);
  // Ponto e fotografia: o mapa só mostra demanda com os dois (a fotografia já
  // é obrigatória no envio; a coordenada passou a ser, migração 024).
  if (geo) where.push("d.latitude IS NOT NULL AND d.longitude IS NOT NULL AND coalesce(btrim(d.photo_ref), '') <> ''");

  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };

  const categories = parseList(query.category, CATEGORIES, 'category', fields);
  if (categories) add('d.category = ANY(?::demand_category[])', categories);
  const priorities = parseList(query.priority, PRIORITIES, 'priority', fields);
  if (priorities) add('d.priority = ANY(?::demand_priority[])', priorities);
  // Eixo temático (T26, slide 26): a camada por eixo do mapa. A demanda entra
  // se tiver **algum** dos eixos pedidos; `demand_themes` é lida pelo índice
  // `idx_demand_themes_theme` (migração post 023).
  const themes = parseList(query.theme, THEMES, 'theme', fields);
  if (themes) {
    add(`EXISTS (SELECT 1 FROM demand_themes dt
                   WHERE dt.demand_id = d.id AND dt.theme = ANY(?::demand_theme[]))`, themes);
  }

  for (const [param, column] of [
    ['territory', 'd.territory'], ['municipality', 'd.municipality'], ['district', 'd.district'],
  ]) {
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
    where.push(`(d.title ILIKE ${p} ESCAPE '\\' OR d.territory ILIKE ${p} ESCAPE '\\' OR d.municipality ILIKE ${p} ESCAPE '\\')`);
  }

  // Período de publicação (datas ISO, inclusive nas duas pontas).
  for (const param of ['from', 'to']) {
    const value = typeof query[param] === 'string' ? query[param].trim() : '';
    if (!value) continue;
    if (!DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
      fields[param] = 'Use uma data no formato AAAA-MM-DD';
      continue;
    }
    params.push(value);
    where.push(param === 'from'
      ? `d.published_at >= $${params.length}::date`
      : `d.published_at < ($${params.length}::date + 1)`);
  }

  const bbox = parseBbox(query.bbox, fields);
  if (bbox) {
    params.push(bbox.south, bbox.north, bbox.west, bbox.east);
    const n = params.length;
    where.push(`d.latitude BETWEEN $${n - 3} AND $${n - 2} AND d.longitude BETWEEN $${n - 1} AND $${n}`);
  }

  const zoom = parseZoom(query.zoom, fields);
  const limit = parseLimit(query.limit, fields);
  if (Object.keys(fields).length) throw validationError(fields);
  return { where: where.join(' AND '), params, zoom, limit, bbox };
}

/** `count(*) FILTER (...)` por valor de enum; as listas são constantes do código. */
function filteredCounts(column, values, prefix) {
  return values
    .map((value) => `count(*) FILTER (WHERE d.${column} = '${value}')::int AS ${prefix}_${value}`)
    .join(',\n         ');
}

/**
 * Contagem por eixo temático (T26): os eixos são um vínculo (uma demanda pode
 * ter vários), então cada demanda do recorte traz a sua lista por um LATERAL
 * indexado (`idx_demand_themes_theme`, chave primária da tabela de vínculo) e a
 * contagem sai do mesmo agregado — a consulta continua sendo uma só.
 */
const THEMES_LATERAL = `
   LEFT JOIN LATERAL (
     SELECT array_agg(dt.theme::text) AS list FROM demand_themes dt WHERE dt.demand_id = d.id
   ) th ON true`;

function themeCounts() {
  return THEMES
    .map((theme) => `count(*) FILTER (WHERE th.list @> ARRAY['${theme}'])::int AS thm_${theme}`)
    .join(',\n         ');
}

function countsSql(where) {
  return `SELECT count(*)::int AS total,
         ${filteredCounts('category', CATEGORIES, 'cat')},
         ${filteredCounts('priority', PRIORITIES, 'pri')},
         ${filteredCounts('status', PUBLIC_STATUSES, 'sta')},
         ${themeCounts()},
         count(*) FILTER (WHERE th.list IS NOT NULL)::int AS thm_total
    FROM demands d${THEMES_LATERAL}
   WHERE ${where}`;
}

function serializeCounts(row) {
  const pick = (values, prefix) => Object.fromEntries(
    values.map((value) => [value, Number(row?.[`${prefix}_${value}`] ?? 0)]),
  );
  return {
    total: Number(row?.total ?? 0),
    category: pick(CATEGORIES, 'cat'),
    priority: pick(PRIORITIES, 'pri'),
    status: pick(PUBLIC_STATUSES, 'sta'),
    theme: pick(THEMES, 'thm'),
    // Quantas demandas do recorte já têm eixo marcado (o eixo é opcional).
    themed: Number(row?.thm_total ?? 0),
  };
}

/** Projeção pública do ponto: sem autor, sem endereço fino, sem orçamento. */
const POINT_SQL = `
  d.id, d.category::text AS category, d.priority::text AS priority, d.status::text AS status,
  d.title, d.district, d.municipality, d.uf, d.territory, d.latitude, d.longitude, d.published_at,
  (SELECT p.id FROM posts p WHERE p.demand_id = d.id AND p.visibility = 'visible') AS post_id`;

function pointsSql(where, limitParam) {
  return `SELECT ${POINT_SQL}
            FROM demands d
           WHERE ${where}
           ORDER BY d.published_at DESC NULLS LAST, d.id DESC
           LIMIT $${limitParam}`;
}

function serializePoint(row) {
  return {
    id: row.id,
    category: row.category,
    priority: row.priority,
    status: row.status,
    title: row.title,
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    territory: row.territory ?? null,
    latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
    publishedAt: row.published_at instanceof Date ? row.published_at.toISOString() : row.published_at ?? null,
    postId: row.post_id ?? null,
  };
}

/** Agrupamento por célula da grade (graus), com contagem por classe da legenda. */
function clustersSql(where, sizeParam, limitParam) {
  return `SELECT floor(d.longitude / $${sizeParam})::int AS cell_x,
                 floor(d.latitude / $${sizeParam})::int AS cell_y,
                 count(*)::int AS total,
                 avg(d.latitude)::float8 AS latitude,
                 avg(d.longitude)::float8 AS longitude,
                 ${filteredCounts('category', CATEGORIES, 'cat')}
            FROM demands d
           WHERE ${where}
           GROUP BY cell_x, cell_y
           ORDER BY total DESC, cell_x, cell_y
           LIMIT $${limitParam}`;
}

function serializeCluster(row, cellSize) {
  return {
    id: `${row.cell_x}:${row.cell_y}`,
    total: Number(row.total),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    cellSize,
    category: Object.fromEntries(CATEGORIES.map((c) => [c, Number(row[`cat_${c}`] ?? 0)])),
  };
}

/** Agregação por território (bairro/comunidade/região), para a página pública. */
function territoriesSql(where, limitParam) {
  return `SELECT d.territory, d.municipality, d.uf,
                 count(*)::int AS total,
                 max(d.published_at) AS last_published_at,
                 avg(d.latitude)::float8 AS latitude,
                 avg(d.longitude)::float8 AS longitude,
                 ${filteredCounts('category', CATEGORIES, 'cat')},
                 ${themeCounts()}
            FROM demands d${THEMES_LATERAL}
           WHERE ${where} AND d.territory IS NOT NULL AND btrim(d.territory) <> ''
           GROUP BY d.territory, d.municipality, d.uf
           ORDER BY total DESC, d.territory
           LIMIT $${limitParam}`;
}

module.exports = {
  THEMES_LATERAL,
  themeCounts,
  CELLS_MAX,
  POINTS_MAX,
  TERRITORIES_MAX,
  cellSizeDegrees,
  mapFilter,
  countsSql,
  serializeCounts,
  pointsSql,
  serializePoint,
  clustersSql,
  serializeCluster,
  territoriesSql,
  validationError,
};
