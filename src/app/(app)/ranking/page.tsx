"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  RANK_CATEGORIES, ROLE_COLORS, normalizeRole,
  type RankCategory, type RankEntry,
} from "@/lib/app/types";
import { Icon, type IconName } from "@/components/app/Icon";
import { Avatar } from "@/components/app/Avatar";
import { Card, EmptyState } from "@/components/app/ui";

const METRIC_HINT: Record<RankCategory, string> = {
  partner: "Pontos por valor apoiado, projetos e tipos de apoio.",
  community: "Pontos por projetos publicados e apoios recebidos.",
  volunteer: "Pontos por participações, projetos e horas doadas.",
};

/** Ouro, prata, bronze para o pódio; demais em cinza. */
const MEDAL = ["#f4841a", "#9aa7b2", "#c88a52"];

export default function RankingPage() {
  const { user } = useAuth();
  const [boards, setBoards] = useState<Record<RankCategory, RankEntry[]> | null>(null);
  const [tab, setTab] = useState<RankCategory>("partner");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.ranking().then((r) => { setBoards(r); setLoading(false); });
  }, []);

  const entries = boards?.[tab] ?? [];
  const podium = entries.slice(0, 3);
  const rest = entries.slice(3);
  const mine = useMemo(
    () => (user ? entries.find((e) => e.userId === user.id) : undefined),
    [entries, user],
  );

  return (
    <div className="mx-auto max-w-2xl">
      {/* header */}
      <div className="brand-gradient overflow-hidden rounded-2xl p-5 text-white sm:p-6">
        <div className="flex items-center gap-2">
          <Icon name="trophy" size={20} style={{ color: "#f4841a" }} />
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.7)" }}>
            Ranking de impacto
          </p>
        </div>
        <h1 className="mt-2 text-2xl font-bold">Quem mais transforma o bairro</h1>
        <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>{METRIC_HINT[tab]}</p>
      </div>

      {/* abas */}
      <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar pb-1" role="tablist" aria-label="Categorias do ranking">
        {RANK_CATEGORIES.map((c) => (
          <button
            key={c.category}
            role="tab"
            aria-selected={tab === c.category}
            className="app-chip shrink-0"
            data-active={tab === c.category}
            onClick={() => setTab(c.category)}
          >
            <Icon name={c.icon as IconName} size={14} className="mr-1 inline-block align-[-2px]" />
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><span className="app-spinner" /></div>
      ) : entries.length === 0 ? (
        <div className="mt-4"><EmptyState icon="trophy" title="Ranking em construção" hint="Ainda não há participantes nesta categoria." /></div>
      ) : (
        <>
          {/* pódio */}
          <div className="mt-5 grid grid-cols-3 items-end gap-2 sm:gap-3">
            {orderPodium(podium).map((e, i) =>
              e ? <PodiumCard key={e.userId} entry={e} isMe={e.userId === user?.id} /> : <div key={`empty-${i}`} />,
            )}
          </div>

          {/* demais posições */}
          {rest.length > 0 && (
            <div className="mt-4 space-y-2">
              {rest.map((e) => <RankRow key={e.userId} entry={e} isMe={e.userId === user?.id} />)}
            </div>
          )}

          {/* sua posição, se não estiver no pódio visível */}
          {mine && mine.rank > 3 && (
            <div className="mt-5">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Sua posição</p>
              <RankRow entry={mine} isMe highlight />
            </div>
          )}

          <p className="mt-5 text-center text-xs" style={{ color: "var(--th-muted)" }}>
            {METRIC_HINT[tab]}
          </p>
        </>
      )}
    </div>
  );
}

/** Reordena o top-3 para exibição: [2º, 1º, 3º] — o campeão no centro, mais alto. */
function orderPodium(top: RankEntry[]): (RankEntry | undefined)[] {
  return [top[1], top[0], top[2]];
}

function PodiumCard({ entry, isMe }: { entry: RankEntry; isMe: boolean }) {
  const color = MEDAL[entry.rank - 1] ?? "#9aa7b2";
  const champion = entry.rank === 1;
  return (
    <Card padded={false} className="flex flex-col items-center px-2 pb-3 pt-4 text-center">
      <div className="relative">
        <Avatar name={entry.name} src={entry.avatarUrl} id={entry.userId} size={champion ? 64 : 52} ring />
        <span
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white font-numeric"
          style={{ background: color, boxShadow: "0 2px 6px rgba(13,45,66,0.25)" }}
        >
          {entry.rank}
        </span>
      </div>
      <p className="mt-2 line-clamp-2 text-xs font-bold leading-tight" style={{ color: "var(--th-text)" }}>{entry.name}</p>
      <p className="mt-1 font-numeric text-lg font-bold" style={{ color }}>{entry.points.toLocaleString("pt-BR")}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>pontos</p>
      {isMe && <span className="mt-1 rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: "rgba(244,132,26,0.14)", color: "#f4841a" }}>VOCÊ</span>}
    </Card>
  );
}

function RankRow({ entry, isMe, highlight }: { entry: RankEntry; isMe: boolean; highlight?: boolean }) {
  const roleColor = ROLE_COLORS[normalizeRole(entry.role)];
  return (
    <div
      className="app-card flex items-center gap-3 rounded-2xl px-3 py-3"
      style={{
        boxShadow: highlight ? `inset 0 0 0 2px ${roleColor}` : "0 4px 16px rgba(13,45,66,0.05)",
      }}
    >
      <span className="w-6 shrink-0 text-center font-numeric text-sm font-bold" style={{ color: "var(--th-muted)" }}>{entry.rank}</span>
      <Avatar name={entry.name} src={entry.avatarUrl} id={entry.userId} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-bold" style={{ color: "var(--th-text)" }}>{entry.name}</p>
          {isMe && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(244,132,26,0.14)", color: "#f4841a" }}>VOCÊ</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {entry.highlights.map((h) => (
            <span key={h.label} className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--th-muted)" }}>
              <Icon name={h.icon as IconName} size={11} style={{ color: roleColor }} />
              {h.label}
            </span>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-numeric text-base font-bold" style={{ color: "var(--th-text)" }}>{entry.points.toLocaleString("pt-BR")}</p>
        <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>pontos</p>
      </div>
    </div>
  );
}
