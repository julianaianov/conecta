import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  ANALYSIS_REQUEST_KINDS, ANALYSIS_REQUEST_KIND_LABELS, ANALYSIS_REQUEST_STATUS_LABELS, ANALYSIS_EVENT_TYPES,
  analysisRequestProblem, analysisTimelineLabel,
} from "./analysis.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/analysis/index.js");

test("respostas à análise: vocabulário igual ao do post-service (Modelo §10)", () => {
  assert.deepEqual(ANALYSIS_REQUEST_KINDS, server.REQUEST_KINDS);
  assert.deepEqual(ANALYSIS_REQUEST_KIND_LABELS, server.REQUEST_KIND_LABELS);
  assert.deepEqual(ANALYSIS_REQUEST_STATUS_LABELS, server.REQUEST_STATUS_LABELS);
  assert.deepEqual([...ANALYSIS_EVENT_TYPES], server.REQUEST_EVENT_TYPES);
});

test("respostas à análise: linha do tempo sem nome e validação do formulário", () => {
  assert.equal(
    analysisTimelineLabel({ type: "solicitacao_registrada", details: { kind: "documentos", requesterCategory: "parceiro" } }),
    "Solicitação de documentos (Parceiro)",
  );
  assert.equal(
    analysisTimelineLabel({ type: "solicitacao_respondida", details: { kind: "documentos", documentsCount: 1 } }),
    "Solicitação de documentos respondida pelo Agente com 1 documento",
  );
  assert.equal(analysisTimelineLabel({ type: "outro" }), null);
  assert.equal(analysisRequestProblem({ kind: "recusa", body: " " }), "Informe o motivo da recusa");
  assert.equal(analysisRequestProblem({ kind: "documentos", body: "x" }), "Escolha ao menos um documento");
  assert.equal(analysisRequestProblem({ kind: "reuniao", body: "Visita" }), null);
});
