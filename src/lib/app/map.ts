// Mapa inteligente (T20) — espelho de services/post-service/src/map/constants.js.
//
// Fonte da verdade: Apresentação Institucional, slide 19 (legenda literal do
// mapa e "leitura rápida para governo, empresas, mídia e comunidade") e slide
// 18 (demandas e conteúdos do feed como coisas distintas). As cinco classes da
// legenda são as cinco categorias da demanda. Cores: docs/manual-marca.md.
//
// `src/lib/app/map.test.mjs` compara este arquivo com o do post-service.

import type { DemandCategory, DemandPriority, DemandStatus } from "./types.ts";

export type MapLegendId =
  | "problemas_urgentes"
  | "problemas_urbanos"
  | "projetos_sociais"
  | "acoes_ambientais"
  | "necessidades";

export type MapShape = "triangulo" | "quadrado" | "circulo" | "losango" | "estrela" | "ponto";

export interface MapLegendClass {
  id: MapLegendId;
  label: string;
  category: DemandCategory;
  color: string;
  shape: MapShape;
}

/** Classes da legenda, na ordem do slide 19. */
// TODO(fonte-da-verdade): Modelo de Conexão §03 — legenda de 1 classe por categoria; faltam 7 tipos de demanda (ver TODO em services/post-service/migrations/007-demands.sql).
export const MAP_LEGEND: MapLegendClass[] = [
  { id: "problemas_urgentes", label: "Problemas urgentes", category: "problema_urgente", color: "#E53935", shape: "triangulo" },
  { id: "problemas_urbanos", label: "Problemas urbanos", category: "problema_urbano", color: "#1B4F72", shape: "quadrado" },
  { id: "projetos_sociais", label: "Projetos sociais", category: "projeto_social", color: "#2E9E5B", shape: "circulo" },
  { id: "acoes_ambientais", label: "Ações ambientais", category: "projeto_ambiental", color: "#2E7BA8", shape: "losango" },
  {
    id: "necessidades",
    label: "Necessidades (Oportunidades de patrocínio)",
    category: "necessidade_de_patrocinio",
    color: "#F4841A",
    shape: "estrela",
  },
];

/** Camada de conteúdos do feed (slide 18): publicações comuns, sem demanda. */
export const MAP_FEED_LAYER = { id: "feed", label: "Conteúdos do feed", color: "#5A9BC4", shape: "ponto" as MapShape };

export const MAP_LEGEND_BY_CATEGORY: Record<DemandCategory, MapLegendClass> = Object.fromEntries(
  MAP_LEGEND.map((item) => [item.category, item]),
) as Record<DemandCategory, MapLegendClass>;

export function mapLegendFor(category: DemandCategory): MapLegendClass {
  return MAP_LEGEND_BY_CATEGORY[category] ?? MAP_LEGEND[0];
}

/** Descrição curta da forma, para quem lê a legenda sem enxergar a cor. */
export const MAP_SHAPE_LABELS: Record<MapShape, string> = {
  triangulo: "triângulo",
  quadrado: "quadrado",
  circulo: "círculo",
  losango: "losango",
  estrela: "estrela",
  ponto: "ponto",
};

export type MapAudienceId = "governo" | "empresas" | "imprensa" | "comunidade";

export interface MapAudience {
  id: MapAudienceId;
  label: string;
  description: string;
  filter: { category: DemandCategory[]; priority: DemandPriority[]; status: DemandStatus[] };
  layers: { demands: boolean; feed: boolean };
}

/** Atalhos de leitura rápida por público (slide 19). */
export const MAP_AUDIENCES: MapAudience[] = [
  {
    id: "governo",
    label: "Governo",
    description: "Problemas urgentes e urbanos de maior prioridade, ainda em aberto.",
    filter: {
      category: ["problema_urgente", "problema_urbano"],
      priority: ["alta", "urgente"],
      status: ["publicada", "em_busca_de_parceiro", "conectada", "em_execucao"],
    },
    layers: { demands: true, feed: false },
  },
  {
    id: "empresas",
    label: "Empresas",
    description: "Oportunidades de patrocínio e projetos em busca de parceiro.",
    filter: {
      category: ["necessidade_de_patrocinio", "projeto_social", "projeto_ambiental"],
      priority: [],
      status: ["publicada", "em_busca_de_parceiro"],
    },
    layers: { demands: true, feed: false },
  },
  {
    id: "imprensa",
    label: "Imprensa",
    description: "Demandas publicadas, em execução e com resultados para divulgar.",
    filter: {
      category: [],
      priority: [],
      status: ["publicada", "em_execucao", "concluida", "prestacao_de_contas"],
    },
    layers: { demands: true, feed: true },
  },
  {
    id: "comunidade",
    label: "Comunidade",
    description: "Tudo o que acontece no território, com as publicações do feed.",
    filter: { category: [], priority: [], status: [] },
    layers: { demands: true, feed: true },
  },
];

export const MAP_ZOOM_MIN = 1;
export const MAP_ZOOM_MAX = 18;
export const MAP_CLUSTER_THRESHOLD = 300;
export const MAP_POINTS_MAX = 500;

export function mapCellSizeDegrees(zoom: number): number {
  const z = Math.min(Math.max(Math.trunc(Number(zoom) || MAP_ZOOM_MIN), MAP_ZOOM_MIN), MAP_ZOOM_MAX);
  return 360 / 2 ** z;
}

/** Identificador estável do território numa URL pública (`/mapa/<slug>`). */
export function territorySlug(place: { territory?: string | null; municipality?: string | null; uf?: string | null }): string {
  return [place.territory, place.municipality, place.uf]
    .filter((v): v is string => typeof v === "string" && v.trim() !== "")
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

// ── Estado dos filtros ─────────────────────────────────────

export interface MapFilterState {
  category: DemandCategory[];
  priority: DemandPriority[];
  status: DemandStatus[];
  territory: string;
  municipality: string;
  uf: string;
  from: string;
  to: string;
  layers: { demands: boolean; feed: boolean };
}

export function emptyMapFilter(): MapFilterState {
  return {
    category: [], priority: [], status: [], territory: "", municipality: "", uf: "",
    from: "", to: "", layers: { demands: true, feed: false },
  };
}

export function audienceFilter(audience: MapAudience): MapFilterState {
  return {
    ...emptyMapFilter(),
    category: [...audience.filter.category],
    priority: [...audience.filter.priority],
    status: [...audience.filter.status],
    layers: { ...audience.layers },
  };
}

/** O atalho está ativo quando os filtros são exatamente os dele. */
export function matchesAudience(filter: MapFilterState, audience: MapAudience): boolean {
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
  return same(filter.category, audience.filter.category)
    && same(filter.priority, audience.filter.priority)
    && same(filter.status, audience.filter.status)
    && filter.layers.demands === audience.layers.demands
    && filter.layers.feed === audience.layers.feed
    && !filter.territory && !filter.municipality && !filter.uf && !filter.from && !filter.to;
}

export function toggleValue<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export interface MapQueryOptions {
  bbox?: [number, number, number, number] | null;
  zoom?: number | null;
  limit?: number | null;
}

/** Filtros + recorte → querystring das rotas `/demands/map*`. */
export function buildMapQuery(filter: MapFilterState, options: MapQueryOptions = {}): string {
  const q = new URLSearchParams();
  if (filter.category.length) q.set("category", filter.category.join(","));
  if (filter.priority.length) q.set("priority", filter.priority.join(","));
  if (filter.status.length) q.set("status", filter.status.join(","));
  if (filter.territory.trim()) q.set("territory", filter.territory.trim());
  if (filter.municipality.trim()) q.set("municipality", filter.municipality.trim());
  if (filter.uf.trim()) q.set("uf", filter.uf.trim().toUpperCase());
  if (filter.from) q.set("from", filter.from);
  if (filter.to) q.set("to", filter.to);
  if (options.bbox) q.set("bbox", options.bbox.join(","));
  if (options.zoom) q.set("zoom", String(options.zoom));
  if (options.limit) q.set("limit", String(options.limit));
  return q.toString();
}

/** Raio do círculo do agrupamento, em pixels, pelo número de pontos. */
export function clusterRadius(total: number): number {
  if (total >= 500) return 34;
  if (total >= 100) return 28;
  if (total >= 25) return 23;
  return 19;
}

/** Classe dominante de um agrupamento, para dar cor ao círculo. */
export function clusterLegend(counts: Partial<Record<DemandCategory, number>>): MapLegendClass {
  let best = MAP_LEGEND[0];
  let bestTotal = -1;
  for (const item of MAP_LEGEND) {
    const total = counts[item.category] ?? 0;
    if (total > bestTotal) {
      best = item;
      bestTotal = total;
    }
  }
  return best;
}
