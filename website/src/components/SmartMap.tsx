"use client";

import { useState } from "react";
import { MAP_ACTIVITIES, BANNER_PHOTOS } from "@/lib/banner-data";
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
              {/* Map image */}
              <div
                style={{ borderColor: "var(--th-border)" }}
                className="relative min-h-[300px] border-b bg-[#EDE8DF] lg:min-h-[460px] lg:border-b-0 lg:border-r"
              >
                <AppImage
                  src={BANNER_PHOTOS.mapCoastal}
                  alt="Mapa interativo de bairro"
                  fill
                  className="object-cover opacity-95"
                  sizes="(max-width: 1024px) 100vw, 60vw"
                />
                <p className="absolute left-4 top-4 z-10 text-sm font-bold text-navy">Mapa inteligente</p>

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
