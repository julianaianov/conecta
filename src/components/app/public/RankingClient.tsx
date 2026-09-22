"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { RANK_CATEGORIES, ROLE_COLORS, normalizeRole, type RankCategory, type RankEntry } from "@/lib/app/types";
import { Avatar } from "../Avatar";
import { Icon, type IconName } from "../Icon";

type Boards = Record<RankCategory, RankEntry[]>;

export function RankingClient({ initialBoards }: { initialBoards: Boards }) {
  const { user } = useAuth();
  const [boards, setBoards] = useState(initialBoards);
  const [tab, setTab] = useState<RankCategory>("partner");

  useEffect(() => {
    let alive = true;
    api.ranking().then((next) => { if (alive) setBoards(next); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const entries = boards[tab] ?? [];
  const mine = user ? entries.find((entry) => entry.userId === user.id) : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="brand-gradient rounded-2xl p-5 text-white sm:p-6"><p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Indicadores de impacto</p><h1 className="mt-2 text-2xl font-bold">Pessoas e iniciativas que fazem avançar</h1><p className="mt-1 text-sm text-white/75">Veja os registros públicos de participação e colaboração no território.</p></header>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Dimensões do impacto">{RANK_CATEGORIES.map((category) => <button key={category.category} type="button" role="tab" aria-selected={tab === category.category} className="app-chip shrink-0" data-active={tab === category.category} onClick={() => setTab(category.category)}>{category.label}</button>)}</div>
      {mine && <div className="app-card flex items-center gap-3 rounded-2xl border-l-4 p-4" style={{ borderLeftColor: "#f4841a" }}><Avatar name={mine.name} src={mine.avatarUrl} id={mine.userId} size={42} /><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#f4841a" }}>Sua posição nesta dimensão</p><p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{mine.rank}º lugar · {mine.points.toLocaleString("pt-BR")} pontos</p></div><Icon name="trophy" size={22} style={{ color: "#f4841a" }} /></div>}
      <section aria-label="Indicadores públicos" className="space-y-2">{entries.length === 0 ? <div className="app-card rounded-2xl p-6 text-center"><h2 className="text-lg font-bold" style={{ color: "var(--th-text)" }}>Indicadores em construção</h2><p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Ainda não há dados suficientes nesta dimensão.</p></div> : entries.map((entry) => { const roleColor = ROLE_COLORS[normalizeRole(entry.role, entry.profileType)]; const isMine = entry.userId === user?.id; return <Link key={entry.userId} href={`/perfil/${encodeURIComponent(entry.userId)}`} className="app-card flex items-center gap-3 rounded-2xl border-l-4 px-4 py-3 hover:shadow-md" style={{ borderLeftColor: isMine ? "#f4841a" : "transparent" }}><span className="w-6 shrink-0 text-center text-sm font-bold font-numeric" style={{ color: "var(--th-muted)" }}>{entry.rank}</span><Avatar name={entry.name} src={entry.avatarUrl} id={entry.userId} size={42} /><span className="min-w-0 flex-1"><strong className="flex items-center gap-2 truncate text-sm" style={{ color: "var(--th-text)" }}>{entry.name}{isMine && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(244,132,26,0.14)", color: "#f4841a" }}>VOCÊ</span>}</strong><span className="block text-xs" style={{ color: roleColor }}>{entry.points.toLocaleString("pt-BR")} pontos de impacto</span><span className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">{entry.highlights.map((highlight) => <span key={highlight.label} className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--th-muted)" }}><Icon name={highlight.icon as IconName} size={11} style={{ color: roleColor }} />{highlight.label}</span>)}</span></span><span className="text-xs" style={{ color: "var(--th-muted)" }}>Ver atuação →</span></Link>; })}</section>
    </div>
  );
}
