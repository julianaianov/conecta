"use client";

import { DEMAND_STEPS, type DemandStepId, type DemandStepState } from "@/lib/app/demand";
import { Icon } from "../Icon";

const STATE_TEXT: Record<DemandStepState, string> = {
  completa: "completa",
  pendente: "pendente",
  opcional: "opcional",
};

/**
 * Barra de progresso com as etapas numeradas. Cada etapa é um botão (salva a
 * atual e muda); a atual tem `aria-current="step"`.
 */
export function DemandProgress({ current, states, onGo, locked }: {
  current: DemandStepId;
  states: Record<DemandStepId, DemandStepState>;
  onGo: (step: DemandStepId) => void;
  /** Sem rascunho ainda: só a primeira etapa está disponível. */
  locked: boolean;
}) {
  const index = DEMAND_STEPS.findIndex((s) => s.id === current);
  const done = DEMAND_STEPS.filter((s) => s.id !== "revisao" && states[s.id] !== "pendente").length;
  const total = DEMAND_STEPS.length - 1;
  const percent = Math.round((done / total) * 100);
  const step = DEMAND_STEPS[index];

  return (
    <nav aria-label="Etapas da demanda" className="app-card rounded-2xl p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
        <span>Etapa <span className="font-numeric">{step.number}</span> de <span className="font-numeric">{DEMAND_STEPS.length}</span> · {step.short}</span>
        <span className="font-numeric">{done} de {total} etapas preenchidas</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full"
        style={{ background: "var(--th-card-alt)" }}
        role="progressbar"
        aria-label="Preenchimento da demanda"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, background: "linear-gradient(135deg,#f4841a,#f89b45)" }} />
      </div>
      <ol className="mt-3 flex gap-1 overflow-x-auto pb-1 sm:grid sm:grid-cols-9 sm:overflow-visible">
        {DEMAND_STEPS.map((s) => {
          const active = s.id === current;
          const state = states[s.id];
          const disabled = locked && s.id !== "classificacao";
          const color = active ? "#f4841a" : state === "completa" ? "#2e9e5b" : "var(--th-muted)";
          return (
            <li key={s.id} className="shrink-0 sm:shrink">
              <button
                type="button"
                onClick={() => onGo(s.id)}
                disabled={disabled || active}
                aria-current={active ? "step" : undefined}
                className="flex w-full min-w-[4.5rem] flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-center transition-colors disabled:cursor-default enabled:hover:bg-[var(--th-card-alt)]"
                style={{ opacity: disabled ? 0.45 : 1 }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold font-numeric"
                  style={{
                    borderColor: color,
                    background: active ? "#f4841a" : state === "completa" ? "rgba(46,158,91,0.12)" : "transparent",
                    color: active ? "#fff" : color,
                  }}
                  aria-hidden
                >
                  {state === "completa" && !active ? <Icon name="check" size={14} /> : s.number}
                </span>
                <span aria-hidden className="text-[11px] font-semibold leading-tight" style={{ color: active ? "var(--th-text)" : "var(--th-muted)" }}>
                  {s.short}
                </span>
                <span className="sr-only">
                  Etapa {s.number}: {s.title}, {STATE_TEXT[state]}{active ? " (atual)" : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
