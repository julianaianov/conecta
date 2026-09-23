// Inteligência artificial (T23): o espelho do frontend precisa ser igual ao
// domínio do post-service, e a interface nunca pode mostrar resultado de IA
// sem o rótulo de sugestão.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  AI_DISCLAIMER,
  AI_KINDS,
  AI_KIND_AUDIENCE,
  AI_KIND_LABELS,
  AI_KIND_STAGE,
  AI_LABEL,
  AI_SUGGESTION_STATUSES,
  AI_SUGGESTION_STATUS_LABELS,
  AI_UNAVAILABLE_MESSAGES,
  aiBadgeLabel,
  aiUnavailableMessage,
  awaitsReview,
  evidenceEntries,
  isInDevelopment,
} from "./ai.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/ai/constants.js");

test("os 5 recursos do slide 23 são os mesmos do post-service, na mesma ordem", () => {
  assert.deepEqual(AI_KINDS, server.KINDS);
  assert.deepEqual(AI_KIND_LABELS, server.KIND_LABELS);
  assert.deepEqual(AI_KIND_AUDIENCE, server.KIND_AUDIENCE);
  assert.deepEqual(AI_KIND_STAGE, server.KIND_STAGE);
  assert.deepEqual(AI_SUGGESTION_STATUSES, server.STATUSES);
  assert.deepEqual(AI_SUGGESTION_STATUS_LABELS, server.STATUS_LABELS);
});

test("o rótulo de sugestão e o aviso são os mesmos dos dois lados", () => {
  assert.equal(AI_LABEL, server.SUGGESTION_LABEL);
  assert.equal(AI_DISCLAIMER, server.SUGGESTION_DISCLAIMER);
  for (const [reason, message] of Object.entries(server.UNAVAILABLE_REASONS)) {
    assert.equal(AI_UNAVAILABLE_MESSAGES[reason], message, `frase diferente para ${reason}`);
  }
  // Todo rótulo exibido começa por "Sugestão de IA".
  for (const kind of AI_KINDS) assert.ok(aiBadgeLabel(kind).startsWith("Sugestão de IA"));
  for (const label of Object.values(AI_SUGGESTION_STATUS_LABELS)) {
    assert.match(label, /Sugestão de IA/);
  }
});

test("a sugestão de editais aparece identificada como em desenvolvimento", () => {
  assert.equal(isInDevelopment("sugestao_de_editais"), true);
  assert.equal(isInDevelopment("deteccao_de_urgencia"), false);
  assert.ok(server.STAGE_NOTES.sugestao_de_editais.includes("cadastrarem editais"));
});

test("sem sugestão, a interface mostra o motivo — nunca um resultado inventado", () => {
  assert.equal(aiUnavailableMessage({ reason: "desligado" }), AI_UNAVAILABLE_MESSAGES.desligado);
  assert.equal(aiUnavailableMessage({ message: "Sem editais no território" }), "Sem editais no território");
  assert.equal(aiUnavailableMessage(null), AI_UNAVAILABLE_MESSAGES.erro);
});

test("os números verificáveis ficam legíveis ao lado do texto", () => {
  assert.deepEqual(evidenceEntries({ prioridade_atual: "media", indicadores: { demandas_recebidas: 12 } }), [
    { label: "Prioridade atual", value: "media" },
    { label: "Indicadores", value: "Demandas recebidas: 12" },
  ]);
  assert.deepEqual(evidenceEntries({ territorio_atual: null }), [{ label: "Territorio atual", value: "—" }]);
  assert.equal(awaitsReview({ status: "sugerida" }), true);
  assert.equal(awaitsReview({ status: "aceita" }), false);
});
