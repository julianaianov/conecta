"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/app/api";
import { MAP_PIN_COLORS, POST_TYPE_LABELS, type Post, type PostType } from "@/lib/app/types";
import { Icon } from "@/components/app/Icon";

const MapView = dynamic(() => import("@/components/app/MapView"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>,
});

const FILTERS: { value: PostType | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "problem", label: "Problemas" },
  { value: "project", label: "Projetos" },
  { value: "need", label: "Necessidades" },
  { value: "event", label: "Eventos" },
  { value: "action", label: "Ações" },
];

const LEGEND: PostType[] = ["problem", "project", "action", "need", "event"];

export default function MapPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filter, setFilter] = useState<PostType | "all">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.mapPosts(filter === "all" ? undefined : filter).then((p) => { if (alive) { setPosts(p); setLoading(false); } });
    return () => { alive = false; };
  }, [filter]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Mapa de demandas</h1>
          <p className="text-sm" style={{ color: "var(--th-muted)" }}>
            <span className="font-numeric font-bold" style={{ color: "#f4841a" }}>{posts.length}</span> demandas mapeadas · Recreio dos Bandeirantes
          </p>
        </div>
        {loading && <span className="app-spinner" style={{ width: 22, height: 22 }} />}
      </div>

      {/* filtros */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {FILTERS.map((f) => (
          <button key={f.value} className="app-chip shrink-0" data-active={filter === f.value} onClick={() => setFilter(f.value)}>{f.label}</button>
        ))}
      </div>

      {/* mapa */}
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "var(--th-border)", height: "calc(100dvh - 290px)", minHeight: 420 }}>
        <MapView posts={posts} />

        {/* legenda */}
        <div className="absolute bottom-3 right-3 z-[1000] rounded-xl border p-3 shadow-lg" style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Legenda</p>
          <div className="space-y-1">
            {LEGEND.map((t) => (
              <div key={t} className="flex items-center gap-2 text-xs" style={{ color: "var(--th-text)" }}>
                <span className="h-3 w-3 rounded-full" style={{ background: MAP_PIN_COLORS[t] }} />
                {POST_TYPE_LABELS[t]}
              </div>
            ))}
          </div>
        </div>

        <div className="absolute left-3 top-3 z-[1000] flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold shadow" style={{ background: "var(--th-card)", borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
          <Icon name="info" size={13} /> Toque num pino para ver a publicação
        </div>
      </div>
    </div>
  );
}
