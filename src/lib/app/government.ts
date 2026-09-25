// Área de governo e gestão pública (T22): vocabulário dos 10 indicadores do
// slide 14, períodos, recortes e apresentação do painel.
// Espelha services/post-service/src/government/constants.js e
// indicators.js; `government.test.mjs` compara as listas.
//
// Aqui só há domínio puro (listas, query e apresentação), testado contra o
// servidor. O cliente HTTP fica em `government-client.ts`, porque a exportação
// CSV/PDF baixa um arquivo (Blob) e não JSON.

import { DEMAND_CATEGORY_LABELS, type DemandCategory, type DemandPriority, type DemandTheme } from "./types.ts";

export const GOVERNMENT_AREA_PATH = "/governo";
export const GOVERNMENT_INDICATORS_PATH = "/governo/indicadores";
export const GOVERNMENT_ACTIONS_PATH = "/governo/acoes";

// ── Vocabulário ────────────────────────────────────────────

export type IndicatorId =
  | "demandas_recebidas" | "demandas_por_territorio" | "demandas_por_categoria"
  | "demandas_urgentes" | "demandas_encaminhadas" | "demandas_em_execucao"
  | "demandas_concluidas" | "projetos_apoiados" | "beneficiarios_alcancados"
  | "resultados_registrados";

export type IndicatorKind = "contagem" | "distribuicao";

export interface IndicatorDefinition {
  id: IndicatorId;
  label: string;
  kind: IndicatorKind;
}

/** Os 10 indicadores do slide 14, na ordem da fonte. */
export const INDICATORS: IndicatorDefinition[] = [
  { id: "demandas_recebidas", label: "Demandas recebidas", kind: "contagem" },
  { id: "demandas_por_territorio", label: "Demandas por território", kind: "distribuicao" },
  { id: "demandas_por_categoria", label: "Demandas por categoria", kind: "distribuicao" },
  { id: "demandas_urgentes", label: "Demandas urgentes", kind: "contagem" },
  { id: "demandas_encaminhadas", label: "Demandas encaminhadas", kind: "contagem" },
  { id: "demandas_em_execucao", label: "Demandas em execução", kind: "contagem" },
  { id: "demandas_concluidas", label: "Demandas concluídas", kind: "contagem" },
  { id: "projetos_apoiados", label: "Projetos apoiados", kind: "contagem" },
  { id: "beneficiarios_alcancados", label: "Beneficiários alcançados", kind: "contagem" },
  { id: "resultados_registrados", label: "Resultados registrados", kind: "contagem" },
];

export const COUNT_INDICATORS = INDICATORS.filter((i) => i.kind === "contagem");

export type GovernmentScope = "competencia" | "jurisdicao" | "todas";

export const GOVERNMENT_SCOPES: GovernmentScope[] = ["competencia", "jurisdicao", "todas"];

export const GOVERNMENT_SCOPE_LABELS: Record<GovernmentScope, string> = {
  competencia: "Demandas da competência do órgão (com atuação registrada)",
  jurisdicao: "Território de atuação do órgão",
  todas: "Todas as demandas publicadas",
};

export type IndicatorPeriod = "7d" | "30d" | "90d" | "12m" | "tudo";

export const INDICATOR_PERIODS: IndicatorPeriod[] = ["7d", "30d", "90d", "12m", "tudo"];

export const INDICATOR_PERIOD_LABELS: Record<IndicatorPeriod, string> = {
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  "12m": "Últimos 12 meses",
  tudo: "Desde o início",
};

export type GovernmentActionKind = "acao" | "programa" | "servico" | "obra" | "evento_publico" | "edital";

export const GOVERNMENT_ACTION_KINDS: GovernmentActionKind[] = [
  "acao", "programa", "servico", "obra", "evento_publico", "edital",
];

export const GOVERNMENT_ACTION_KIND_LABELS: Record<GovernmentActionKind, string> = {
  acao: "Ação",
  programa: "Programa público",
  servico: "Serviço público",
  obra: "Obra",
  evento_publico: "Evento público",
  edital: "Edital ou chamamento",
};

/** Tipos que o servidor grava como resposta `programa_publico_relacionado` (exige o nome). */
export const ACTION_KINDS_REQUIRING_PROGRAM: GovernmentActionKind[] = ["programa", "servico", "edital"];

export function actionRequiresProgramName(kind: GovernmentActionKind | "", demandId: string | null): boolean {
  return Boolean(demandId) && ACTION_KINDS_REQUIRING_PROGRAM.includes(kind as GovernmentActionKind);
}

// ── Tipos das respostas ────────────────────────────────────

export interface IndicatorPeriodRange {
  key: string;
  from: string | null;
  to: string;
  label: string;
}

export interface GovernmentOrganizationSummary {
  name: string | null;
  department: string | null;
  governmentSphere: string | null;
  municipality: string | null;
  uf: string | null;
  competenceAreas: string[];
}

export interface IndicatorEnvelope {
  organizationId: string;
  organization: GovernmentOrganizationSummary;
  scope: GovernmentScope;
  scopeLabel: string;
  period: IndicatorPeriodRange;
  filters: { category: DemandCategory[] | null; priority: DemandPriority[] | null; territory: string | null };
  sources: Record<IndicatorId, string>;
  generatedAt: string;
  cached: boolean;
}

export interface TerritoryBreakdown {
  label: string;
  uf: string | null;
  total: number;
  urgent: number;
  concluded: number;
}

export interface CategoryBreakdown {
  category: DemandCategory;
  total: number;
  urgent: number;
  concluded: number;
}

export interface IndicatorReport extends IndicatorEnvelope {
  indicators: Record<Exclude<IndicatorId, "demandas_por_territorio" | "demandas_por_categoria">, number>;
  accountabilityReports: number;
  byTerritory: TerritoryBreakdown[];
  byCategory: CategoryBreakdown[];
}

export interface PriorityArea {
  label: string;
  uf: string | null;
  total: number;
  urgent: number;
  withoutResponse: number;
  oldestWaitDays: number;
  averageWaitDays: number;
  score: number;
}

export interface PriorityReport extends IndicatorEnvelope {
  territories: PriorityArea[];
  categories: PriorityArea[];
  /** Priorização por eixo temático (T26, slide 26); `label` é o id do eixo. */
  themes?: PriorityArea[];
}

export interface GovernmentImpact {
  demandsActedOn: number;
  concluded: number;
  accountabilityConcluded: number;
  beneficiariesReached: number;
  executedAmountCents: number;
  resultsRecorded: number;
  goalsAchieved: number;
  supports: number;
  offers: number;
  responses: number;
  forwardings: number;
  actions: number;
}

export interface ImpactReport extends IndicatorEnvelope {
  impact: GovernmentImpact;
}

export interface GovernmentAction {
  id: string;
  organizationName: string;
  department: string | null;
  postId: string;
  demandId: string | null;
  demandTitle: string | null;
  responseId: string | null;
  kind: GovernmentActionKind;
  title: string;
  summary: string;
  programName: string | null;
  programUrl: string | null;
  territory: string | null;
  municipality: string | null;
  uf: string | null;
  startsOn: string | null;
  endsOn: string | null;
  publishedAt: string;
}

export interface GovernmentActionInput {
  kind: GovernmentActionKind;
  title: string;
  summary: string;
  programName?: string | null;
  programUrl?: string | null;
  territory?: string | null;
  municipality?: string | null;
  uf?: string | null;
  demandId?: string | null;
  startsOn?: string | null;
  endsOn?: string | null;
}

export interface IndicatorFilter {
  scope?: GovernmentScope;
  period?: IndicatorPeriod;
  from?: string;
  to?: string;
  category?: DemandCategory[];
  priority?: DemandPriority[];
  /** Eixos temáticos (T26, T-01-04): a demanda entra se tiver algum deles. */
  theme?: DemandTheme[];
  territory?: string;
}

/** Query das rotas do painel (a mesma para indicadores, priorização, impacto e exportação). */
export function buildIndicatorQuery(filter: IndicatorFilter = {}): string {
  const q = new URLSearchParams();
  if (filter.scope) q.set("scope", filter.scope);
  if (filter.from) q.set("from", filter.from);
  if (filter.to) q.set("to", filter.to);
  if (!filter.from && filter.period) q.set("period", filter.period);
  if (filter.category?.length) q.set("category", filter.category.join(","));
  if (filter.priority?.length) q.set("priority", filter.priority.join(","));
  if (filter.theme?.length) q.set("theme", filter.theme.join(","));
  if (filter.territory) q.set("territory", filter.territory);
  return q.toString();
}

/** Rótulo do eixo temático (o servidor devolve o id em `PriorityArea.label`). */
export function themeLabel(theme: string): string {
  return THEME_LABELS[theme as DemandTheme] ?? theme;
}

// Os nove eixos do slide 26 (espelho de THEME_LABELS do post-service;
// `government.test.mjs` compara).
const THEME_LABELS: Record<DemandTheme, string> = {
  iluminacao: "Iluminação",
  seguranca: "Segurança",
  saneamento: "Saneamento",
  limpeza: "Limpeza",
  esporte: "Esporte",
  educacao: "Educação",
  mobilidade: "Mobilidade",
  cultura: "Cultura",
  meio_ambiente: "Meio Ambiente",
};
export const GOVERNMENT_THEMES = Object.keys(THEME_LABELS) as DemandTheme[];

// ── Apresentação ───────────────────────────────────────────

export const formatIndicator = (value: number): string => Number(value ?? 0).toLocaleString("pt-BR");

export function categoryLabel(category: DemandCategory): string {
  return DEMAND_CATEGORY_LABELS[category] ?? category;
}

/** "há 12 dias" / "hoje" para o tempo sem resposta institucional. */
export function waitLabel(days: number): string {
  const rounded = Math.round(Number(days) || 0);
  if (rounded <= 0) return "menos de 1 dia";
  return rounded === 1 ? "1 dia" : `${rounded} dias`;
}

/** Barras acessíveis: proporção de cada valor em relação ao maior da série. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(max) || max <= 0) return 0;
  return Math.max(2, Math.round((Number(value) / max) * 100));
}

/** Momento da leitura, no formato que o painel mostra ("atualizado às 14:32"). */
export function generatedAtLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Mensagem para o representante a partir de um erro do painel. */
export function governmentErrorMessage(err: unknown, fallback = "Não foi possível carregar os indicadores agora."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") {
      return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    }
    if (err.message) return err.message;
  }
  return fallback;
}
