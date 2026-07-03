"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { ROLE_LABELS, type Post, type PostType, type Community, type UserRole } from "@/lib/app/types";
import { PostCard } from "@/components/app/PostCard";
import { Avatar } from "@/components/app/Avatar";
import { Icon } from "@/components/app/Icon";
import { Card, EmptyState } from "@/components/app/ui";

const FILTERS: { value: PostType | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "problem", label: "Problemas" },
  { value: "project", label: "Projetos" },
  { value: "need", label: "Necessidades" },
  { value: "event", label: "Eventos" },
  { value: "action", label: "Ações" },
  { value: "message", label: "Mensagens" },
];

export default function FeedPage() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [filter, setFilter] = useState<PostType | "all">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.listPosts(filter === "all" ? undefined : { type: filter }).then((p) => {
      if (alive) { setPosts(p); setLoading(false); }
    });
    return () => { alive = false; };
  }, [filter]);

  useEffect(() => { api.communities().then(setCommunities); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [posts, search]);

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
      {/* Sidebar esquerda */}
      <aside className="hidden lg:block">
        <div className="sticky top-20 space-y-4">
          <Card>
            <div className="flex flex-col items-center text-center">
              <Avatar name={user?.name ?? ""} src={user?.avatarUrl} id={user?.id} size={64} />
              <p className="mt-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>{user?.name}</p>
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>{ROLE_LABELS[(user?.role as UserRole) ?? "citizen"]}</p>
              <Link href="/perfil" className="mt-3 w-full rounded-lg border py-2 text-xs font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
                Ver meu perfil
              </Link>
            </div>
          </Card>
          <Card>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Atalhos</p>
            <ShortcutLink href="/mapa" icon="map" label="Mapa de demandas" />
            <ShortcutLink href="/meus-apoios" icon="heart" label="Meus apoios" />
            <ShortcutLink href="/comunidades" icon="groups" label="Comunidades" />
          </Card>
        </div>
      </aside>

      {/* Coluna central */}
      <div className="space-y-4">
        {/* Quick post */}
        <Card>
          <div className="flex items-center gap-3">
            <Avatar name={user?.name ?? ""} src={user?.avatarUrl} id={user?.id} size={40} />
            <Link href="/criar" className="flex-1 rounded-full border px-4 py-2.5 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)", background: "var(--th-card-alt)" }}>
              O que está acontecendo no bairro?
            </Link>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
            {(["problem", "project", "need", "event"] as PostType[]).map((t) => (
              <Link key={t} href={`/criar?type=${t}`} className="app-chip shrink-0">
                <Icon name={t === "problem" ? "bolt" : t === "project" ? "leaf" : t === "need" ? "volunteer" : "calendar"} size={14} style={{ color: "#f4841a" }} />
                {FILTERS.find((f) => f.value === t)?.label}
              </Link>
            ))}
          </div>
        </Card>

        {/* Busca */}
        <div className="relative">
          <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar demandas, projetos..." className="app-input pl-11 pr-10" />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} aria-label="Limpar">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {FILTERS.map((f) => (
            <button key={f.value} className="app-chip shrink-0" data-active={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
        ) : visible.length === 0 ? (
          <EmptyState title="Nada por aqui ainda" hint="Ajuste os filtros ou seja o primeiro a publicar algo no bairro." />
        ) : (
          <div className="space-y-4">{visible.map((p) => <PostCard key={p.id} post={p} />)}</div>
        )}
      </div>

      {/* Sidebar direita */}
      <aside className="hidden lg:block">
        <div className="sticky top-20">
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Comunidades</p>
              <Link href="/comunidades" className="text-xs font-semibold" style={{ color: "#f4841a" }}>Ver todas</Link>
            </div>
            <div className="space-y-3">
              {communities.map((c) => (
                <Link key={c.id} href="/comunidades" className="flex items-center gap-3">
                  <Avatar name={c.name} src={c.imageUrl} id={c.id} size={38} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{c.name}</p>
                    <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{c.memberCount.toLocaleString("pt-BR")} membros</p>
                  </div>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </aside>
    </div>
  );
}

function ShortcutLink({ href, icon, label }: { href: string; icon: "map" | "heart" | "groups"; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors hover:bg-[var(--th-card-alt)]" style={{ color: "var(--th-text)" }}>
      <Icon name={icon} size={17} style={{ color: "#2e7ba8" }} />
      {label}
    </Link>
  );
}
