import Link from "next/link";
import {
  DEMAND_PRIORITY_LABELS,
  type DemandTimelineEvent,
  type PublicDemand,
  type PublicDemandExecution,
  type PublicDemandInstitutional,
  type PublicDemandAccountabilityView,
  type PublicDossierInfo,
  type DemandCoverage,
  type PublicInstitution,
} from "@/lib/app/types";
import { DOSSIER_TITLE, formatBytesShort, publicDossierDownloadPath, shortHash } from "@/lib/app/dossier";
import { resolveMediaUrl } from "@/lib/app/uploads";
import { runtime } from "@/lib/app/runtime";
import { DEMAND_PRIORITY_CRITERION_LABELS, formatIsoDate, timelineEventLabel } from "@/lib/app/demand";
import { formatDate } from "@/lib/app/format";
import { ShareButton } from "../ShareButton";
import { ReportButton } from "../ReportButton";
import { Avatar } from "../Avatar";
import { Icon } from "../Icon";
import { DemandMap } from "./DemandMap";
import { InstitutionSeal, PublicInstitutionCard } from "../institution/PublicInstitutionCard";
import { PublicInstitutionalSection } from "../institutional/InstitutionalParts";
import { institutionalTimelineDetail } from "@/lib/app/institutional";
import { interestTimelineDetail } from "@/lib/app/interest";
import { supportTimelineDetail } from "@/lib/app/support";
import { executionTimelineDetail } from "@/lib/app/execution";
import { accountabilityTimelineDetail } from "@/lib/app/accountability";
import { mediaTimelineDetail } from "@/lib/app/media";
import { DemandCoverageSection } from "../media/DemandCoverageSection";
import { DemandProcessesSection } from "../process/ProcessParts";
import { DemandExecutionSection } from "../execution/DemandExecutionSection";
import { DemandAccountabilitySection } from "../accountability/DemandAccountabilitySection";
import { DemandInterestPanel } from "../interest/DemandInterestPanel";
import { DemandSupportBlock } from "../support/DemandSupportPanel";
import { ViewerComposition } from "../institutional/ViewerComposition";
import {
  BudgetTable,
  CategoryBadge,
  ModuleDetailsBlock,
  DemandStatusBadge,
  DocumentsSummary,
  GoalsList,
  PriorityBadge,
  ReadSection,
  ResourcesSummary,
  ScheduleList,
  StatusTrack,
  TextBlock,
} from "./DemandParts";

function schedulePeriod(items: PublicDemand["scheduleItems"]): string {
  if (!items.length) return "";
  const starts = items.map((i) => i.startsOn).sort();
  const ends = items.map((i) => i.endsOn).sort();
  return `${formatIsoDate(starts[0])} a ${formatIsoDate(ends[ends.length - 1])}`;
}

/**
 * Página pública da demanda (T09): só a projeção pública do post-service
 * (sem CEP, logradouro, número, complemento, instituição interna, parecer,
 * responsável do cronograma nem link de documento).
 */
/**
 * Versão pública do Dossiê da Demanda (T10): gerada na publicação, sem
 * endereço completo, contatos nem responsáveis. O botão baixa pelo
 * post-service, que redireciona para uma URL assinada curta.
 */
function PublicDossierSection({ demandId, dossier }: { demandId: string; dossier: PublicDossierInfo | null }) {
  const href = resolveMediaUrl(publicDossierDownloadPath(demandId), runtime.apiBase);
  const info = dossier?.available ? dossier.dossier : null;
  return (
    <ReadSection title="Documento oficial" icon="document">
      <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{DOSSIER_TITLE}</p>
      {info ? (
        <>
          <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
            {info.number} · versão {info.version} (pública) · gerado em {formatDate(info.generatedAt)}
            {info.sizeBytes ? ` · ${formatBytesShort(info.sizeBytes)}` : ""}
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
            Reúne identificação do Agente, demanda, orçamento, planejamento, recursos e documentação, sem endereço completo nem dados de contato.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={href} className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#0d2d42,#1b4f72)" }}>
              <Icon name="download" size={17} /> Baixar dossiê (PDF)
            </a>
            <Link href={info.verifyPath} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
              <Icon name="shield" size={17} /> Verificar autenticidade
            </Link>
          </div>
          <p className="mt-2 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>SHA-256 do conteúdo: {shortHash(info.contentSha256)}</p>
        </>
      ) : (
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          {dossier?.status === "indisponivel"
            ? "O documento desta demanda ainda não está disponível para download neste ambiente."
            : "O documento desta demanda está sendo gerado. Volte em alguns minutos."}
        </p>
      )}
    </ReadSection>
  );
}

export function PublicDemandView({
  demand, timeline, dossier = null, institutional = null, execution = null, accountability = null, coverage = [],
  institution = null,
}: {
  demand: PublicDemand;
  /**
   * Instituição responsável pela publicação (slides 4 e 19): projeção pública
   * do user-service, só quando validada; sem contatos do representante.
   */
  institution?: PublicInstitution | null;
  timeline: DemandTimelineEvent[];
  dossier?: PublicDossierInfo | null;
  /** Respostas institucionais e status por órgão (T13). */
  institutional?: PublicDemandInstitutional | null;
  /** Histórico visual antes/depois e acompanhamento da execução (T17). */
  execution?: PublicDemandExecution | null;
  /** Resultados e prestação de contas, quando concluída (T18/T19). */
  accountability?: PublicDemandAccountabilityView | null;
  /** Divulgações publicadas pela Comunicação (T28). */
  coverage?: DemandCoverage[];
}) {
  const place = [demand.territory, demand.district !== demand.territory ? demand.district : null, [demand.municipality, demand.uf].filter(Boolean).join("/")]
    .filter(Boolean).join(" · ");
  const profileHref = `/perfil/${encodeURIComponent(demand.authorId)}`;
  const period = schedulePeriod(demand.scheduleItems);

  return (
    <article className="mx-auto max-w-3xl space-y-4" aria-labelledby="demand-title">
      <div className="app-card overflow-hidden rounded-2xl">
        {demand.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={demand.photoUrl} alt={`Fotografia: ${demand.title}`} className="max-h-96 w-full object-cover" />
        )}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={demand.category} />
            <DemandStatusBadge status={demand.status} />
            <PriorityBadge priority={demand.priority} />
          </div>
          <h1 id="demand-title" className="mt-3 text-2xl font-bold leading-tight sm:text-3xl" style={{ color: "var(--th-text)" }}>{demand.title}</h1>
          <div className="mt-3 flex items-center gap-3">
            <Link href={profileHref} aria-label={`Perfil de ${demand.authorName ?? "quem publicou"}`}>
              <Avatar name={demand.authorName ?? "Agente de Transformação"} src={demand.authorAvatar} id={demand.authorId} size={40} />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={profileHref} className="text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>{demand.authorName ?? "Agente de Transformação"}</Link>
                {institution && <InstitutionSeal institution={institution} />}
              </div>
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                Agente de Transformação{demand.publishedAt ? ` · publicada em ${formatDate(demand.publishedAt)}` : ""}
              </p>
            </div>
          </div>
          {place && (
            <p className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: "var(--th-muted)" }}>
              <Icon name="location" size={15} /> {place}
            </p>
          )}
          {/* Amplificação (T21): compartilhar a demanda e registrar o compartilhamento. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ShareButton
              targetKind="demand"
              targetId={demand.id}
              path={`/demandas/${encodeURIComponent(demand.id)}`}
              title={demand.title}
              text={`${demand.title} — DM Conecta`}
              sharesCount={demand.sharesCount ?? 0}
            />
            {/* Denúncia da demanda (T6.3). */}
            <ReportButton
              targetKind="demanda"
              targetId={demand.id}
              targetOwnerId={demand.authorId}
              targetLabel="esta demanda"
            />
          </div>
          <div className="mt-4"><StatusTrack status={demand.status} /></div>
          <div className="mt-5 space-y-4">
            <TextBlock label="Descrição">{demand.description}</TextBlock>
            <TextBlock label="Objetivo">{demand.objective}</TextBlock>
            <TextBlock label="Justificativa">{demand.justification}</TextBlock>
            <ModuleDetailsBlock module={demand.module} moduleLabel={demand.moduleLabel} moduleDetails={demand.moduleDetails} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {/* O apoio à demanda é registrado no painel desta página (T16, T-04-01), não no post-vitrine. */}
            <a href="#registrar-apoio" className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)" }}>
              <Icon name="volunteer" size={17} /> Apoiar esta demanda
            </a>
            {demand.postId && (
              <Link href={`/post/${encodeURIComponent(demand.postId)}`} className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
                <Icon name="comment" size={17} /> Acompanhar no pulso
              </Link>
            )}
            <Link href="/mapa" className="inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
              <Icon name="map" size={17} /> Ver no território
            </Link>
          </div>
        </div>
      </div>

      {/* Instituição responsável pela publicação (T-02-02): razão social, CNPJ, CNAE e selo. */}
      {institution && <PublicInstitutionCard institution={institution} title="Publicada por" profileHref={profileHref} />}

      <DemandInterestPanel demandId={demand.id} authorId={demand.authorId} postId={demand.postId} />

      {/* Registro de apoio realizado e histórico de apoio (T16, slides 20 e 21). */}
      <DemandSupportBlock demandId={demand.id} authorId={demand.authorId} />

      <ReadSection title="Público beneficiado" icon="groups">
        <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
          <div>
            <p className="font-numeric text-3xl font-bold" style={{ color: "#f4841a" }}>{demand.beneficiariesEstimate.toLocaleString("pt-BR")}</p>
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>pessoas beneficiadas (estimativa)</p>
            <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Prioridade: <strong style={{ color: "var(--th-text)" }}>{DEMAND_PRIORITY_LABELS[demand.priority]}</strong></p>
            {demand.priorityCriteria && demand.priorityCriteria.length > 0 && (
              <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                Critérios: {demand.priorityCriteria.map((c) => DEMAND_PRIORITY_CRITERION_LABELS[c] ?? c).join("; ")}
              </p>
            )}
          </div>
          <TextBlock label="Perfil dos beneficiários">{demand.beneficiariesProfile}</TextBlock>
        </div>
      </ReadSection>

      {demand.latitude != null && demand.longitude != null && (
        <ReadSection title="Localização" icon="location">
          <DemandMap latitude={demand.latitude} longitude={demand.longitude} label={`Mapa com o local da demanda ${demand.title}${place ? `, ${place}` : ""}`} />
        </ReadSection>
      )}

      <ReadSection title="Orçamento e composição financeira" icon="payments">
        <BudgetTable items={demand.budgetItems} />
        {/* Decisão 14: o Poder Público vê só o orçamento original. */}
        <div className="mt-4"><ViewerComposition composition={demand.composition} /></div>
        <p className="mt-3 text-xs" style={{ color: "var(--th-muted)" }}>
          A plataforma não processa pagamentos: os valores servem à transparência, ao dossiê e à prestação de contas.
        </p>
      </ReadSection>

      <ReadSection title="Cronograma" icon="calendar" action={period ? <span className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{period}</span> : undefined}>
        <ScheduleList items={demand.scheduleItems} budgetItems={demand.budgetItems} />
      </ReadSection>

      <ReadSection title="Metas e indicadores" icon="trophy">
        <GoalsList goals={demand.goals} />
      </ReadSection>

      <ReadSection title="Recursos e contrapartida" icon="inventory">
        <ResourcesSummary resources={demand.resources} />
      </ReadSection>

      {demand.documents.length > 0 && (
        <ReadSection title="Documentação comprobatória" icon="shield">
          <p className="mb-3 text-xs" style={{ color: "var(--th-muted)" }}>Os arquivos ficam disponíveis para a análise da plataforma; aqui aparecem o tipo e o nome.</p>
          <DocumentsSummary documents={demand.documents} />
        </ReadSection>
      )}

      <PublicDossierSection demandId={demand.id} dossier={dossier} />

      <PublicInstitutionalSection data={institutional} />

      {/* Processos de conexão formalizados, com protocolo (T-05-01, Modelo §11 e §28). */}
      <DemandProcessesSection demandId={demand.id} />

      {/* Histórico visual antes/depois e acompanhamento da execução (T17). */}
      <DemandExecutionSection execution={execution} />

      {/* Resultados e prestação de contas (T18, slide 24; transparência T19). */}
      <DemandAccountabilitySection data={accountability} />

      {/* Amplificação: divulgações publicadas pela Comunicação (T28). */}
      <DemandCoverageSection coverage={coverage} />

      <ReadSection title="Linha do tempo" icon="clock">
        {timeline.length ? (
          <ol className="space-y-3 border-l-2 pl-4" style={{ borderColor: "var(--th-border)" }}>
            {timeline.map((event) => (
              <li key={event.id} className="relative">
                <span aria-hidden className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2" style={{ borderColor: "#f4841a", background: "var(--th-card)" }} />
                <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{timelineEventLabel(event)}</p>
                {(institutionalTimelineDetail(event) ?? interestTimelineDetail(event) ?? supportTimelineDetail(event) ?? executionTimelineDetail(event) ?? accountabilityTimelineDetail(event) ?? mediaTimelineDetail(event)) && (
                  <p className="mt-0.5 line-clamp-2 text-xs" style={{ color: "var(--th-text)" }}>
                    {institutionalTimelineDetail(event) ?? interestTimelineDetail(event) ?? supportTimelineDetail(event) ?? executionTimelineDetail(event) ?? accountabilityTimelineDetail(event) ?? mediaTimelineDetail(event)}
                  </p>
                )}
                <p className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{formatDate(event.createdAt)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm" style={{ color: "var(--th-muted)" }}>Sem registros públicos ainda.</p>
        )}
      </ReadSection>
    </article>
  );
}
