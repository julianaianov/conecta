"use client";

/**
 * Peças de gráfico do painel administrativo.
 *
 * Regras que valem para todas: marca fina, ponta arredondada de 4px ancorada na
 * linha de base, 2px de respiro entre preenchimentos, eixo e grade recessivos,
 * rótulo direto no lugar de número em cima de cada ponto, e camada de hover em
 * tudo que é plotado. As cores vêm dos tokens `--viz-*` (globals.css), que já
 * passaram pelo validador nos dois modos.
 */
import { useId, useMemo, useState } from "react";
import { Icon, type IconName } from "../Icon";

const ORDINAL = ["var(--viz-o1)", "var(--viz-o2)", "var(--viz-o3)", "var(--viz-o4)", "var(--viz-o5)"];

/** Passo da rampa ordinal para a posição `i` de `n` (claro → escuro). */
export function ordinalStep(i: number, n: number): string {
  if (n <= 1) return ORDINAL[4];
  const idx = Math.round((i / (n - 1)) * (ORDINAL.length - 1));
  return ORDINAL[Math.min(ORDINAL.length - 1, Math.max(0, idx))];
}

export const int = (v: number) => v.toLocaleString("pt-BR");
export const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const pctLabel = (v: number) => `${(v * 100).toFixed(v >= 0.1 || v === 0 ? 0 : 1)}%`;
const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

// ── Stat tile ──────────────────────────────────────────────
export function StatTile({
  label, value, hint, icon, accent = false,
}: { label: string; value: string; hint?: string; icon: IconName; accent?: boolean }) {
  return (
    <div className="app-card flex flex-col rounded-2xl p-4" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{
            background: accent ? "rgba(244,132,26,0.14)" : "rgba(46,123,168,0.12)",
            color: accent ? "#f4841a" : "#2e7ba8",
          }}
        >
          <Icon name={icon} size={15} />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
          {label}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold leading-none" style={{ color: "var(--th-text)", letterSpacing: "-0.02em" }}>
        {value}
      </p>
      {hint && <p className="mt-1.5 text-xs" style={{ color: "var(--th-muted)" }}>{hint}</p>}
    </div>
  );
}

// ── Lista de barras (magnitude, um só matiz) ───────────────
export interface BarItem {
  key: string;
  label: string;
  value: number;
  hint?: string;
  icon?: IconName;
}

export function BarList({
  items, format = int, emptyHint = "Sem dados no período.",
}: { items: BarItem[]; format?: (v: number) => string; emptyHint?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>{emptyHint}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li
          key={item.key}
          className="group rounded-lg px-1 py-0.5 transition-colors hover:bg-[var(--th-card-alt)]"
          title={`${item.label}: ${format(item.value)}`}
        >
          <div className="flex items-baseline gap-2">
            {item.icon && <Icon name={item.icon} size={13} style={{ color: "var(--th-muted)" }} />}
            <span className="min-w-0 flex-1 truncate text-sm" style={{ color: "var(--th-text)" }}>{item.label}</span>
            <span className="font-numeric text-sm font-bold tabular-nums" style={{ color: "var(--th-text)" }}>
              {format(item.value)}
            </span>
            {item.hint && <span className="text-xs" style={{ color: "var(--th-muted)" }}>{item.hint}</span>}
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{ width: item.value === 0 ? "0%" : `${Math.max(2, (item.value / max) * 100)}%`, background: "var(--viz-o4)" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Funil ──────────────────────────────────────────────────
export interface FunnelItem {
  key: string;
  label: string;
  hint: string;
  count: number;
  ofTotal: number;
  ofPrevious: number;
}

export function Funnel({ stages }: { stages: FunnelItem[] }) {
  return (
    <ol className="space-y-2.5">
      {stages.map((s, i) => (
        <li key={s.key} title={`${s.label}: ${int(s.count)} (${pctLabel(s.ofTotal)} do total)`}>
          <div className="flex items-baseline gap-2">
            <span className="font-numeric text-[11px] font-bold tabular-nums" style={{ color: "var(--th-muted)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>
              {s.label}
            </span>
            <span className="font-numeric text-sm font-bold tabular-nums" style={{ color: "var(--th-text)" }}>
              {int(s.count)}
            </span>
            <span className="w-12 text-right font-numeric text-xs tabular-nums" style={{ color: "var(--th-muted)" }}>
              {pctLabel(s.ofTotal)}
            </span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--viz-track)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                // etapa zerada não ganha barra mínima: um tracinho pareceria "quase lá"
                width: s.count === 0 ? "0%" : `${Math.max(2, s.ofTotal * 100)}%`,
                background: ordinalStep(i, stages.length),
              }}
            />
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--th-muted)" }}>
            {s.hint}
            {i > 0 && <> · <span className="font-numeric tabular-nums">{pctLabel(s.ofPrevious)}</span> da etapa anterior</>}
          </p>
        </li>
      ))}
    </ol>
  );
}

// ── Barra empilhada (parte-todo) ───────────────────────────
export function StackedBar({ segments }: { segments: { key: string; label: string; value: number }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div
            key={s.key}
            title={`${s.label}: ${int(s.value)} (${pctLabel(s.value / total)})`}
            style={{ width: `${(s.value / total) * 100}%`, background: ordinalStep(i, segments.length) }}
            className="h-full first:rounded-l-full last:rounded-r-full"
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: ordinalStep(i, segments.length) }} />
            <span style={{ color: "var(--th-text)" }}>{s.label}</span>
            <span className="font-numeric tabular-nums">{int(s.value)} · {pctLabel(s.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Série temporal (2 séries) ──────────────────────────────
export interface SeriesPointInput {
  date: string;
  posts: number;
  supports: number;
}

const W = 720;
const H = 210;
const PAD = { top: 14, right: 54, bottom: 24, left: 34 };

/** Junta os dias em semanas quando a janela é longa demais para plotar dia a dia. */
function bucketize(points: SeriesPointInput[]): SeriesPointInput[] {
  if (points.length <= 45) return points;
  const size = Math.ceil(points.length / 40);
  const out: SeriesPointInput[] = [];
  for (let i = 0; i < points.length; i += size) {
    const chunk = points.slice(i, i + size);
    out.push({
      date: chunk[0].date,
      posts: chunk.reduce((s, p) => s + p.posts, 0),
      supports: chunk.reduce((s, p) => s + p.supports, 0),
    });
  }
  return out;
}

export function TimeSeries({ points }: { points: SeriesPointInput[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const clipId = useId();

  const data = useMemo(() => bucketize(points), [points]);
  const grouped = data.length !== points.length;

  const max = Math.max(1, ...data.map((p) => Math.max(p.posts, p.supports)));
  const stepX = data.length > 1 ? (W - PAD.left - PAD.right) / (data.length - 1) : 0;
  const x = (i: number) => PAD.left + i * stepX;
  const y = (v: number) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const path = (pick: (p: SeriesPointInput) => number) =>
    data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(pick(p)).toFixed(1)}`).join(" ");

  const ticks = [0, Math.round(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  const last = data[data.length - 1];
  const totalPosts = data.reduce((s, p) => s + p.posts, 0);
  const totalSupports = data.reduce((s, p) => s + p.supports, 0);

  if (data.length === 0) {
    return <p className="py-10 text-center text-sm" style={{ color: "var(--th-muted)" }}>Sem atividade no período.</p>;
  }

  return (
    <div>
      {/* legenda — sempre presente com 2 séries */}
      <div className="mb-2 flex flex-wrap items-center gap-4">
        <LegendDot color="var(--viz-s1)" label="Publicações" value={int(totalPosts)} />
        <LegendDot color="var(--viz-s2)" label="Apoios" value={int(totalSupports)} />
        <button
          type="button"
          onClick={() => setTable((v) => !v)}
          className="ml-auto rounded-lg border px-2.5 py-1 text-xs font-semibold"
          style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}
        >
          {table ? "Ver gráfico" : "Ver tabela"}
        </button>
      </div>

      {table ? (
        <div className="max-h-64 overflow-auto rounded-xl border" style={{ borderColor: "var(--th-border)" }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0" style={{ background: "var(--th-card-alt)" }}>
              <tr>
                <Th>{grouped ? "Semana de" : "Dia"}</Th>
                <Th align="right">Publicações</Th>
                <Th align="right">Apoios</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.date} className="border-t" style={{ borderColor: "var(--th-border)" }}>
                  <Td>{dayLabel(p.date)}</Td>
                  <Td align="right">{int(p.posts)}</Td>
                  <Td align="right">{int(p.supports)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Publicações e apoios ao longo do tempo">
            <defs>
              <clipPath id={clipId}>
                <rect x={PAD.left} y={0} width={W - PAD.left - PAD.right} height={H} />
              </clipPath>
            </defs>

            {/* grade recessiva + eixo y */}
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--th-muted)">{t}</text>
              </g>
            ))}
            <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--viz-axis)" strokeWidth={1} />

            {/* rótulos de x — só primeiro, meio e último */}
            {[0, Math.floor((data.length - 1) / 2), data.length - 1]
              .filter((v, i, a) => a.indexOf(v) === i && v >= 0)
              .map((i) => (
                <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fontSize={11} fill="var(--th-muted)">
                  {dayLabel(data[i].date)}
                </text>
              ))}

            <g clipPath={`url(#${clipId})`}>
              <path d={path((p) => p.posts)} fill="none" stroke="var(--viz-s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              <path d={path((p) => p.supports)} fill="none" stroke="var(--viz-s2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>

            {/* Rótulo direto no último ponto — identidade sem depender só da cor.
                Quando as duas séries terminam juntas, os textos se sobreporiam:
                afasta um para cima e o outro para baixo. */}
            {(() => {
              const yPosts = y(last.posts);
              const ySupports = y(last.supports);
              const colide = Math.abs(yPosts - ySupports) < 13;
              return (
                <>
                  <text x={W - PAD.right + 8} y={(colide ? yPosts - 5 : yPosts) + 4} fontSize={11} fontWeight={700} fill="var(--viz-s1)">Pub.</text>
                  <text x={W - PAD.right + 8} y={(colide ? ySupports + 9 : ySupports) + 4} fontSize={11} fontWeight={700} fill="var(--viz-s2)">Apoios</text>
                </>
              );
            })()}

            {/* crosshair */}
            {hover != null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.top - 6} y2={y(0)} stroke="var(--viz-axis)" strokeWidth={1} />
                <circle cx={x(hover)} cy={y(data[hover].posts)} r={5} fill="var(--viz-s1)" stroke="var(--th-card)" strokeWidth={2} />
                <circle cx={x(hover)} cy={y(data[hover].supports)} r={5} fill="var(--viz-s2)" stroke="var(--th-card)" strokeWidth={2} />
              </g>
            )}

            {/* área de captura do ponteiro */}
            <rect
              x={PAD.left - stepX / 2}
              y={0}
              width={W - PAD.left - PAD.right + stepX}
              height={H}
              fill="transparent"
              onPointerLeave={() => setHover(null)}
              onPointerMove={(e) => {
                const box = e.currentTarget.getBoundingClientRect();
                const rel = ((e.clientX - box.left) / box.width) * (W - PAD.left - PAD.right + stepX) + PAD.left - stepX / 2;
                const i = stepX > 0 ? Math.round((rel - PAD.left) / stepX) : 0;
                setHover(Math.min(data.length - 1, Math.max(0, i)));
              }}
            />
          </svg>

          {hover != null && (
            <div
              className="pointer-events-none absolute top-1 rounded-xl border px-3 py-2 text-xs shadow-lg"
              style={{
                background: "var(--th-card)", borderColor: "var(--th-border)",
                left: `${Math.min(78, Math.max(2, (x(hover) / W) * 100))}%`,
              }}
            >
              <p className="font-semibold" style={{ color: "var(--th-text)" }}>
                {grouped ? "Semana de " : ""}{dayLabel(data[hover].date)}
              </p>
              <p className="mt-1 flex items-center gap-1.5" style={{ color: "var(--th-muted)" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--viz-s1)" }} />
                Publicações <span className="font-numeric font-bold tabular-nums" style={{ color: "var(--th-text)" }}>{data[hover].posts}</span>
              </p>
              <p className="flex items-center gap-1.5" style={{ color: "var(--th-muted)" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--viz-s2)" }} />
                Apoios <span className="font-numeric font-bold tabular-nums" style={{ color: "var(--th-text)" }}>{data[hover].supports}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span style={{ color: "var(--th-text)" }}>{label}</span>
      <span className="font-numeric font-bold tabular-nums" style={{ color: "var(--th-text)" }}>{value}</span>
    </span>
  );
}

// ── Tabela ─────────────────────────────────────────────────
export function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      className={`px-3 py-2 text-[11px] font-bold uppercase tracking-wide ${align === "right" ? "text-right" : "text-left"}`}
      style={{ color: "var(--th-muted)" }}
    >
      {children}
    </th>
  );
}

export function Td({ children, align = "left", strong = false }: { children: React.ReactNode; align?: "left" | "right"; strong?: boolean }) {
  return (
    <td
      className={`px-3 py-2 ${align === "right" ? "text-right font-numeric tabular-nums" : ""} ${strong ? "font-semibold" : ""}`}
      style={{ color: strong ? "var(--th-text)" : "var(--th-muted)" }}
    >
      {children}
    </td>
  );
}
