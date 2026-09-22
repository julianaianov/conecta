"use client";

import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer } from "react-leaflet";

/** Mapa só de leitura com o ponto da demanda. */
export default function DemandMapInner({ latitude, longitude }: { latitude: number; longitude: number }) {
  return (
    <MapContainer center={[latitude, longitude]} zoom={15} scrollWheelZoom={false} className="h-full w-full" attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker center={[latitude, longitude]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillColor: "#f4841a", fillOpacity: 1 }} />
    </MapContainer>
  );
}
