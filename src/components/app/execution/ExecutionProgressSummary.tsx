// Percentual de execução, status das etapas e ocorrências (Modelo de Conexão
// §18–19; T-05-11). Sem estado: serve ao SSR da página pública e ao painel do
// Agente. O número vem em texto e em tabela; a barra é decorativa para quem
// enxerga e `role="progressbar"` para leitor de tela.

import type { ReactNode } from "react";
import {
  INCIDENT_IMPACT_LABELS,
  INCIDENT_KIND_LABELS,
  STAGE_PROGRESS_LABELS,
  formatPercent,
  formatRecordDate,
} from "@/lib/app/execution";
import type {
  DemandExecutionSummary,
  DemandScheduleStatus,
  DemandStageProgress,
  PublicDemandIncident,
} from "@/lib/app/types";

const STATUS_COLORS: Record<DemandStageProgress, string> = {
  nao_iniciada: "var(--th-muted)",
  em_andamento: "#2e7ba8",
  concluida: "#2e9e5b",
  atrasada: "#c2410c",
  bloqueada: "#b91c1c",
};

export function ExecutionPercentBar({ label, value, idPrefix = "exec" }: { label: string; value: number | null; idPrefix?: string }) {
  const labelId = `${idPrefix}-${label.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span id={labelId} style={{ color: "var(--th-text)" }}>{label}</span>
        <span className="font-bold font-numeric" style={{ color: "var(--th-text)" }}>{formatPercent(value)}</span>
      </div>
      <div
        role="progressbar"
        aria-labelledby={labelId}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? "sem base para o cálculo" : formatPercent(value)}
        className="mt-1 h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--th-card-alt)" }}
      >
        <div className="h-full rounded-full" style={{ width: `${width}%`, background: "#2e9e5b" }} />
      </div>
    </div>
  );
}

/** Percentual + tabela de etapas com status (§18). */
export function ExecutionProgressSummary({ summary, schedule, idPrefix = "exec" }: {
  summary?: DemandExecutionSummary;
  schedule: DemandScheduleStatus[];
  idPrefix?: string;
}) {
  if (!summary && schedule.length === 0) return null;
  return (
    <div className="space-y-3">
      {summary && (
        <div className="grid gap-3 sm:grid-cols-2">
          <ExecutionPercentBar idPrefix={idPrefix} label="Etapas concluídas" value={summary.percentComplete} />
          <ExecutionPercentBar idPrefix={idPrefix} label="Orçamento executado" value={summary.percentByAmount} />
        </div>
      )}
      {summary && (summary.stagesLate > 0 || summary.stagesBlocked > 0 || summary.incidentsOpen > 0) && (
        <p className="text-sm" style={{ color: "var(--th-text)" }}>
          {[
            summary.stagesLate > 0 ? `${summary.stagesLate} etapa(s) atrasada(s)` : "",
            summary.stagesBlocked > 0 ? `${summary.stagesBlocked} etapa(s) bloqueada(s)` : "",
            summary.incidentsOpen > 0 ? `${summary.incidentsOpen} ocorrência(s) em aberto` : "",
          ].filter(Boolean).join(" · ")}
        </p>
      )}
      {schedule.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Status das etapas do cronograma</caption>
            <thead>
              <tr style={{ color: "var(--th-muted)" }}>
                <th scope="col" className="py-1 pr-3 font-semibold">Etapa</th>
                <th scope="col" className="py-1 pr-3 font-semibold">Status</th>
                <th scope="col" className="py-1 font-semibold">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((stage) => {
                const status = stage.stageProgress ?? "nao_iniciada";
                return (
                  <tr key={stage.scheduleItemId} className="border-t" style={{ borderColor: "var(--th-border)" }}>
                    <th scope="row" className="py-1.5 pr-3 font-semibold" style={{ color: "var(--th-text)" }}>{stage.stage}</th>
                    <td className="py-1.5 pr-3">
                      <span className="font-semibold" style={{ color: STATUS_COLORS[status] }}>{STAGE_PROGRESS_LABELS[status]}</span>
                      {status === "bloqueada" && stage.blockReason && (
                        <span className="block text-xs" style={{ color: "var(--th-text)" }}>Motivo: {stage.blockReason}</span>
                      )}
                      {status === "atrasada" && stage.lateSince && (
                        <span className="block text-xs" style={{ color: "var(--th-muted)" }}>atraso registrado em {formatRecordDate(stage.lateSince)}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                      {formatRecordDate(stage.startsOn)} → {formatRecordDate(stage.currentEndsOn)}
                      {stage.rescheduledTo ? ` (prazo alterado, era ${formatRecordDate(stage.endsOn)})` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Ocorrências registradas (§19), com a resolução quando houver. */
export function ExecutionIncidentList({ incidents, renderAction }: {
  incidents: PublicDemandIncident[];
  renderAction?: (incident: PublicDemandIncident) => ReactNode;
}) {
  if (incidents.length === 0) return null;
  return (
    <ul className="space-y-2">
      {incidents.map((incident) => (
        <li key={incident.id} className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--th-border)" }}>
          <p className="font-semibold" style={{ color: "var(--th-text)" }}>
            {INCIDENT_KIND_LABELS[incident.kind]}
            {incident.stage ? ` · ${incident.stage}` : ""}
            <span className="font-normal" style={{ color: "var(--th-muted)" }}>
              {incident.occurredOn ? ` · ${formatRecordDate(incident.occurredOn)}` : ""}
              {incident.impact !== "nenhum" ? ` · impacto: ${INCIDENT_IMPACT_LABELS[incident.impact].toLowerCase()}` : ""}
            </span>
          </p>
          <p className="whitespace-pre-line" style={{ color: "var(--th-text)" }}>{incident.description}</p>
          {incident.resolved ? (
            <p className="text-xs" style={{ color: "#2e9e5b" }}>
              Resolvida{incident.resolvedAt ? ` em ${new Date(incident.resolvedAt).toLocaleDateString("pt-BR")}` : ""}
              {incident.resolution ? ` — ${incident.resolution}` : ""}
            </p>
          ) : (
            <p className="text-xs font-semibold" style={{ color: "#c2410c" }}>Em aberto</p>
          )}
          {renderAction?.(incident)}
        </li>
      ))}
    </ul>
  );
}
