// Prestação de contas e resultados (T18): o espelho do frontend precisa ser
// igual ao domínio do post-service
// (services/post-service/src/accountability/constants.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  ACCOUNTABILITY_EVENT_TYPES,
  ACCOUNTABILITY_OPEN_STATUSES,
  ACCOUNTABILITY_STATUSES,
  ACCOUNTABILITY_STATUS_LABELS,
  ACCOUNTABILITY_UPLOAD_PURPOSE,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  MAX_ACTIONS_RECORD,
  MAX_AMOUNT_CENTS,
  MAX_BENEFICIARIES,
  MAX_BENEFICIARIES_NOTE,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_DESCRIPTION,
  MAX_DOCUMENT_TITLE,
  MAX_EXECUTION_REPORT,
  MAX_FINANCIAL_SUMMARY,
  MAX_IMPACT_INDICATORS,
  MAX_MEASUREMENT_METHOD,
  MAX_MEASURED_VALUE,
  MAX_RESULT_NOTE,
  MAX_SCHEDULE_SUMMARY,
  REQUIREMENTS,
  REQUIREMENT_CONDITION_LABELS,
  REQUIREMENT_KEYS,
  accountabilityErrorMessage,
  accountabilityReaisToCents,
  accountabilityTimelineDetail,
  accountabilityTimelineLabel,
  beneficiariesDelta,
  formatAccountabilityDate,
  formatCents,
  goalsSummaryLabel,
  pendingRequirements,
} from "./accountability.ts";
import { timelineEventLabel } from "./demand.ts";
import { UPLOAD_PURPOSES } from "./uploads.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/accountability/constants.js");

test("estados, tipos de anexo, exigências e limites seguem o post-service", () => {
  assert.deepEqual(ACCOUNTABILITY_STATUSES, server.ACCOUNTABILITY_STATUSES);
  assert.deepEqual(ACCOUNTABILITY_STATUS_LABELS, server.ACCOUNTABILITY_STATUS_LABELS);
  assert.deepEqual(DOCUMENT_KINDS, server.DOCUMENT_KINDS);
  assert.deepEqual(DOCUMENT_KIND_LABELS, server.DOCUMENT_KIND_LABELS);
  assert.deepEqual(ACCOUNTABILITY_OPEN_STATUSES, server.ACCOUNTABILITY_OPEN_STATUSES);
  assert.deepEqual(ACCOUNTABILITY_EVENT_TYPES, server.ACCOUNTABILITY_EVENT_TYPES);
  assert.equal(ACCOUNTABILITY_UPLOAD_PURPOSE, server.ACCOUNTABILITY_UPLOAD_PURPOSE);
  assert.deepEqual(REQUIREMENTS, server.REQUIREMENTS);
  assert.deepEqual(REQUIREMENT_KEYS, server.REQUIREMENT_KEYS);
  for (const [key, value] of Object.entries({
    MAX_EXECUTION_REPORT, MAX_ACTIONS_RECORD, MAX_SCHEDULE_SUMMARY, MAX_IMPACT_INDICATORS,
    MAX_FINANCIAL_SUMMARY, MAX_BENEFICIARIES_NOTE, MAX_RESULT_NOTE, MAX_MEASURED_VALUE,
    MAX_MEASUREMENT_METHOD, MAX_DOCUMENT_TITLE, MAX_DOCUMENT_DESCRIPTION, MAX_DOCUMENTS,
    MAX_BENEFICIARIES, MAX_AMOUNT_CENTS,
  })) {
    assert.equal(value, server[key], key);
  }
});

test("cada condição da fonte tem rótulo de tela", () => {
  const conditions = [...new Set(REQUIREMENTS.map((r) => r.condition))].sort();
  assert.deepEqual(Object.keys(REQUIREMENT_CONDITION_LABELS).sort(), conditions);
});

test("a finalidade de upload do anexo existe na tabela da T08", () => {
  assert.ok(UPLOAD_PURPOSES[ACCOUNTABILITY_UPLOAD_PURPOSE]);
  assert.equal(UPLOAD_PURPOSES[ACCOUNTABILITY_UPLOAD_PURPOSE].service, "posts");
});

test("as exigências pendentes ignoram o que não se aplica", () => {
  const requirements = [
    { key: "a", label: "A", condition: "sempre", applies: true, satisfied: true, reason: null },
    { key: "b", label: "B", condition: "sempre", applies: true, satisfied: false, reason: null },
    { key: "c", label: "C", condition: "apoio_financeiro", applies: false, satisfied: false, reason: "sem apoio" },
    { key: "d", label: "D", condition: "previsto_no_cronograma", applies: true, satisfied: false, informative: true, reason: null },
  ];
  assert.deepEqual(pendingRequirements(requirements).map((r) => r.key), ["b"], "a exigência informativa não bloqueia");
  assert.deepEqual(pendingRequirements(null), []);
});

test("a linha do tempo ganha rótulo e detalhe da prestação concluída", () => {
  const event = {
    type: "prestacao_de_contas_concluida",
    details: {
      beneficiariesReached: 340, beneficiariesEstimate: 200, goalsTotal: 2, goalsAchieved: 1,
      executedAmountCents: 930000, impactIndicators: "Uso diário dobrou",
    },
  };
  assert.equal(accountabilityTimelineLabel(event), "Prestação de contas concluída");
  assert.equal(timelineEventLabel({ ...event, toStatus: null }), "Prestação de contas concluída");
  const detail = accountabilityTimelineDetail(event);
  assert.match(detail, /340 pessoas alcançadas/);
  assert.match(detail, /estimativa: 200/);
  assert.match(detail, /1 de 2 metas cumpridas/);
  assert.match(detail, /R\$\s?9\.300,00/);
  assert.equal(accountabilityTimelineLabel({ type: "publicada", details: undefined }), null);
  assert.equal(accountabilityTimelineDetail({ type: "publicada", details: undefined }), null);
});

test("resumos, valores e datas da prestação", () => {
  assert.equal(goalsSummaryLabel(1, 2), "1 de 2 metas cumpridas");
  assert.equal(goalsSummaryLabel(1, 1), "1 de 1 meta cumprida");
  assert.equal(goalsSummaryLabel(0, 0), "Sem metas declaradas");
  assert.equal(beneficiariesDelta(340, 200), 140);
  assert.equal(beneficiariesDelta(340, null), null);
  assert.equal(accountabilityReaisToCents("9.300,00"), 930000);
  assert.equal(accountabilityReaisToCents(""), null);
  assert.ok(Number.isNaN(accountabilityReaisToCents("abc")));
  assert.equal(formatAccountabilityDate("2026-09-22"), "22/09/2026");
  assert.equal(formatAccountabilityDate(null), "");
  assert.match(formatCents(500000), /R\$\s?5\.000,00/);
  assert.equal(formatCents(null), "—");
});

test("os códigos de erro das rotas viram texto de tela", () => {
  const withCode = (code) => Object.assign(new Error("erro"), { code });
  assert.match(accountabilityErrorMessage(withCode("accountability_incomplete")), /itens obrigatórios/);
  assert.match(accountabilityErrorMessage(withCode("accountability_concluded")), /não muda mais/);
  assert.match(accountabilityErrorMessage(withCode("accountability_exists")), /já tem prestação/);
  assert.match(accountabilityErrorMessage(withCode("document_exists")), /já foi anexado/);
  assert.match(accountabilityErrorMessage(withCode("evidence_required")), /"antes"/);
  assert.match(accountabilityErrorMessage(withCode("demand_not_open")), /prestação de contas/);
  assert.match(accountabilityErrorMessage(new Error("network")), /Sem conexão/);
});
