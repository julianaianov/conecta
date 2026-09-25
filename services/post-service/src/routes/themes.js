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
const { THEMES, THEME_LABELS } = require('../demand/constants');
const { territorySlug } = require('../map/constants');
const { mapFilter } = require('../map/query');

// Teto de linhas da agregação (eixo × território). Nove eixos × 500 lugares é o
// mesmo teto do `/map/territories`.
const INTELLIGENCE_MAX = 500;

const THEME_REFERENCE = THEMES.map((theme) => ({ theme, label: THEME_LABELS[theme] }));

const SOURCE = 'Apresentação Institucional, slide 26: "Dados e inteligência territorial como ativo".';

/**
 * Agregação eixo × território, numa consulta: o total por eixo, o total por
 * território e o cruzamento dos dois. `demand_themes` é a tabela de vínculo da
 * migração 023; demanda sem eixo simplesmente não entra na leitura por tema.
 */
function intelligenceSql(where, limitParam) {
  return `
    WITH base AS (
      SELECT d.id, d.territory, d.municipality, d.uf,
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
    )
    SELECT (SELECT count(*)::int FROM base) AS demands_total,
           (SELECT count(DISTINCT id)::int FROM marked) AS demands_with_theme,
           coalesce((SELECT json_agg(x) FROM by_theme x), '[]'::json) AS by_theme,
           coalesce((SELECT json_agg(x) FROM crossed x), '[]'::json) AS crossed`;
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
    res.json({
      source: SOURCE,
      generatedAt: new Date().toISOString(),
      demandsTotal: row.demands_total ?? 0,
      demandsWithTheme: row.demands_with_theme ?? 0,
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
module.exports.intelligenceSql = intelligenceSql;
