"use client";

import { useEffect, useState } from "react";
import "leaflet/dist/leaflet.css";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { MAP_CENTER } from "@/lib/app/types";
import type { Coordinates } from "@/lib/app/location";
import { Icon } from "./Icon";

type LocationPickerProps = {
  value: Coordinates | null;
  onChange: (coordinates: Coordinates | null) => void;
};

function LocationEvents({ onChange }: { onChange: (coordinates: Coordinates) => void }) {
  useMapEvents({
    click(event) {
      onChange({ latitude: event.latlng.lat, longitude: event.latlng.lng });
    },
  });
  return null;
}

function Recenter({ value }: { value: Coordinates | null }) {
  const map = useMap();

  useEffect(() => {
    if (!value) return;
    map.setView([value.latitude, value.longitude], Math.max(map.getZoom(), 15), { animate: true });
  }, [map, value]);

  return null;
}

export function LocationPicker({ value, onChange }: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const center: [number, number] = value ? [value.latitude, value.longitude] : MAP_CENTER;

  function select(coordinates: Coordinates) {
    setError(null);
    onChange(coordinates);
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setError("Este navegador não informa sua localização. Toque no mapa para escolher o ponto.");
      return;
    }

    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        select({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      },
      () => {
        setLocating(false);
        setError("Não foi possível obter sua localização. Toque no mapa para escolher o ponto.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--th-border)" }}>
      <div className="relative h-56 sm:h-64">
        <MapContainer center={center} zoom={14} scrollWheelZoom className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <LocationEvents onChange={select} />
          <Recenter value={value} />
          {value && <CircleMarker center={[value.latitude, value.longitude]} radius={9} pathOptions={{ color: "#fff", weight: 3, fillColor: "#f4841a", fillOpacity: 1 }} />}
        </MapContainer>
        <span className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow" style={{ background: "var(--th-card)", borderColor: "var(--th-border)", color: "var(--th-text)" }}>
          Toque no mapa para marcar o local
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
        <button type="button" onClick={useCurrentLocation} disabled={locating} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)", background: "var(--th-card)" }}>
          <Icon name="location" size={15} />
          {locating ? "Localizando…" : "Usar minha localização"}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
            <Icon name="close" size={14} /> Remover
          </button>
        )}
        <span className="basis-full text-[11px]" style={{ color: error ? "#e53935" : "var(--th-muted)" }}>
          {error ?? (value ? `${value.latitude.toFixed(5)}, ${value.longitude.toFixed(5)}` : "A localização é aproximada e aparece junto da publicação.")}
        </span>
      </div>
    </div>
  );
}
