"use client";

import Link from "next/link";
import type { Compatibility } from "@/lib/app/types";
import {
  COMPATIBILITY_CRITERION_LABELS,
  COMPATIBILITY_LEVEL_COLORS,
  COMPATIBILITY_LEVEL_LABELS,
  OPPORTUNITIES_PATH,
} from "@/lib/app/interest";
import { Icon } from "../Icon";

/** Selo com a pontuação (0–100) e o nível. */
export function CompatibilityBadge({ compatibility }: { compatibility: Compatibility }) {
  const color = COMPATIBILITY_LEVEL_COLORS[compatibility.level];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: `${color}1a`, color }}
      title={`${compatibility.score} de ${compatibility.maxScore} pontos`}
    >
      <Icon name="star" size={11} />
      <span className="font-numeric">{compatibility.score}</span>/{compatibility.maxScore} · {COMPATIBILITY_LEVEL_LABELS[compatibility.level]}
    </span>
  );
}

/**
 * Motivos da compatibilidade, critério a critério (território 40, categoria
 * 30, recursos 30). O cálculo é do post-service; aqui só se mostra.
 */
export function CompatibilityReasons({ compatibility, showProfileHint = true }: { compatibility: Compatibility; showProfileHint?: boolean }) {
  return (
    <div>
      <ul className="space-y-1.5" aria-label="Motivos da compatibilidade">
        {compatibility.reasons.map((reason) => (
          <li key={reason.criterion} className="flex items-start gap-2 text-xs" style={{ color: "var(--th-text)" }}>
            <Icon
              name={reason.matched ? "check" : "close"}
              size={13}
              className="mt-0.5 shrink-0"
              style={{ color: reason.matched ? "#2e9e5b" : "var(--th-muted)" }}
            />
            <span className="min-w-0 flex-1">
              <strong>{COMPATIBILITY_CRITERION_LABELS[reason.criterion]}</strong>: {reason.text}
            </span>
            <span className="shrink-0 font-numeric" style={{ color: "var(--th-muted)" }}>{reason.points}/{reason.maxPoints}</span>
          </li>
        ))}
      </ul>
      {showProfileHint && !compatibility.profileComplete && (
        <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>
          Preencha seu <Link href={`${OPPORTUNITIES_PATH}#perfil-de-apoio`} className="font-bold" style={{ color: "#f4841a" }}>perfil de apoio</Link> para calcular a compatibilidade.
        </p>
      )}
    </div>
  );
}
