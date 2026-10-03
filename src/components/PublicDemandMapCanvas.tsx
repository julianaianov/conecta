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
  height = 420,
}: {
  view: MapView | null;
  publicDemandTotal: number | null;
  height?: number | string;
}) {
  const hasMapData = Boolean(view && (view.points.length || view.clusters.length));
  let emptyMessage: string | null = null;

  if (view === null) {
    emptyMessage = "O mapa público não está disponível agora.";
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
