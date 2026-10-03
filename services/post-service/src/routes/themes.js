// Eixos temáticos e inteligência territorial (T26). Montada em `/demands`
// antes das rotas da demanda; pública em `/api/posts/demands/themes*` (o Caddy
// tira `/api/posts`).
//
// Fonte: Apresentação Institucional, slide 26 — "a plataforma constrói um mapa
// contínuo das demandas e necessidades dos territórios" e "essas informações
// permitem identificar padrões, prioridades e oportunidades de atuação por
// território", com os nove eixos (Iluminação, Segurança, Saneamento, Limpeza,
// Esporte, Educação, Mobilidade, Cultura, Meio Ambiente).
//
//   GET /themes                 vocabulário: os nove eixos com o rótulo da fonte
//   GET /themes/intelligence    agregação eixo × território (filtros do mapa)
//
// Sem token e **sem dado pessoal**: só contagens, rótulos e nomes de lugar. É
// o mesmo recorte público do mapa (status públicos), com os filtros de
// `src/map/query.js` — inclusive `theme`, para olhar um eixo de cada vez.
//
// Custo por requisição: **uma** consulta agregada, servida por
// `idx_demand_themes_theme` (migração post 023) e pelos índices do mapa
// (migração post 016), com teto de linhas. Nada de varredura e nada de tabela
// de agregação: o painel do governo (T22) e o dm-gestao leem daqui.

const express = require('express');
const { sendError } = require('../demand/store');
const { THEMES, THEME_LABELS, PUBLIC_STATUSES } = require('../demand/constants');
const { territorySlug } = require('../map/constants');
const { mapFilter } = require('../map/query');

// Teto de linhas da agregação (eixo × território). Nove eixos × 500 lugares é o
// mesmo teto do `/map/territories`.
const INTELLIGENCE_MAX = 500;
const PUBLIC_ACTIONS_MAX = 4;

const THEME_REFERENCE = THEMES.map((theme) => ({ theme, label: THEME_LABELS[theme] }));

const SOURCE = 'Apresentação Institucional, slide 26: "Dados e inteligência territorial como ativo".';

/**
 * Agregação pública do painel numa consulta: eixos, status, mês, território e
 * articulações institucionais publicadas. `demand_themes` é a tabela de vínculo
 * da migração 023; demanda sem eixo simplesmente não entra na leitura por tema.
 */
function intelligenceSql(where, limitParam) {
  return `
    WITH base AS (
      SELECT d.id, d.territory, d.municipality, d.uf, d.status::text AS status,
             d.published_at,
             (d.priority = 'urgente' OR d.category = 'problema_urgente') AS urgent,
             (d.status IN ('concluida', 'prestacao_de_contas', 'encerrada')) AS concluded
        FROM demands d
       WHERE ${where}
    ),
    marked AS (
      SELECT b.*, t.theme::text AS theme
        FROM base b JOIN demand_themes t ON t.demand_id = b.id
    ),
    by_theme AS (
      SELECT theme,
             count(*)::int AS total,
             count(*) FILTER (WHERE urgent)::int AS urgent,
             count(*) FILTER (WHERE concluded)::int AS concluded,
             count(DISTINCT coalesce(nullif(btrim(territory), ''), '—'))::int AS territories
        FROM marked GROUP BY theme
    ),
    crossed AS (
      SELECT theme,
             coalesce(nullif(btrim(territory), ''), 'Não informado') AS territory,
             municipality, uf,
             count(*)::int AS total,
             count(*) FILTER (WHERE urgent)::int AS urgent,
             count(*) FILTER (WHERE concluded)::int AS concluded
        FROM marked GROUP BY 1, 2, 3, 4
       ORDER BY total DESC, theme, territory
       LIMIT $${limitParam}
    ),
    by_status AS (
      SELECT status, count(*)::int AS total
        FROM base GROUP BY status
    ),
    by_month AS (
      SELECT to_char(date_trunc('month', published_at), 'YYYY-MM') AS month,
             count(*)::int AS total
        FROM base
       WHERE published_at >= date_trunc('month', CURRENT_TIMESTAMP) - INTERVAL '11 months'
       GROUP BY 1
    ),
    territory_rollup AS (
      SELECT coalesce(nullif(btrim(territory), ''), nullif(btrim(municipality), ''), nullif(btrim(uf), '')) AS territory,
             municipality, uf,
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'em_execucao')::int AS in_execution,
             count(*) FILTER (WHERE concluded)::int AS concluded
        FROM base
       WHERE coalesce(nullif(btrim(territory), ''), nullif(btrim(municipality), ''), nullif(btrim(uf), '')) IS NOT NULL
       GROUP BY 1, 2, 3
    ),
    territory_totals AS (
      SELECT * FROM territory_rollup
       ORDER BY total DESC, territory, municipality, uf
       LIMIT $${limitParam}
    ),
    territory_keys AS (
      SELECT DISTINCT territory, municipality, uf
        FROM territory_rollup
    ),
    recent_actions AS (
      SELECT ga.id, ga.kind::text AS kind, ga.title, ga.organization_name,
             ga.territory, ga.municipality, ga.uf, ga.published_at
        FROM government_actions ga
        JOIN posts p ON p.id = ga.post_id AND p.visibility = 'visible'
        LEFT JOIN demands d ON d.id = ga.demand_id
       WHERE ga.demand_id IS NULL OR d.status = ANY($1::demand_status[])
       ORDER BY ga.published_at DESC, ga.id DESC
       LIMIT ${PUBLIC_ACTIONS_MAX}
    ),
    recent_demand AS (
      SELECT d.title, d.status::text AS status,
             coalesce(nullif(btrim(d.territory), ''), nullif(btrim(d.municipality), ''), nullif(btrim(d.uf), '')) AS territory,
             d.published_at
        FROM demands d
       WHERE ${where}
       ORDER BY d.published_at DESC NULLS LAST, d.id DESC
       LIMIT 1
    )
    SELECT (SELECT count(*)::int FROM base) AS demands_total,
           (SELECT count(DISTINCT id)::int FROM marked) AS demands_with_theme,
           coalesce((SELECT json_agg(x) FROM by_theme x), '[]'::json) AS by_theme,
           coalesce((SELECT json_agg(x) FROM crossed x), '[]'::json) AS crossed,
           coalesce((SELECT json_agg(x) FROM by_status x), '[]'::json) AS by_status,
           coalesce((SELECT json_agg(x) FROM by_month x), '[]'::json) AS by_month,
           coalesce((SELECT json_agg(x) FROM territory_totals x), '[]'::json) AS territories,
           (SELECT count(*)::int FROM territory_keys) AS territories_total,
           coalesce((SELECT json_agg(x) FROM recent_actions x), '[]'::json) AS recent_actions,
           (SELECT to_jsonb(x) FROM recent_demand x) AS recent_demand`;
}

function lastTwelveMonths(now = new Date()) {
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return Array.from({ length: 12 }, (_value, index) => {
    const date = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - 11 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

module.exports = ({ pool }) => {
  const router = express.Router();
  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };

  router.get('/themes', (_req, res) => {
    res.json({ themes: THEME_REFERENCE, required: false, source: SOURCE });
  });

  router.get('/themes/intelligence', handle(async (req, res) => {
    const { where, params } = mapFilter(req.query, { geo: false });
    params.push(INTELLIGENCE_MAX);
    const { rows } = await pool.query(intelligenceSql(where, params.length), params);
    const row = rows[0] ?? {};
    const byTheme = new Map((row.by_theme ?? []).map((t) => [t.theme, t]));
    const crossed = row.crossed ?? [];
    const byStatus = new Map((row.by_status ?? []).map((status) => [status.status, Number(status.total) || 0]));
    const byMonth = new Map((row.by_month ?? []).map((month) => [month.month, Number(month.total) || 0]));
    res.json({
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      demandsTotal: row.demands_total ?? 0,
      demandsWithTheme: row.demands_with_theme ?? 0,
      territoriesTotal: Number(row.territories_total) || 0,
      byStatus: PUBLIC_STATUSES.map((status) => ({ status, total: byStatus.get(status) ?? 0 })),
      byMonth: lastTwelveMonths().map((month) => ({ month, total: byMonth.get(month) ?? 0 })),
      territories: (row.territories ?? []).map((territory) => ({
        territory: territory.territory,
        municipality: territory.municipality ?? null,
        uf: territory.uf ?? null,
        total: Number(territory.total) || 0,
        inExecution: Number(territory.in_execution) || 0,
        concluded: Number(territory.concluded) || 0,
      })),
      recentGovernmentActions: (row.recent_actions ?? []).map((action) => ({
        id: action.id,
        kind: action.kind,
        title: action.title,
        organizationName: action.organization_name,
        territory: action.territory ?? null,
        municipality: action.municipality ?? null,
        uf: action.uf ?? null,
        publishedAt: action.published_at instanceof Date
          ? action.published_at.toISOString()
          : action.published_at ?? null,
      })),
      recentDemand: row.recent_demand ? {
        title: row.recent_demand.title,
        status: row.recent_demand.status,
        territory: row.recent_demand.territory ?? null,
        publishedAt: row.recent_demand.published_at instanceof Date
          ? row.recent_demand.published_at.toISOString()
          : row.recent_demand.published_at ?? null,
      } : null,
      // Os nove eixos aparecem sempre, inclusive zerados: a leitura do
      // território é a distribuição inteira, não só o que já tem demanda.
      themes: THEMES.map((theme) => {
        const found = byTheme.get(theme);
        return {
          theme,
          label: THEME_LABELS[theme],
          total: found?.total ?? 0,
          urgent: found?.urgent ?? 0,
          concluded: found?.concluded ?? 0,
          territories: found?.territories ?? 0,
        };
      }),
      byTerritory: crossed.map((c) => ({
        theme: c.theme,
        label: THEME_LABELS[c.theme] ?? c.theme,
        territory: c.territory,
        municipality: c.municipality ?? null,
        uf: c.uf ?? null,
        slug: territorySlug({ territory: c.territory, municipality: c.municipality, uf: c.uf }),
        total: c.total,
        urgent: c.urgent,
        concluded: c.concluded,
      })),
      truncated: crossed.length >= INTELLIGENCE_MAX,
    });
  }));

  return router;
};

module.exports.INTELLIGENCE_MAX = INTELLIGENCE_MAX;
module.exports.PUBLIC_ACTIONS_MAX = PUBLIC_ACTIONS_MAX;
module.exports.intelligenceSql = intelligenceSql;
module.exports.lastTwelveMonths = lastTwelveMonths;
