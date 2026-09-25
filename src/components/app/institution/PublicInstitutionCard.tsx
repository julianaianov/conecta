import Link from "next/link";
import { formatDate } from "@/lib/app/format";
import { safeWebsite } from "@/lib/app/institution";
import {
  GOVERNMENT_SPHERE_LABELS,
  INSTITUTION_KIND_LABELS,
  formatCnae,
  formatCnpj,
  type PublicInstitution,
} from "@/lib/app/types";
import { Icon } from "../Icon";

/** Selo compacto ao lado do nome do perfil. */
export function InstitutionSeal({ institution }: { institution: PublicInstitution }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={{ background: "rgba(46,158,91,0.12)", color: "#2e9e5b" }}
      title={`${INSTITUTION_KIND_LABELS[institution.kind]}: instituição validada pela equipe do DM Conecta`}
    >
      <Icon name="shield" size={12} strokeWidth={2.4} />
      Instituição validada
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>{label}</dt>
      <dd className="mt-0.5 text-sm" style={{ color: "var(--th-text)" }}>{children}</dd>
    </div>
  );
}

/**
 * Dados públicos da instituição validada (projeção pública do user-service:
 * sem contatos, endereço completo nem representante). Na página pública da
 * demanda aparece como "Publicada por", com link ao perfil (T-02-02).
 */
export function PublicInstitutionCard({
  institution, title = "Instituição validada", profileHref = null,
}: {
  institution: PublicInstitution;
  title?: string;
  profileHref?: string | null;
}) {
  const name = institution.tradeName || institution.legalName;
  const website = safeWebsite(institution.website);
  const place = [institution.municipality, institution.uf].filter(Boolean).join("/");

  return (
    <section aria-labelledby="public-institution-title" className="app-card overflow-hidden rounded-2xl" style={{ boxShadow: "0 4px 16px rgba(13,45,66,0.05)" }}>
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--th-border)", borderLeft: "3px solid #2e9e5b" }}>
        <Icon name="shield" size={15} style={{ color: "#2e9e5b" }} />
        <h2 id="public-institution-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{title}</h2>
        {title !== "Instituição validada" && <span className="ml-auto"><InstitutionSeal institution={institution} /></span>}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-base font-bold leading-tight" style={{ color: "var(--th-text)" }}>{name}</p>
          {institution.tradeName && institution.tradeName !== institution.legalName && (
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>{institution.legalName}</p>
          )}
          <p className="mt-1 text-xs font-semibold" style={{ color: "#2e7ba8" }}>{INSTITUTION_KIND_LABELS[institution.kind]}</p>
        </div>
        <dl className="grid gap-3">
          <Row label="CNPJ"><span className="font-numeric">{formatCnpj(institution.cnpj)}</span></Row>
          {institution.kind === "agente_transformacao" && institution.cnaePrimary && (
            <Row label="CNAE principal">
              <span className="font-numeric">{formatCnae(institution.cnaePrimary)}</span>
              {institution.cnaePrimaryDescription ? ` — ${institution.cnaePrimaryDescription}` : ""}
            </Row>
          )}
          {institution.cnaeSecondary.length > 0 && (
            <Row label="CNAEs secundários">
              <ul className="space-y-0.5">
                {institution.cnaeSecondary.map((c) => (
                  <li key={c.code}><span className="font-numeric">{formatCnae(c.code)}</span>{c.description ? ` — ${c.description}` : ""}</li>
                ))}
              </ul>
            </Row>
          )}
          {institution.governmentSphere && <Row label="Esfera">{GOVERNMENT_SPHERE_LABELS[institution.governmentSphere]}</Row>}
          {institution.department && <Row label="Secretaria, órgão ou departamento">{institution.department}</Row>}
          {institution.competenceAreas.length > 0 && (
            <Row label="Áreas de competência">
              <ul className="mt-1 flex flex-wrap gap-1.5">
                {institution.competenceAreas.map((area) => (
                  <li key={area} className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--th-card-alt)", color: "var(--th-text)" }}>{area}</li>
                ))}
              </ul>
            </Row>
          )}
          {institution.territory && <Row label="Território de atuação">{institution.territory}</Row>}
          {place && <Row label="Município">{place}</Row>}
          {website && (
            <Row label="Site">
              <a href={website} target="_blank" rel="noopener noreferrer nofollow" className="break-all font-semibold underline" style={{ color: "#2e7ba8" }}>{website}</a>
            </Row>
          )}
        </dl>
        {institution.validatedAt && (
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>Validada pela equipe do DM Conecta em {formatDate(institution.validatedAt)}.</p>
        )}
        {profileHref && (
          <Link href={profileHref} className="inline-flex items-center gap-1 text-sm font-semibold hover:underline" style={{ color: "#2e7ba8" }}>
            Ver perfil de quem publicou <Icon name="chevronRight" size={14} />
          </Link>
        )}
      </div>
    </section>
  );
}
