"use client";

import { useState } from "react";
import { MAP_ACTIVITIES } from "@/lib/banner-data";
import { ActivityPinIcon, MapPinMarker } from "./MapPinMarker";
import { AppImage } from "./AppImage";
import { Reveal } from "./Reveal";

export function SmartMap() {
  const [activeId, setActiveId] = useState(MAP_ACTIVITIES[0].id);
  const active = MAP_ACTIVITIES.find((a) => a.id === activeId) ?? MAP_ACTIVITIES[0];

  return (
    <section id="mapa" className="relative py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        <Reveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <span className="text-sm font-semibold uppercase tracking-widest text-orange">
              Mapa inteligente
            </span>
            <h2 className="mt-3 text-3xl font-bold sm:text-4xl" style={{ color: "var(--th-text)" }}>
              Veja o que acontece
              <br />
              <span className="gradient-text">no seu bairro</span>
            </h2>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div
            style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
            className="overflow-hidden rounded-3xl border shadow-xl"
          >
            <div className="grid lg:grid-cols-[1.35fr_1fr]">
              {/* Map (mapa estilizado do produto) */}
              <div
                style={{ borderColor: "var(--th-border)" }}
                className="relative min-h-[300px] border-b lg:min-h-[460px] lg:border-b-0 lg:border-r"
              >
                <MapBackdrop />
                <span className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-navy shadow-sm backdrop-blur">
                  <span className="h-1.5 w-1.5 rounded-full bg-orange" /> Mapa do bairro
                </span>

                {MAP_ACTIVITIES.map((activity) => (
                  <MapPinMarker
                    key={activity.id}
                    category={activity.category}
                    icon={activity.pinIcon}
                    active={activeId === activity.id}
                    onClick={() => setActiveId(activity.id)}
                    label={`${activity.badge}: ${activity.title}`}
                    style={{ left: `${activity.x}%`, top: `${activity.y}%` }}
                  />
                ))}
              </div>

              {/* Activity list */}
              <div style={{ background: "var(--th-card)" }} className="flex flex-col p-5 lg:p-6">
                <h3 className="mb-4 text-sm font-bold" style={{ color: "var(--th-text)" }}>
                  Atividades próximas
                </h3>
                <div className="space-y-3">
                  {MAP_ACTIVITIES.map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setActiveId(activity.id)}
                      style={{ background: "var(--th-surface)", borderColor: "var(--th-border)" }}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all ${
                        activeId === activity.id ? "ring-2 ring-orange/60" : "hover:shadow-md"
                      }`}
                    >
                      <ActivityPinIcon category={activity.category} icon={activity.pinIcon} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{activity.title}</p>
                        <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>{activity.subtitle}</p>
                      </div>
                      <span
                        className="shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-bold"
                        style={{ backgroundColor: activity.badgeBg, color: activity.badgeText }}
                      >
                        {activity.badge}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Preview card */}
                <div
                  style={{ borderColor: "var(--th-border)" }}
                  className="mt-4 overflow-hidden rounded-2xl border"
                >
                  <div className="relative h-28">
                    <AppImage src={active.image} alt={active.title} fill className="object-cover" sizes="400px" />
                  </div>
                  <div style={{ background: "var(--th-surface)" }} className="p-3">
                    <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{active.title}</p>
                    <p className="text-xs" style={{ color: "var(--th-muted)" }}>{active.subtitle}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/** Mapa estilizado (ruas, quadras, praça e água) nas cores da marca — evoca o mapa real do app. */
function MapBackdrop() {
  return (
    <svg
      viewBox="0 0 800 500"
      preserveAspectRatio="xMidYMid slice"
      className="absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      {/* papel do mapa */}
      <rect width="800" height="500" fill="#e9eef1" />

      {/* praça / área verde */}
      <rect x="548" y="60" width="196" height="132" rx="18" fill="#d2e7d4" />
      <rect x="70" y="250" width="150" height="96" rx="16" fill="#d2e7d4" />

      {/* água (orla) */}
      <path d="M0,430 Q150,405 300,432 T620,436 L800,452 L800,500 L0,500 Z" fill="#bcdcec" />
      <path d="M0,430 Q150,405 300,432 T620,436 L800,452" fill="none" stroke="#a9cfe1" strokeWidth="2" />

      {/* quadras (blocos sutis) */}
      <g fill="#dde5ea">
        <rect x="250" y="70" width="120" height="80" rx="8" />
        <rect x="390" y="70" width="120" height="80" rx="8" />
        <rect x="250" y="200" width="120" height="90" rx="8" />
        <rect x="390" y="200" width="120" height="90" rx="8" />
        <rect x="560" y="230" width="150" height="90" rx="8" />
        <rect x="70" y="70" width="150" height="150" rx="8" />
      </g>

      {/* casing das avenidas */}
      <g fill="none" stroke="#cfd8de" strokeWidth="16" strokeLinecap="round">
        <path d="M-20,180 C 220,205 520,150 820,205" />
        <path d="M-20,360 C 250,340 540,375 820,350" />
        <path d="M330,-20 L 360,520" />
        <path d="M600,-20 L 560,520" />
      </g>
      {/* asfalto branco */}
      <g fill="none" stroke="#ffffff" strokeWidth="9" strokeLinecap="round">
        <path d="M-20,180 C 220,205 520,150 820,205" />
        <path d="M-20,360 C 250,340 540,375 820,350" />
        <path d="M330,-20 L 360,520" />
        <path d="M600,-20 L 560,520" />
      </g>

      {/* ruas menores (grade) */}
      <g fill="none" stroke="#ffffff" strokeWidth="4" opacity="0.95" strokeLinecap="round">
        <path d="M0,110 H540" />
        <path d="M0,250 H520" />
        <path d="M120,-10 V430" />
        <path d="M220,-10 V430" />
        <path d="M460,-10 V430" />
        <path d="M700,60 V430" />
      </g>
    </svg>
  );
}
