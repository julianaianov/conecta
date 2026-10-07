// Landing pública: transforma a leitura pública do banco (`MapView` e
// `ThemeIntelligence`, vindas do post-service) nos números dos gráficos, da
// tabela do painel e dos indicadores. Funções puras, sem valor embutido: sem
// dado (`null`) ou sem registro, o resultado é vazio e a interface mostra o
// estado vazio honesto. Nenhuma amostra, fixture ou fallback sintético mora
// aqui (AGENTS.md: dados sintéticos proibidos fora dos testes).

import { GOVERNMENT_ACTION_KIND_LABELS, type GovernmentActionKind } from "./government.ts";
import { emptyMapFilter, type MapFilterState } from "./map.ts";
import type { DemandStatus, DemandTheme, MapTerritory, MapView, ThemeIntelligence } from "./types.ts";

const MONTH_ABBREVIATIONS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Estágios públicos da demanda, na ordem do painel (T26/T22). */
export const LANDING_PUBLIC_STAGES: { id: DemandStatus; label: string }[] = [
  { id: "publicada", label: "Publicadas" },
  { id: "em_busca_de_parceiro", label: "Buscando apoio" },
  { id: "conectada", label: "Conectadas" },
  { id: "em_execucao", label: "Em execução" },
  { id: "concluida", label: "Concluídas" },
  { id: "prestacao_de_contas", label: "Prestação de contas" },
  { id: "encerrada", label: "Encerradas" },
];

/** Quantas linhas os gráficos por território mostram. */
export const LANDING_TERRITORY_ROWS = 7;

const EM_DASH = "—";

const list = <T>(value: T[] | undefined): T[] => (Array.isArray(value) ? value : []);

/** "4 de out. de 2026"; vazio quando a data falta ou é inválida. */
export function publishedDateLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

/** Resposta de `GET /demands/map` pronta para a landing; `null` quando não tem a forma esperada. */
export function normalizeMapView(data: MapView | null | undefined): MapView | null {
  if (!data || !Array.isArray(data.points) || !data.counts) return null;
  return { ...data, clusters: list(data.clusters) };
}

/** Resposta de `GET /demands/themes/intelligence` com todas as listas presentes; `null` sem eixos. */
export function normalizeThemeIntelligence(data: ThemeIntelligence | null | undefined): ThemeIntelligence | null {
  if (!data || !Array.isArray(data.themes)) return null;
  return {
    ...data,
    themes: data.themes.map((theme) => ({
      ...theme,
      budgetCents: Number(theme.budgetCents) || 0,
      mobilizedCents: Number(theme.mobilizedCents) || 0,
    })),
    totals: {
      budgetCents: Number(data.totals?.budgetCents) || 0,
      mobilizedCents: Number(data.totals?.mobilizedCents) || 0,
      beneficiariesReached: Number(data.totals?.beneficiariesReached) || 0,
    },
    byStatus: list(data.byStatus),
    byMonth: list(data.byMonth),
    territories: list(data.territories),
    recentGovernmentActions: list(data.recentGovernmentActions),
    byTerritory: list(data.byTerritory),
  };
}

export function countLabel(value: number): string {
  return value.toLocaleString("pt-BR");
}

/** "2026-10" → "Out"; formato inesperado volta como veio. */
export function monthAbbreviation(yearMonth: string): string {
  const match = /^\d{4}-(\d{2})$/.exec(yearMonth);
  return (match ? MONTH_ABBREVIATIONS[Number(match[1]) - 1] : undefined) ?? yearMonth;
}

export interface MonthBar {
  month: string;
  label: string;
  total: number;
}

/** Publicações por mês (últimos 12 meses), exatamente como o servidor devolve. */
export function monthBars(intelligence: ThemeIntelligence | null): MonthBar[] {
  return (intelligence?.byMonth ?? []).map((item) => ({
    month: item.month,
    label: monthAbbreviation(item.month),
    total: item.total,
  }));
}

/** Teto "redondo" do eixo do gráfico: 2, 4, 10, 20, 50, 100, 200… (sempre par, para a marca do meio). */
export function niceMax(max: number): number {
  const value = Number.isFinite(max) && max > 0 ? max : 0;
  for (const step of [2, 4, 10]) if (value <= step) return step;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const factor of [1, 2, 5, 10]) if (factor * magnitude >= value) return factor * magnitude;
  return 10 * magnitude;
}

export interface ThemeRow {
  theme: string;
  label: string;
  total: number;
}

/** Os nove eixos por número de demandas (maior primeiro, empate pelo nome). */
export function themeRows(intelligence: ThemeIntelligence | null): ThemeRow[] {
  return (intelligence?.themes ?? [])
    .map((item) => ({ theme: item.theme, label: item.label, total: item.total }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "pt-BR"));
}

export interface TerritoryRow {
  key: string;
  name: string;
  place: string;
  total: number;
  /** Publicadas, buscando apoio e conectadas: ainda não começaram a execução. */
  open: number;
  inExecution: number;
  concluded: number;
  /** Eixo com mais demandas no território (`null` quando nenhuma tem eixo). */
  mainTheme: string | null;
}

function territoryKey(territory: string | null, municipality: string | null, uf: string | null): string {
  return [territory, municipality, uf].map((part) => (part ?? "").trim().toLowerCase()).join("|");
}

/** Eixo dominante por território, a partir do cruzamento eixo × território do servidor. */
function mainThemeByTerritory(intelligence: ThemeIntelligence): Map<string, string> {
  const best = new Map<string, { label: string; total: number }>();
  for (const row of intelligence.byTerritory) {
    const key = territoryKey(row.territory, row.municipality, row.uf);
    const current = best.get(key);
    if (!current || row.total > current.total) best.set(key, { label: row.label, total: row.total });
  }
  return new Map([...best].map(([key, value]) => [key, value.label]));
}

/** Territórios com mais demandas, já divididos por estágio. A ordem é a do servidor. */
export function territoryRows(
  intelligence: ThemeIntelligence | null,
  limit: number = LANDING_TERRITORY_ROWS,
): TerritoryRow[] {
  if (!intelligence) return [];
  const mainThemes = mainThemeByTerritory(intelligence);
  return intelligence.territories.slice(0, limit).map((item) => {
    const key = territoryKey(item.territory, item.municipality, item.uf);
    return {
      key,
      name: item.territory,
      place: [item.municipality, item.uf].filter(Boolean).join("/"),
      total: item.total,
      open: Math.max(0, item.total - item.inExecution - item.concluded),
      inExecution: item.inExecution,
      concluded: item.concluded,
      mainTheme: mainThemes.get(key) ?? null,
    };
  });
}

export interface ResourceRow {
  theme: string;
  label: string;
  budgetCents: number;
  mobilizedCents: number;
  /** Mobilizado ÷ orçamento, em %, inteiro. Pode passar de 100. */
  percent: number;
}

/** Orçamento × apoio confirmado por eixo; só entram eixos com orçamento. */
export function resourceRows(intelligence: ThemeIntelligence | null): ResourceRow[] {
  return (intelligence?.themes ?? [])
    .filter((item) => item.budgetCents > 0)
    .map((item) => ({
      theme: item.theme,
      label: item.label,
      budgetCents: item.budgetCents,
      mobilizedCents: item.mobilizedCents,
      percent: Math.round((item.mobilizedCents / item.budgetCents) * 100),
    }))
    .sort((a, b) => b.budgetCents - a.budgetCents || a.label.localeCompare(b.label, "pt-BR"));
}

/** "R$ 900", "R$ 45 mil", "R$ 1,2 mi": valor compacto para rótulos de gráfico. */
export function formatCompactBRL(cents: number): string {
  const reais = Math.max(0, cents) / 100;
  const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  if (reais >= 1_000_000) return `R$ ${number(reais / 1_000_000)} mi`;
  if (reais >= 1_000) return `R$ ${number(reais / 1_000)} mil`;
  return `R$ ${number(reais)}`;
}

export interface StageTotal {
  id: DemandStatus;
  label: string;
  total: number;
}

/** Demandas por estágio público, sem valor de reserva: ausente no servidor é zero. */
export function stageTotals(intelligence: ThemeIntelligence | null): StageTotal[] {
  const totals = new Map((intelligence?.byStatus ?? []).map((item) => [item.status, item.total]));
  return LANDING_PUBLIC_STAGES.map((stage) => ({ ...stage, total: totals.get(stage.id) ?? 0 }));
}

export interface GovernmentActionRow {
  id: string;
  kindLabel: string;
  title: string;
  organizationName: string;
  place: string;
  publishedAt: string | null;
}

/** Ações divulgadas por órgãos públicos (T22), as mais recentes primeiro (ordem do servidor). */
export function governmentActionRows(intelligence: ThemeIntelligence | null): GovernmentActionRow[] {
  return (intelligence?.recentGovernmentActions ?? []).map((action) => ({
    id: action.id,
    kindLabel: GOVERNMENT_ACTION_KIND_LABELS[action.kind as GovernmentActionKind] ?? action.kind,
    title: action.title,
    organizationName: action.organizationName,
    place: [action.territory, [action.municipality, action.uf].filter(Boolean).join("/")]
      .filter(Boolean)
      .join(" · "),
    publishedAt: action.publishedAt,
  }));
}

/** Estágios que contam como "com resultados" na faixa do mapa e no filtro. */
export const LANDING_RESULT_STATUSES: DemandStatus[] = ["concluida", "prestacao_de_contas", "encerrada"];

export interface MapFlowItem {
  key: "projetos" | "recursos" | "execucao" | "resultados" | "impacto";
  label: string;
  value: string;
  hint: string;
}

/**
 * Faixa de indicadores do mapa (projetos → recursos → execução → resultados →
 * impacto) para o recorte lido; sem leitura, "—" (nunca um número inventado).
 */
export function mapFlow(intelligence: ThemeIntelligence | null): MapFlowItem[] {
  const status = new Map((intelligence?.byStatus ?? []).map((item) => [item.status, item.total]));
  const results = LANDING_RESULT_STATUSES.reduce((sum, id) => sum + (status.get(id) ?? 0), 0);
  const value = (read: (data: ThemeIntelligence) => string) => (intelligence ? read(intelligence) : EM_DASH);
  return [
    { key: "projetos", label: "Projetos", value: value((d) => countLabel(d.demandsTotal)), hint: "no recorte selecionado" },
    { key: "recursos", label: "Recursos", value: value((d) => formatCompactBRL(d.totals.mobilizedCents)), hint: "em apoio confirmado" },
    { key: "execucao", label: "Execução", value: value(() => countLabel(status.get("em_execucao") ?? 0)), hint: "em execução" },
    { key: "resultados", label: "Resultados", value: value(() => countLabel(results)), hint: "concluídos com resultados" },
    { key: "impacto", label: "Impacto", value: value((d) => countLabel(d.totals.beneficiariesReached)), hint: "pessoas beneficiadas" },
  ];
}

/** Filtros do mapa da landing: um valor por campo, "" = sem filtro. */
export interface LandingMapFilter {
  /** `slug` do território (lista de `GET /demands/map/territories`). */
  territory: string;
  theme: DemandTheme | "";
  status: DemandStatus | "";
  period: LandingPeriodId | "";
  /** Somente demandas concluídas, em prestação de contas ou encerradas. */
  withResults: boolean;
}

export type LandingPeriodId = "30d" | "90d" | "12m";

export const LANDING_PERIODS: { id: LandingPeriodId; label: string; days: number }[] = [
  { id: "30d", label: "Últimos 30 dias", days: 30 },
  { id: "90d", label: "Últimos 90 dias", days: 90 },
  { id: "12m", label: "Últimos 12 meses", days: 365 },
];

export function emptyLandingMapFilter(): LandingMapFilter {
  return { territory: "", theme: "", status: "", period: "", withResults: false };
}

/** Quantos filtros estão aplicados e quantos deles ficam em "Mais filtros". */
export function landingMapFilterCount(filter: LandingMapFilter): { total: number; advanced: number } {
  const advanced = (filter.period ? 1 : 0) + (filter.withResults ? 1 : 0);
  return { total: advanced + (filter.territory ? 1 : 0) + (filter.theme ? 1 : 0) + (filter.status ? 1 : 0), advanced };
}

/**
 * Filtros da landing → filtro das rotas públicas `/demands/map` e
 * `/demands/themes/intelligence`. "Com resultados" restringe aos estágios de
 * resultado; um estágio escolhido que não seja de resultado deixa de valer.
 */
export function landingMapQueryFilter(
  filter: LandingMapFilter,
  territories: MapTerritory[],
  now: Date = new Date(),
): MapFilterState {
  const query = emptyMapFilter();
  const place = filter.territory ? territories.find((item) => item.slug === filter.territory) : undefined;
  if (place) {
    query.territory = place.territory;
    query.municipality = place.municipality ?? "";
    query.uf = place.uf ?? "";
  }
  if (filter.theme) query.theme = [filter.theme];
  if (filter.withResults) {
    query.status = filter.status && LANDING_RESULT_STATUSES.includes(filter.status) ? [filter.status] : [...LANDING_RESULT_STATUSES];
  } else if (filter.status) {
    query.status = [filter.status];
  }
  const period = LANDING_PERIODS.find((item) => item.id === filter.period);
  if (period) {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - period.days));
    query.from = from.toISOString().slice(0, 10);
  }
  return query;
}
