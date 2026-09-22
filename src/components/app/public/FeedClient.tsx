"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { allowedPostTypes, type Community, type Post, type PostType } from "@/lib/app/types";
import { Icon } from "../Icon";
import { PostCard } from "../PostCard";
import { PublicPostCard } from "./PublicPostCard";

const FILTERS: { value: PostType | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "problem", label: "Problemas" },
  { value: "project", label: "Projetos" },
  { value: "need", label: "Necessidades" },
  { value: "event", label: "Eventos" },
  { value: "action", label: "Ações" },
  { value: "message", label: "Informes" },
];

export function FeedClient({ initialPosts, initialCommunities }: { initialPosts: Post[]; initialCommunities: Community[] }) {
  const { user } = useAuth();
  const postTypes = allowedPostTypes(user?.role, user?.profileType);
  const [posts, setPosts] = useState(initialPosts);
  const [communities, setCommunities] = useState(initialCommunities);
  const [filter, setFilter] = useState<PostType | "all">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let alive = true;
    api.listPosts(filter === "all" ? undefined : { type: filter }).then((next) => { if (alive) setPosts(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, [filter]);

  useEffect(() => {
    let alive = true;
    api.communities().then((next) => { if (alive) setCommunities(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return posts;
    return posts.filter((post) => `${post.title} ${post.description} ${post.neighborhood ?? ""}`.toLowerCase().includes(query));
  }, [posts, search]);

  return (
    <div className="space-y-5">
      <header className="border-b pb-4" style={{ borderColor: "var(--th-border)" }}>
        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "#f4841a" }}>O pulso do território</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight" style={{ color: "var(--th-text)" }}>Sinais e iniciativas locais</h1>
        <p className="mt-1 max-w-2xl text-sm" style={{ color: "var(--th-muted)" }}>Acompanhe necessidades, projetos, status e resultados que pedem atenção e colaboração.</p>
      </header>

      {user && (
        <section className="app-card flex flex-col gap-4 rounded-2xl border-l-4 p-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderLeftColor: "#f4841a" }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "#f4841a" }}>Área de atuação</p>
            <h2 className="mt-1 text-base font-bold" style={{ color: "var(--th-text)" }}>Acompanhe o próximo passo</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Sinais, apoios e conexões ficam disponíveis no mesmo fluxo.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {postTypes.length > 0 && <Link href="/criar" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "#f4841a" }}><Icon name="plus" size={16} /> Registrar sinal</Link>}
            <Link href="/meus-apoios" className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}><Icon name="volunteer" size={16} /> Ações apoiadas</Link>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="public-feed-search">Buscar no pulso</label>
        <input id="public-feed-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por título, bairro ou tema" className="app-input flex-1" />
        <Link href="/mapa" className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}><Icon name="map" size={17} /> Ver mapa</Link>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" aria-label="Filtrar sinais">
        {FILTERS.map((item) => <button key={item.value} type="button" className="app-chip shrink-0" data-active={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}</button>)}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
        <section aria-label="Sinais públicos" className="space-y-4">
          {visible.length === 0 ? (
            <div className="app-card rounded-2xl p-6 text-center"><h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Nenhum registro encontrado</h2><p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Tente outro termo ou consulte o mapa do território.</p></div>
          ) : visible.map((post) => user ? <PostCard key={post.id} post={post} /> : <PublicPostCard key={post.id} post={post} />)}
        </section>

        <aside className="space-y-4">
          <section className="app-card rounded-2xl p-4"><h2 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Frentes de atuação</h2><p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>Conheça as iniciativas que movimentam o território.</p><div className="mt-3 space-y-2">{communities.slice(0, 6).map((community) => <Link key={community.id} href="/conexoes" className="flex items-center justify-between rounded-lg px-2 py-2 text-sm hover:bg-[var(--th-card-alt)]" style={{ color: "var(--th-text)" }}><span className="truncate">{community.name}</span><span className="ml-2 shrink-0 text-xs" style={{ color: "var(--th-muted)" }}>{community.memberCount} participantes</span></Link>)}</div></section>
          {user ? <section className="app-card rounded-2xl p-4"><h2 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Próximos passos</h2><div className="mt-3 space-y-2"><Link href="/mapa" className="block text-sm font-semibold" style={{ color: "#2e7ba8" }}>Explorar território →</Link><Link href="/conexoes" className="block text-sm font-semibold" style={{ color: "#2e7ba8" }}>Acompanhar conexões →</Link></div></section> : <section className="app-card rounded-2xl p-4"><h2 className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Quer participar?</h2><p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Entre para registrar uma demanda, apoiar uma iniciativa ou acompanhar uma conexão.</p><Link href="/login?next=%2Fcriar" className="mt-3 inline-flex text-sm font-bold" style={{ color: "#f4841a" }}>Entrar para participar →</Link></section>}
        </aside>
      </div>
    </div>
  );
}
