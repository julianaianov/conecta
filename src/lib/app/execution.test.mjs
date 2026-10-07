// Execução, evidências e acompanhamento (T17): o espelho do frontend precisa
// ser igual ao domínio do post-service
// (services/post-service/src/execution/constants.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  EVIDENCE_MEDIA_KINDS,
  EVIDENCE_MEDIA_LABELS,
  EVIDENCE_OPEN_STATUSES,
  EVIDENCE_PURPOSE_BY_MEDIA,
  EXECUTION_EVENT_TYPES,
  EVIDENCE_MILESTONES,
  EVIDENCE_MILESTONE_LABELS,
  EVIDENCE_MILESTONE_SHORT,
  EXECUTION_DOCUMENT_OPEN_STATUSES,
  EXECUTION_DOCUMENT_PURPOSE,
  MAX_EXECUTION_DOCUMENTS,
  DELIVERY_OPEN_STATUSES,
  MAX_DELIVERIES,
  MAX_DELIVERY_DESCRIPTION,
  MAX_DELIVERY_ITEM,
  MAX_DELIVERY_RECIPIENT,
  INCIDENT_IMPACTS,
  INCIDENT_IMPACT_LABELS,
  INCIDENT_KINDS,
  INCIDENT_KIND_LABELS,
  MAX_CAPTION,
  MAX_INCIDENT_TEXT,
  MAX_EXECUTED_CENTS,
  MAX_EXPENSES,
  MAX_NOTE,
  MAX_PARTIAL_RESULTS,
  MAX_REASON,
  PROGRESS_OPEN_STATUSES,
  RECORD_MILESTONES,
  RECORD_MILESTONE_LABELS,
  RECORD_MILESTONE_SHORT,
  STAGE_PROGRESS,
  STAGE_PROGRESS_LABELS,
  TRANSITION_REQUIRED_MILESTONE,
  WAIVER_OPEN_STATUSES,
  executionErrorMessage,
  executionReaisToCents,
  executionTimelineDetail,
  executionTimelineLabel,
  formatCents,
  formatPercent,
  formatRecordDate,
  isLate,
} from "./execution.ts";
import { timelineEventLabel } from "./demand.ts";
import { UPLOAD_PURPOSES } from "./uploads.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/execution/constants.js");

test("marcos, tipos de registro, situações e limites seguem o post-service", () => {
  assert.deepEqual(RECORD_MILESTONES, server.RECORD_MILESTONES);
  assert.deepEqual(RECORD_MILESTONE_LABELS, server.RECORD_MILESTONE_LABELS);
  assert.deepEqual(EVIDENCE_MEDIA_KINDS, server.EVIDENCE_MEDIA_KINDS);
  assert.deepEqual(EVIDENCE_MEDIA_LABELS, server.EVIDENCE_MEDIA_LABELS);
  assert.deepEqual(EVIDENCE_PURPOSE_BY_MEDIA, server.EVIDENCE_PURPOSE_BY_MEDIA);
  assert.deepEqual(STAGE_PROGRESS, server.STAGE_PROGRESS);
  assert.deepEqual(STAGE_PROGRESS_LABELS, server.STAGE_PROGRESS_LABELS);
  assert.deepEqual(EVIDENCE_OPEN_STATUSES, server.EVIDENCE_OPEN_STATUSES);
  assert.deepEqual(PROGRESS_OPEN_STATUSES, server.PROGRESS_OPEN_STATUSES);
  assert.deepEqual(WAIVER_OPEN_STATUSES, server.WAIVER_OPEN_STATUSES);
  assert.deepEqual(TRANSITION_REQUIRED_MILESTONE, server.TRANSITION_REQUIRED_MILESTONE);
  assert.deepEqual(EXECUTION_EVENT_TYPES, server.EXECUTION_EVENT_TYPES);
  for (const [key, value] of Object.entries({
    MAX_CAPTION, MAX_PARTIAL_RESULTS, MAX_NOTE, MAX_REASON, MAX_EXPENSES, MAX_EXECUTED_CENTS,
  })) {
    assert.equal(value, server[key], key);
  }
  assert.deepEqual(Object.keys(RECORD_MILESTONE_SHORT).sort(), [...RECORD_MILESTONES].sort());
});

test("as finalidades de upload da evidência existem na tabela da T08", () => {
  for (const purpose of Object.values(EVIDENCE_PURPOSE_BY_MEDIA)) {
    assert.ok(UPLOAD_PURPOSES[purpose], purpose);
    assert.equal(UPLOAD_PURPOSES[purpose].service, "posts");
  }
});

test("a linha do tempo ganha rótulo e detalhe dos eventos da execução", () => {
  const evidencia = {
    type: "evidencia_registrada",
    details: { milestone: "antes", mediaKind: "foto", stage: "Obra", caption: "Praça abandonada", recordedOn: "2026-09-01" },
  };
  assert.equal(executionTimelineLabel(evidencia), "Evidência registrada: fotografia do antes");
  assert.equal(timelineEventLabel({ ...evidencia, toStatus: null }), "Evidência registrada: fotografia do antes");
  const detalhe = executionTimelineDetail(evidencia);
  assert.match(detalhe, /Etapa: Obra/);
  assert.match(detalhe, /Praça abandonada/);
  assert.match(detalhe, /01\/09\/2026/);

  const andamento = {
    type: "andamento_registrado",
    details: { stage: "Obra", stageProgress: "em_andamento", onSchedule: false, executedAmountCents: 530000, partialResults: "Metade do piso" },
  };
  assert.equal(executionTimelineLabel(andamento), "Andamento da execução atualizado");
  assert.match(executionTimelineDetail(andamento), /Em andamento/);
  assert.match(executionTimelineDetail(andamento), /fora do cronograma/);
  assert.match(executionTimelineDetail(andamento), /R\$\s?5\.300,00/);

  const prazo = { type: "prazo_alterado", details: { stage: "Obra", newEndsOn: "2026-12-20", deadlineReason: "Chuvas" } };
  assert.match(executionTimelineDetail(prazo), /novo término em 20\/12\/2026/);
  assert.equal(executionTimelineLabel({ type: "publicada", details: undefined }), null);
  assert.equal(executionTimelineDetail({ type: "publicada", details: undefined }), null);
});

test("valores em reais e datas do registro", () => {
  assert.equal(executionReaisToCents("1.500,50"), 150050);
  assert.equal(executionReaisToCents("1500"), 150000);
  assert.equal(executionReaisToCents(""), null);
  assert.ok(Number.isNaN(executionReaisToCents("abc")));
  assert.equal(formatRecordDate("2026-09-22"), "22/09/2026");
  assert.equal(formatRecordDate(null), "");
  assert.match(formatCents(200000), /R\$\s?2\.000,00/);
  assert.equal(formatCents(null), "—");
});

test("os códigos de erro das rotas viram texto de tela", () => {
  const withCode = (code) => Object.assign(new Error("erro"), { code });
  assert.match(executionErrorMessage(withCode("evidence_required")), /justifique/);
  assert.match(executionErrorMessage(withCode("pair_taken")), /já está pareado/);
  assert.match(executionErrorMessage(withCode("pair_locked")), /não é desfeito/);
  assert.match(executionErrorMessage(withCode("record_waiver_exists")), /não muda/);
  assert.match(executionErrorMessage(new Error("network")), /Sem conexão/);
});

test("status Atrasada/Bloqueada e ocorrências seguem o post-service (Modelo §18–19)", () => {
  assert.deepEqual(INCIDENT_KINDS, server.INCIDENT_KINDS);
  assert.deepEqual(INCIDENT_KIND_LABELS, server.INCIDENT_KIND_LABELS);
  assert.deepEqual(INCIDENT_IMPACTS, server.INCIDENT_IMPACTS);
  assert.deepEqual(INCIDENT_IMPACT_LABELS, server.INCIDENT_IMPACT_LABELS);
  assert.equal(MAX_INCIDENT_TEXT, server.MAX_INCIDENT_TEXT);
  for (const [ends, progress] of [["2026-09-24", "em_andamento"], ["2026-09-24", null], ["2026-09-25", null],
    ["2026-09-01", "concluida"], ["2026-09-01", "bloqueada"]]) {
    assert.equal(isLate(ends, progress, "2026-09-25"), server.isLate(ends, progress, "2026-09-25"), `${ends} ${progress}`);
  }
  assert.equal(formatPercent(50), "50%");
  assert.equal(formatPercent(null), "—");
  assert.equal(executionTimelineLabel({ type: "etapa_atrasada", details: {} }), "Etapa atrasada");
  assert.match(executionTimelineDetail({ type: "ocorrencia_registrada", details: { kind: "clima", impact: "prazo", stage: "Obra" } }) ?? "",
    /Etapa: Obra · Clima · impacto: prazo/);
});

test("marcos do módulo ambiental e documentos da execução seguem o post-service (§20, §24)", () => {
  assert.deepEqual(EVIDENCE_MILESTONES, server.EVIDENCE_MILESTONES);
  assert.deepEqual(EVIDENCE_MILESTONE_LABELS, server.EVIDENCE_MILESTONE_LABELS);
  assert.deepEqual(Object.keys(EVIDENCE_MILESTONE_SHORT), EVIDENCE_MILESTONES);
  assert.equal(EXECUTION_DOCUMENT_PURPOSE, server.EXECUTION_DOCUMENT_PURPOSE);
  assert.deepEqual(EXECUTION_DOCUMENT_OPEN_STATUSES, server.EXECUTION_DOCUMENT_OPEN_STATUSES);
  assert.equal(MAX_EXECUTION_DOCUMENTS, server.MAX_EXECUTION_DOCUMENTS);
  assert.ok(UPLOAD_PURPOSES[EXECUTION_DOCUMENT_PURPOSE]);
  assert.equal(executionTimelineLabel({ type: "documento_da_execucao_registrado", details: {} }), "Documento da execução anexado");
});

test("entregas seguem o post-service e têm rótulo e detalhe na linha do tempo (Modelo §22)", () => {
  assert.deepEqual(DELIVERY_OPEN_STATUSES, server.DELIVERY_OPEN_STATUSES);
  for (const [key, value] of Object.entries({
    MAX_DELIVERIES, MAX_DELIVERY_DESCRIPTION, MAX_DELIVERY_ITEM, MAX_DELIVERY_RECIPIENT,
  })) {
    assert.equal(value, server[key], key);
  }
  assert.ok(EXECUTION_EVENT_TYPES.includes("entrega_registrada"));
  assert.equal(executionTimelineLabel({ type: "entrega_registrada", details: {} }), "Entrega registrada");
  assert.equal(timelineEventLabel({ type: "entrega_registrada", toStatus: null, details: {} }), "Entrega registrada");
  // O recebedor só vem no evento quando o Agente autorizou: sem ele, o detalhe não o inventa.
  assert.equal(
    executionTimelineDetail({
      type: "entrega_registrada",
      details: { item: "Praça revitalizada", deliveredOn: "2026-11-28", stage: "Obra" },
    }),
    "Etapa: Obra · Praça revitalizada · entregue em 28/11/2026",
  );
  assert.match(
    executionTimelineDetail({
      type: "entrega_registrada",
      details: { item: "Kit esportivo", deliveredOn: "2026-11-29", recipient: "Associação de Moradores" },
    }) ?? "",
    /recebido por Associação de Moradores/,
  );
});
