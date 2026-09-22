// Mapa inteligente (T20): o espelho do frontend precisa ser igual ao do
// post-service (services/post-service/src/map/constants.js) e à legenda
// literal do slide 19 da Apresentação Institucional.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  MAP_AUDIENCES,
  MAP_CLUSTER_THRESHOLD,
  MAP_FEED_LAYER,
  MAP_LEGEND,
  MAP_LEGEND_BY_CATEGORY,
  MAP_POINTS_MAX,
  MAP_SHAPE_LABELS,
  MAP_ZOOM_MAX,
  MAP_ZOOM_MIN,
  audienceFilter,
  buildMapQuery,
  clusterLegend,
  clusterRadius,
  emptyMapFilter,
  mapCellSizeDegrees,
  mapLegendFor,
  matchesAudience,
  territorySlug,
  toggleValue,
} from "./map.ts";
import { DEMAND_CATEGORY_LABELS } from "./types.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/map/constants.js");

test("a legenda é a do slide 19, uma classe por categoria da demanda", () => {
  assert.deepEqual(MAP_LEGEND.map((l) => l.label), [
    "Problemas urgentes",
    "Problemas urbanos",
    "Projetos sociais",
    "Ações ambientais",
    "Necessidades (Oportunidades de patrocínio)",
  ]);
  assert.deepEqual(MAP_LEGEND, server.LEGEND);
  assert.deepEqual(
    [...MAP_LEGEND.map((l) => l.category)].sort(),
    Object.keys(DEMAND_CATEGORY_LABELS).sort(),
  );
  assert.deepEqual(MAP_FEED_LAYER, server.FEED_LAYER);
});

test("cada classe tem cor e forma próprias, todas do manual de marca", () => {
  const palette = new Set([
    "#1B4F72", "#0D2D42", "#2E7BA8", "#5A9BC4", "#D6EAF8",
    "#F4841A", "#F89B45", "#343A40", "#868E96", "#E53935", "#2E9E5B",
  ]);
  for (const item of [...MAP_LEGEND, MAP_FEED_LAYER]) {
    assert.ok(palette.has(item.color), `${item.id}: ${item.color}`);
    assert.ok(MAP_SHAPE_LABELS[item.shape], `sem rótulo para a forma ${item.shape}`);
  }
  assert.equal(new Set(MAP_LEGEND.map((l) => l.color)).size, MAP_LEGEND.length);
  assert.equal(new Set(MAP_LEGEND.map((l) => l.shape)).size, MAP_LEGEND.length);
});

test("os atalhos de leitura rápida são os quatro públicos do slide 19", () => {
  assert.deepEqual(MAP_AUDIENCES, server.AUDIENCES);
  assert.deepEqual(MAP_AUDIENCES.map((a) => a.id), ["governo", "empresas", "imprensa", "comunidade"]);
  // Empresas: patrocínio e demandas em busca de parceiro (permissões dos slides 10–11).
  const empresas = MAP_AUDIENCES.find((a) => a.id === "empresas");
  assert.ok(empresas.filter.category.includes("necessidade_de_patrocinio"));
  assert.ok(empresas.filter.status.includes("em_busca_de_parceiro"));
  assert.equal(empresas.layers.feed, false);
  // Comunidade e imprensa enxergam também os conteúdos do feed (slide 18).
  assert.equal(MAP_AUDIENCES.find((a) => a.id === "comunidade").layers.feed, true);
  assert.equal(MAP_AUDIENCES.find((a) => a.id === "imprensa").layers.feed, true);
});

test("limites e tamanho da célula seguem o post-service", () => {
  assert.equal(MAP_CLUSTER_THRESHOLD, server.CLUSTER_THRESHOLD);
  assert.equal(MAP_POINTS_MAX, server.POINTS_MAX);
  assert.equal(MAP_ZOOM_MIN, server.ZOOM_MIN);
  assert.equal(MAP_ZOOM_MAX, server.ZOOM_MAX);
  for (const zoom of [1, 8, 12, 18, 99, 0, Number.NaN]) {
    assert.equal(mapCellSizeDegrees(zoom), server.cellSizeDegrees(zoom), `zoom ${zoom}`);
  }
});

test("o slug do território é o mesmo dos dois lados", () => {
  const places = [
    { territory: "Jardim São José", municipality: "Duque de Caxias", uf: "RJ" },
    { territory: "Vila Kennedy", municipality: "Rio de Janeiro", uf: "RJ" },
    { territory: "Centro", municipality: null, uf: null },
    { territory: "  ", municipality: null, uf: null },
  ];
  for (const place of places) assert.equal(territorySlug(place), server.territorySlug(place));
  assert.equal(territorySlug(places[0]), "jardim-sao-jose-duque-de-caxias-rj");
});

test("mapLegendFor devolve a classe da categoria", () => {
  assert.equal(mapLegendFor("problema_urgente").color, "#E53935");
  assert.equal(MAP_LEGEND_BY_CATEGORY.projeto_ambiental.label, "Ações ambientais");
});

test("buildMapQuery só manda o que foi escolhido", () => {
  assert.equal(buildMapQuery(emptyMapFilter()), "");
  const filter = {
    ...emptyMapFilter(),
    category: ["problema_urgente"],
    priority: ["alta"],
    status: ["publicada"],
    territory: " Vila Kennedy ",
    uf: "rj",
    from: "2026-01-01",
    to: "2026-09-30",
  };
  const query = new URLSearchParams(buildMapQuery(filter, { bbox: [-43.6, -23.1, -43.2, -22.9], zoom: 13, limit: 100 }));
  assert.equal(query.get("category"), "problema_urgente");
  assert.equal(query.get("territory"), "Vila Kennedy");
  assert.equal(query.get("uf"), "RJ");
  assert.equal(query.get("bbox"), "-43.6,-23.1,-43.2,-22.9");
  assert.equal(query.get("zoom"), "13");
  assert.equal(query.get("limit"), "100");
  assert.equal(query.get("from"), "2026-01-01");
});

test("o atalho só fica ativo quando os filtros são exatamente os dele", () => {
  const governo = MAP_AUDIENCES.find((a) => a.id === "governo");
  const filter = audienceFilter(governo);
  assert.ok(matchesAudience(filter, governo));
  assert.ok(!matchesAudience({ ...filter, territory: "Centro" }, governo));
  assert.ok(!matchesAudience(emptyMapFilter(), governo));
});

test("toggleValue liga e desliga um valor da lista", () => {
  assert.deepEqual(toggleValue([], "alta"), ["alta"]);
  assert.deepEqual(toggleValue(["alta"], "alta"), []);
});

test("o agrupamento ganha cor da classe dominante e raio pelo tamanho", () => {
  const counts = { problema_urgente: 2, problema_urbano: 9, projeto_social: 0, projeto_ambiental: 1, necessidade_de_patrocinio: 0 };
  assert.equal(clusterLegend(counts).category, "problema_urbano");
  assert.ok(clusterRadius(900) > clusterRadius(10));
});
