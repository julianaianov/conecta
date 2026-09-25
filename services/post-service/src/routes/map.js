// Mapa inteligente (T20): rotas públicas de leitura geográfica da demanda.
// Montada em `/demands` antes das rotas da demanda (o `/:id` de lá só aceita
// UUID, mas a ordem deixa o contrato explícito). Público em
// `/api/posts/demands/map` (o Caddy tira `/api/posts`).
//
//   GET /map              pontos ou agrupamento por célula, com contagens
//                         (filtros: category, priority, status, territory,
//                         municipality, district, uf, q, from, to, bbox,
//                         zoom, limit, theme)
//   GET /map/territories  agregação por território/município/UF
//   GET /map/legend       legenda, camadas e atalhos de leitura rápida
//
// Sem token e sem dado pessoal: o ponto leva id, categoria, prioridade,
// status, título, lugar, coordenada, data de publicação e o id do
// post-vitrine. Autor, endereço fino, CEP e orçamento ficam de fora.
//
// Nenhuma requisição faz varredura pesada: duas consultas agregadas com
// índice (migração post 016) e teto em pontos (500), células (400) e
// territórios (500). Acima do limiar, a resposta vem agrupada.

const express = require('express');
const { sendError } = require('../demand/store');
const {
  AUDIENCES, CATEGORY_LABELS, CLUSTER_THRESHOLD, FEED_LAYER, LEGEND, THEME_FILTERS, territorySlug,
} = require('../map/constants');
const {
  CELLS_MAX, TERRITORIES_MAX, cellSizeDegrees, mapFilter, countsSql, serializeCounts,
  pointsSql, serializePoint, clustersSql, serializeCluster, territoriesSql, categoryAndClassCounts,
} = require('../map/query');

module.exports = ({ pool }) => {
  const router = express.Router();
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };

  router.get('/map/legend', (_req, res) => {
    res.json({
      // Cinco classes do slide 19, cada uma com as suas categorias (§03).
      legend: LEGEND,
      categoryLabels: CATEGORY_LABELS,
      feedLayer: FEED_LAYER,
      // Filtro por eixo temático (T26): recorte que se cruza com a legenda.
      themes: THEME_FILTERS,
      audiences: AUDIENCES,
      clusterThreshold: CLUSTER_THRESHOLD,
    });
  });

  router.get('/map/territories', handle(async (req, res) => {
    const { where, params } = mapFilter(req.query, { geo: false });
    params.push(TERRITORIES_MAX);
    const { rows } = await pool.query(territoriesSql(where, params.length), params);
    res.json({
      territories: rows.map((row) => ({
        slug: territorySlug(row),
        territory: row.territory,
        municipality: row.municipality ?? null,
        uf: row.uf ?? null,
        total: Number(row.total),
        latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
        longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
        lastPublishedAt: row.last_published_at instanceof Date
          ? row.last_published_at.toISOString()
          : row.last_published_at ?? null,
        ...categoryAndClassCounts(row),
        theme: Object.fromEntries(THEME_FILTERS.map((item) => [item.id, Number(row[`thm_${item.id}`] ?? 0)])),
      })),
    });
  }));

  router.get('/map', handle(async (req, res) => {
    const { where, params, zoom, limit } = mapFilter(req.query);
    const { rows: countRows } = await pool.query(countsSql(where), params);
    const counts = serializeCounts(countRows[0]);

    if (counts.total > Math.max(limit, CLUSTER_THRESHOLD)) {
      const cellSize = cellSizeDegrees(zoom);
      const clusterParams = [...params, cellSize, CELLS_MAX];
      const { rows } = await pool.query(
        clustersSql(where, clusterParams.length - 1, clusterParams.length),
        clusterParams,
      );
      return res.json({
        mode: 'clusters',
        zoom,
        cellSize,
        counts,
        points: [],
        clusters: rows.map((row) => serializeCluster(row, cellSize)),
        truncated: true,
      });
    }

    const pointParams = [...params, limit];
    const { rows } = await pool.query(pointsSql(where, pointParams.length), pointParams);
    return res.json({
      mode: 'points',
      zoom,
      cellSize: cellSizeDegrees(zoom),
      counts,
      points: rows.map(serializePoint),
      clusters: [],
      truncated: counts.total > rows.length,
    });
  }));

  return router;
};
