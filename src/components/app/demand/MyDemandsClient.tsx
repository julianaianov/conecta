"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { useEffectiveRole } from "../institution/useInstitutionAccess";
import {
  DEMAND_ACTION_LABELS,
  DEMAND_ACTION_TARGET,
  DEMAND_NEW_PATH,
  MY_DEMANDS_PATH,
  demandEditPath,
  demandErrorMessage,
  demandGuidance,
  demandPublicPath,
  formatCents,
  isAgentTransition,
} from "@/lib/app/demand";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  DEMAND_PUBLIC_STATUSES,
  DEMAND_STATUS_LABELS,
  type Demand,
  type DemandAgentAction,
  type InstitutionValidationStatus,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Card, EmptyState } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { CategoryBadge, DemandStatusBadge, StatusTrack } from "./DemandParts";
import { DossierPanel } from "./DossierPanel";
import { DemandInterestsInbox } from "../interest/DemandInterestsInbox";
import { PotentialPartnersPanel } from "../interest/PotentialPartnersPanel";
import { DemandSupportsInbox } from "../support/DemandSupportsInbox";
import { DemandExecutionPanel } from "../execution/DemandExecutionPanel";
import { DemandAccountabilityPanel } from "../accountability/DemandAccountabilityPanel";
import { AiSuggestionPanel } from "../ai/AiSuggestionPanel";
import { FormAlert } from "./fields";
import type { IconName } from "../Icon";

function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type DemandPanel = "interessados" | "apoios" | "execucao" | "prestacao" | "dossie" | "ia";

/** Abas do detalhe da demanda em "Minhas demandas". */
const PANELS: [DemandPanel, string, IconName][] = [
  ["interessados", "Interessados e conexões", "groups"],
  ["apoios", "Apoios recebidos", "volunteer"],
  ["execucao", "Execução", "clock"],
  ["prestacao", "Prestação de contas", "trophy"],
  ["dossie", "Dossiê (PDF)", "document"],
  // Sugestões de IA (T23): sempre disponível, inclusive no rascunho. Sem IA
  // ligada, o painel diz o motivo e o trabalho segue sem sugestão.
  ["ia", "Sugestões de IA", "bolt"],
];

function DemandRow({ demand, onUpdated }: { demand: Demand; onUpdated: (next: Demand) => void }) {
  const [confirming, setConfirming] = useState<DemandAgentAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  // Abas do detalhe da demanda: interessados (T15), apoios (T16), execução
  // (T17) e dossiê (T10). Uma de cada vez, `null` fechado.
  const [panel, setPanel] = useState<DemandPanel | null>(null);
  // Dossiê existe a partir do primeiro envio para análise (T10).
  const hasDossier = Boolean(demand.submittedAt);
  const actions = demand.availableActions.filter(isAgentTransition);
  const isPublic = DEMAND_PUBLIC_STATUSES.includes(demand.status);
  const title = demand.title || "Rascunho sem título";

  async function run(action: DemandAgentAction) {
    setBusy(true);
    setError(null);
    setGate(null);
    try {
      const updated = await api.transitionDemand(demand.id, action);
      // A resposta traz a visão completa; a lista mantém a foto já assinada.
      onUpdated({ ...updated, photoUrl: updated.photoUrl ?? demand.photoUrl });
      setConfirming(null);
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
      else setError(demandErrorMessage(err, "Não foi possível atualizar o andamento agora."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <article id={`demanda-${demand.id}`} className="app-card scroll-mt-24 overflow-hidden rounded-2xl" aria-labelledby={`dm-${demand.id}-title`}>
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
          {demand.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={demand.photoUrl} alt="" className="h-32 w-full shrink-0 rounded-xl object-cover sm:h-28 sm:w-40" />
          ) : (
            <div className="hidden h-28 w-40 shrink-0 items-center justify-center rounded-xl border border-dashed text-xs sm:flex" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>Sem fotografia</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <DemandStatusBadge status={demand.status} reviewState={demand.reviewState} />
              <CategoryBadge category={demand.category} />
            </div>
            <h2 id={`dm-${demand.id}-title`} className="mt-2 text-base font-bold leading-snug" style={{ color: "var(--th-text)" }}>{title}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>{demandGuidance(demand)}</p>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--th-muted)" }}>
              {demand.territory && <div><dt className="inline">Território: </dt><dd className="inline">{demand.territory}</dd></div>}
              {demand.composition.totalAmountCents > 0 && <div><dt className="inline">Valor total: </dt><dd className="inline font-numeric">{formatCents(demand.composition.totalAmountCents)}</dd></div>}
              <div><dt className="inline">Atualizada em </dt><dd className="inline font-numeric">{dateTime(demand.updatedAt)}</dd></div>
            </dl>
          </div>
        </div>

        {demand.reviewState === "devolvida" && demand.reviewNote && (
          <div className="mx-4 mb-4 rounded-xl border p-3 sm:mx-5" style={{ borderColor: "rgba(244,132,26,0.45)", background: "rgba(244,132,26,0.08)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#f4841a" }}>Parecer da equipe</p>
            <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{demand.reviewNote}</p>
            {demand.reviewedAt && <p className="mt-1 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>{dateTime(demand.reviewedAt)}</p>}
          </div>
        )}
        {demand.status === "arquivada" && demand.archiveReason && (
          <div className="mx-4 mb-4 rounded-xl border p-3 sm:mx-5" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Motivo do arquivamento</p>
            <p className="mt-1 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{demand.archiveReason}</p>
          </div>
        )}

        {isPublic && <div className="px-4 pb-3 sm:px-5"><StatusTrack status={demand.status} /></div>}

        <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
          {demand.editable && (
            <Button href={demandEditPath(demand.id, demand.reviewState === "devolvida" ? "revisao" : undefined)} size="sm" icon="edit">
              {demand.reviewState === "devolvida" ? "Ajustar e reenviar" : "Continuar preenchimento"}
            </Button>
          )}
          {!demand.editable && demand.status === "em_analise" && (
            <Button href={demandEditPath(demand.id)} size="sm" variant="outline" icon="eye">Ver o que foi enviado</Button>
          )}
          {isPublic && <Button href={demandPublicPath(demand.id)} size="sm" variant="outline" icon="eye">Página pública</Button>}
          {isPublic && demand.postId && <Button href={`/post/${demand.postId}`} size="sm" variant="ghost" icon="bolt">No pulso</Button>}
          <div role="tablist" aria-label={`Detalhes de ${title}`} className="flex flex-wrap items-center gap-2">
            {PANELS.filter(([key]) => {
              if (key === "dossie") return hasDossier;
              // A prestação de contas só faz sentido no último status (T18).
              if (key === "prestacao") return demand.status === "prestacao_de_contas";
              // A IA sugere desde o rascunho: é ajuda de preenchimento.
              if (key === "ia") return true;
              return isPublic;
            }).map(([key, label, icon]) => (
              <Button
                key={key}
                type="button"
                role="tab"
                size="sm"
                variant={panel === key ? "secondary" : "outline"}
                icon={icon}
                onClick={() => setPanel(panel === key ? null : key)}
                aria-selected={panel === key}
                aria-expanded={panel === key}
                aria-controls={`dm-${demand.id}-${key}`}
              >
                {label}
              </Button>
            ))}
          </div>
          {actions.map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant={confirming === action ? "primary" : "secondary"}
              disabled={busy && confirming !== action}
              onClick={() => setConfirming(confirming === action ? null : action)}
              aria-expanded={confirming === action}
              aria-controls={`dm-${demand.id}-confirm`}
            >
              {DEMAND_ACTION_LABELS[action]}
            </Button>
          ))}
        </div>

        {panel === "interessados" && (
          <div id={`dm-${demand.id}-interessados`} role="tabpanel" className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
            <DemandInterestsInbox
              demandId={demand.id}
              onStatus={(status) => {
                if (status === demand.status) return;
                // Conexão aceita levou a demanda a "Conectada": recarrega ações e status.
                void api.getMyDemand(demand.id).then((next) => {
                  if (next) onUpdated({ ...next, photoUrl: next.photoUrl ?? demand.photoUrl });
                }).catch(() => onUpdated({ ...demand, status }));
              }}
            />
            {/* Potenciais parceiros e instituições (T30, §6 etapa 3). */}
            <PotentialPartnersPanel demand={demand} />
          </div>
        )}
        {panel === "ia" && (
          <div id={`dm-${demand.id}-ia`} role="tabpanel" className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
            <AiSuggestionPanel demandId={demand.id} />
          </div>
        )}
        {panel === "apoios" && (
          <div id={`dm-${demand.id}-apoios`} role="tabpanel" className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
            <DemandSupportsInbox demandId={demand.id} />
          </div>
        )}
        {panel === "execucao" && (
          <div id={`dm-${demand.id}-execucao`} role="tabpanel" className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
            <DemandExecutionPanel
              demandId={demand.id}
              onChanged={() => {
                // Evidência nova libera "Iniciar execução" e "Concluir" (T17).
                void api.getMyDemand(demand.id).then((next) => {
                  if (next) onUpdated({ ...next, photoUrl: next.photoUrl ?? demand.photoUrl });
                }).catch(() => undefined);
              }}
            />
          </div>
        )}
        {panel === "prestacao" && (
          <div id={`dm-${demand.id}-prestacao`} role="tabpanel" className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
            <DemandAccountabilityPanel
              demandId={demand.id}
              onChanged={() => {
                // A conclusão da prestação gera dossiê novo e muda a linha do tempo.
                void api.getMyDemand(demand.id).then((next) => {
                  if (next) onUpdated({ ...next, photoUrl: next.photoUrl ?? demand.photoUrl });
                }).catch(() => undefined);
              }}
            />
          </div>
        )}
        {panel === "dossie" && (
          <div id={`dm-${demand.id}-dossie`} role="tabpanel" className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)" }}>
            <DossierPanel demandId={demand.id} compact />
          </div>
        )}

        {confirming && (
          <div id={`dm-${demand.id}-confirm`} className="border-t px-4 py-3 sm:px-5" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <p className="text-sm" style={{ color: "var(--th-text)" }}>
              {DEMAND_ACTION_LABELS[confirming]}: o status passa de <strong>{DEMAND_STATUS_LABELS[demand.status]}</strong> para{" "}
              <strong>{DEMAND_STATUS_LABELS[DEMAND_ACTION_TARGET[confirming]]}</strong> e o registro entra na linha do tempo pública.
            </p>
            <div className="mt-2 flex gap-2">
              <Button type="button" size="sm" icon="check" loading={busy} onClick={() => void run(confirming)}>Confirmar</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>Cancelar</Button>
            </div>
          </div>
        )}
        {(error || gate) && (
          <div className="px-4 pb-4 sm:px-5">
            {error && <FormAlert message={error} />}
            {gate && <InstitutionGateNotice action="mover_demanda" status={gate.status} kind="agente_transformacao" />}
          </div>
        )}
      </article>
    </li>
  );
}

/** "Minhas demandas" (T09): as demandas do Agente em qualquer estado. */
export function MyDemandsClient() {
  const { user, status } = useAuth();
  // Papel efetivo (T29): a própria categoria ou a que o vínculo empresta.
  const { role: effective, resolving: roleResolving } = useEffectiveRole();
  const isAgent = effective === "agent";
  const [demands, setDemands] = useState<Demand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (status !== "authenticated" || !isAgent) return;
    let alive = true;
    api.myDemands()
      .then((list) => { if (alive) { setDemands(list); setError(null); } })
      .catch((err) => { if (alive) setError(demandErrorMessage(err, "Não foi possível carregar suas demandas.")); });
    return () => { alive = false; };
  }, [status, isAgent, reload]);

  // Link do sino (`#demanda-<id>`, T-05-16): a lista chega depois da página.
  useEffect(() => {
    if (!demands || typeof window === "undefined" || !window.location.hash.startsWith("#demanda-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [demands]);

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Minhas demandas</h1>
          <div className="mt-4"><AuthPrompt action="acompanhar suas demandas" returnTo={MY_DEMANDS_PATH} /></div>
        </Card>
      </div>
    );
  }
  if (roleResolving) return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!isAgent) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Minhas demandas</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Demandas são criadas e acompanhadas por Agentes de Transformação.</p>
          <Button className="mt-4" href="/feed">Ver o pulso</Button>
        </Card>
      </div>
    );
  }

  const inProgress = demands?.filter((d) => d.status === "em_analise") ?? [];
  const others = demands?.filter((d) => d.status !== "em_analise") ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Minhas demandas</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Rascunhos, análise, publicação, execução e prestação de contas.</p>
        </div>
        <Button href={DEMAND_NEW_PATH} icon="plus">Nova demanda</Button>
      </header>

      {error && (
        <div className="space-y-2">
          <FormAlert message={error} />
          <Button type="button" size="sm" variant="outline" onClick={() => setReload((n) => n + 1)}>Tentar de novo</Button>
        </div>
      )}
      {!demands && !error && <div className="flex justify-center py-16"><span className="app-spinner" aria-label="Carregando suas demandas" /></div>}
      {demands && demands.length === 0 && (
        <EmptyState icon="plus" title="Você ainda não estruturou nenhuma demanda" hint="Comece pela categoria; o rascunho fica salvo e você completa as etapas no seu ritmo." />
      )}

      {inProgress.length > 0 && (
        <section aria-labelledby="dm-analise">
          <h2 id="dm-analise" className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Em preparação e análise</h2>
          <ul className="space-y-3">
            {inProgress.map((d) => <DemandRow key={d.id} demand={d} onUpdated={(n) => setDemands((list) => list?.map((x) => (x.id === n.id ? n : x)) ?? null)} />)}
          </ul>
        </section>
      )}
      {others.length > 0 && (
        <section aria-labelledby="dm-publicadas">
          <h2 id="dm-publicadas" className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Da publicação em diante</h2>
          <ul className="space-y-3">
            {others.map((d) => <DemandRow key={d.id} demand={d} onUpdated={(n) => setDemands((list) => list?.map((x) => (x.id === n.id ? n : x)) ?? null)} />)}
          </ul>
        </section>
      )}
    </div>
  );
}
