"use client";

import dynamic from "next/dynamic";
import type { MapView } from "@/lib/app/types";

const SmartMapView = dynamic(() => import("@/components/app/map/SmartMapView"), {
  ssr: false,
  loading: () => <div className="landing-map-loading" role="status">Carregando mapa público…</div>,
});

function ignoreViewportChange() {}

export function PublicDemandMapCanvas({
  view,
  publicDemandTotal,
  loading = false,
  filtered = false,
  onClear,
  height = 420,
}: {
  view: MapView | null;
  publicDemandTotal: number | null;
  /** O navegador está relendo o que o SSR não trouxe: mostra "carregando", não "indisponível". */
  loading?: boolean;
  /** Há filtro aplicado: recorte vazio é "nenhum com esses filtros", não "ainda não há". */
  filtered?: boolean;
  onClear?: () => void;
  height?: number | string;
}) {
  const hasMapData = Boolean(view && (view.points.length || view.clusters.length));
  let emptyMessage: string | null = null;

  if (view === null) {
    emptyMessage = loading ? "Carregando mapa público…" : "O mapa público não está disponível agora.";
  } else if (view.counts.total === 0 && filtered) {
    emptyMessage = "Nenhum projeto com esses filtros.";
  } else if (view.counts.total === 0) {
    emptyMessage = publicDemandTotal === 0
      ? "Ainda não há demandas públicas cadastradas. As demandas aprovadas aparecerão aqui quando forem publicadas."
      : "Ainda não há demandas públicas com localização e fotografia para exibir no mapa.";
  } else if (!hasMapData) {
    emptyMessage = "Os registros do mapa público não puderam ser carregados.";
  }

  return (
    <div className="landing-map-canvas" style={{ height }}>
      {emptyMessage ? (
        <div className="landing-map-empty" role="status">
          <span className="landing-map-empty-icon" aria-hidden="true">
            <svg className="ico"><use href="#i-map" /></svg>
          </span>
          <p>{emptyMessage}</p>
          {filtered && onClear && view?.counts.total === 0 ? (
            <button type="button" className="mf-clear" onClick={onClear}>Limpar filtros</button>
          ) : null}
        </div>
      ) : view ? (
        <SmartMapView
          points={view.points}
          clusters={view.clusters}
          posts={[]}
          fitKey={`landing-${view.mode}-${view.points.map((point) => point.id).join("-")}`}
          onViewport={ignoreViewportChange}
        />
      ) : null}
    </div>
  );
}
