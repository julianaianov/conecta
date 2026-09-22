"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { MAP_PIN_COLORS, POST_TYPE_LABELS, type Post, type PostType } from "@/lib/app/types";

const MapView = dynamic(() => import("../MapView"), {
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

export function MapClient({ initialPosts }: { initialPosts: Post[] }) {
  const [posts, setPosts] = useState(initialPosts);
  const [filter, setFilter] = useState<PostType | "all">("all");

  useEffect(() => {
    let alive = true;
    api.mapPosts(filter === "all" ? undefined : filter).then((next) => { if (alive) setPosts(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, [filter]);

  return (
    <div className="space-y-4">
      <header><h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Mapa de demandas e iniciativas</h1><p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Explore registros públicos por localização e acompanhe o que acontece no território.</p></header>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">{FILTERS.map((item) => <button key={item.value} type="button" className="app-chip shrink-0" data-active={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}</div>
      <div className="relative overflow-hidden rounded-2xl border" style={{ borderColor: "var(--th-border)", height: "calc(100dvh - 290px)", minHeight: 420 }}><MapView posts={posts} /></div>
      <section aria-label="Registros localizados" className="app-card rounded-2xl p-4"><h2 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{posts.length} registros localizados</h2>{posts.length === 0 ? <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Ainda não há registros públicos com localização disponível.</p> : <ul className="mt-3 grid gap-2 sm:grid-cols-2">{posts.map((post) => <li key={post.id}><Link href={`/post/${encodeURIComponent(post.id)}`} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[var(--th-card-alt)]"><span className="h-3 w-3 shrink-0 rounded-full" style={{ background: MAP_PIN_COLORS[post.type] }} /><span className="min-w-0"><strong className="block truncate text-sm" style={{ color: "var(--th-text)" }}>{post.title}</strong><span className="block truncate text-xs" style={{ color: "var(--th-muted)" }}>{POST_TYPE_LABELS[post.type]}{post.neighborhood ? ` · ${post.neighborhood}` : ""}</span></span></Link></li>)}</ul>}</section>
    </div>
  );
}
