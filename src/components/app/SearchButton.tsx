"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import type { Community, Post } from "@/lib/app/types";
import { Icon } from "./Icon";
import { TypeBadge } from "./ui";

/**
 * Busca global do app — lupa no header, abre um painel com resultados ao vivo.
 * Procura em publicações (título, descrição, tags, autor, bairro) e em conexões.
 * Os dados do demo cabem em memória, então o filtro é no cliente; quando houver
 * backend de busca, é só trocar o corpo do useMemo por uma chamada à API.
 */
export function SearchButton() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega uma vez, na primeira abertura.
  useEffect(() => {
    if (!open || posts.length > 0) return;
    let alive = true;
    setLoading(true);
    Promise.all([api.listPosts(), api.communities()]).then(([p, c]) => {
      if (!alive) return;
      setPosts(p);
      setCommunities(c);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [open, posts.length]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const q = query.trim().toLowerCase();

  const foundPosts = useMemo(() => {
    if (!q) return [];
    return posts
      .filter((p) =>
        [p.title, p.description, p.authorName, p.neighborhood ?? "", ...p.tags]
          .some((f) => f.toLowerCase().includes(q)),
      )
      .slice(0, 6);
  }, [posts, q]);

  const foundCommunities = useMemo(() => {
    if (!q) return [];
    return communities
      .filter((c) => [c.name, c.description, c.category].some((f) => (f ?? "").toLowerCase().includes(q)))
      .slice(0, 4);
  }, [communities, q]);

  const empty = q.length > 0 && !loading && foundPosts.length === 0 && foundCommunities.length === 0;

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:border-orange/40"
        style={{ borderColor: "var(--th-border)", color: "var(--th-muted)", background: "var(--th-surface)" }}
        aria-label="Buscar"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Icon name="search" size={17} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center px-3 pt-16 sm:pt-24" role="dialog" aria-modal="true" aria-label="Buscar">
          <div className="absolute inset-0" style={{ background: "rgba(13,45,66,0.45)" }} onClick={close} aria-hidden="true" />

          <div
            className="relative z-10 flex max-h-[75vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
          >
            <div className="flex items-center gap-2 border-b px-3" style={{ borderColor: "var(--th-border)" }}>
              <Icon name="search" size={18} style={{ color: "var(--th-muted)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar publicações, conexões, bairros..."
                className="h-14 flex-1 bg-transparent text-[15px] outline-none"
                style={{ color: "var(--th-text)" }}
                aria-label="Termo de busca"
              />
              <button type="button" onClick={close} aria-label="Fechar" style={{ color: "var(--th-muted)" }}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!q ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--th-muted)" }}>
                  Digite para buscar por título, descrição, tag, autor ou bairro.
                </p>
              ) : loading ? (
                <div className="flex justify-center py-10"><span className="app-spinner" style={{ width: 24, height: 24 }} /></div>
              ) : empty ? (
                <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--th-muted)" }}>
                  Nada encontrado para <strong style={{ color: "var(--th-text)" }}>{query}</strong>.
                </p>
              ) : (
                <>
                  {foundPosts.length > 0 && (
                    <Section title="Publicações">
                      {foundPosts.map((p) => (
                        <Link
                          key={p.id}
                          href={`/post/${p.id}`}
                          onClick={close}
                          className="flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-[var(--th-card-alt)]"
                          style={{ borderColor: "var(--th-border)" }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{p.title}</p>
                            <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>
                              {p.authorName}{p.neighborhood ? ` · ${p.neighborhood}` : ""}
                            </p>
                          </div>
                          <TypeBadge type={p.type} />
                        </Link>
                      ))}
                    </Section>
                  )}

                  {foundCommunities.length > 0 && (
                    <Section title="Conexões">
                      {foundCommunities.map((c) => (
                        <Link
                          key={c.id}
                          href="/conexoes"
                          onClick={close}
                          className="flex items-center gap-3 border-b px-4 py-3 transition-colors hover:bg-[var(--th-card-alt)]"
                          style={{ borderColor: "var(--th-border)" }}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "rgba(46,123,168,0.14)", color: "#2e7ba8" }}>
                            <Icon name="groups" size={16} />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{c.name}</p>
                            <p className="truncate text-xs" style={{ color: "var(--th-muted)" }}>{c.category}</p>
                          </div>
                        </Link>
                      ))}
                    </Section>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{title}</p>
      {children}
    </div>
  );
}
