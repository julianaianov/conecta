/**
 * Peças de leitura da atuação institucional (T13), sem estado: servem à página
 * pública da demanda (SSR) e à área institucional do Poder Público. Mostram o
 * órgão, nunca o representante. Ordem cronológica, sem comparar órgãos
 * (neutralidade: não há ranking do Poder Público).
 */
import type {
  InstitutionalOffer,
  InstitutionalResponse,
  InstitutionalStatus,
  PublicDemandInstitutional,
  PublicInstitutionalTrack,
} from "@/lib/app/types";
import {
  INSTITUTIONAL_STATUS_COLORS,
  INSTITUTIONAL_STATUS_LABELS,
  LEGACY_INSTITUTIONAL_STATUS_LABELS,
  RESPONSE_TYPE_LABELS,
  supportTypeLabel,
} from "@/lib/app/institutional";
import { formatDate } from "@/lib/app/format";
import { formatIsoDate } from "@/lib/app/demand";
import { Icon } from "../Icon";
import { ReadSection } from "../demand/DemandParts";
import { PublicForwardingList } from "./ForwardingParts";

const SPHERE_LABELS: Record<string, string> = { municipal: "Municipal", estadual: "Estadual", federal: "Federal" };

export function InstitutionalStatusBadge({ status }: { status: InstitutionalStatus }) {
  const color = INSTITUTIONAL_STATUS_COLORS[status] ?? "#4a6f88";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: `${color}1a`, color }}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {INSTITUTIONAL_STATUS_LABELS[status] ?? LEGACY_INSTITUTIONAL_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function organizationPlace(track: Pick<PublicInstitutionalTrack, "governmentSphere" | "department" | "municipality" | "uf">): string {
  return [
    track.governmentSphere ? `Esfera ${SPHERE_LABELS[track.governmentSphere]?.toLowerCase() ?? track.governmentSphere}` : null,
    track.department,
    [track.municipality, track.uf].filter(Boolean).join("/") || null,
  ].filter(Boolean).join(" · ");
}

export function OrganizationTrackList({ organizations }: { organizations: PublicInstitutionalTrack[] }) {
  return (
    <ul className="space-y-2">
      {organizations.map((org) => (
        <li key={org.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--th-text)" }}>
              <Icon name="building" size={16} style={{ color: "#2e7ba8" }} /> {org.organizationName}
            </p>
            <InstitutionalStatusBadge status={org.status} />
          </div>
          {organizationPlace(org) && <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{organizationPlace(org)}</p>}
          <p className="mt-1 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
            Recebida em {formatDate(org.receivedAt)}
            {org.statusChangedAt !== org.receivedAt ? ` · atualizada em ${formatDate(org.statusChangedAt)}` : ""}
          </p>
          {org.statusNote && <p className="mt-2 text-sm" style={{ color: "var(--th-text)" }}>{org.statusNote}</p>}
        </li>
      ))}
    </ul>
  );
}

export function ResponseList({ responses, showAuthor = false }: { responses: InstitutionalResponse[]; showAuthor?: boolean }) {
  return (
    <ol className="space-y-3">
      {responses.map((r) => (
        <li key={r.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{RESPONSE_TYPE_LABELS[r.type] ?? r.type}</p>
            <InstitutionalStatusBadge status={r.institutionalStatus} />
          </div>
          <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
            {r.organizationName} · {formatDate(r.createdAt)}{showAuthor && r.authorName ? ` · por ${r.authorName}` : ""}
          </p>
          <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{r.body}</p>
          {(r.responsibleSector || r.programName || r.plannedFor) && (
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2" style={{ color: "var(--th-muted)" }}>
              {r.responsibleSector && <div><dt className="inline font-semibold">Órgão ou setor responsável: </dt><dd className="inline">{r.responsibleSector}</dd></div>}
              {r.programName && (
                <div>
                  <dt className="inline font-semibold">Programa ou serviço: </dt>
                  <dd className="inline">
                    {r.programUrl
                      ? <a href={r.programUrl} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline" style={{ color: "#2e7ba8" }}>{r.programName}</a>
                      : r.programName}
                  </dd>
                </div>
              )}
              {r.plannedFor && <div><dt className="inline font-semibold">Data prevista: </dt><dd className="inline font-numeric">{formatIsoDate(r.plannedFor)}</dd></div>}
            </dl>
          )}
        </li>
      ))}
    </ol>
  );
}

export function OfferList({ offers }: { offers: InstitutionalOffer[] }) {
  return (
    <ul className="space-y-3">
      {offers.map((o) => (
        <li key={o.id} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{o.organizationName}</p>
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>{formatDate(o.createdAt)}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {o.supportTypes.map((t) => (
              <span key={t} className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(46,158,91,0.12)", color: "#2e9e5b" }}>
                {supportTypeLabel(t)}
              </span>
            ))}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{o.description}</p>
        </li>
      ))}
    </ul>
  );
}

/** Seção "Respostas institucionais" da página pública da demanda. */
export function PublicInstitutionalSection({ data }: { data: PublicDemandInstitutional | null }) {
  const forwardings = data?.forwardings ?? [];
  const empty = !data || (!data.organizations.length && !data.responses.length && !data.offers.length && !forwardings.length);
  return (
    <ReadSection title="Respostas institucionais" icon="building">
      <p className="text-xs" style={{ color: "var(--th-muted)" }}>
        Registro público da atuação do Poder Público nesta demanda: recebimento, respostas, status por órgão, encaminhamentos e apoio oferecido.
      </p>
      {empty ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>Nenhum órgão do Poder Público registrou atuação nesta demanda até agora.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {data.organizations.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Status por órgão</h3>
              <OrganizationTrackList organizations={data.organizations} />
            </div>
          )}
          {data.responses.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Respostas</h3>
              <ResponseList responses={data.responses} />
            </div>
          )}
          {forwardings.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Encaminhamentos e tramitação</h3>
              <PublicForwardingList forwardings={forwardings} />
            </div>
          )}
          {data.offers.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Apoio oferecido</h3>
              <OfferList offers={data.offers} />
            </div>
          )}
        </div>
      )}
    </ReadSection>
  );
}
