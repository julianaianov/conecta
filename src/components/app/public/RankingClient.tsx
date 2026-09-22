"use client";

// Os sete rankings da fonte (Apresentação Institucional, slide 22) com o
// período configurável (mês, ano, sempre), o critério de cada um explicado na
// tela, o tratamento de empate e o aviso de governança do slide 13: o Poder
// Público e os políticos não disputam ranking — são acompanhados por
// indicadores de atuação.
//
// A conta vem pronta do post-service (agregação materializada). Aqui não há
// cálculo nem estimativa: sem dado, a lista aparece vazia e o diz.

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  RANKING_BOARD_ICONS, rankingDisplayName, rankingHighlights,
  type RankingBoard, type RankingBoardId, type RankingEntry, type RankingPeriod,
  type RankingsResponse,
} from "@/lib/app/ranking";
import { Avatar } from "../Avatar";
import { Icon, type IconName } from "../Icon";

function entryHref(entry: RankingEntry): string | null {
  if (entry.subjectKind === "demanda") return `/demandas/${encodeURIComponent(entry.subjectId)}`;
  if (entry.subjectKind === "usuario" && entry.identified) return `/perfil/${encodeURIComponent(entry.subjectId)}`;
  return null;
}

function EntryRow({ entry, mine }: { entry: RankingEntry; mine: boolean }) {
  const name = rankingDisplayName(entry);
  const highlights = rankingHighlights(entry);
  const href = entryHref(entry);
  const body = (
    <>
      <span className="flex w-9 shrink-0 flex-col items-center">
        <span className="text-sm font-bold font-numeric" style={{ color: "var(--th-muted)" }}>{entry.position}º</span>
        {entry.tied && <span className="text-[9px] font-bold uppercase" style={{ color: "var(--th-muted)" }}>empate</span>}
      </span>
      {entry.subjectKind === "usuario" && (
        <Avatar name={entry.identified ? name : "?"} src={entry.avatarUrl} id={entry.subjectId} size={40} />
      )}
      <span className="min-w-0 flex-1">
        <strong className="flex items-center gap-2 truncate text-sm" style={{ color: "var(--th-text)" }}>
          {name}
          {mine && (
            <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold" style={{ background: "rgba(244,132,26,0.14)", color: "#f4841a" }}>VOCÊ</span>
          )}
        </strong>
        <span className="block text-xs font-numeric" style={{ color: "#f4841a" }}>
          {entry.points.toLocaleString("pt-BR")} pontos
        </span>
        {entry.place && entry.subjectKind !== "bairro" && (
          <span className="block text-[11px]" style={{ color: "var(--th-muted)" }}>{entry.place}</span>
        )}
        {highlights.length > 0 && (
          <span className="mt-0.5 block text-[11px]" style={{ color: "var(--th-muted)" }}>{highlights.join(" · ")}</span>
        )}
      </span>
    </>
  );
  const className = "app-card flex items-center gap-3 rounded-2xl border-l-4 px-4 py-3";
  const style = { borderLeftColor: mine ? "#f4841a" : "transparent" };
  return href
    ? <Link href={href} className={`${className} hover:shadow-md`} style={style}>{body}</Link>
    : <div className={className} style={style}>{body}</div>;
}

function BoardSection({ board, userId }: { board: RankingBoard; userId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section aria-labelledby={`board-${board.id}`} className="space-y-2">
      <header className="flex items-start gap-3">
        <Icon name={(RANKING_BOARD_ICONS[board.id] ?? "trophy") as IconName} size={20} style={{ color: "#f4841a" }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id={`board-${board.id}`} className="text-base font-bold" style={{ color: "var(--th-text)" }}>{board.label}</h2>
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>{board.subtitle}</p>
        </div>
        <button
          type="button"
          className="app-chip shrink-0 text-[11px]"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Ocultar critério" : "Como é calculado"}
        </button>
      </header>
      {open && (
        <p className="app-card rounded-2xl p-3 text-xs" style={{ color: "var(--th-muted)" }}>{board.criteria}</p>
      )}
      {board.entries.length === 0 ? (
        <p className="app-card rounded-2xl p-4 text-sm" style={{ color: "var(--th-muted)" }}>
          Ainda não há registros suficientes neste período.
        </p>
      ) : (
        <ol className="space-y-2">
          {board.entries.map((entry) => (
            <li key={`${board.id}-${entry.subjectId}`}>
              <EntryRow entry={entry} mine={Boolean(userId) && entry.subjectId === userId} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function RankingClient({ initial }: { initial: RankingsResponse }) {
  const { user } = useAuth();
  const [data, setData] = useState(initial);
  const [period, setPeriod] = useState<RankingPeriod>(initial.period);
  const [board, setBoard] = useState<RankingBoardId | "todos">("todos");

  useEffect(() => {
    let alive = true;
    api.rankings(period, { limit: 10 })
      .then((next) => { if (alive) setData(next); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [period]);

  const boards = board === "todos" ? data.boards : data.boards.filter((item) => item.id === board);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="brand-gradient rounded-2xl p-5 text-white sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-white/70">Engajamento e reconhecimento</p>
        <h1 className="mt-2 text-2xl font-bold">Quem faz o território avançar</h1>
        <p className="mt-1 text-sm text-white/75">
          Sete indicadores públicos, calculados só a partir de registros reais da plataforma.
          {data.computedAt && ` Atualizados em ${new Date(data.computedAt).toLocaleString("pt-BR")}.`}
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Período">
        {data.periods.map((item) => (
          <button
            key={item.id}
            type="button"
            className="app-chip"
            data-active={period === item.id}
            aria-pressed={period === item.id}
            onClick={() => setPeriod(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Indicador">
        <button type="button" className="app-chip shrink-0" data-active={board === "todos"} aria-pressed={board === "todos"} onClick={() => setBoard("todos")}>
          Todos
        </button>
        {data.boards.map((item) => (
          <button
            key={item.id}
            type="button"
            className="app-chip shrink-0"
            data-active={board === item.id}
            aria-pressed={board === item.id}
            onClick={() => setBoard(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="app-card space-y-2 rounded-2xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
          <Icon name="shield" size={16} style={{ color: "#205375" }} aria-hidden />
          Governança destes indicadores
        </h2>
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>{data.notices.government}</p>
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>{data.notices.consent}</p>
      </div>

      <div className="space-y-6">
        {boards.map((item) => <BoardSection key={item.id} board={item} userId={user?.id} />)}
      </div>
    </div>
  );
}
