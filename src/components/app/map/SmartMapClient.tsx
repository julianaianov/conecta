"use client";

// Mapa inteligente (T20). Fonte: Apresentação Institucional, slide 19.
//
// A página é útil sem JavaScript e sem mouse: o SSR já traz a legenda com as
// contagens, os atalhos de leitura rápida e a lista das demandas do recorte,
// cada uma com link para a página pública. O mapa Leaflet é um reforço visual
// carregado depois (`ssr: false`).
//
// Nenhuma consulta pesada: o servidor devolve contagens agregadas, no máximo
// 500 pontos e, acima do limiar, agrupamento por célula. Mexer no mapa manda
// só o bbox e o zoom, com espera curta para não disparar a cada quadro.

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/app/api";
import {
  audienceFilter, buildMapQuery, emptyMapFilter, mapLegendFor, matchesAudience,
  MAP_AUDIENCES, MAP_FEED_LAYER, MAP_LEGEND, MAP_POINTS_MAX, MAP_THEME_FILTERS, toggleValue,
  countsByLegend, isLegendSelected, toggleLegendClass,
  type MapFilterState,
} from "@/lib/app/map";
import {
  DEMAND_CATEGORY_LABELS, DEMAND_PRIORITY_LABELS, DEMAND_STATUS_LABELS,
  type DemandPriority, type DemandStatus,
  type MapTerritory, type MapView, type Post, type ThemeIntelligence as ThemeIntelligenceData,
} from "@/lib/app/types";
import { MapLegend } from "./MapLegend";
import { ThemeIntelligence } from "./ThemeIntelligence";
import { swatchSvg } from "./pins";
import type { Viewport } from "./SmartMapView";

const SmartMapView = dynamic(() => import("./SmartMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <span className="app-spinner" style={{ width: 30, height: 30 }} />
      <span className="sr-only">Carregando o mapa</span>
    </div>
  ),
});

/** Status públicos da demanda, na ordem do fluxo (decisão 4). */
const PUBLIC_STATUSES: DemandStatus[] = [
  "publicada", "em_busca_de_parceiro", "conectada", "em_execucao", "concluida", "prestacao_de_contas",
  "encerrada",
];
const PRIORITIES: DemandPriority[] = ["urgente", "alta", "media", "baixa"];

export interface SmartMapClientProps {
  initialView: MapView;
  initialPosts: Post[];
  territories: MapTerritory[];
  /** Filtro de partida (a página por território trava o recorte). */
  initialFilter?: MapFilterState;
  /** Território fixo: some dos campos editáveis e vira contexto da página. */
  lockedTerritory?: MapTerritory | null;
  /** Leitura por eixo temático do recorte inicial (T26, slide 26), do SSR. */
  initialIntelligence?: ThemeIntelligenceData | null;
  title: string;
  intro: string;
}

export function SmartMapClient({
  initialView, initialPosts, territories, initialFilter, lockedTerritory = null, initialIntelligence = null, title, intro,
}: SmartMapClientProps) {
  const base = useMemo(() => initialFilter ?? emptyMapFilter(), [initialFilter]);
  const [filter, setFilter] = useState<MapFilterState>(base);
  const [view, setView] = useState<MapView>(initialView);
  const legendCounts = countsByLegend(view.counts.category);
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [viewport, setViewport] = useState<Viewport | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const initial = useRef(true);

  const filterKey = buildMapQuery(filter);
  const bboxKey = viewport ? viewport.bbox.map((v) => v.toFixed(3)).join(",") : "";

  useEffect(() => {
    // O primeiro desenho usa o que veio do SSR; daí em diante, busca.
    if (initial.current) {
      initial.current = false;
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(() => {
      const options = viewport ? { bbox: viewport.bbox, zoom: viewport.zoom } : {};
      const demands = filter.layers.demands
        ? api.demandMap(filter, options)
        : Promise.resolve({ ...initialView, counts: { ...initialView.counts, total: 0 }, points: [], clusters: [] });
      const feed = filter.layers.feed
        ? api.mapPosts(undefined, { bbox: viewport?.bbox ?? null, limit: MAP_POINTS_MAX })
        : Promise.resolve<Post[]>([]);
      Promise.all([demands, feed])
        .then(([nextView, nextPosts]) => {
          if (!alive) return;
          setView(nextView);
          setPosts(nextPosts);
          setFailed(false);
        })
        .catch(() => { if (alive) setFailed(true); })
        .finally(() => { if (alive) setLoading(false); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
    // `initialView` só serve de molde para a camada desligada.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, bboxKey, filter.layers.demands, filter.layers.feed]);

  // Inteligência por eixo (T26): acompanha os filtros, não o enquadramento do mapa.
  const [intelligence, setIntelligence] = useState<ThemeIntelligenceData | null>(initialIntelligence);
  const initialIntelligenceKey = useRef(filterKey);
  useEffect(() => {
    if (filterKey === initialIntelligenceKey.current) return;
    initialIntelligenceKey.current = "";
    let alive = true;
    const timer = setTimeout(() => {
      api.themeIntelligence(filter).then((next) => { if (alive && next) setIntelligence(next); }).catch(() => {});
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
    // `filter` muda junto com `filterKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const onViewport = useCallback((next: Viewport) => setViewport(next), []);
  const update = (patch: Partial<MapFilterState>) => setFilter((current) => ({ ...current, ...patch }));

  const feedCount = filter.layers.feed ? posts.length : null;
  const points = filter.layers.demands ? view.points : [];
  const clusters = filter.layers.demands ? view.clusters : [];
  const total = filter.layers.demands ? view.counts.total : 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>{title}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>{intro}</p>
      </header>

      {/* Leitura rápida por público (slide 19). */}
      <nav aria-label="Leitura rápida por público">
        <ul className="flex flex-wrap gap-2">
          {MAP_AUDIENCES.map((audience) => {
            const active = matchesAudience(filter, audience);
            return (
              <li key={audience.id}>
                <button
                  type="button"
                  className="app-chip"
                  data-active={active}
                  aria-pressed={active}
                  title={audience.description}
                  onClick={() => setFilter(active
                    ? { ...base }
                    : { ...audienceFilter(audience), territory: base.territory, municipality: base.municipality, uf: base.uf })}
                >
                  {audience.label}
                </button>
              </li>
            );
          })}
          <li>
            <button type="button" className="app-chip" onClick={() => setFilter({ ...base })}>
              Limpar filtros
            </button>
          </li>
        </ul>
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
          {MAP_AUDIENCES.map((a) => `${a.label}: ${a.description}`).join(" ")}
        </p>
      </nav>

      <form
        className="app-card space-y-3 rounded-2xl p-4"
        aria-label="Filtros do mapa"
        onSubmit={(event) => event.preventDefault()}
      >
        <fieldset>
          <legend className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>Categoria</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {MAP_LEGEND.map((legend) => {
              const active = isLegendSelected(filter.category, legend);
              return (
                <li key={legend.id}>
                  <button
                    type="button"
                    className="app-chip inline-flex items-center gap-1.5"
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => update({ category: toggleLegendClass(filter.category, legend) })}
                    title={legend.categories.map((c) => DEMAND_CATEGORY_LABELS[c]).join(", ")}
                  >
                    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: swatchSvg(legend.color, legend.shape, 14) }} />
                    {legend.label}
                    <span className="font-numeric">({(legendCounts[legend.id] ?? 0).toLocaleString("pt-BR")})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        {/* Eixos temáticos (T26, slide 26): recorte que se cruza com a legenda. */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>Eixo temático</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {MAP_THEME_FILTERS.map((theme) => {
              const active = filter.theme.includes(theme.id);
              return (
                <li key={theme.id}>
                  <button
                    type="button"
                    className="app-chip"
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => update({ theme: MAP_THEME_FILTERS.map((t) => t.id).filter((id) => id === theme.id ? !active : filter.theme.includes(id)) })}
                  >
                    {theme.label}
                    <span className="font-numeric"> ({(view.counts.theme?.[theme.id] ?? 0).toLocaleString("pt-BR")})</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {view.counts.themed !== undefined && (
            <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
              {view.counts.themed.toLocaleString("pt-BR")} de {view.counts.total.toLocaleString("pt-BR")} demandas do recorte têm eixo marcado.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>Prioridade</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {PRIORITIES.map((priority) => {
              const active = filter.priority.includes(priority);
              return (
                <li key={priority}>
                  <button
                    type="button"
                    className="app-chip"
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => update({ priority: toggleValue(filter.priority, priority) })}
                  >
                    {DEMAND_PRIORITY_LABELS[priority]}
                    <span className="font-numeric"> ({(view.counts.priority[priority] ?? 0).toLocaleString("pt-BR")})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>Status</legend>
          <ul className="mt-2 flex flex-wrap gap-2">
            {PUBLIC_STATUSES.map((status) => {
              const active = filter.status.includes(status);
              return (
                <li key={status}>
                  <button
                    type="button"
                    className="app-chip"
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => update({ status: toggleValue(filter.status, status) })}
                  >
                    {DEMAND_STATUS_LABELS[status]}
                    <span className="font-numeric"> ({(view.counts.status[status] ?? 0).toLocaleString("pt-BR")})</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {lockedTerritory ? null : (
            <label className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>
              Território
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={filter.territory}
                placeholder="Bairro, comunidade ou região"
                onChange={(event) => update({ territory: event.target.value })}
              />
            </label>
          )}
          {lockedTerritory ? null : (
            <label className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>
              Município
              <input
                type="text"
                className="app-input mt-1 w-full"
                value={filter.municipality}
                onChange={(event) => update({ municipality: event.target.value })}
              />
            </label>
          )}
          {lockedTerritory ? null : (
            <label className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>
              UF
              <input
                type="text"
                maxLength={2}
                className="app-input mt-1 w-full uppercase"
                value={filter.uf}
                onChange={(event) => update({ uf: event.target.value.toUpperCase().slice(0, 2) })}
              />
            </label>
          )}
          <label className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>
            Publicadas de
            <input
              type="date"
              className="app-input mt-1 w-full"
              value={filter.from}
              onChange={(event) => update({ from: event.target.value })}
            />
          </label>
          <label className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>
            até
            <input
              type="date"
              className="app-input mt-1 w-full"
              value={filter.to}
              onChange={(event) => update({ to: event.target.value })}
            />
          </label>
        </div>

        <fieldset>
          <legend className="text-xs font-semibold uppercase" style={{ color: "var(--th-muted)" }}>Camadas</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm" style={{ color: "var(--th-text)" }}>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.layers.demands}
                onChange={(event) => update({ layers: { ...filter.layers, demands: event.target.checked } })}
              />
              Demandas <span className="font-numeric">({total.toLocaleString("pt-BR")})</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={filter.layers.feed}
                onChange={(event) => update({ layers: { ...filter.layers, feed: event.target.checked } })}
              />
              {MAP_FEED_LAYER.label} <span className="font-numeric">({(feedCount ?? 0).toLocaleString("pt-BR")})</span>
            </label>
          </div>
        </fieldset>
      </form>

      <p aria-live="polite" className="text-sm" style={{ color: "var(--th-muted)" }}>
        {loading ? "Atualizando o recorte…" : null}
        {!loading && failed ? "Não foi possível atualizar o mapa agora. A leitura abaixo é a do último recorte." : null}
        {!loading && !failed ? (
          <>
            {total.toLocaleString("pt-BR")} demanda{total === 1 ? "" : "s"} no recorte
            {feedCount === null ? "" : ` · ${feedCount.toLocaleString("pt-BR")} publicações do pulso`}
            {view.mode === "clusters" ? " · pontos agrupados por área; aproxime o mapa para ver cada demanda" : ""}
            {view.mode === "points" && view.truncated ? ` · mostrando as ${points.length.toLocaleString("pt-BR")} mais recentes` : ""}
          </>
        ) : null}
      </p>

      <div
        className="relative overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--th-border)", height: "min(70vh, 620px)", minHeight: 360 }}
      >
        <SmartMapView points={points} clusters={clusters} posts={posts} fitKey={filterKey} onViewport={onViewport} />
      </div>

      <MapLegend
        counts={view.counts.category}
        feedCount={feedCount}
        active={filter.category}
        onToggle={(legend) => update({ category: toggleLegendClass(filter.category, legend) })}
      />

      <section className="app-card rounded-2xl p-4" aria-labelledby="map-list-title">
        <h2 id="map-list-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
          Demandas do recorte
        </h2>
        {points.length === 0 ? (
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            {view.mode === "clusters"
              ? "Há demandas demais nesta área para listar. Aproxime o mapa ou use os filtros."
              : "Nenhuma demanda publicada com localização neste recorte."}
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {points.map((point) => {
              const legend = mapLegendFor(point.category);
              const place = [point.territory, point.district, point.municipality, point.uf].filter(Boolean).join(" · ");
              return (
                <li key={point.id}>
                  <Link
                    href={`/demandas/${encodeURIComponent(point.id)}`}
                    className="flex items-start gap-2 rounded-lg px-2 py-2 hover:bg-[var(--th-card-alt)]"
                  >
                    <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: swatchSvg(legend.color, legend.shape, 16) }} />
                    <span className="min-w-0">
                      <strong className="block truncate text-sm" style={{ color: "var(--th-text)" }}>{point.title}</strong>
                      <span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>
                        {legend.label} · {DEMAND_STATUS_LABELS[point.status]}{place ? ` · ${place}` : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ThemeIntelligence data={intelligence} />

      {territories.length === 0 ? null : (
        <section className="app-card rounded-2xl p-4" aria-labelledby="map-territories-title">
          <h2 id="map-territories-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
            Mapa por território
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {territories.map((territory) => (
              <li key={territory.slug}>
                <Link
                  href={`/mapa/${territory.slug}`}
                  className="app-chip inline-flex items-center gap-1"
                  data-active={lockedTerritory?.slug === territory.slug}
                >
                  {territory.territory}
                  {territory.uf ? ` (${territory.uf})` : ""}
                  <span className="font-numeric">{territory.total.toLocaleString("pt-BR")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
