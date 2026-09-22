// Histórico visual (antes/depois) e acompanhamento público da execução (T17).
// Sem estado: serve ao SSR da página da demanda (`/demandas/[id]`).
//
// Fonte: Fluxo 2, slide 23 (etapas concluídas e em andamento, cumprimento do
// cronograma, alterações de prazo, execução orçamentária, resultados parciais
// e evidências) e slide 24 (os registros de antes e depois ficam vinculados à
// demanda e compõem o histórico visual do projeto).

import {
  EVIDENCE_MEDIA_LABELS,
  RECORD_MILESTONE_LABELS,
  RECORD_MILESTONE_SHORT,
  STAGE_PROGRESS_LABELS,
  formatCents,
  formatRecordDate,
} from "@/lib/app/execution";
import type { PublicDemandEvidence, PublicDemandExecution } from "@/lib/app/types";
import { Icon } from "../Icon";
import { ReadSection } from "../demand/DemandParts";

function EvidenceFigure({ evidence, badge }: { evidence: PublicDemandEvidence; badge: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--th-border)" }}>
      <div className="relative">
        {evidence.mediaKind === "video" && evidence.url ? (
          <video src={evidence.url} controls preload="metadata" className="h-48 w-full bg-black object-cover" />
        ) : evidence.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={evidence.url}
            alt={evidence.caption ?? `${RECORD_MILESTONE_LABELS[evidence.milestone]}${evidence.stage ? ` — ${evidence.stage}` : ""}`}
            className="h-48 w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-48 w-full items-center justify-center" style={{ background: "var(--th-card-alt)" }}>
            <Icon name="eye" size={18} />
          </div>
        )}
        <span
          className="absolute left-2 top-2 rounded-md px-2 py-0.5 text-xs font-bold"
          style={{ background: "rgba(0,0,0,0.65)", color: "#fff" }}
        >
          {badge}
        </span>
      </div>
      <figcaption className="px-3 py-2">
        {evidence.caption && <p className="text-sm" style={{ color: "var(--th-text)" }}>{evidence.caption}</p>}
        <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
          {EVIDENCE_MEDIA_LABELS[evidence.mediaKind]}
          {evidence.recordedOn ? ` · registrado em ${formatRecordDate(evidence.recordedOn)}` : ""}
          {evidence.stage ? ` · ${evidence.stage}` : ""}
        </p>
      </figcaption>
    </figure>
  );
}

/** Galeria antes/depois e acompanhamento da execução na página pública. */
export function DemandExecutionSection({ execution }: { execution: PublicDemandExecution | null }) {
  if (!execution) return null;
  const paired = new Set(execution.pairs.flatMap((p) => [p.before.id, p.after.id]));
  const loose = execution.evidences.filter((e) => !paired.has(e.id));
  const hasContent = execution.evidences.length > 0
    || execution.progress.length > 0
    || Boolean(execution.recordWaiverReason);
  if (!hasContent) return null;

  return (
    <>
      {(execution.pairs.length > 0 || loose.length > 0 || execution.recordWaiverReason) && (
        <ReadSection title="Histórico visual: antes e depois" icon="eye">
          {execution.recordWaiverReason && (
            <p
              className="mb-3 rounded-xl border p-3 text-sm"
              style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)", color: "var(--th-text)" }}
            >
              <strong>Sem execução física a registrar.</strong> {execution.recordWaiverReason}
            </p>
          )}
          {execution.pairs.map((pair) => (
            <div key={`${pair.before.id}-${pair.after.id}`} className="mb-4 last:mb-0">
              {pair.stage && (
                <p className="mb-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
                  {pair.stage}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <EvidenceFigure evidence={pair.before} badge="Antes" />
                <EvidenceFigure evidence={pair.after} badge="Depois" />
              </div>
            </div>
          ))}
          {loose.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {loose.map((evidence) => (
                <EvidenceFigure
                  key={evidence.id}
                  evidence={evidence}
                  badge={RECORD_MILESTONE_SHORT[evidence.milestone]}
                />
              ))}
            </div>
          )}
          {execution.evidences.length === 0 && !execution.recordWaiverReason && (
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>Sem registros publicados ainda.</p>
          )}
        </ReadSection>
      )}

      {(execution.progress.length > 0 || execution.budgetExecution.executedCents > 0) && (
        <ReadSection title="Execução e acompanhamento" icon="clock">
          <dl className="mb-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Orçamento de execução</dt>
              <dd className="text-base font-bold font-numeric" style={{ color: "var(--th-text)" }}>
                {formatCents(execution.budgetExecution.plannedCents)}
              </dd>
            </div>
            <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
              <dt className="text-xs uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Executado até agora</dt>
              <dd className="text-base font-bold font-numeric" style={{ color: "var(--th-text)" }}>
                {formatCents(execution.budgetExecution.executedCents)}
              </dd>
            </div>
          </dl>

          {execution.schedule.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {execution.schedule.map((stage) => (
                <li
                  key={stage.scheduleItemId}
                  className="flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--th-border)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--th-text)" }}>{stage.stage}</span>
                  <span style={{ color: "var(--th-muted)" }}>
                    {stage.stageProgress ? STAGE_PROGRESS_LABELS[stage.stageProgress] : "Sem atualização"}
                  </span>
                  <span className="ml-auto text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    {formatRecordDate(stage.startsOn)} → {formatRecordDate(stage.currentEndsOn)}
                    {stage.rescheduledTo ? ` (prazo alterado, era ${formatRecordDate(stage.endsOn)})` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {execution.progress.length > 0 ? (
            <ol className="space-y-3 border-l-2 pl-4" style={{ borderColor: "var(--th-border)" }}>
              {execution.progress.map((update) => (
                <li key={update.id} className="relative">
                  <span
                    aria-hidden
                    className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2"
                    style={{ borderColor: "#f4841a", background: "var(--th-card)" }}
                  />
                  <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                    {update.stage ?? "Andamento da execução"}
                    {update.stageProgress ? ` · ${STAGE_PROGRESS_LABELS[update.stageProgress]}` : ""}
                  </p>
                  {update.partialResults && (
                    <p className="mt-0.5 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>
                      {update.partialResults}
                    </p>
                  )}
                  {update.newEndsOn && (
                    <p className="mt-0.5 text-xs" style={{ color: "var(--th-text)" }}>
                      Novo término em {formatRecordDate(update.newEndsOn)}
                      {update.deadlineReason ? ` — ${update.deadlineReason}` : ""}
                    </p>
                  )}
                  <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                    {update.onSchedule === true ? "Dentro do cronograma" : update.onSchedule === false ? "Fora do cronograma" : ""}
                    {update.executedAmountCents > 0 ? `${update.onSchedule === null ? "" : " · "}executado ${formatCents(update.executedAmountCents)}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>Sem atualizações de andamento ainda.</p>
          )}
        </ReadSection>
      )}
    </>
  );
}
