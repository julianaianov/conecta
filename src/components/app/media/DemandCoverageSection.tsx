/**
 * Seção "Divulgação" da página pública da demanda (T28): divulgações
 * publicadas pela Comunicação — veículo, data e endereço da matéria. Nunca o
 * nome nem o id da conta. Some quando não há cobertura. Serve ao SSR.
 */
import { PROFILE_LABELS, type DemandCoverage } from "@/lib/app/types";
import { formatIsoDay } from "@/lib/app/media";
import { ReadSection } from "../demand/DemandParts";
import { Icon } from "../Icon";

export function DemandCoverageSection({ coverage }: { coverage: DemandCoverage[] }) {
  if (!coverage.length) return null;
  return (
    <ReadSection title="Divulgação" icon="megaphone">
      <p className="mb-3 text-xs" style={{ color: "var(--th-muted)" }}>
        Matérias e conteúdos publicados por veículos e profissionais de comunicação sobre esta demanda.
      </p>
      <ul className="space-y-2">
        {coverage.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ background: "var(--th-card-alt)" }}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold" style={{ color: "var(--th-text)" }}>{c.outletName}</span>
              <span className="block text-xs" style={{ color: "var(--th-muted)" }}>
                {formatIsoDay(c.publishedOn)}
                {c.profileType && PROFILE_LABELS[c.profileType] ? ` · ${PROFILE_LABELS[c.profileType]}` : ""}
              </span>
            </span>
            <a
              href={c.publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-semibold"
              style={{ color: "#f4841a" }}
            >
              <Icon name="link" size={14} /> Ler a matéria
            </a>
          </li>
        ))}
      </ul>
    </ReadSection>
  );
}
