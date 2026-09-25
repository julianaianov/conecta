// Encerramento da demanda (Modelo de Conexão §22, decisão 16; T-05-14): o
// portal espelha o post-service (status, rótulo, ação, limites e mensagens do
// registro final) e mostra o evento `demanda_encerrada`.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  CLOSING_RESPONSIBLES_MAX,
  CLOSING_SUMMARY_MAX,
  DEMAND_ACTION_LABELS,
  DEMAND_ACTION_TARGET,
  DEMAND_CONCLUDED_STATUSES,
  DEMAND_STATUS_COLORS,
  closureTimelineDetail,
  demandGuidance,
  timelineEventLabel,
  validateClosing,
} from "./demand.ts";
import { DEMAND_PUBLIC_STATUSES, DEMAND_STATUS_LABELS } from "./types.ts";
import { DOSSIER_TRIGGER_LABELS } from "./dossier.ts";
import { RESULT_STATUSES } from "./profile.ts";

const require = createRequire(import.meta.url);
const constants = require("../../../services/post-service/src/demand/constants.js");
const { ACTIONS } = require("../../../services/post-service/src/demand/state-machine.js");
const { TRIGGER_LABELS } = require("../../../services/post-service/src/dossier/content.js");

test("status encerrada: rótulo da decisão 16, público e contado como concluída", () => {
  assert.equal(DEMAND_STATUS_LABELS.encerrada, "Concluído — encerrado");
  assert.equal(DEMAND_STATUS_LABELS.encerrada, constants.STATUS_LABELS.encerrada);
  assert.deepEqual(Object.keys(DEMAND_STATUS_LABELS).sort(), [...constants.STATUSES].sort());
  assert.deepEqual(DEMAND_PUBLIC_STATUSES, constants.PUBLIC_STATUSES);
  assert.deepEqual(DEMAND_CONCLUDED_STATUSES, constants.CONCLUDED_STATUSES);
  assert.ok(RESULT_STATUSES.includes("encerrada"));
  assert.ok(DEMAND_STATUS_COLORS.encerrada);
  assert.match(demandGuidance({ status: "encerrada" }), /histórico/);
});

test("ação encerrar: rótulo e destino iguais aos do post-service", () => {
  assert.equal(DEMAND_ACTION_LABELS.encerrar, ACTIONS.encerrar.label);
  assert.equal(DEMAND_ACTION_TARGET.encerrar, ACTIONS.encerrar.to.status);
  assert.deepEqual(ACTIONS.encerrar.from.status, ["prestacao_de_contas"]);
});

test("registro final: obrigatório, com os limites do CHECK da migração 037", () => {
  assert.equal(CLOSING_SUMMARY_MAX, constants.CLOSING_SUMMARY_MAX);
  assert.equal(CLOSING_RESPONSIBLES_MAX, constants.CLOSING_RESPONSIBLES_MAX);
  assert.deepEqual(Object.keys(validateClosing({ closingSummary: " ", closingResponsibles: "" })).sort(),
    ["closingResponsibles", "closingSummary"]);
  assert.deepEqual(validateClosing({ closingSummary: "Praça entregue.", closingResponsibles: "Associação" }), {});
  assert.ok(validateClosing({ closingSummary: "x".repeat(CLOSING_SUMMARY_MAX + 1), closingResponsibles: "A" }).closingSummary);
});

test("linha do tempo: demanda_encerrada com o registro final no detalhe", () => {
  const event = {
    type: "demanda_encerrada", toStatus: "encerrada",
    details: { closedAt: "2026-11-30T15:00:00Z", closingSummary: "Clube de leitura entregue à comunidade." },
  };
  assert.match(timelineEventLabel(event), /Concluído — encerrado/);
  assert.equal(closureTimelineDetail(event), "Clube de leitura entregue à comunidade.");
  assert.equal(closureTimelineDetail({ type: "publicada", details: undefined }), null);
  assert.equal(closureTimelineDetail({ ...event, details: { closingSummary: "a".repeat(400) } }).length, 280);
  assert.equal(constants.CLOSURE_EVENT_TYPES[0], "demanda_encerrada");
});

test("dossiê: versão de encerramento com o mesmo rótulo do PDF", () => {
  assert.equal(DOSSIER_TRIGGER_LABELS.encerramento, TRIGGER_LABELS.encerramento);
});
