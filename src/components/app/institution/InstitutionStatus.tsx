"use client";

import Link from "next/link";
import { formatDate } from "@/lib/app/format";
import {
  INSTITUTION_EVENT_ACTOR_LABELS,
  INSTITUTION_HUB_PATH,
  INSTITUTION_STATUS_COLORS,
  INSTITUTION_STATUS_GUIDANCE,
  institutionGateMessage,
  type GatedAction,
} from "@/lib/app/institution";
import {
  INSTITUTION_STATUS_LABELS,
  type Institution,
  type InstitutionKind,
  type InstitutionValidationStatus,
} from "@/lib/app/types";
import { Icon, type IconName } from "../Icon";

const STATUS_ICONS: Record<InstitutionValidationStatus, IconName> = {
  pendente: "edit",
  em_analise: "clock",
  validada: "shield",
  devolvida: "info",
  revogada: "close",
};

export function InstitutionStatusBadge({ status }: { status: InstitutionValidationStatus }) {
  const color = INSTITUTION_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold" style={{ background: `${color}1a`, color }}>
      <Icon name={STATUS_ICONS[status]} size={13} />
      {INSTITUTION_STATUS_LABELS[status]}
    </span>
  );
}

function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Estado, parecer da equipe e trilha de eventos do cadastro do titular. */
export function InstitutionStatusCard({ institution }: { institution: Institution }) {
  const { status } = institution;
  const color = INSTITUTION_STATUS_COLORS[status];
  const showNote = (status === "devolvida" || status === "revogada") && institution.validationNote;
  const events = [...institution.events].reverse();

  return (
    <section aria-labelledby="inst-status-title" className="app-card overflow-hidden rounded-2xl" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="inst-status-title" className="text-base font-bold" style={{ color: "var(--th-text)" }}>Situação do cadastro</h2>
          <InstitutionStatusBadge status={status} />
        </div>
        <p className="mt-2 text-sm" style={{ color: "var(--th-text)" }}>{INSTITUTION_STATUS_GUIDANCE[status]}</p>

        {showNote && (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: `${color}66`, background: `${color}10` }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color }}>Parecer da equipe</p>
            <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{institution.validationNote}</p>
            {institution.reviewedAt && <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{dateTime(institution.reviewedAt)}</p>}
          </div>
        )}

        <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2" style={{ color: "var(--th-muted)" }}>
          {institution.submittedAt && <div><dt className="inline">Último envio: </dt><dd className="inline font-numeric">{dateTime(institution.submittedAt)}</dd></div>}
          {status === "validada" && institution.reviewedAt && <div><dt className="inline">Validada em: </dt><dd className="inline font-numeric">{formatDate(institution.reviewedAt)}</dd></div>}
          {institution.updatedAt && <div><dt className="inline">Última alteração: </dt><dd className="inline font-numeric">{dateTime(institution.updatedAt)}</dd></div>}
        </dl>

        {events.length > 0 && (
          <details className="mt-4 group" open={status === "devolvida" || status === "revogada"}>
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: "#2e7ba8" }}>
              Histórico da validação ({events.length})
            </summary>
            <ol className="mt-3 space-y-3 border-l-2 pl-4" style={{ borderColor: "var(--th-border)" }}>
              {events.map((event, i) => {
                const c = INSTITUTION_STATUS_COLORS[event.toStatus];
                return (
                  <li key={`${event.createdAt}-${i}`} className="relative">
                    <span aria-hidden className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2" style={{ borderColor: c, background: "var(--th-card)" }} />
                    <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                      {INSTITUTION_STATUS_LABELS[event.toStatus]}
                      <span className="font-normal" style={{ color: "var(--th-muted)" }}> · {INSTITUTION_EVENT_ACTOR_LABELS[event.actorType]}</span>
                    </p>
                    <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{dateTime(event.createdAt)}</p>
                    {event.note && <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{event.note}</p>}
                  </li>
                );
              })}
            </ol>
          </details>
        )}
      </div>
    </section>
  );
}

/** Aviso amigável para o 403 `institution_not_validated`. */
export function InstitutionGateNotice({ action, status, kind }: {
  action: GatedAction;
  status: InstitutionValidationStatus | null;
  kind?: InstitutionKind;
}) {
  return (
    <div role="alert" className="rounded-xl border p-3" style={{ borderColor: "rgba(46,123,168,0.35)", background: "rgba(46,123,168,0.08)" }}>
      <p className="flex items-start gap-2 text-sm" style={{ color: "var(--th-text)" }}>
        <Icon name="shield" size={16} className="mt-0.5 shrink-0" style={{ color: "#2e7ba8" }} />
        <span>{institutionGateMessage(action, status, kind)}</span>
      </p>
      <Link href={INSTITUTION_HUB_PATH} className="mt-2 inline-flex text-sm font-bold" style={{ color: "#f4841a" }}>
        {status === "em_analise" ? "Acompanhar o cadastro institucional →" : "Ir para o cadastro institucional →"}
      </Link>
    </div>
  );
}
