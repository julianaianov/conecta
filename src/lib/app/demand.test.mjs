// Assistente da demanda (T09). As demandas abaixo existem só neste teste;
// nenhuma tela usa dados de exemplo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DEMAND_ACTION_LABELS,
  DEMAND_ACTION_TARGET,
  DEMAND_CATEGORIES,
  DEMAND_PRIORITIES,
  DEMAND_STEPS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  RECORD_MILESTONES,
  RESOURCE_TYPE_LABELS,
  STEP_FIELDS,
  UFS,
  adjacentStep,
  budgetItemInput,
  budgetItemToInput,
  centsToInput,
  computeComposition,
  demandEditPath,
  demandFieldLabel,
  demandPublicPath,
  demandStatusText,
  demandStepStates,
  emptyDemandForm,
  emptyScheduleItemForm,
  scheduleItemFormFrom,
  errorsByStep,
  firstPendingStep,
  formFromDemand,
  formatIsoDate,
  goalInput,
  isStepDirty,
  lineTotalCents,
  localSubmitErrors,
  parseMoneyToCents,
  physicalFinancialRows,
  scheduleItemInput,
  stepForErrorKey,
  stepInput,
  timelineEventLabel,
} from "./demand.ts";
import { DEMAND_RESOURCE_TYPES } from "./types.ts";
import { institutionGateMessage } from "./institution.ts";

const require = createRequire(import.meta.url);
const constants = require("../../../services/post-service/src/demand/constants.js");
const finance = require("../../../services/post-service/src/demand/finance.js");
const { validateDemand, UFS: SERVER_UFS } = require("../../../services/post-service/src/demand/validation.js");
const { ACTIONS } = require("../../../services/post-service/src/demand/state-machine.js");
const store = require("../../../services/post-service/src/demand/store.js");

const PHOTO = "upload:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const STAGE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STAGE_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

/** Demanda completa, no formato da visão do autor (GET /demands/mine/:id). */
function completeDemand(overrides = {}) {
  return {
    category: "problema_urbano",
    title: "Recuperação da praça",
    description: "Praça com piso quebrado e sem iluminação.",
    problemIdentified: "Moradores deixaram de usar a praça à noite.",
    coverageArea: "Praça e quadras do entorno.",
    objective: "Recuperar o piso e a iluminação.",
    justification: "Moradores deixaram de usar o espaço à noite.",
    beneficiariesEstimate: 800,
    beneficiariesProfile: "Moradores do entorno",
    priority: "alta",
    photoRef: PHOTO,
    cep: "20040020",
    street: null,
    addressNumber: null,
    addressComplement: null,
    district: "Centro",
    municipality: "Rio de Janeiro",
    uf: "RJ",
    latitude: -22.9068,
    longitude: -43.1729,
    territory: "Centro",
    hasPhysicalExecution: true,
    budgetItems: [
      { id: "11111111-1111-4111-8111-111111111111", description: "Piso", quantity: 10, unit: "m²", unitPriceCents: 95000, totalCents: 950000, isAudiovisualRecord: false, scheduleItemId: STAGE_A },
      { id: "22222222-2222-4222-8222-222222222222", description: "Registro audiovisual", quantity: 1, unit: "serviço", unitPriceCents: 50000, totalCents: 50000, isAudiovisualRecord: true, scheduleItemId: null },
    ],
    scheduleItems: [
      { id: STAGE_A, stage: "Obra", activities: "Troca do piso", startsOn: "2026-10-01", endsOn: "2026-10-20", responsible: null, recordMilestones: ["antes", "acompanhamento", "depois"] },
    ],
    goals: [{ goal: "Piso novo", expectedResult: "Praça usada", indicator: "m² recuperados", measurementMethod: "Medição" }],
    resources: [{ kind: "necessario", type: "materiais", description: null }],
    documents: [],
    ...overrides,
  };
}

function serverSubmitErrors(demand) {
  const input = {
    ...demand,
    budgetItems: (demand.budgetItems ?? []).map((item) => ({ ...item, quantity: String(item.quantity) })),
  };
  return validateDemand(input, { forSubmission: true }).errors;
}

test("nove etapas numeradas, na ordem dos passos 03 a 11 do fluxo completo", () => {
  assert.deepEqual(DEMAND_STEPS.map((s) => s.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(DEMAND_STEPS.map((s) => s.sourceStep), [
    "Passo 03", "Passo 04", "Passo 05", "Passo 06", "Passo 07", "Passo 08", "Passo 09", "Passo 10", "Passo 11",
  ]);
  assert.equal(adjacentStep("classificacao", -1), null);
  assert.equal(adjacentStep("classificacao", 1), "descricao");
  assert.equal(adjacentStep("revisao", 1), null);
  assert.equal(demandEditPath("abc", "orcamento"), "/demandas/abc/editar?etapa=orcamento");
  assert.equal(demandPublicPath("a b"), "/demandas/a%20b");
});

test("toda coluna escalar do servidor tem etapa (a foto grava no upload)", () => {
  const covered = new Set(Object.values(STEP_FIELDS).flat());
  const missing = Object.keys(store.SCALAR_COLUMNS).filter((key) => !covered.has(key) && key !== "photoRef");
  assert.deepEqual(missing, []);
  for (const field of covered) assert.ok(field in store.SCALAR_COLUMNS, field);
});

test("vocabulário igual ao do post-service", () => {
  assert.deepEqual(DEMAND_CATEGORIES, constants.CATEGORIES);
  assert.deepEqual(DEMAND_PRIORITIES, constants.PRIORITIES);
  assert.deepEqual(RECORD_MILESTONES, constants.RECORD_MILESTONES);
  assert.deepEqual(DOCUMENT_TYPES, constants.DOCUMENT_TYPES);
  assert.deepEqual(UFS, SERVER_UFS);
  assert.deepEqual(DEMAND_RESOURCE_TYPES, constants.RESOURCE_TYPES_BY_KIND);
  for (const type of [...constants.NEEDED_RESOURCE_TYPES, ...constants.COUNTERPART_RESOURCE_TYPES]) {
    assert.ok(RESOURCE_TYPE_LABELS[type], type);
  }
  for (const type of constants.DOCUMENT_TYPES) assert.ok(DOCUMENT_TYPE_LABELS[type], type);
});

test("ações do Agente com os rótulos e destinos da máquina de estados", () => {
  for (const [action, label] of Object.entries(DEMAND_ACTION_LABELS)) {
    assert.equal(label, ACTIONS[action].label, action);
    assert.ok(ACTIONS[action].actors.includes("agente"), action);
  }
  for (const [action, target] of Object.entries(DEMAND_ACTION_TARGET)) {
    assert.equal(target, ACTIONS[action].to.status, action);
  }
});

test("formulário → PUT da etapa: só os campos dela, brancos viram null", () => {
  const form = { ...emptyDemandForm(), category: "projeto_social", title: "  Horta  ", cep: "20040-020", uf: "rj", beneficiariesEstimate: "1.500" };
  // A classificação leva também as informações do módulo derivado (T-05-08).
  assert.deepEqual(stepInput("classificacao", form), { category: "projeto_social", moduleDetails: {} });
  assert.deepEqual(
    stepInput("classificacao", { ...form, category: "recuperacao_ambiental", moduleDetails: { area_m2: "1.200,5", equipe: "fora do módulo" } }),
    { category: "recuperacao_ambiental", moduleDetails: { area_m2: 1200.5 } },
  );
  const descricao = stepInput("descricao", form);
  assert.equal(descricao.title, "Horta");
  assert.equal(descricao.cep, "20040020");
  assert.equal(descricao.uf, "RJ");
  assert.equal(descricao.description, null);
  assert.equal("category" in descricao, false);
  assert.equal(stepInput("publico", form).beneficiariesEstimate, 1500);
  assert.equal(stepInput("publico", { ...form, beneficiariesEstimate: "muitas" }).beneficiariesEstimate, "muitas");
  assert.deepEqual(stepInput("orcamento", form), { hasPhysicalExecution: true });
  assert.deepEqual(stepInput("metas", form), {});

  // O servidor aceita o parcial do rascunho sem erro.
  for (const step of DEMAND_STEPS) {
    const { errors } = validateDemand(stepInput(step.id, { ...form, beneficiariesEstimate: "1500" }));
    assert.deepEqual(errors, {}, step.id);
  }
});

test("rascunho gravado → formulário e detecção de alteração", () => {
  const demand = completeDemand();
  const form = formFromDemand(demand);
  assert.equal(form.cep, "20040-020");
  assert.equal(form.beneficiariesEstimate, "800");
  assert.equal(isStepDirty("descricao", form, form), false);
  assert.equal(isStepDirty("descricao", { ...form, title: "Outro" }, form), true);
  assert.equal(isStepDirty("publico", { ...form, title: "Outro" }, form), false);
  assert.equal(isStepDirty("descricao", { ...form, title: "Recuperação da praça  " }, form), false);
});

test("conferência local do envio tem as mesmas chaves do servidor", () => {
  const cases = [
    {},
    completeDemand(),
    completeDemand({ photoRef: null, cep: null, goals: [] }),
    completeDemand({ budgetItems: completeDemand().budgetItems.map((i) => ({ ...i, isAudiovisualRecord: false })) }),
    completeDemand({ scheduleItems: [{ ...completeDemand().scheduleItems[0], recordMilestones: ["acompanhamento"] }] }),
    completeDemand({ hasPhysicalExecution: false, budgetItems: [completeDemand().budgetItems[0]], scheduleItems: [{ ...completeDemand().scheduleItems[0], recordMilestones: [] }] }),
    completeDemand({ budgetItems: [], scheduleItems: [] }),
  ];
  for (const demand of cases) {
    assert.deepEqual(Object.keys(localSubmitErrors(demand)).sort(), Object.keys(serverSubmitErrors(demand)).sort());
  }
  assert.deepEqual(localSubmitErrors(completeDemand()), {});
});

test("erros do servidor caem na etapa certa", () => {
  const errors = serverSubmitErrors({});
  for (const key of Object.keys(errors)) assert.notEqual(stepForErrorKey(key), "revisao", key);
  assert.equal(stepForErrorKey("budgetItems[0].quantity"), "orcamento");
  assert.equal(stepForErrorKey("audiovisualRecord"), "orcamento");
  assert.equal(stepForErrorKey("recordMilestones"), "cronograma");
  assert.equal(stepForErrorKey("physicalFinancial"), "cronograma");
  assert.equal(stepForErrorKey("documents[2].reference"), "documentos");
  assert.equal(stepForErrorKey("desconhecido"), "revisao");
  const grouped = errorsByStep({ photoRef: "x", goals: "y", cep: "z" });
  assert.deepEqual(grouped.descricao.map(([k]) => k), ["photoRef", "cep"]);
  assert.equal(demandFieldLabel("budgetItems[0].quantity"), "Orçamento, item 1: Quantidade");
  assert.equal(demandFieldLabel("goals[1].description"), "Meta 2: Descrição");
  assert.equal(demandFieldLabel("photoRef"), "Fotografia");
});

test("barra de progresso: etapas pendentes e retomada", () => {
  const empty = demandStepStates({});
  assert.equal(empty.classificacao, "pendente");
  assert.equal(empty.documentos, "opcional");
  assert.equal(empty.revisao, "pendente");
  assert.equal(firstPendingStep({}), "classificacao");
  const done = demandStepStates(completeDemand());
  assert.ok(Object.values(done).every((s) => s === "completa" || s === "opcional"));
  assert.equal(firstPendingStep(completeDemand()), "revisao");
  assert.equal(firstPendingStep(completeDemand({ goals: [] })), "metas");
  assert.equal(demandStepStates(completeDemand({ resources: [] })).recursos, "pendente");
});

test("dinheiro em reais → centavos", () => {
  assert.equal(parseMoneyToCents("10.000,00"), 1_000_000);
  assert.equal(parseMoneyToCents("R$ 1.234,5"), 123_450);
  assert.equal(parseMoneyToCents("1234.56"), 123_456);
  assert.equal(parseMoneyToCents("10.000"), 1_000_000);
  assert.equal(parseMoneyToCents("0"), 0);
  assert.equal(parseMoneyToCents(""), null);
  assert.equal(parseMoneyToCents("-5"), null);
  assert.equal(parseMoneyToCents("1,234"), null);
  assert.equal(parseMoneyToCents("abc"), null);
  assert.equal(centsToInput(123_456), "1234,56");
  assert.equal(centsToInput(5), "0,05");
});

test("total do item e composição 4%/6% iguais ao post-service", () => {
  const quantities = ["1", "2,5", "0.001", "3.333", 7, "999"];
  const prices = [0, 1, 99, 12_345, 1_000_000, 33_333];
  for (const q of quantities) {
    for (const p of prices) assert.equal(lineTotalCents(q, p), finance.lineTotalCents(typeof q === "string" ? q.replace(",", ".") : q, p), `${q} × ${p}`);
  }
  assert.equal(lineTotalCents("0", 100), null);
  assert.equal(lineTotalCents("1,2345", 100), null);
  for (const base of [0, 1, 12, 13, 25, 99, 1_000_000, 123_457, 99_999_999_999]) {
    assert.deepEqual(computeComposition(base), finance.computeComposition(base), String(base));
  }
  const example = computeComposition(1_000_000);
  assert.equal(example.agentFeeCents, 40_000);
  assert.equal(example.platformFeeCents, 60_000);
  assert.equal(example.totalAmountCents, 1_100_000);
});

test("formulários dos itens conferem os obrigatórios antes de gravar", () => {
  const bad = budgetItemInput({ item: "", description: " ", supplierReference: "", quantity: "0", unit: "", unitPrice: "x", isAudiovisualRecord: false, scheduleItemId: "" });
  assert.deepEqual(Object.keys(bad.errors).sort(), ["description", "quantity", "unit", "unitPriceCents"]);
  const ok = budgetItemInput({ item: " Filmagem ", description: "Filmagem", supplierReference: "", quantity: "2,5", unit: "diária", unitPrice: "1.200,00", isAudiovisualRecord: true, scheduleItemId: "" });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.input, { item: "Filmagem", description: "Filmagem", supplierReference: null, quantity: "2.5", unit: "diária", unitPriceCents: 120_000, isAudiovisualRecord: true, scheduleItemId: null });
  assert.deepEqual(validateDemand({ budgetItems: [ok.input] }).errors, {});
  const relinked = budgetItemToInput(completeDemand().budgetItems[0], { scheduleItemId: STAGE_B });
  assert.equal(relinked.scheduleItemId, STAGE_B);
  assert.equal(relinked.quantity, "10");

  const stage = scheduleItemInput({ stage: "Obra", activities: "Piso", startsOn: "2026-10-10", endsOn: "2026-10-01", responsible: "", resourcesNeeded: "", amount: "", recordMilestones: ["depois", "antes"] });
  assert.deepEqual(Object.keys(stage.errors), ["endsOn"]);
  assert.deepEqual(stage.input.recordMilestones, ["antes", "depois"]);
  assert.equal(stage.input.responsible, null);

  assert.deepEqual(Object.keys(goalInput({ goal: "a", expectedResult: "", indicator: "c", measurementMethod: " " }).errors), ["expectedResult", "measurementMethod"]);
});

test("cronograma físico-financeiro soma o custo por etapa", () => {
  const demand = completeDemand();
  const rows = physicalFinancialRows(demand.budgetItems, demand.scheduleItems);
  assert.deepEqual(rows.map((r) => [r.scheduleItemId, r.itemCount, r.totalCents]), [[STAGE_A, 1, 950_000], [null, 1, 50_000]]);
  assert.equal(formatIsoDate("2026-10-05"), "05/10/2026");
  assert.equal(formatIsoDate(null), "");
});

test("status e linha do tempo nunca mostram o código cru", () => {
  assert.equal(demandStatusText({ status: "em_analise", reviewState: "devolvida" }), "Em análise · Devolvida para ajustes");
  assert.equal(demandStatusText({ status: "publicada", reviewState: "aprovada" }), "Publicada");
  assert.equal(timelineEventLabel({ type: "status_alterado", toStatus: "conectada" }), "Conectada");
  assert.equal(timelineEventLabel({ type: "enviada_para_analise", toStatus: "em_analise", payload: { reenvio: true } }), "Reenviada para análise");
  assert.equal(timelineEventLabel({ type: "algo_novo", toStatus: null }), "Atualização");
});

test("aviso do gate fala da instituição do Agente", () => {
  assert.match(institutionGateMessage("enviar_demanda", null, "agente_transformacao"), /CNPJ \+ CNAE/);
  assert.match(institutionGateMessage("enviar_demanda", "em_analise", "agente_transformacao"), /instituição/);
  assert.doesNotMatch(institutionGateMessage("mover_demanda", null, "agente_transformacao"), /Poder Público/);
  assert.match(institutionGateMessage("publicar", null), /Poder Público/);
});

// ── Instituição responsável na página pública da demanda (T-02-02) ──────────
import { readFileSync } from "node:fs";
import { mapPublicInstitutionRecord } from "./institution.ts";

const readSource = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("página pública da demanda mostra a instituição responsável, sem contato do representante", () => {
  const page = readSource("src/app/(app)/demandas/[id]/page.tsx");
  assert.match(page, /getPublicInstitution\(demand\.authorId\)/);
  assert.match(page, /institution=\{institution\}/);
  const view = readSource("src/components/app/demand/PublicDemandView.tsx");
  assert.match(view, /<PublicInstitutionCard institution=\{institution\} title="Publicada por"/);

  const projected = mapPublicInstitutionRecord({
    institution_kind: "agente_transformacao",
    cnpj: "11222333000181",
    legal_name: "Associação de Moradores do Parque",
    cnae_primary: "9430800",
    representative_email: "representante@exemplo.org",
    representative_phone: "11999990000",
    validation_reviewed_at: "2026-09-20T10:00:00.000Z",
  });
  assert.equal(projected.legalName, "Associação de Moradores do Parque");
  assert.equal(projected.cnaePrimary, "9430800");
  const keys = Object.keys(projected).join(",");
  assert.doesNotMatch(keys, /email|phone|telefone|representative/i);
});

// ── Critérios de prioridade da plataforma (T-02-01, decisão 17) ─────────────
import {
  DEMAND_PRIORITY_CRITERIA,
  PRIORITIES_EXPECTING_CRITERIA,
  sortPriorityCriteria,
  togglePriorityCriterion,
} from "./demand.ts";

test("critérios de prioridade iguais aos do post-service, com texto único", () => {
  const server = createRequire(import.meta.url)("../../../services/post-service/src/demand/priority.js");
  assert.deepEqual(DEMAND_PRIORITY_CRITERIA, server.PRIORITY_CRITERIA);
  assert.deepEqual(PRIORITIES_EXPECTING_CRITERIA, server.PRIORITIES_EXPECTING_CRITERIA);
  assert.equal(new Set(DEMAND_PRIORITY_CRITERIA.map((c) => c.description)).size, 4);
});

test("critérios: formulário ↔ API na ordem da plataforma, sem repetição", () => {
  assert.deepEqual(sortPriorityCriteria(["prazo_sazonalidade", "inventado", "risco_vida_seguranca", "prazo_sazonalidade"]),
    ["risco_vida_seguranca", "prazo_sazonalidade"]);
  assert.deepEqual(togglePriorityCriterion(["pessoas_afetadas"], "risco_vida_seguranca"), ["risco_vida_seguranca", "pessoas_afetadas"]);
  assert.deepEqual(togglePriorityCriterion(["pessoas_afetadas"], "pessoas_afetadas"), []);
  const form = { ...emptyDemandForm(), priority: "urgente", priorityCriteria: ["recurso_disponivel", "risco_vida_seguranca"] };
  const body = stepInput("publico", form);
  assert.deepEqual(body.priorityCriteria, ["risco_vida_seguranca", "recurso_disponivel"]);
  assert.equal(stepForErrorKey("priorityCriteria"), "publico");
  assert.deepEqual(formFromDemand({ priorityCriteria: ["pessoas_afetadas"] }).priorityCriteria, ["pessoas_afetadas"]);
  assert.deepEqual(formFromDemand({}).priorityCriteria, []);
});

// ── Avisos do envio na revisão (T-02-05) ───────────────────────────────────
import { demandWarnings } from "./demand.ts";

test("avisos do envio: rótulo humano, etapa de correção e ordem das etapas", () => {
  const list = demandWarnings({
    themes: "Marque os eixos",
    physicalFinancial: "Vincule cada item",
    priorityCriteria: "Indique o critério",
    recordMilestones: "Considere o acompanhamento",
  });
  assert.deepEqual(list.map((w) => [w.key, w.step]), [
    ["priorityCriteria", "publico"],
    ["physicalFinancial", "cronograma"],
    ["recordMilestones", "cronograma"],
    ["themes", null],
  ]);
  assert.equal(list[1].label, "Cronograma físico-financeiro");
  assert.equal(list[3].label, "Eixos temáticos");
  assert.deepEqual(demandWarnings({}), []);
  assert.deepEqual(demandWarnings(undefined), []);
  // Toda chave de aviso do post-service tem rótulo e etapa conhecidos.
  const { validateDemand } = createRequire(import.meta.url)("../../../services/post-service/src/demand/validation.js");
  const { warnings } = validateDemand({
    priority: "urgente",
    hasPhysicalExecution: true,
    scheduleItems: [{ id: "11111111-1111-4111-8111-111111111111", stage: "Etapa", activities: "a", startsOn: "2026-10-01", endsOn: "2026-10-10", recordMilestones: ["antes", "depois"] }],
    budgetItems: [{ description: "Item", quantity: "1", unit: "un", unitPriceCents: 100 }],
  }, { forSubmission: true });
  assert.ok(warnings.physicalFinancial);
  for (const w of demandWarnings(warnings)) assert.notEqual(w.label, w.key, w.key);
});

// ── Campos do Modelo de Conexão §04/§05 (T-05-09) ──────────────────────────
import {
  BUDGET_CSV_HEADER,
  budgetCsvTemplate,
  budgetImportErrorLines,
  formatDeadlineDays,
  stageDeadlineDays,
} from "./demand.ts";

test("§04: problema identificado e área de abrangência na etapa 2, obrigatórios no envio como no servidor", () => {
  assert.ok(STEP_FIELDS.descricao.includes("problemIdentified"));
  assert.ok(STEP_FIELDS.descricao.includes("coverageArea"));
  assert.equal(stepForErrorKey("problemIdentified"), "descricao");
  assert.equal(stepForErrorKey("coverageArea"), "descricao");
  const form = { ...emptyDemandForm(), problemIdentified: "  Praça sem luz  ", coverageArea: "" };
  const body = stepInput("descricao", form);
  assert.equal(body.problemIdentified, "Praça sem luz");
  assert.equal(body.coverageArea, null);
  const missing = completeDemand({ problemIdentified: null, coverageArea: "" });
  assert.deepEqual(Object.keys(localSubmitErrors(missing)).sort(), ["coverageArea", "problemIdentified"]);
  assert.deepEqual(Object.keys(serverSubmitErrors(missing)).sort(), ["coverageArea", "problemIdentified"]);
  assert.equal(demandFieldLabel("problemIdentified"), "Problema identificado");
  assert.equal(demandFieldLabel("budgetItems[0].supplierReference"), "Orçamento, item 1: Fornecedor ou referência");
  assert.equal(formFromDemand(completeDemand()).coverageArea, "Praça e quadras do entorno.");
});

test("§04/§05: item, fornecedor, recursos e valor da etapa; prazo em dias igual ao do post-service", () => {
  const server = createRequire(import.meta.url)("../../../services/post-service/src/demand/budget-import.js");
  assert.equal(BUDGET_CSV_HEADER, server.TEMPLATE_HEADER);
  assert.ok(budgetCsvTemplate().startsWith("﻿" + BUDGET_CSV_HEADER));
  assert.equal(server.parseBudgetCsv(budgetCsvTemplate()).errors.file, "A planilha não tem itens abaixo do cabeçalho");
  for (const [a, b] of [["2026-10-01", "2026-10-01"], ["2026-10-01", "2026-10-31"], ["2026-02-27", "2026-03-02"], ["2026-10-02", "2026-10-01"]]) {
    assert.equal(stageDeadlineDays(a, b), store.deadlineDays(a, b), `${a}..${b}`);
  }
  assert.equal(formatDeadlineDays(1), "1 dia");
  assert.equal(formatDeadlineDays(15), "15 dias");
  const stage = scheduleItemInput({ stage: "Obra", activities: "Piso", startsOn: "2026-10-01", endsOn: "2026-10-05", responsible: "", resourcesNeeded: " Andaime ", amount: "1.500,00", recordMilestones: [] });
  assert.deepEqual(stage.errors, {});
  assert.equal(stage.input.resourcesNeeded, "Andaime");
  assert.equal(stage.input.amountCents, 150_000);
  assert.deepEqual(validateDemand({ scheduleItems: [stage.input] }).errors, {});
  assert.ok(scheduleItemInput({ ...emptyScheduleItemForm(), stage: "a", activities: "b", startsOn: "2026-10-01", endsOn: "2026-10-01", amount: "abc" }).errors.amountCents);
  assert.equal(scheduleItemFormFrom({ ...completeDemand().scheduleItems[0], amountCents: 150_000, resourcesNeeded: "Andaime" }).amount, "1500,00");
  const rows = physicalFinancialRows(completeDemand().budgetItems, [{ ...completeDemand().scheduleItems[0], amountCents: 900_000 }]);
  assert.equal(rows[0].declaredCents, 900_000);
  assert.deepEqual(budgetImportErrorLines([{ line: 3, fields: { valor_unitario: "Valor inválido", descricao: "Descreva" } }]),
    ["Linha 3 · valor_unitario: Valor inválido", "Linha 3 · descricao: Descreva"]);
});
