/**
 * Assistente da demanda (T09). Módulo puro: etapas do assistente, estado do
 * formulário ↔ API, conferência local do envio, dinheiro em centavos,
 * composição 4%/6% espelhada e rótulos.
 *
 * Fonte da verdade: Fluxo 2 (Agente de Transformação), etapas 03 a 07 e os
 * passos 03 a 11 do fluxo completo (slide 25). O servidor é quem decide
 * (`services/post-service/src/demand/validation.js` e `finance.js`); o que
 * está aqui só antecipa o aviso e mostra a composição enquanto o Agente
 * digita. `demand.test.mjs` compara este módulo com o do post-service.
 */
import {
  DEMAND_REVIEW_STATE_LABELS,
  DEMAND_STATUS_LABELS,
  type Demand,
  type DemandAction,
  type DemandAgentAction,
  type DemandBudgetItem,
  type DemandBudgetItemInput,
  type DemandCategory,
  type DemandComposition,
  type DemandDocumentType,
  type DemandFieldErrors,
  type DemandGoalInput,
  type DemandInput,
  type DemandPriority,
  type DemandRecordMilestone,
  type DemandResourceType,
  type DemandReviewState,
  type DemandScheduleItem,
  type DemandScheduleItemInput,
  type DemandStatus,
  type DemandTimelineEvent,
} from "./types.ts";
import { institutionalTimelineLabel } from "./institutional.ts";
import { interestTimelineLabel } from "./interest.ts";
import { supportTimelineLabel } from "./support.ts";
import { executionTimelineLabel } from "./execution.ts";
import { accountabilityTimelineLabel } from "./accountability.ts";
import { mediaTimelineLabel } from "./media.ts";

// ── Rotas ──────────────────────────────────────────────────

export const DEMAND_NEW_PATH = "/demandas/nova";
export const MY_DEMANDS_PATH = "/minhas-demandas";

export function demandPublicPath(id: string): string {
  return `/demandas/${encodeURIComponent(id)}`;
}

export function demandEditPath(id: string, step?: DemandStepId): string {
  return `/demandas/${encodeURIComponent(id)}/editar${step ? `?etapa=${step}` : ""}`;
}

// ── Etapas do assistente ───────────────────────────────────

export type DemandStepId =
  | "classificacao" | "descricao" | "publico" | "orcamento" | "cronograma"
  | "metas" | "recursos" | "documentos" | "revisao";

export interface DemandStep {
  id: DemandStepId;
  /** Número exibido na barra de progresso (1 a 9). */
  number: number;
  title: string;
  /** Rótulo curto da barra de progresso. */
  short: string;
  /** Passo correspondente do fluxo completo (slide 25). */
  sourceStep: string;
  intro: string;
  /** Documentação comprobatória é "quando aplicável". */
  optional?: boolean;
}

export const DEMAND_STEPS: DemandStep[] = [
  {
    id: "classificacao", number: 1, title: "Classificação da demanda", short: "Categoria", sourceStep: "Passo 03",
    intro: "Selecione a categoria correspondente. A classificação organiza as demandas e facilita a análise e o direcionamento aos potenciais parceiros.",
  },
  {
    id: "descricao", number: 2, title: "Descrição, fotografia e localização", short: "Descrição", sourceStep: "Passo 04",
    intro: "Descreva a demanda, envie a fotografia da situação, do local ou do projeto e informe a localização com CEP e o território de abrangência.",
  },
  {
    id: "publico", number: 3, title: "Público beneficiado, objetivo e justificativa", short: "Público", sourceStep: "Passo 05",
    intro: "Informe quem será beneficiado (estimativa de pessoas e perfil), o que se pretende resolver ou realizar, por que a ação é necessária e o nível de prioridade.",
  },
  {
    id: "orcamento", number: 4, title: "Orçamento detalhado", short: "Orçamento", sourceStep: "Passo 06",
    intro: "Monte a planilha com os custos necessários para a execução, incluindo o registro fotográfico e audiovisual do antes e do depois quando houver execução física.",
  },
  {
    id: "cronograma", number: 5, title: "Cronograma físico-financeiro", short: "Cronograma", sourceStep: "Passo 07",
    intro: "Informe as etapas, atividades, datas de início e término e responsáveis. Sempre que possível, relacione cada etapa aos custos do orçamento.",
  },
  {
    id: "metas", number: 6, title: "Metas e indicadores", short: "Metas", sourceStep: "Passo 08",
    intro: "Apresente as metas, os resultados esperados, os indicadores de acompanhamento e a forma de mensuração dos resultados.",
  },
  {
    id: "recursos", number: 7, title: "Recursos necessários e contrapartida", short: "Recursos", sourceStep: "Passo 09",
    intro: "Indique os recursos necessários para realizar a demanda e o que a sua instituição já possui e pode disponibilizar.",
  },
  {
    id: "documentos", number: 8, title: "Documentação comprobatória", short: "Documentos", sourceStep: "Passo 10", optional: true,
    intro: "Quando aplicável, anexe documentos relacionados à demanda para comprovação ou contextualização.",
  },
  {
    id: "revisao", number: 9, title: "Revisão e envio para análise", short: "Revisão", sourceStep: "Passo 11",
    intro: "Confira as informações. Depois do envio, a equipe do DM Conecta analisa a demanda antes da publicação.",
  },
];

export const DEMAND_STEP_IDS = DEMAND_STEPS.map((step) => step.id);

export function isDemandStepId(value: unknown): value is DemandStepId {
  return typeof value === "string" && (DEMAND_STEP_IDS as string[]).includes(value);
}

export function demandStep(id: DemandStepId): DemandStep {
  return DEMAND_STEPS.find((step) => step.id === id) ?? DEMAND_STEPS[0];
}

export function adjacentStep(id: DemandStepId, delta: 1 | -1): DemandStepId | null {
  const index = DEMAND_STEP_IDS.indexOf(id) + delta;
  return index >= 0 && index < DEMAND_STEP_IDS.length ? DEMAND_STEP_IDS[index] : null;
}

// ── Formulário dos campos escalares ────────────────────────

export interface DemandFormState {
  category: DemandCategory | "";
  title: string;
  description: string;
  cep: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  municipality: string;
  uf: string;
  latitude: number | null;
  longitude: number | null;
  territory: string;
  beneficiariesEstimate: string;
  beneficiariesProfile: string;
  objective: string;
  justification: string;
  priority: DemandPriority | "";
  hasPhysicalExecution: boolean;
}

export type DemandFormField = keyof DemandFormState;

/**
 * Campos gravados por etapa (PUT /demands/:id só com eles). A fotografia é
 * gravada assim que o upload termina; os itens, pelas rotas próprias.
 */
export const STEP_FIELDS: Record<DemandStepId, DemandFormField[]> = {
  classificacao: ["category"],
  descricao: [
    "title", "description", "cep", "street", "addressNumber", "addressComplement", "district",
    "municipality", "uf", "latitude", "longitude", "territory",
  ],
  publico: ["beneficiariesEstimate", "beneficiariesProfile", "objective", "justification", "priority"],
  orcamento: ["hasPhysicalExecution"],
  cronograma: [],
  metas: [],
  recursos: [],
  documentos: [],
  revisao: [],
};

export function emptyDemandForm(): DemandFormState {
  return {
    category: "", title: "", description: "", cep: "", street: "", addressNumber: "",
    addressComplement: "", district: "", municipality: "", uf: "", latitude: null, longitude: null,
    territory: "", beneficiariesEstimate: "", beneficiariesProfile: "", objective: "",
    justification: "", priority: "", hasPhysicalExecution: true,
  };
}

const str = (value: string | null | undefined): string => value ?? "";

export function maskDemandCep(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export function formFromDemand(demand: Demand): DemandFormState {
  return {
    category: demand.category ?? "",
    title: str(demand.title),
    description: str(demand.description),
    cep: demand.cep ? maskDemandCep(demand.cep) : "",
    street: str(demand.street),
    addressNumber: str(demand.addressNumber),
    addressComplement: str(demand.addressComplement),
    district: str(demand.district),
    municipality: str(demand.municipality),
    uf: str(demand.uf),
    latitude: demand.latitude ?? null,
    longitude: demand.longitude ?? null,
    territory: str(demand.territory),
    beneficiariesEstimate: demand.beneficiariesEstimate != null ? String(demand.beneficiariesEstimate) : "",
    beneficiariesProfile: str(demand.beneficiariesProfile),
    objective: str(demand.objective),
    justification: str(demand.justification),
    priority: demand.priority ?? "",
    hasPhysicalExecution: demand.hasPhysicalExecution ?? true,
  };
}

const blankToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

/** Estimativa de pessoas: aceita "1.500" ou "1500"; o que não for número vai como texto (o servidor recusa). */
function estimateValue(value: string): number | string | null {
  const raw = value.trim();
  if (!raw) return null;
  const digits = raw.replace(/[.\s]/g, "");
  return /^\d+$/.test(digits) && Number.isSafeInteger(Number(digits)) ? Number(digits) : raw;
}

function fieldValue(form: DemandFormState, field: DemandFormField): unknown {
  switch (field) {
    case "category":
    case "priority":
      return form[field] || null;
    case "cep": {
      const digits = form.cep.replace(/\D/g, "");
      return digits ? digits : null;
    }
    case "uf":
      return blankToNull(form.uf.toUpperCase());
    case "latitude":
    case "longitude":
    case "hasPhysicalExecution":
      return form[field];
    case "beneficiariesEstimate":
      return estimateValue(form.beneficiariesEstimate);
    default:
      return blankToNull(form[field] as string);
  }
}

/** Corpo do PUT de uma etapa (só os campos dela). */
export function stepInput(step: DemandStepId, form: DemandFormState): DemandInput {
  const input: Record<string, unknown> = {};
  for (const field of STEP_FIELDS[step]) input[field] = fieldValue(form, field);
  return input as DemandInput;
}

/** A etapa tem alteração ainda não gravada? */
export function isStepDirty(step: DemandStepId, form: DemandFormState, saved: DemandFormState): boolean {
  return JSON.stringify(stepInput(step, form)) !== JSON.stringify(stepInput(step, saved));
}

// ── Erros do servidor por etapa ─────────────────────────────

const FIELD_STEP: Record<string, DemandStepId> = {
  category: "classificacao",
  title: "descricao", description: "descricao", photoRef: "descricao", cep: "descricao", street: "descricao",
  addressNumber: "descricao", addressComplement: "descricao", district: "descricao", municipality: "descricao",
  uf: "descricao", latitude: "descricao", longitude: "descricao", territory: "descricao",
  beneficiariesEstimate: "publico", beneficiariesProfile: "publico", objective: "publico",
  justification: "publico", priority: "publico",
  hasPhysicalExecution: "orcamento", budgetItems: "orcamento", audiovisualRecord: "orcamento",
  scheduleItems: "cronograma", recordMilestones: "cronograma", physicalFinancial: "cronograma",
  goals: "metas",
  resources: "recursos",
  documents: "documentos",
};

/** Etapa de uma chave de erro (`budgetItems[0].quantity` → orçamento). */
export function stepForErrorKey(key: string): DemandStepId {
  const base = key.replace(/\[\d+\].*$/, "").split(".")[0];
  return FIELD_STEP[base] ?? "revisao";
}

export function errorsByStep(fields: DemandFieldErrors): Partial<Record<DemandStepId, [string, string][]>> {
  const out: Partial<Record<DemandStepId, [string, string][]>> = {};
  for (const [key, message] of Object.entries(fields)) {
    const step = stepForErrorKey(key);
    (out[step] ??= []).push([key, message]);
  }
  return out;
}

export const DEMAND_FIELD_LABELS: Record<string, string> = {
  category: "Categoria",
  title: "Título",
  description: "Descrição detalhada",
  photoRef: "Fotografia",
  cep: "CEP",
  street: "Logradouro",
  addressNumber: "Número",
  addressComplement: "Complemento",
  district: "Bairro",
  municipality: "Município",
  uf: "UF",
  latitude: "Ponto no mapa",
  longitude: "Ponto no mapa",
  territory: "Território de abrangência",
  beneficiariesEstimate: "Estimativa de pessoas beneficiadas",
  beneficiariesProfile: "Perfil dos beneficiários",
  objective: "Objetivo",
  justification: "Justificativa",
  priority: "Nível de prioridade",
  hasPhysicalExecution: "Execução física",
  budgetItems: "Orçamento detalhado",
  audiovisualRecord: "Registro fotográfico e audiovisual",
  scheduleItems: "Cronograma",
  recordMilestones: "Momentos de registro no cronograma",
  physicalFinancial: "Cronograma físico-financeiro",
  goals: "Metas e indicadores",
  resources: "Recursos e contrapartida",
  documents: "Documentação comprobatória",
  description_item: "Descrição",
  quantity: "Quantidade",
  unit: "Unidade",
  unitPriceCents: "Valor unitário",
  scheduleItemId: "Etapa vinculada",
  stage: "Etapa",
  activities: "Atividades previstas",
  startsOn: "Início",
  endsOn: "Término",
  responsible: "Responsável",
  goal: "Meta",
  expectedResult: "Resultado esperado",
  indicator: "Indicador de acompanhamento",
  measurementMethod: "Forma de mensuração",
  kind: "Tipo",
  type: "Tipo",
  reference: "Arquivo",
};

const LIST_LABELS: Record<string, string> = {
  budgetItems: "Orçamento, item",
  scheduleItems: "Cronograma, etapa",
  goals: "Meta",
  resources: "Recurso",
  documents: "Documento",
};

/** Rótulo legível de uma chave de erro, inclusive de listas. */
export function demandFieldLabel(key: string): string {
  const match = /^(\w+)\[(\d+)\]\.(\w+)$/.exec(key);
  if (match) {
    const [, list, index, field] = match;
    const fieldLabel = field === "description" ? DEMAND_FIELD_LABELS.description_item : DEMAND_FIELD_LABELS[field] ?? "Campo";
    return `${LIST_LABELS[list] ?? "Item"} ${Number(index) + 1}: ${fieldLabel}`;
  }
  return DEMAND_FIELD_LABELS[key] ?? "Campo";
}

// ── Conferência local do envio (espelho de validation.js) ──

const REQUIRED_ON_SUBMIT: [keyof Demand, string][] = [
  ["category", "Selecione a categoria da demanda"],
  ["title", "Informe o título da demanda"],
  ["description", "Descreva a demanda"],
  ["objective", "Informe o objetivo: o que se pretende resolver ou realizar"],
  ["justification", "Explique a necessidade da ação (justificativa)"],
  ["beneficiariesEstimate", "Informe a estimativa de pessoas beneficiadas"],
  ["beneficiariesProfile", "Descreva o perfil dos beneficiários"],
  ["priority", "Selecione o nível de prioridade"],
  ["photoRef", "A fotografia da situação, local ou projeto é obrigatória"],
  ["cep", "A localização com CEP é obrigatória"],
  ["latitude", "Marque no mapa o ponto da demanda: sem ele a demanda não aparece no mapa"],
  ["municipality", "Informe o município"],
  ["uf", "Informe a UF"],
  ["territory", "Informe o território de abrangência (bairro, comunidade ou região)"],
];

type DemandLike = Partial<Demand>;

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/**
 * O que ainda falta para enviar, com as mesmas chaves do servidor
 * (`validateDemand(..., { forSubmission: true })`) para a demanda gravada.
 */
export function localSubmitErrors(demand: DemandLike): DemandFieldErrors {
  const errors: DemandFieldErrors = {};
  for (const [field, message] of REQUIRED_ON_SUBMIT) {
    if (isBlank(demand[field])) errors[field] = message;
  }
  const budget = demand.budgetItems ?? [];
  const schedule = demand.scheduleItems ?? [];
  const base = budget.reduce((sum, item) => sum + (item.totalCents ?? 0), 0);
  if (budget.length === 0) errors.budgetItems = "O orçamento detalhado é obrigatório";
  else if (base === 0) errors.budgetItems = "O orçamento precisa ter valor";
  if (schedule.length === 0) errors.scheduleItems = "O cronograma de execução é obrigatório";
  if ((demand.goals ?? []).length === 0) {
    errors.goals = "Informe ao menos uma meta, com resultado esperado, indicador e forma de mensuração";
  }
  if (demand.hasPhysicalExecution ?? true) {
    if (!budget.some((item) => item.isAudiovisualRecord && item.totalCents > 0)) {
      errors.audiovisualRecord = "Com execução física, o orçamento deve prever o custo do registro fotográfico e audiovisual do antes e do depois";
    }
    const milestones = new Set(schedule.flatMap((item) => item.recordMilestones ?? []));
    if (schedule.length > 0 && (!milestones.has("antes") || !milestones.has("depois"))) {
      errors.recordMilestones = "Com execução física, o cronograma deve prever o registro do antes e do depois";
    }
  }
  return errors;
}

export type DemandStepState = "completa" | "pendente" | "opcional";

/** Situação de cada etapa para a barra de progresso. */
export function demandStepStates(demand: DemandLike | null): Record<DemandStepId, DemandStepState> {
  const pending = new Set(Object.keys(localSubmitErrors(demand ?? {})).map(stepForErrorKey));
  const out = {} as Record<DemandStepId, DemandStepState>;
  for (const step of DEMAND_STEPS) {
    if (step.id === "revisao") out[step.id] = pending.size === 0 ? "completa" : "pendente";
    else if (step.optional) out[step.id] = (demand?.documents ?? []).length > 0 ? "completa" : "opcional";
    else if (step.id === "recursos") out[step.id] = (demand?.resources ?? []).length > 0 ? "completa" : "pendente";
    else out[step.id] = pending.has(step.id) ? "pendente" : "completa";
  }
  return out;
}

/** Primeira etapa com pendência (para retomar a edição). */
export function firstPendingStep(demand: DemandLike | null): DemandStepId {
  const states = demandStepStates(demand);
  return DEMAND_STEPS.find((step) => step.id !== "revisao" && states[step.id] === "pendente")?.id ?? "revisao";
}

// ── Dinheiro e quantidade ──────────────────────────────────

/** Mesmo teto do post-service (R$ 1 bilhão por demanda). */
export const MAX_BUDGET_CENTS = 100_000_000_000;

/**
 * Valor digitado em reais → centavos. Aceita "1.234,56", "1234,56", "1234.56",
 * "R$ 10.000". Retorna null se inválido (negativo, mais de 2 casas).
 */
export function parseMoneyToCents(value: string): number | null {
  let raw = value.replace(/R\$/gi, "").replace(/[\s ]/g, "");
  if (!raw) return null;
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, "");
  const match = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents <= MAX_BUDGET_CENTS ? cents : null;
}

/** Centavos → texto editável ("1234,56"). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  return `${Math.trunc(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}

/** Centavos → "R$ 1.234,56". */
export function formatCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Quantidade em milésimos (até 3 casas, maior que zero); aceita vírgula. */
export function quantityToMilli(quantity: number | string): bigint | null {
  const text = typeof quantity === "number" ? (Number.isFinite(quantity) ? String(quantity) : "")
    : typeof quantity === "string" ? quantity.trim().replace(",", ".") : "";
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) return null;
  const milli = BigInt(match[1]) * BigInt(1000) + BigInt((match[2] ?? "").padEnd(3, "0"));
  return milli > BigInt(0) ? milli : null;
}

function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * BigInt(2) + denominator) / (denominator * BigInt(2));
}

/** Total do item: round(quantidade × valor unitário), meio para cima. */
export function lineTotalCents(quantity: number | string, unitPriceCents: number): number | null {
  const milli = quantityToMilli(quantity);
  if (milli === null || !Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) return null;
  return Number(divRoundHalfUp(milli * BigInt(unitPriceCents), BigInt(1000)));
}

export const AGENT_FEE_BPS = 400;
export const PLATFORM_FEE_BPS = 600;

function feeCents(base: number, bps: number): number {
  return Number(divRoundHalfUp(BigInt(base) * BigInt(bps), BigInt(10000)));
}

/**
 * Composição (decisão 5): 4% para o Agente e 6% para a plataforma, cada um
 * sobre o valor original e arredondado meio para cima ao centavo, acrescidos
 * ao total. R$ 10.000,00 → R$ 11.000,00.
 */
export function computeComposition(baseCents: number): DemandComposition {
  const agentFeeCents = feeCents(baseCents, AGENT_FEE_BPS);
  const platformFeeCents = feeCents(baseCents, PLATFORM_FEE_BPS);
  return {
    budgetAmountCents: baseCents,
    agentFeeBps: AGENT_FEE_BPS,
    platformFeeBps: PLATFORM_FEE_BPS,
    agentFeeCents,
    platformFeeCents,
    totalAmountCents: baseCents + agentFeeCents + platformFeeCents,
  };
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toLocaleString("pt-BR")}%`;
}

export function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

// ── Formulários dos itens ──────────────────────────────────

export interface BudgetItemForm {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  isAudiovisualRecord: boolean;
  scheduleItemId: string;
}

export function emptyBudgetItemForm(): BudgetItemForm {
  return { description: "", quantity: "1", unit: "", unitPrice: "", isAudiovisualRecord: false, scheduleItemId: "" };
}

export function budgetItemFormFrom(item: DemandBudgetItem): BudgetItemForm {
  return {
    description: item.description,
    quantity: String(item.quantity).replace(".", ","),
    unit: item.unit,
    unitPrice: centsToInput(item.unitPriceCents),
    isAudiovisualRecord: item.isAudiovisualRecord,
    scheduleItemId: item.scheduleItemId ?? "",
  };
}

type Checked<T> = { input: T; errors: Record<string, string> };

export function budgetItemInput(form: BudgetItemForm): Checked<DemandBudgetItemInput> {
  const errors: Record<string, string> = {};
  const unitPriceCents = parseMoneyToCents(form.unitPrice);
  const quantity = form.quantity.trim().replace(",", ".");
  if (!form.description.trim()) errors.description = "Descreva o item";
  if (!form.unit.trim()) errors.unit = "Informe a unidade";
  if (quantityToMilli(quantity) === null) errors.quantity = "Quantidade maior que zero, com até 3 casas decimais";
  if (unitPriceCents === null) errors.unitPriceCents = "Informe o valor unitário em reais (ex.: 1.250,00)";
  return {
    input: {
      description: form.description.trim(),
      quantity,
      unit: form.unit.trim(),
      unitPriceCents: unitPriceCents ?? 0,
      isAudiovisualRecord: form.isAudiovisualRecord,
      scheduleItemId: form.scheduleItemId || null,
    },
    errors,
  };
}

/** Item gravado → corpo do PUT (para trocar só o vínculo com a etapa). */
export function budgetItemToInput(item: DemandBudgetItem, overrides: Partial<DemandBudgetItemInput> = {}): DemandBudgetItemInput {
  return {
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit,
    unitPriceCents: item.unitPriceCents,
    isAudiovisualRecord: item.isAudiovisualRecord,
    scheduleItemId: item.scheduleItemId,
    ...overrides,
  };
}

export interface ScheduleItemForm {
  stage: string;
  activities: string;
  startsOn: string;
  endsOn: string;
  responsible: string;
  recordMilestones: DemandRecordMilestone[];
}

export function emptyScheduleItemForm(): ScheduleItemForm {
  return { stage: "", activities: "", startsOn: "", endsOn: "", responsible: "", recordMilestones: [] };
}

export function scheduleItemFormFrom(item: DemandScheduleItem): ScheduleItemForm {
  return {
    stage: item.stage,
    activities: item.activities,
    startsOn: item.startsOn,
    endsOn: item.endsOn,
    responsible: item.responsible ?? "",
    recordMilestones: [...(item.recordMilestones ?? [])],
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function scheduleItemInput(form: ScheduleItemForm): Checked<DemandScheduleItemInput> {
  const errors: Record<string, string> = {};
  if (!form.stage.trim()) errors.stage = "Informe a etapa";
  if (!form.activities.trim()) errors.activities = "Descreva as atividades previstas";
  if (!ISO_DATE.test(form.startsOn)) errors.startsOn = "Informe a data de início";
  if (!ISO_DATE.test(form.endsOn)) errors.endsOn = "Informe a data de término";
  if (!errors.startsOn && !errors.endsOn && form.endsOn < form.startsOn) errors.endsOn = "O término não pode ser antes do início";
  return {
    input: {
      stage: form.stage.trim(),
      activities: form.activities.trim(),
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      responsible: form.responsible.trim() || null,
      recordMilestones: RECORD_MILESTONES.filter((m) => form.recordMilestones.includes(m)),
    },
    errors,
  };
}

export function goalInput(form: DemandGoalInput): Checked<DemandGoalInput> {
  const errors: Record<string, string> = {};
  const messages: Record<keyof Omit<DemandGoalInput, "position">, string> = {
    goal: "Informe a meta",
    expectedResult: "Informe o resultado esperado",
    indicator: "Informe o indicador de acompanhamento",
    measurementMethod: "Informe a forma de mensuração",
  };
  for (const [field, message] of Object.entries(messages)) {
    if (!String(form[field as keyof DemandGoalInput] ?? "").trim()) errors[field] = message;
  }
  return {
    input: {
      goal: form.goal.trim(),
      expectedResult: form.expectedResult.trim(),
      indicator: form.indicator.trim(),
      measurementMethod: form.measurementMethod.trim(),
    },
    errors,
  };
}

// ── Cronograma físico-financeiro ───────────────────────────

export interface PhysicalFinancialRow {
  scheduleItemId: string | null;
  stage: string;
  startsOn: string | null;
  endsOn: string | null;
  itemCount: number;
  totalCents: number;
}

/** Custo por etapa (itens vinculados) e o que ainda não tem etapa. */
export function physicalFinancialRows(
  budgetItems: Pick<DemandBudgetItem, "scheduleItemId" | "totalCents">[],
  scheduleItems: Pick<DemandScheduleItem, "id" | "stage" | "startsOn" | "endsOn">[],
): PhysicalFinancialRow[] {
  const known = new Set(scheduleItems.map((s) => s.id));
  const rows: PhysicalFinancialRow[] = scheduleItems.map((s) => {
    const linked = budgetItems.filter((b) => b.scheduleItemId === s.id);
    return {
      scheduleItemId: s.id,
      stage: s.stage,
      startsOn: s.startsOn,
      endsOn: s.endsOn,
      itemCount: linked.length,
      totalCents: linked.reduce((sum, b) => sum + b.totalCents, 0),
    };
  });
  const unlinked = budgetItems.filter((b) => !b.scheduleItemId || !known.has(b.scheduleItemId));
  if (unlinked.length) {
    rows.push({
      scheduleItemId: null,
      stage: "Sem etapa vinculada",
      startsOn: null,
      endsOn: null,
      itemCount: unlinked.length,
      totalCents: unlinked.reduce((sum, b) => sum + b.totalCents, 0),
    });
  }
  return rows;
}

/** "2026-10-05" → "05/10/2026" (sem fuso: é uma data de calendário). */
export function formatIsoDate(value: string | null | undefined): string {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
}

// ── Rótulos ────────────────────────────────────────────────

export const RECORD_MILESTONES: DemandRecordMilestone[] = ["antes", "acompanhamento", "depois"];

export const RECORD_MILESTONE_LABELS: Record<DemandRecordMilestone, string> = {
  antes: "Situação inicial (antes)",
  acompanhamento: "Acompanhamento",
  depois: "Resultado final (depois)",
};

export const RESOURCE_TYPE_LABELS: Record<DemandResourceType, string> = {
  recursos_financeiros: "Recursos financeiros",
  materiais: "Materiais",
  servicos: "Serviços",
  equipamentos: "Equipamentos",
  mao_de_obra: "Mão de obra",
  estrutura: "Estrutura",
  apoio_tecnico: "Apoio técnico",
  conhecimento_especializado: "Conhecimento especializado",
  servicos_de_fotografia_e_filmagem: "Serviços de fotografia e filmagem",
  equipe: "Equipe",
  espaco_fisico: "Espaço físico",
  recursos_proprios: "Recursos próprios",
  conhecimento_tecnico: "Conhecimento técnico",
};

export const DOCUMENT_TYPES: DemandDocumentType[] = [
  "documentos_institucionais", "estatuto", "documentos_de_representacao", "autorizacoes",
  "orcamentos_e_cotacoes", "projetos_tecnicos", "fotografias", "outros",
];

export const DOCUMENT_TYPE_LABELS: Record<DemandDocumentType, string> = {
  documentos_institucionais: "Documentos institucionais",
  estatuto: "Estatuto",
  documentos_de_representacao: "Documentos de representação",
  autorizacoes: "Autorizações",
  orcamentos_e_cotacoes: "Orçamentos e cotações",
  projetos_tecnicos: "Projetos técnicos",
  fotografias: "Fotografias",
  outros: "Outros documentos",
};

// TODO(fonte-da-verdade): Modelo de Conexão §03 — faltam 7 tipos de demanda; ver TODO em services/post-service/migrations/007-demands.sql.
export const DEMAND_CATEGORIES: DemandCategory[] = [
  "projeto_social", "projeto_ambiental", "necessidade_de_patrocinio", "problema_urbano", "problema_urgente",
];

export const DEMAND_PRIORITIES: DemandPriority[] = ["baixa", "media", "alta", "urgente"];

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR",
  "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

/** Cores da paleta oficial (docs/manual-marca.md). */
export const DEMAND_STATUS_COLORS: Record<DemandStatus, string> = {
  em_analise: "#868e96",
  publicada: "#2e7ba8",
  em_busca_de_parceiro: "#f4841a",
  conectada: "#1b4f72",
  em_execucao: "#0d2d42",
  concluida: "#2e9e5b",
  prestacao_de_contas: "#2e9e5b",
  arquivada: "#868e96",
};

export const DEMAND_REVIEW_STATE_COLORS: Record<DemandReviewState, string> = {
  rascunho: "#868e96",
  aguardando_analise: "#2e7ba8",
  devolvida: "#f4841a",
  aprovada: "#2e9e5b",
};

export const DEMAND_PRIORITY_COLORS: Record<DemandPriority, string> = {
  baixa: "#5a9bc4",
  media: "#2e7ba8",
  alta: "#f4841a",
  urgente: "#e53935",
};

/** Ações do Agente (mesmos rótulos de state-machine.js). */
export const DEMAND_ACTION_LABELS: Record<DemandAction, string> = {
  enviar: "Enviar para análise",
  buscar_parceiro: "Buscar parceiro",
  conectar: "Marcar como conectada",
  iniciar_execucao: "Iniciar execução",
  concluir: "Concluir",
  prestar_contas: "Iniciar prestação de contas",
};

/** Status de destino de cada ação do Agente. */
export const DEMAND_ACTION_TARGET: Record<DemandAgentAction, DemandStatus> = {
  buscar_parceiro: "em_busca_de_parceiro",
  conectar: "conectada",
  iniciar_execucao: "em_execucao",
  concluir: "concluida",
  prestar_contas: "prestacao_de_contas",
};

export function isAgentTransition(action: DemandAction): action is DemandAgentAction {
  return action !== "enviar";
}

/** Status canônico para exibir; em análise, com a etapa da análise. */
export function demandStatusText(demand: { status: DemandStatus; reviewState?: DemandReviewState | null }): string {
  const label = DEMAND_STATUS_LABELS[demand.status] ?? "Status desconhecido";
  if (demand.status === "em_analise" && demand.reviewState && demand.reviewState !== "aprovada") {
    return `${label} · ${DEMAND_REVIEW_STATE_LABELS[demand.reviewState]}`;
  }
  return label;
}

/** Orientação ao Agente conforme o estado. */
export function demandGuidance(demand: { status: DemandStatus; reviewState?: DemandReviewState | null }): string {
  if (demand.status === "em_analise") {
    switch (demand.reviewState) {
      case "rascunho":
        return "Rascunho salvo. Complete as etapas e envie para análise quando estiver pronto.";
      case "aguardando_analise":
        return "Enviada para análise. A equipe do DM Conecta confere as informações antes da publicação.";
      case "devolvida":
        return "A equipe devolveu a demanda para ajustes. Confira o parecer, ajuste e envie de novo.";
      default:
        return "Em análise pela equipe do DM Conecta.";
    }
  }
  switch (demand.status) {
    case "publicada": return "Publicada: potenciais parceiros já podem conhecer a demanda.";
    case "em_busca_de_parceiro": return "Em busca de parceiro: a demanda aparece para quem pode apoiar.";
    case "conectada": return "Conectada a um parceiro. Quando a execução começar, registre o início.";
    case "em_execucao": return "Em execução. Ao terminar, marque a demanda como concluída.";
    case "concluida": return "Concluída. Registre os resultados e as evidências na prestação de contas.";
    case "prestacao_de_contas": return "Em prestação de contas: resultados, evidências e comprovantes.";
    case "arquivada": return "Arquivada pela moderação e fora do fluxo público.";
    default: return "";
  }
}

/** Evento da linha do tempo → texto (nunca o código cru). */
export function timelineEventLabel(event: Pick<DemandTimelineEvent, "type" | "toStatus" | "details"> & { payload?: Record<string, unknown> }): string {
  // Atuação institucional do Poder Público (T13): órgão, resposta, status e apoio.
  // Na visão do autor, o mesmo conteúdo público vem em payload.public.
  const institutional = institutionalTimelineLabel({
    type: event.type,
    details: event.details ?? (event.payload?.public as DemandTimelineEvent["details"] | undefined),
  });
  if (institutional) return institutional;
  // Interesse, participação e conexão (T15): categoria da conta, nunca o nome.
  const interest = interestTimelineLabel({
    type: event.type,
    details: event.details ?? (event.payload?.public as DemandTimelineEvent["details"] | undefined),
  });
  if (interest) return interest;
  // Apoio registrado, confirmado ou contestado (T16).
  const support = supportTimelineLabel({
    type: event.type,
    details: event.details ?? (event.payload?.public as DemandTimelineEvent["details"] | undefined),
  });
  if (support) return support;
  // Execução, evidências antes/depois e acompanhamento (T17).
  const execution = executionTimelineLabel({
    type: event.type,
    details: event.details ?? (event.payload?.public as DemandTimelineEvent["details"] | undefined),
  });
  if (execution) return execution;
  // Prestação de contas e resultados (T18).
  const accountability = accountabilityTimelineLabel({
    type: event.type,
    details: event.details ?? (event.payload?.public as DemandTimelineEvent["details"] | undefined),
  });
  if (accountability) return accountability;
  // Divulgação registrada pela Comunicação (T28).
  const media = mediaTimelineLabel({
    type: event.type,
    details: event.details ?? (event.payload?.public as DemandTimelineEvent["details"] | undefined),
  });
  if (media) return media;
  switch (event.type) {
    case "criada": return "Rascunho criado";
    case "enviada_para_analise": return event.payload?.reenvio === true ? "Reenviada para análise" : "Enviada para análise";
    case "devolvida_para_ajustes": return "Devolvida para ajustes";
    case "publicada": return "Demanda publicada";
    case "arquivada": return "Arquivada";
    case "dossie_gerado": {
      const version = typeof event.payload?.version === "number" ? ` (versão ${event.payload.version})` : "";
      return `Dossiê da Demanda gerado${version}`;
    }
    case "status_alterado":
      return event.toStatus && DEMAND_STATUS_LABELS[event.toStatus] ? DEMAND_STATUS_LABELS[event.toStatus] : "Andamento atualizado";
    default: return "Atualização";
  }
}

// ── Erros ──────────────────────────────────────────────────

/** Mensagem para o Agente a partir de um erro da API. */
export function demandErrorMessage(err: unknown, fallback = "Não foi possível salvar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") {
      return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    }
    const code = (err as { code?: unknown }).code;
    if (code === "demand_not_editable") return "A demanda não pode ser alterada no estado atual.";
    if (code === "demand_author_not_agent") return "Só Agentes de Transformação estruturam demandas.";
    if (err.message) return err.message;
  }
  return fallback;
}

export function fieldErrorsOf(err: unknown): DemandFieldErrors {
  const fields = err && typeof err === "object" ? (err as { fields?: unknown }).fields : null;
  return fields && typeof fields === "object" ? (fields as DemandFieldErrors) : {};
}
