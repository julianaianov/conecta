"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { useRouter } from "next/navigation";
import { MAP_CENTER, MAP_PIN_COLORS, POST_TYPE_LABELS, type Post } from "@/lib/app/types";

function pinIcon(color: string) {
  const html = `
    <svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0Z" fill="${color}"/>
      <circle cx="15" cy="15" r="6" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    html,
    className: "dm-pin",
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -38],
  });
}

export default function MapView({ posts }: { posts: Post[] }) {
  const router = useRouter();
  return (
    <MapContainer center={MAP_CENTER} zoom={14} scrollWheelZoom className="h-full w-full" style={{ borderRadius: "1rem" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {posts.map((p) =>
        p.latitude != null && p.longitude != null ? (
          <Marker key={p.id} position={[p.latitude, p.longitude]} icon={pinIcon(MAP_PIN_COLORS[p.type])}>
            <Popup>
              <div style={{ minWidth: 180 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: MAP_PIN_COLORS[p.type] }}>{POST_TYPE_LABELS[p.type]}</span>
                <p style={{ margin: "2px 0 4px", fontWeight: 700, color: "#1b4f72" }}>{p.title}</p>
                <p style={{ margin: 0, fontSize: 12, color: "#4a6f88" }}>{p.neighborhood}</p>
                <button
                  onClick={() => router.push(`/post/${p.id}`)}
                  style={{ marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 8, border: "none", background: "#f4841a", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                >
                  Ver publicação
                </button>
              </div>
            </Popup>
          </Marker>
        ) : null,
      )}
    </MapContainer>
  );
}
