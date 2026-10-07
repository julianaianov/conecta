// Documentos do Processo de Conexão (T-05-04): o espelho do frontend precisa
// ser igual ao domínio do post-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  PROCESS_DOCUMENT_LIMITS, PROCESS_DOCUMENT_STATUSES, PROCESS_DOCUMENT_STATUS_LABELS, PROCESS_DOCUMENT_TYPES,
  PROCESS_DOCUMENT_TYPE_LABELS, PROCESS_MODULE_DOCUMENT_TYPES, PROCESS_TYPE_BY_DEMAND_TYPE,
  formatProcessMoment, processDocumentAccessLabel, processDocumentActions, processDocumentArchiveProblem,
  processDocumentProblems, processDocumentSideLabel, processDocumentTypesFor, processTypeForDemandType,
  suggestedDocumentName,
} from "./process-documents.ts";
import { DOCUMENT_ACCESS_LEVELS, DOCUMENT_ACCESS_LEVEL_LABELS } from "./document-access.ts";
import { DOCUMENT_TYPES as DEMAND_DOCUMENT_TYPES } from "./demand.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/process/documents.js");

const UPLOAD = "upload:abababab-abab-4bab-8bab-abababababab";
const AGENT = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

test("vocabulário igual ao do post-service (Modelo §17, §23 a §25, §33)", () => {
  assert.deepEqual(PROCESS_DOCUMENT_TYPES, server.DOCUMENT_TYPES);
  assert.deepEqual(PROCESS_DOCUMENT_TYPE_LABELS, server.DOCUMENT_TYPE_LABELS);
  assert.deepEqual(Object.keys(PROCESS_DOCUMENT_TYPE_LABELS), PROCESS_DOCUMENT_TYPES);
  assert.deepEqual(PROCESS_MODULE_DOCUMENT_TYPES, server.PROCESS_MODULE_DOCUMENT_TYPES);
  assert.deepEqual(PROCESS_TYPE_BY_DEMAND_TYPE, server.PROCESS_TYPE_BY_DEMAND_TYPE);
  assert.deepEqual(PROCESS_DOCUMENT_STATUSES, server.DOCUMENT_STATUSES);
  assert.deepEqual(PROCESS_DOCUMENT_STATUS_LABELS, server.DOCUMENT_STATUS_LABELS);
  assert.deepEqual(DOCUMENT_ACCESS_LEVELS, server.ACCESS_LEVELS);
  assert.deepEqual(DOCUMENT_ACCESS_LEVEL_LABELS, server.ACCESS_LEVEL_LABELS);
  assert.deepEqual({ ...PROCESS_DOCUMENT_LIMITS }, { ...server.DOCUMENT_LIMITS });
});

test("tipos alinhados aos módulos: plano de execução, de recuperação, relatório ambiental, plano de ação e contrato", () => {
  for (const type of ["plano_de_execucao", "plano_de_recuperacao", "relatorio_ambiental", "plano_de_acao", "contrato"]) {
    assert.ok(PROCESS_DOCUMENT_TYPES.includes(type), type);
  }
  assert.equal(PROCESS_DOCUMENT_TYPE_LABELS.plano_de_recuperacao, "Plano de recuperação");
  assert.equal(PROCESS_DOCUMENT_TYPE_LABELS.art_rrt, "ART/RRT");
  // Os do módulo vêm primeiro, sem repetir, e todos continuam na lista.
  const ambiental = processDocumentTypesFor("ambiental");
  assert.deepEqual(ambiental.slice(0, 3), ["plano_de_recuperacao", "autorizacao_ou_licenca", "metodologia"]);
  assert.equal(new Set(ambiental).size, PROCESS_DOCUMENT_TYPES.length);
  assert.deepEqual(processDocumentTypesFor("articulacao_publica"), PROCESS_DOCUMENT_TYPES);
  assert.deepEqual(processDocumentTypesFor(null), PROCESS_DOCUMENT_TYPES);
  assert.deepEqual(processDocumentTypesFor("social"), server.documentTypesForModule("social"));
  assert.deepEqual(processDocumentTypesFor("obras"), server.documentTypesForModule("obras"));
  // Tipo da demanda → tipo do processo (resposta a "Solicitação de documentos").
  for (const [demandType, processType] of Object.entries(PROCESS_TYPE_BY_DEMAND_TYPE)) {
    assert.ok(DEMAND_DOCUMENT_TYPES.includes(demandType), `${demandType} não é tipo de documento da demanda`);
    assert.ok(PROCESS_DOCUMENT_TYPES.includes(processType), `${processType} não é tipo do processo`);
    assert.equal(processTypeForDemandType(demandType), server.processTypeForDemandType(demandType));
  }
  assert.equal(processTypeForDemandType("contratos"), "contrato");
  assert.equal(processTypeForDemandType("orcamentos_e_cotacoes"), "orcamento");
  assert.equal(processTypeForDemandType("nao_existe"), "outro");
  assert.equal(processTypeForDemandType(undefined), "outro");
});

test("validação do envio com as mesmas mensagens do servidor", () => {
  const cases = [
    { name: "Orçamento", documentType: "orcamento", uploadId: UPLOAD, accessLevel: "institucional", restrictedTo: [] },
    { name: "", documentType: "", uploadId: "", accessLevel: "institucional", restrictedTo: [] },
    { name: "Contrato", documentType: "contrato", uploadId: UPLOAD, accessLevel: "restrito", restrictedTo: [] },
    { name: "Contrato", documentType: "contrato", uploadId: UPLOAD, accessLevel: "restrito", restrictedTo: [AGENT] },
    { name: "Contrato", documentType: "contrato", uploadId: UPLOAD, accessLevel: "publico", restrictedTo: [AGENT] },
    { name: "x".repeat(256), documentType: "plano_de_acao", uploadId: UPLOAD, accessLevel: "publico", restrictedTo: [] },
    { name: "Contrato", documentType: "contrato", uploadId: UPLOAD, accessLevel: "secreto", restrictedTo: [] },
  ];
  for (const input of cases) {
    const local = processDocumentProblems(input);
    const remote = server.validateDocument(input).errors;
    assert.deepEqual(local, remote, JSON.stringify(input).slice(0, 80));
  }
  assert.deepEqual(processDocumentProblems(cases[0]), {});
  assert.equal(processDocumentArchiveProblem("  "), server.validateArchive({ reason: "  " }).errors.reason);
  assert.equal(processDocumentArchiveProblem("x".repeat(1001)), server.validateArchive({ reason: "x".repeat(1001) }).errors.reason);
  assert.equal(processDocumentArchiveProblem("Versão errada"), null);
});

test("o que cabe a cada um: abrir, nova versão e arquivar (só quem enviou, só a vigente, só com o processo aberto)", () => {
  const version = (over) => ({ canOpen: true, mine: false, status: "vigente", ...over });
  const group = (over, v) => ({ status: "vigente", versions: [version(v)], ...over });
  assert.deepEqual(processDocumentActions(group({}, { mine: true }), true), { open: true, replace: true, archive: true });
  assert.deepEqual(processDocumentActions(group({}, { mine: false }), true), { open: true, replace: true, archive: false });
  assert.deepEqual(processDocumentActions(group({}, { mine: true }), false), { open: true, replace: false, archive: false },
    "processo encerrado: só abrir");
  assert.deepEqual(processDocumentActions(group({ status: "arquivado" }, { mine: true, status: "arquivado" }), true),
    { open: true, replace: false, archive: false }, "arquivado não recebe versão nova nem arquiva de novo");
  assert.deepEqual(processDocumentActions(group({}, { canOpen: false }), true), { open: false, replace: false, archive: false });
});

test("permissão de acesso em texto e lado de quem enviou", () => {
  const participants = [
    { id: AGENT, side: "agente", label: "Agente de Transformação (autor da demanda)" },
    { id: PARTNER, side: "conectado", label: "Construtora Horizonte" },
  ];
  assert.equal(processDocumentAccessLabel({ accessLevel: "publico", restrictedTo: [] }, participants), "Público");
  assert.equal(processDocumentAccessLabel({ accessLevel: "institucional", restrictedTo: [] }, participants), "Institucional");
  assert.equal(processDocumentAccessLabel({ accessLevel: "restrito", restrictedTo: [] }, participants), "Restrito");
  assert.equal(
    processDocumentAccessLabel({ accessLevel: "restrito", restrictedTo: [PARTNER.toUpperCase(), "99999999-9999-4999-8999-999999999999"] }, participants),
    "Restrito: Construtora Horizonte, Conta autorizada",
  );
  assert.equal(processDocumentSideLabel("agente"), "Agente de Transformação");
  assert.equal(processDocumentSideLabel("conectado"), "Parte conectada");
});

test("data e hora no formato do Modelo §12, no horário de Brasília", () => {
  assert.equal(formatProcessMoment("2026-09-22T17:35:00.000Z"), "22/09/2026 - 14h35");
  assert.equal(formatProcessMoment("2026-12-31T02:05:00.000Z"), "30/12/2026 - 23h05");
  assert.equal(formatProcessMoment("2026-09-22T03:00:00.000Z"), "22/09/2026 - 00h00", "meia-noite não vira 24h");
  assert.equal(formatProcessMoment(null), "");
  assert.equal(formatProcessMoment("não é data"), "");
});

test("nome sugerido a partir do arquivo", () => {
  assert.equal(suggestedDocumentName("Orçamento.xlsx"), "Orçamento");
  assert.equal(suggestedDocumentName("Termo de parceria.v2.pdf"), "Termo de parceria.v2");
  assert.equal(suggestedDocumentName("sem-extensao"), "sem-extensao");
  assert.equal(suggestedDocumentName(null), "");
});
