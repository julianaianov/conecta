"use client";

import { formatCents } from "@/lib/app/demand";
import type { DemandComposition } from "@/lib/app/types";
import { CompositionCard } from "../demand/DemandParts";
import { useEffectiveRole } from "../institution/useInstitutionAccess";

/** Linha do orçamento original, sem 4% + 6% (decisão 14). */
export function BudgetOnlyLine({ budgetAmountCents }: { budgetAmountCents: number }) {
  return (
    <p className="flex items-baseline justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm" style={{ borderColor: "var(--th-border)" }}>
      <span style={{ color: "var(--th-text)" }}>Orçamento para execução</span>
      <strong className="font-numeric" style={{ color: "var(--th-text)" }}>{formatCents(budgetAmountCents)}</strong>
    </p>
  );
}

/**
 * Composição financeira conforme quem vê (decisão 14; Modelo de Conexão §04
 * Obs.): 4% + 6% nunca incidem sobre o Poder Público, então a conta do órgão
 * (própria ou por vínculo, T29) vê só o orçamento original. Os demais veem a
 * composição completa, como no SSR.
 */
export function ViewerComposition({ composition }: { composition: DemandComposition }) {
  const { role, resolving } = useEffectiveRole();
  if (!resolving && role === "government") return <BudgetOnlyLine budgetAmountCents={composition.budgetAmountCents} />;
  return <CompositionCard composition={composition} />;
}
