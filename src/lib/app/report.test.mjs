// Denúncia de conteúdo e de perfil (T6.3): o espelho do frontend precisa ser
// igual ao domínio do post-service (services/post-service/src/report/constants.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  REPORT_CONFIRMATION_NOTICE,
  REPORT_DESCRIPTION_MAX,
  REPORT_RATE_LIMIT,
  REPORT_REASONS,
  REPORT_REASON_HINTS,
  REPORT_REASON_LABELS,
  REPORT_REASON_REQUIRING_DESCRIPTION,
  REPORT_STATE_LABELS,
  REPORT_TARGET_KINDS,
  REPORT_TARGET_LABELS,
  reportDescriptionRequired,
  reportErrorMessage,
  reportReasonLabel,
  reportTargetLabel,
} from "./report.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/report/constants.js");
const validation = require("../../../services/post-service/src/report/validation.js");

test("alvos, motivos e limites seguem o post-service", () => {
  assert.deepEqual(REPORT_TARGET_KINDS, server.TARGET_KINDS);
  assert.deepEqual(REPORT_TARGET_LABELS, server.TARGET_LABELS);
  assert.deepEqual(REPORT_REASONS, server.REASONS);
  assert.deepEqual(REPORT_REASON_LABELS, server.REASON_LABELS);
  assert.equal(REPORT_REASON_REQUIRING_DESCRIPTION, server.REASON_REQUIRING_DESCRIPTION);
  assert.equal(REPORT_DESCRIPTION_MAX, server.DESCRIPTION_MAX);
  assert.deepEqual(REPORT_RATE_LIMIT, server.RATE_LIMIT);
  assert.equal(REPORT_CONFIRMATION_NOTICE, server.CONFIRMATION_NOTICE);
});

test("todo motivo tem rótulo e ajuda na tela", () => {
  for (const reason of REPORT_REASONS) {
    assert.ok(REPORT_REASON_LABELS[reason], `sem rótulo: ${reason}`);
    assert.ok(REPORT_REASON_HINTS[reason], `sem ajuda: ${reason}`);
    assert.equal(reportReasonLabel(reason), REPORT_REASON_LABELS[reason]);
  }
  for (const kind of REPORT_TARGET_KINDS) {
    assert.equal(reportTargetLabel(kind), REPORT_TARGET_LABELS[kind]);
  }
});

test("o estado mostrado a quem denunciou nunca revela o desfecho", () => {
  assert.deepEqual(Object.keys(REPORT_STATE_LABELS).sort(), server.REPORTER_STATES.slice().sort());
  assert.equal(server.REPORTER_STATE_OF("pendente"), "em_apuracao");
  assert.equal(server.REPORTER_STATE_OF("em_analise"), "em_apuracao");
  assert.equal(server.REPORTER_STATE_OF("procedente"), "analisada");
  assert.equal(server.REPORTER_STATE_OF("improcedente"), "analisada");
  // Nenhum rótulo da tela deixa escapar "procedente"/"improcedente".
  for (const label of Object.values(REPORT_STATE_LABELS)) {
    assert.ok(!/procedente/i.test(label), label);
  }
});

test("a descrição é obrigatória só no motivo Outro, dos dois lados", () => {
  const TARGET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  assert.equal(reportDescriptionRequired("outro"), true);
  assert.equal(reportDescriptionRequired("spam"), false);
  assert.equal(reportDescriptionRequired(null), false);

  const semDescricao = validation.validateReport({ targetKind: "publicacao", targetId: TARGET, reason: "outro" });
  assert.ok(semDescricao.errors.description);
  const comDescricao = validation.validateReport({
    targetKind: "publicacao", targetId: TARGET, reason: "outro", description: "Conta falsa",
  });
  assert.deepEqual(comDescricao.errors, {});
  const spam = validation.validateReport({ targetKind: "perfil", targetId: TARGET, reason: "spam" });
  assert.deepEqual(spam.errors, {});
  assert.equal(spam.value.description, null);
});

test("erros do servidor viram texto da tela", () => {
  assert.match(reportErrorMessage("report_already_open", "x"), /já denunciou/);
  assert.match(reportErrorMessage("report_rate_limited", "x"), /muitas denúncias/);
  assert.equal(reportErrorMessage(null, "Falhou"), "Falhou");
});
