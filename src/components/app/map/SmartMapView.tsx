"use client";

// Mapa inteligente (T20): camada Leaflet. Carregado só no navegador
// (`dynamic(..., { ssr: false })` em SmartMapClient); a leitura acessível do
// mesmo conteúdo fica na legenda e na lista, renderizadas no SSR.

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import Link from "next/link";
import { clusterLegend, clusterRadius, mapLegendFor, MAP_FEED_LAYER } from "@/lib/app/map";
import {
  DEMAND_CATEGORY_LABELS, DEMAND_PRIORITY_LABELS, DEMAND_STATUS_LABELS,
  MAP_CENTER, POST_TYPE_LABELS,
  type MapCluster, type MapPoint, type Post,
} from "@/lib/app/types";
import { pinSvg } from "./pins";

export interface Viewport {
  bbox: [number, number, number, number];
  zoom: number;
}

function pinIcon(color: string, shape: Parameters<typeof pinSvg>[1]) {
  return L.divIcon({
    html: pinSvg(color, shape),
    className: "dm-pin",
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -38],
  });
}

function clusterIcon(cluster: MapCluster) {
  const legend = clusterLegend(cluster.category);
  const size = clusterRadius(cluster.total) * 2;
  const html = `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${legend.color};color:#fff;font-weight:700;font-size:${size > 50 ? 15 : 13}px;border:2px solid #fff;box-shadow:0 1px 4px rgba(13,45,66,.35)">${cluster.total}</span>`;
  return L.divIcon({ html, className: "dm-cluster", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function ViewportWatcher({ onViewport }: { onViewport: (viewport: Viewport) => void }) {
  const emit = (map: L.Map) => {
    const bounds = map.getBounds();
    onViewport({
      bbox: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
      zoom: map.getZoom(),
    });
  };
  const map = useMapEvents({
    moveend: () => emit(map),
    zoomend: () => emit(map),
  });
  return null;
}

/** Enquadra os pontos quando o recorte muda (troca de território ou de filtro). */
function FitBounds({ points, fitKey }: { points: MapPoint[]; fitKey: string }) {
  const map = useMap();
  const applied = useRef<string | null>(null);
  useEffect(() => {
    if (applied.current === fitKey) return;
    const valid = points.filter((p) => p.latitude != null && p.longitude != null);
    if (!valid.length) return;
    applied.current = fitKey;
    if (valid.length === 1) {
      map.setView([valid[0].latitude!, valid[0].longitude!], 15, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds(valid.map((p) => [p.latitude!, p.longitude!])), { padding: [40, 40], maxZoom: 15 });
  }, [map, points, fitKey]);
  return null;
}

export interface SmartMapViewProps {
  points: MapPoint[];
  clusters: MapCluster[];
  posts: Post[];
  fitKey: string;
  onViewport: (viewport: Viewport) => void;
}

export default function SmartMapView({ points, clusters, posts, fitKey, onViewport }: SmartMapViewProps) {
  return (
    <MapContainer center={MAP_CENTER} zoom={12} scrollWheelZoom className="h-full w-full" style={{ borderRadius: "1rem" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ViewportWatcher onViewport={onViewport} />
      <FitBounds points={points} fitKey={fitKey} />

      {clusters.map((cluster) => (
        <Marker
          key={`c-${cluster.id}`}
          position={[cluster.latitude, cluster.longitude]}
          icon={clusterIcon(cluster)}
          title={`${cluster.total} demandas nesta área`}
        >
          <Popup>
            <strong style={{ color: "#1b4f72" }}>{cluster.total} demandas nesta área</strong>
            <ul style={{ margin: "6px 0 0", padding: 0, listStyle: "none", fontSize: 12 }}>
              {Object.entries(cluster.category)
                .filter(([, total]) => total > 0)
                .map(([category, total]) => (
                  <li key={category}>
                    {DEMAND_CATEGORY_LABELS[category as MapPoint["category"]]}: {total}
                  </li>
                ))}
            </ul>
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#4a6f88" }}>Aproxime o mapa para ver cada demanda.</p>
          </Popup>
        </Marker>
      ))}

      {points.map((point) => {
        if (point.latitude == null || point.longitude == null) return null;
        const legend = mapLegendFor(point.category);
        return (
          <Marker
            key={point.id}
            position={[point.latitude, point.longitude]}
            icon={pinIcon(legend.color, legend.shape)}
            title={`${legend.label}: ${point.title}`}
            alt={`${legend.label}: ${point.title}`}
            keyboard
          >
            <Popup>
              <div style={{ minWidth: 190 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: legend.color }}>{legend.label}</span>
                <p style={{ margin: "2px 0 4px", fontWeight: 700, color: "#1b4f72" }}>{point.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#4a6f88" }}>
                  {[point.territory, point.district, point.municipality, point.uf].filter(Boolean).join(" · ")}
                </p>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#4a6f88" }}>
                  {DEMAND_STATUS_LABELS[point.status]} · prioridade {DEMAND_PRIORITY_LABELS[point.priority].toLowerCase()}
                </p>
                <Link
                  href={`/demandas/${encodeURIComponent(point.id)}`}
                  style={{ display: "block", marginTop: 8, padding: "6px 0", borderRadius: 8, background: "#f4841a", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 13 }}
                >
                  Ver demanda
                </Link>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {posts.map((post) => (
        post.latitude != null && post.longitude != null ? (
          <Marker
            key={`p-${post.id}`}
            position={[post.latitude, post.longitude]}
            icon={pinIcon(MAP_FEED_LAYER.color, MAP_FEED_LAYER.shape)}
            title={`${MAP_FEED_LAYER.label}: ${post.title}`}
            alt={`${MAP_FEED_LAYER.label}: ${post.title}`}
            keyboard
          >
            <Popup>
              <div style={{ minWidth: 180 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: MAP_FEED_LAYER.color }}>
                  {MAP_FEED_LAYER.label} · {POST_TYPE_LABELS[post.type]}
                </span>
                <p style={{ margin: "2px 0 4px", fontWeight: 700, color: "#1b4f72" }}>{post.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#4a6f88" }}>{post.neighborhood}</p>
                <Link
                  href={post.demandId ? `/demandas/${encodeURIComponent(post.demandId)}` : `/post/${encodeURIComponent(post.id)}`}
                  style={{ display: "block", marginTop: 8, padding: "6px 0", borderRadius: 8, background: "#1b4f72", color: "#fff", fontWeight: 700, textAlign: "center", fontSize: 13 }}
                >
                  {post.demandId ? "Ver demanda" : "Ver publicação"}
                </Link>
              </div>
            </Popup>
          </Marker>
        ) : null
      ))}
    </MapContainer>
  );
}
