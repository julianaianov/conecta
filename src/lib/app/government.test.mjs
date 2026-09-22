// Área de governo e gestão pública (T22): o espelho do frontend precisa ser
// igual ao domínio do post-service. Nenhuma tela usa dados de exemplo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  ACTION_KINDS_REQUIRING_PROGRAM,
  COUNT_INDICATORS,
  GOVERNMENT_ACTION_KINDS,
  GOVERNMENT_ACTION_KIND_LABELS,
  GOVERNMENT_SCOPES,
  GOVERNMENT_SCOPE_LABELS,
  INDICATORS,
  INDICATOR_PERIODS,
  INDICATOR_PERIOD_LABELS,
  actionRequiresProgramName,
  barPercent,
  buildIndicatorQuery,
  generatedAtLabel,
  governmentErrorMessage,
  waitLabel,
} from "./government.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/government/constants.js");

test("os 10 indicadores do slide 14 são os mesmos do post-service, na mesma ordem", () => {
  assert.deepEqual(INDICATORS.map((i) => i.id), server.INDICATOR_IDS);
  assert.deepEqual(INDICATORS.map((i) => i.label), server.INDICATORS.map((i) => i.label));
  assert.deepEqual(INDICATORS.map((i) => i.kind), server.INDICATORS.map((i) => i.kind));
  assert.equal(COUNT_INDICATORS.length, 8, "oito números e duas distribuições");
});

test("recortes, períodos e tipos de ação espelham o servidor", () => {
  assert.deepEqual(GOVERNMENT_SCOPES, server.SCOPES);
  assert.deepEqual(GOVERNMENT_SCOPE_LABELS, server.SCOPE_LABELS);
  assert.deepEqual(INDICATOR_PERIODS, server.PERIODS);
  assert.deepEqual(INDICATOR_PERIOD_LABELS, server.PERIOD_LABELS);
  assert.deepEqual(GOVERNMENT_ACTION_KINDS, server.ACTION_KINDS);
  assert.deepEqual(GOVERNMENT_ACTION_KIND_LABELS, server.ACTION_KIND_LABELS);
});

test("o nome do programa é exigido nos tipos que viram `programa_publico_relacionado`", () => {
  const exigidos = server.ACTION_KINDS.filter(
    (kind) => server.ACTION_RESPONSE_TYPE[kind] === "programa_publico_relacionado",
  );
  assert.deepEqual(ACTION_KINDS_REQUIRING_PROGRAM, exigidos);
  assert.equal(actionRequiresProgramName("programa", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"), true);
  // Sem demanda ligada não há resposta institucional: o nome deixa de ser obrigatório.
  assert.equal(actionRequiresProgramName("programa", null), false);
  assert.equal(actionRequiresProgramName("acao", "dddddddd-dddd-4ddd-8ddd-dddddddddddd"), false);
});

test("query do painel: período, recorte e filtros; `from` tem precedência sobre o período", () => {
  assert.equal(buildIndicatorQuery(), "");
  assert.equal(buildIndicatorQuery({ scope: "competencia", period: "7d" }), "scope=competencia&period=7d");
  assert.equal(
    buildIndicatorQuery({ period: "30d", from: "2026-01-01", to: "2026-01-31" }),
    "from=2026-01-01&to=2026-01-31",
  );
  assert.equal(
    buildIndicatorQuery({ category: ["projeto_social", "problema_urbano"], territory: "Centro" }),
    "category=projeto_social%2Cproblema_urbano&territory=Centro",
  );
});

test("apresentação: barras proporcionais, espera legível e hora da leitura", () => {
  assert.equal(barPercent(10, 10), 100);
  assert.equal(barPercent(5, 10), 50);
  // Valor pequeno continua visível na barra.
  assert.equal(barPercent(1, 1000), 2);
  assert.equal(barPercent(3, 0), 0);

  assert.equal(waitLabel(0), "menos de 1 dia");
  assert.equal(waitLabel(1), "1 dia");
  assert.equal(waitLabel(12.4), "12 dias");

  assert.equal(generatedAtLabel(null), "—");
  assert.equal(generatedAtLabel("não é data"), "—");
  assert.match(generatedAtLabel("2026-09-22T12:00:00.000Z"), /^\d{2}:\d{2}$/);
});

test("erros do painel viram mensagem para o representante", () => {
  assert.match(governmentErrorMessage(new Error("network")), /Sem conexão/);
  assert.match(governmentErrorMessage(new Error("timeout")), /Sem conexão/);
  assert.equal(governmentErrorMessage(new Error("Filtro inválido")), "Filtro inválido");
  assert.match(governmentErrorMessage(null), /Não foi possível carregar/);
});
