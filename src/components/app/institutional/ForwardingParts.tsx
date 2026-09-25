/**
 * Leitura dos encaminhamentos da demanda (T14), sem estado: servem à página
 * pública (SSR) e à área institucional. Mostram órgão de origem, órgão
 * responsável, setor de destino, data, status, providências e atualizações
 * posteriores (histórico de tramitação). O responsável pelo encaminhamento e o
 * representante só aparecem na visão dos órgãos envolvidos (`Forwarding`).
 */
import type { ReactNode } from "react";
import type { Forwarding, ForwardingStatus, PublicForwarding } from "@/lib/app/types";
import {
  FORWARDING_DESTINATION_KIND_LABELS,
  FORWARDING_STATUS_COLORS,
  FORWARDING_STATUS_LABELS,
  FORWARDING_UPDATE_KIND_LABELS,
  forwardingDestinationLabel,
} from "@/lib/app/institutional";
import { formatDate } from "@/lib/app/format";
import { formatDay } from "@/lib/app/deadlines";
import { Icon } from "../Icon";

const SPHERE_LABELS: Record<string, string> = { municipal: "municipal", estadual: "estadual", federal: "federal" };

export function ForwardingStatusBadge({ status }: { status: ForwardingStatus }) {
  const color = FORWARDING_STATUS_COLORS[status] ?? "#4a6f88";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {FORWARDING_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function isPrivate(f: PublicForwarding | Forwarding): f is Forwarding {
  return "direction" in f;
}

function destinationPlace(f: PublicForwarding): string | null {
  const parts = [
    f.destinationSphere ? `Esfera ${SPHERE_LABELS[f.destinationSphere] ?? f.destinationSphere}` : null,
    [f.destinationMunicipality, f.destinationUf].filter(Boolean).join("/") || null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** Histórico de tramitação: status, providências e atualizações, em ordem cronológica. */
export function ForwardingHistory({ forwarding }: { forwarding: PublicForwarding | Forwarding }) {
  const showAuthor = isPrivate(forwarding);
  return (
    <ol className="space-y-2 border-l-2 pl-3" style={{ borderColor: "var(--th-border)" }} aria-label="Histórico de tramitação">
      <li>
        <p className="text-xs font-semibold" style={{ color: "var(--th-text)" }}>
          Encaminhado por {forwarding.originOrganizationName}
        </p>
        <p className="text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>{formatDate(forwarding.forwardedAt)}</p>
      </li>
      {forwarding.updates.map((u) => (
        <li key={u.id}>
          <p className="text-xs font-semibold" style={{ color: "var(--th-text)" }}>
            {u.kind === "status" && u.toStatus
              ? `${u.organizationName}: ${FORWARDING_STATUS_LABELS[u.toStatus].toLowerCase()}`
              : `${FORWARDING_UPDATE_KIND_LABELS[u.kind]} · ${u.organizationName}`}
          </p>
          {u.body && <p className="whitespace-pre-line text-xs" style={{ color: "var(--th-text)" }}>{u.body}</p>}
          <p className="text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>
            {formatDate(u.createdAt)}{showAuthor && u.authorName ? ` · por ${u.authorName}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Um encaminhamento: origem → destino, status, motivo, datas e tramitação. */
export function ForwardingCard({ forwarding, children }: { forwarding: PublicForwarding | Forwarding; children?: ReactNode }) {
  const priv = isPrivate(forwarding) ? forwarding : null;
  const place = destinationPlace(forwarding);
  return (
    <article className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold" style={{ color: "var(--th-text)" }}>
            <span>{forwarding.originOrganizationName}</span>
            <Icon name="chevronRight" size={14} style={{ color: "var(--th-muted)" }} />
            <span>{forwardingDestinationLabel(forwarding)}</span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
            {FORWARDING_DESTINATION_KIND_LABELS[forwarding.destinationKind]}
            {forwarding.destinationKind === "setor_interno" ? ` de ${forwarding.destinationOrganizationName}` : ""}
            {place ? ` · ${place}` : ""} · encaminhado em {formatDate(forwarding.forwardedAt)}
            {forwarding.dueOn ? ` · prazo até ${formatDay(forwarding.dueOn)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {priv && (
            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>
              {priv.direction === "enviado" ? "Enviado pelo órgão" : "Recebido pelo órgão"}
            </span>
          )}
          <ForwardingStatusBadge status={forwarding.status} />
        </div>
      </div>
      <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{forwarding.reason}</p>
      {forwarding.statusNote && (
        <p className="mt-1 text-xs" style={{ color: "var(--th-text)" }}>
          <strong>{forwarding.status === "devolvido" ? "Motivo da devolução: " : "Observação: "}</strong>{forwarding.statusNote}
        </p>
      )}
      {priv && (priv.responsibleName || priv.forwardedByName) && (
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
          Responsável pelo encaminhamento: {priv.responsibleName ?? priv.forwardedByName}
          {priv.responsibleRole ? ` (${priv.responsibleRole})` : ""} · uso interno, não aparece na página pública
        </p>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold" style={{ color: "#2e7ba8" }}>
          Histórico de tramitação ({forwarding.updates.length + 1})
        </summary>
        <div className="mt-2"><ForwardingHistory forwarding={forwarding} /></div>
      </details>
      {children}
    </article>
  );
}

/** Lista pública da tramitação (página da demanda). */
export function PublicForwardingList({ forwardings }: { forwardings: PublicForwarding[] }) {
  return (
    <ul className="space-y-3">
      {forwardings.map((f) => <li key={f.id}><ForwardingCard forwarding={f} /></li>)}
    </ul>
  );
}
