import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DEADLINE_DEFAULT_DAYS, DEADLINE_STAGES, DEADLINE_STAGE_LABELS, DEADLINE_STAGE_SIDE, DEADLINE_STATUS_LABELS,
  DEADLINE_WARNING_DAYS, dueLabel, dueTone, formatDay, stagesFor,
} from "./deadlines.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/process/constants.js");

test("prazos: vocabulário igual ao do post-service (Modelo §15)", () => {
  assert.deepEqual(DEADLINE_STAGES, server.DEADLINE_STAGES);
  assert.deepEqual(DEADLINE_STAGE_LABELS, server.DEADLINE_STAGE_LABELS);
  assert.deepEqual(DEADLINE_DEFAULT_DAYS, server.DEADLINE_DEFAULT_DAYS);
  assert.deepEqual(DEADLINE_STAGE_SIDE, server.DEADLINE_STAGE_SIDE);
  assert.deepEqual(DEADLINE_STATUS_LABELS, server.DEADLINE_STATUS_LABELS);
  assert.equal(DEADLINE_WARNING_DAYS, server.DEADLINE_WARNING_DAYS);
});

test("prazos: etapas por lado, rótulos de vencimento e data", () => {
  assert.deepEqual(stagesFor("parte"), ["analise_inicial", "analise_tecnica", "outra"]);
  assert.deepEqual(stagesFor("agente"), ["envio_de_documentacao", "elaboracao_do_plano", "execucao", "outra"]);
  assert.equal(dueLabel(0), "Vence hoje");
  assert.equal(dueLabel(5), "Vence em 5 dias");
  assert.equal(dueLabel(-3), "Venceu há 3 dias");
  assert.equal(dueTone({ overdue: false, daysLeft: 2 }), "proximo");
  assert.equal(dueTone({ overdue: true, daysLeft: -1 }), "vencido");
  assert.equal(dueTone({ overdue: false, daysLeft: 9 }), "em_dia");
  assert.equal(formatDay("2026-10-05"), "05/10/2026");
});
