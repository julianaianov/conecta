"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import Link from "next/link";
import { MAP_CENTER, type InstitutionalDemandSummary } from "@/lib/app/types";
import { INSTITUTIONAL_STATUS_COLORS, INSTITUTIONAL_STATUS_LABELS, institutionalDemandPath } from "@/lib/app/institutional";

const UNTRACKED = "#f4841a";

function FitBounds({ demands }: { demands: InstitutionalDemandSummary[] }) {
  const map = useMap();
  useEffect(() => {
    const points = demands.filter((d) => d.latitude != null && d.longitude != null);
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude!, points[0].longitude!], 14, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(points.map((d) => [d.latitude!, d.longitude!])), { padding: [32, 32], maxZoom: 15 });
  }, [map, demands]);
  return null;
}

/** Mapa das demandas do território: cor pelo status do acompanhamento do órgão. */
export default function InstitutionalMapInner({ demands }: { demands: InstitutionalDemandSummary[] }) {
  return (
    <MapContainer center={MAP_CENTER} zoom={12} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds demands={demands} />
      {demands.map((d) => (d.latitude != null && d.longitude != null ? (
        <CircleMarker
          key={d.id}
          center={[d.latitude, d.longitude]}
          radius={9}
          pathOptions={{
            color: "#fff", weight: 2, fillOpacity: 1,
            fillColor: d.institutional ? INSTITUTIONAL_STATUS_COLORS[d.institutional.status] : UNTRACKED,
          }}
        >
          <Popup>
            <div style={{ minWidth: 180 }}>
              <p style={{ margin: "0 0 4px", fontWeight: 700, color: "#1b4f72" }}>{d.title}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#4a6f88" }}>
                {d.institutional ? INSTITUTIONAL_STATUS_LABELS[d.institutional.status] : "Sem acompanhamento do órgão"}
              </p>
              <Link href={institutionalDemandPath(d.id)} style={{ fontSize: 12, fontWeight: 700, color: "#f4841a" }}>Analisar →</Link>
            </div>
          </Popup>
        </CircleMarker>
      ) : null))}
    </MapContainer>
  );
}
