// Landing: os gráficos e o painel vêm só da leitura pública do banco. Sem
// leitura (null) ou sem registro, o resultado é vazio: nada de amostra.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LANDING_PUBLIC_STAGES, emptyLandingMapFilter, formatCompactBRL, governmentActionRows, landingMapFilterCount,
  landingMapQueryFilter, mapFlow, monthAbbreviation, monthBars,
  niceMax, normalizeMapView, normalizeThemeIntelligence, resourceRows, stageTotals, territoryRows, themeRows,
} from "./landing.ts";

const intelligence = {
  source: "fonte",
  generatedAt: "2026-10-04T00:00:00.000Z",
  demandsTotal: 12,
  demandsWithTheme: 9,
  territoriesTotal: 3,
  totals: { budgetCents: 4500000, mobilizedCents: 3550000, beneficiariesReached: 1840 },
  byStatus: [
    { status: "publicada", total: 5 },
    { status: "em_execucao", total: 4 },
    { status: "concluida", total: 3 },
  ],
  byMonth: [{ month: "2026-09", total: 3 }, { month: "2026-10", total: 9 }],
  territories: [
    { territory: "Recreio", municipality: "Rio de Janeiro", uf: "RJ", total: 6, inExecution: 2, concluded: 1 },
    { territory: "Centro", municipality: "Niterói", uf: "RJ", total: 4, inExecution: 4, concluded: 0 },
    { territory: "Sé", municipality: "São Paulo", uf: "SP", total: 2, inExecution: 0, concluded: 2 },
  ],
  recentGovernmentActions: [{
    id: "a1", kind: "edital", title: "Edital de cultura", organizationName: "Secretaria Municipal",
    territory: "Centro", municipality: "Niterói", uf: "RJ", publishedAt: "2026-10-01T10:00:00.000Z",
  }, {
    id: "a2", kind: "tipo_novo", title: "Outra", organizationName: "Órgão", territory: null,
    municipality: null, uf: null, publishedAt: null,
  }],
  recentDemand: null,
  themes: [
    { theme: "cultura", label: "Cultura", total: 2, urgent: 0, concluded: 0, territories: 1, budgetCents: 1000000, mobilizedCents: 250000 },
    { theme: "educacao", label: "Educação", total: 5, urgent: 1, concluded: 1, territories: 2, budgetCents: 3000000, mobilizedCents: 3300000 },
    { theme: "limpeza", label: "Limpeza", total: 0, urgent: 0, concluded: 0, territories: 0, budgetCents: 0, mobilizedCents: 0 },
    { theme: "esporte", label: "Esporte", total: 2, urgent: 0, concluded: 0, territories: 1, budgetCents: 500000, mobilizedCents: 0 },
  ],
  byTerritory: [
    { theme: "cultura", label: "Cultura", territory: "Recreio", municipality: "Rio de Janeiro", uf: "RJ", slug: "a", total: 1, urgent: 0, concluded: 0 },
    { theme: "educacao", label: "Educação", territory: "Recreio", municipality: "Rio de Janeiro", uf: "RJ", slug: "b", total: 4, urgent: 0, concluded: 0 },
    { theme: "esporte", label: "Esporte", territory: "Centro", municipality: "Niterói", uf: "RJ", slug: "c", total: 2, urgent: 0, concluded: 0 },
  ],
  truncated: false,
};

test("sem leitura pública, tudo fica vazio: nenhuma amostra nem número de reserva", () => {
  assert.deepEqual(monthBars(null), []);
  assert.deepEqual(themeRows(null), []);
  assert.deepEqual(territoryRows(null), []);
  assert.deepEqual(resourceRows(null), []);
  assert.deepEqual(governmentActionRows(null), []);
  assert.deepEqual(stageTotals(null).map((stage) => stage.total), LANDING_PUBLIC_STAGES.map(() => 0));
  assert.deepEqual(mapFlow(null).map((item) => item.value), ["—", "—", "—", "—", "—"]);
});

test("faixa do mapa: projetos, apoio confirmado, execução, resultados e pessoas beneficiadas do recorte", () => {
  assert.deepEqual(mapFlow(intelligence).map((item) => [item.key, item.value]), [
    ["projetos", "12"],
    ["recursos", "R$ 35,5 mil"],
    ["execucao", "4"],
    ["resultados", "3"],
    ["impacto", "1.840"],
  ]);
  const empty = normalizeThemeIntelligence({ ...intelligence, totals: undefined, byStatus: [] });
  assert.deepEqual(mapFlow(empty).map((item) => item.value), ["12", "R$ 0", "0", "0", "0"], "serviço sem totais não inventa valor");
});

test("meses: rótulo curto e os totais exatamente como o servidor devolve", () => {
  assert.equal(monthAbbreviation("2026-01"), "Jan");
  assert.equal(monthAbbreviation("2026-12"), "Dez");
  assert.equal(monthAbbreviation("inválido"), "inválido");
  assert.deepEqual(monthBars(intelligence), [
    { month: "2026-09", label: "Set", total: 3 },
    { month: "2026-10", label: "Out", total: 9 },
  ]);
});

test("teto do gráfico: valor redondo e par, para a marca do meio ser inteira", () => {
  assert.equal(niceMax(0), 2);
  assert.equal(niceMax(2), 2);
  assert.equal(niceMax(3), 4);
  assert.equal(niceMax(9), 10);
  assert.equal(niceMax(11), 20);
  assert.equal(niceMax(47), 50);
  assert.equal(niceMax(51), 100);
  assert.equal(niceMax(230), 500);
  assert.equal(niceMax(Number.NaN), 2);
});

test("eixos: do maior para o menor, eixo sem demanda aparece zerado", () => {
  assert.deepEqual(themeRows(intelligence).map((row) => [row.label, row.total]), [
    ["Educação", 5], ["Cultura", 2], ["Esporte", 2], ["Limpeza", 0],
  ]);
});

test("territórios: estágios somam o total e o eixo dominante vem do cruzamento", () => {
  const rows = territoryRows(intelligence);
  assert.deepEqual(rows.map((row) => row.name), ["Recreio", "Centro", "Sé"]);
  for (const row of rows) assert.equal(row.open + row.inExecution + row.concluded, row.total);
  assert.equal(rows[0].open, 3);
  assert.equal(rows[0].place, "Rio de Janeiro/RJ");
  assert.equal(rows[0].mainTheme, "Educação");
  assert.equal(rows[1].mainTheme, "Esporte");
  assert.equal(rows[2].mainTheme, null, "território sem demanda com eixo não ganha eixo inventado");
  assert.equal(territoryRows(intelligence, 1).length, 1);
});

test("recursos: só eixos com orçamento, mobilizado ÷ orçamento sem inventar", () => {
  const rows = resourceRows(intelligence);
  assert.deepEqual(rows.map((row) => [row.label, row.percent]), [["Educação", 110], ["Cultura", 25], ["Esporte", 0]]);
  assert.ok(!rows.some((row) => row.label === "Limpeza"), "eixo sem orçamento sai");
});

test("valor compacto em reais", () => {
  assert.equal(formatCompactBRL(0), "R$ 0");
  assert.equal(formatCompactBRL(90000), "R$ 900");
  assert.equal(formatCompactBRL(4500000), "R$ 45 mil");
  assert.equal(formatCompactBRL(125000000), "R$ 1,3 mi");
  assert.equal(formatCompactBRL(-5), "R$ 0");
});

test("estágios: ausente no servidor é zero, nunca um número de reserva", () => {
  assert.deepEqual(stageTotals(intelligence).map((stage) => [stage.id, stage.total]), [
    ["publicada", 5], ["em_busca_de_parceiro", 0], ["conectada", 0], ["em_execucao", 4],
    ["concluida", 3], ["prestacao_de_contas", 0], ["encerrada", 0],
  ]);
});

test("ações de órgãos: rótulo do tipo e lugar; tipo desconhecido volta como veio", () => {
  const rows = governmentActionRows(intelligence);
  assert.equal(rows[0].kindLabel, "Edital ou chamamento");
  assert.equal(rows[0].place, "Centro · Niterói/RJ");
  assert.equal(rows[1].kindLabel, "tipo_novo");
  assert.equal(rows[1].place, "");
});

test("normalização da leitura: forma inesperada vira null, listas ausentes viram vazias", () => {
  assert.equal(normalizeMapView(null), null);
  assert.equal(normalizeMapView({ points: [] }), null, "sem contagens não é um mapa");
  const view = normalizeMapView({ mode: "points", counts: { total: 0 }, points: [] });
  assert.deepEqual(view.clusters, []);

  assert.equal(normalizeThemeIntelligence(undefined), null);
  assert.equal(normalizeThemeIntelligence({ demandsTotal: 1 }), null, "sem eixos não é a leitura esperada");
  const partial = normalizeThemeIntelligence({
    demandsTotal: 1, themes: [{ theme: "cultura", label: "Cultura", total: 1 }],
  });
  assert.deepEqual(partial.byMonth, []);
  assert.deepEqual(partial.territories, []);
  assert.deepEqual(partial.byTerritory, []);
  assert.deepEqual(partial.recentGovernmentActions, []);
  assert.equal(partial.themes[0].budgetCents, 0, "serviço antigo sem o campo não quebra o gráfico");
  assert.equal(partial.themes[0].mobilizedCents, 0);
});

test("filtros do mapa: viram o filtro das rotas públicas, sem inventar recorte", () => {
  const territories = [{ slug: "recreio-rio-de-janeiro-rj", territory: "Recreio", municipality: "Rio de Janeiro", uf: "RJ" }];
  const now = new Date("2026-10-07T15:00:00.000Z");
  const none = landingMapQueryFilter(emptyLandingMapFilter(), territories, now);
  assert.deepEqual([none.territory, none.theme, none.status, none.from], ["", [], [], ""]);
  assert.deepEqual(landingMapFilterCount(emptyLandingMapFilter()), { total: 0, advanced: 0 });

  const filter = { territory: "recreio-rio-de-janeiro-rj", theme: "cultura", status: "em_execucao", period: "30d", withResults: false };
  const query = landingMapQueryFilter(filter, territories, now);
  assert.deepEqual([query.territory, query.municipality, query.uf], ["Recreio", "Rio de Janeiro", "RJ"]);
  assert.deepEqual(query.theme, ["cultura"]);
  assert.deepEqual(query.status, ["em_execucao"]);
  assert.equal(query.from, "2026-09-07");
  assert.deepEqual(landingMapFilterCount(filter), { total: 4, advanced: 1 });

  // "Com resultados" manda no estágio: o que não é de resultado deixa de valer.
  assert.deepEqual(
    landingMapQueryFilter({ ...filter, withResults: true }, territories, now).status,
    ["concluida", "prestacao_de_contas", "encerrada"],
  );
  assert.deepEqual(
    landingMapQueryFilter({ ...filter, status: "encerrada", withResults: true }, territories, now).status,
    ["encerrada"],
  );
  // Território que saiu da lista não vira filtro por texto solto.
  assert.equal(landingMapQueryFilter({ ...filter, territory: "outro" }, territories, now).territory, "");
});

test("os componentes de dados da landing não embutem amostra (AGENTS.md: sintético só em teste)", () => {
  const sample = /PTS_DEMO|\bPTS\b|Bairro [A-K]\b|Território X|Dados fictícios|\(exemplo\)|Valores ilustrativos|Exemplo ilustrativo/i;
  for (const file of ["SmartMap", "DataGovSection", "TransparencySection", "LandingData"]) {
    const text = readFileSync(new URL(`../../components/${file}.tsx`, import.meta.url), "utf8");
    assert.doesNotMatch(text, sample, file);
  }
  const logic = readFileSync(new URL("./landing.ts", import.meta.url), "utf8");
  assert.doesNotMatch(logic, sample, "landing.ts");
});
