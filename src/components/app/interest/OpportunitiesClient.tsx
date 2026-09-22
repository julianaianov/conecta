"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  DEMAND_CATEGORIES,
  DEMAND_PRIORITIES,
  RESOURCE_TYPE_LABELS,
  demandPublicPath,
  formatCents,
} from "@/lib/app/demand";
import {
  INTEREST_CONNECTION_LABELS,
  INTEREST_KIND_LABELS,
  OFFER_TYPE_LABELS,
  OPPORTUNITIES_PATH,
  UFS,
  canFilterOpportunities,
  interestErrorMessage,
  reaisToCents,
} from "@/lib/app/interest";
import {
  DEMAND_CATEGORY_LABELS,
  DEMAND_PRIORITY_LABELS,
  DEMAND_RESOURCE_TYPES,
  DEMAND_STATUS_LABELS,
  type DemandCategory,
  type DemandNeededResourceType,
  type DemandPriority,
  type InstitutionValidationStatus,
  type MyInterestItem,
  type Opportunity,
  type OpportunityFilter,
  type OpportunityPage,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Card, EmptyState } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { CategoryBadge, DemandStatusBadge, PriorityBadge } from "../demand/DemandParts";
import { FormAlert, SelectInput, TextInput } from "../demand/fields";
import { CompatibilityBadge, CompatibilityReasons } from "./CompatibilityCard";
import { PartnerProfileForm } from "./PartnerProfileForm";

const NEEDED = DEMAND_RESOURCE_TYPES.necessario as DemandNeededResourceType[];
const PAGE = 20;

interface Draft {
  category: string;
  priority: string;
  resourceType: string;
  uf: string;
  municipality: string;
  territory: string;
  q: string;
  minValue: string;
  maxValue: string;
  includeConnected: boolean;
  sort: "compatibilidade" | "recentes";
}

const EMPTY: Draft = {
  category: "", priority: "", resourceType: "", uf: "", municipality: "", territory: "", q: "",
  minValue: "", maxValue: "", includeConnected: false, sort: "compatibilidade",
};

function toFilter(draft: Draft): OpportunityFilter | string {
  const min = reaisToCents(draft.minValue);
  const max = reaisToCents(draft.maxValue);
  if (Number.isNaN(min) || Number.isNaN(max)) return "Informe os valores em reais, por exemplo 5000 ou 5.000,00.";
  return {
    category: draft.category ? [draft.category as DemandCategory] : undefined,
    priority: draft.priority ? [draft.priority as DemandPriority] : undefined,
    resourceType: draft.resourceType ? [draft.resourceType as DemandNeededResourceType] : undefined,
    uf: draft.uf || undefined,
    municipality: draft.municipality.trim() || undefined,
    territory: draft.territory.trim() || undefined,
    q: draft.q.trim() || undefined,
    minTotalCents: min,
    maxTotalCents: max,
    status: draft.includeConnected ? ["publicada", "em_busca_de_parceiro", "conectada", "em_execucao"] : undefined,
    sort: draft.sort,
    limit: PAGE,
  };
}

function OpportunityCard({ item }: { item: Opportunity }) {
  const d = item.demand;
  const place = [d.territory, [d.municipality, d.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return (
    <li>
      <article className="app-card rounded-2xl p-4 sm:p-5" aria-labelledby={`op-${d.id}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={d.category} />
          <DemandStatusBadge status={d.status} />
          <PriorityBadge priority={d.priority} />
          {item.compatibility && <CompatibilityBadge compatibility={item.compatibility} />}
        </div>
        <h2 id={`op-${d.id}`} className="mt-2 text-base font-bold leading-snug" style={{ color: "var(--th-text)" }}>
          <Link href={demandPublicPath(d.id)} className="hover:underline">{d.title}</Link>
        </h2>
        <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--th-muted)" }}>{d.description}</p>
        <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--th-muted)" }}>
          {place && <div><dt className="sr-only">Local</dt><dd className="inline-flex items-center gap-1"><Icon name="location" size={12} />{place}</dd></div>}
          <div><dt className="inline">Valor total: </dt><dd className="inline font-numeric">{formatCents(d.totalAmountCents)}</dd></div>
          {d.beneficiariesEstimate != null && <div><dt className="inline">Beneficiados: </dt><dd className="inline font-numeric">{d.beneficiariesEstimate.toLocaleString("pt-BR")}</dd></div>}
        </dl>
        {d.neededResources.length > 0 && (
          <p className="mt-2 text-xs" style={{ color: "var(--th-text)" }}>
            <strong>Precisa de:</strong> {d.neededResources.map((r) => RESOURCE_TYPE_LABELS[r]).join(", ")}
          </p>
        )}
        {item.compatibility && (
          <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
            <CompatibilityReasons compatibility={item.compatibility} showProfileHint={false} />
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button href={demandPublicPath(d.id)} size="sm" icon="volunteer">
            {item.myInterests.length ? "Ver demanda" : "Ver demanda e demonstrar interesse"}
          </Button>
          {item.myInterests.map((i) => (
            <span key={i.id} className="text-xs font-semibold" style={{ color: "#2e9e5b" }}>
              {INTEREST_KIND_LABELS[i.kind]}{i.connectionStatus ? ` · ${INTEREST_CONNECTION_LABELS[i.connectionStatus]}` : ""}
            </span>
          ))}
        </div>
      </article>
    </li>
  );
}

/**
 * Oportunidades de apoio (T15): demandas publicadas e em busca de parceiro,
 * com filtros (categoria, prioridade, recurso necessário, território, valor) e
 * compatibilidade explicável com o perfil de apoio.
 */
export function OpportunitiesClient() {
  const { user, status } = useAuth();
  const allowed = Boolean(user && canFilterOpportunities(user.role, user.profileType));
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [filter, setFilter] = useState<OpportunityFilter>({ sort: "compatibilidade", limit: PAGE });
  const [page, setPage] = useState<OpportunityPage | null>(null);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [mine, setMine] = useState<MyInterestItem[] | null>(null);
  const [reload, setReload] = useState(0);

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const load = useCallback(async (next: OpportunityFilter, append: boolean) => {
    setLoading(true);
    setError(null);
    setGate(null);
    try {
      const result = await api.opportunities(next);
      setPage(result);
      setItems((list) => (append ? [...list, ...result.opportunities] : result.opportunities));
      if (result.profile && !result.profile.complete) setShowProfile(true);
    } catch (err) {
      if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
      else setError(interestErrorMessage(err, "Não foi possível carregar as oportunidades."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !allowed) return;
    void load(filter, false);
  }, [status, allowed, filter, load, reload]);

  useEffect(() => {
    if (status !== "authenticated" || !allowed) return;
    let alive = true;
    api.myInterests().then((list) => { if (alive) setMine(list); }).catch(() => { if (alive) setMine([]); });
    return () => { alive = false; };
  }, [status, allowed]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.hash === "#perfil-de-apoio") setShowProfile(true);
  }, []);

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Oportunidades de apoio</h1>
          <div className="mt-4"><AuthPrompt action="filtrar oportunidades de apoio" returnTo={OPPORTUNITIES_PATH} /></div>
        </Card>
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Oportunidades de apoio</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Filtrar oportunidades de apoio é uma ação de Parceiros e do Poder Público. Você pode acompanhar as demandas no mapa e no pulso.
          </p>
          <Button className="mt-4" href="/mapa" icon="map">Ver o mapa</Button>
        </Card>
      </div>
    );
  }

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    const next = toFilter(draft);
    if (typeof next === "string") {
      setError(next);
      return;
    }
    setItems([]);
    setFilter(next);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Oportunidades de apoio</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Demandas publicadas e em busca de parceiro. A compatibilidade soma território (até 40 pontos), categoria (30) e recursos (até 30), a partir do seu perfil de apoio, sem inteligência artificial.
        </p>
      </header>

      <section id="perfil-de-apoio" aria-labelledby="pa-titulo" className="app-card rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="pa-titulo" className="text-base font-bold" style={{ color: "var(--th-text)" }}>Meu perfil de apoio</h2>
          <Button type="button" size="sm" variant="outline" icon="edit" aria-expanded={showProfile} aria-controls="pa-form" onClick={() => setShowProfile((v) => !v)}>
            {showProfile ? "Fechar" : "Editar"}
          </Button>
        </div>
        {page?.profile && !page.profile.complete && (
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Preencha onde você atua, as categorias de interesse e os recursos que oferece para ver a compatibilidade.</p>
        )}
        {showProfile && (
          <div id="pa-form" className="mt-4">
            <PartnerProfileForm onSaved={() => setReload((n) => n + 1)} />
          </div>
        )}
      </section>

      <form onSubmit={apply} className="app-card space-y-3 rounded-2xl p-4 sm:p-5" aria-label="Filtros das oportunidades">
        <div className="grid gap-3 sm:grid-cols-3">
          <SelectInput name="op-categoria" label="Categoria" value={draft.category} onValue={set("category")} placeholder="Todas"
            options={DEMAND_CATEGORIES.map((c) => ({ value: c, label: DEMAND_CATEGORY_LABELS[c] }))} />
          <SelectInput name="op-prioridade" label="Prioridade" value={draft.priority} onValue={set("priority")} placeholder="Todas"
            options={DEMAND_PRIORITIES.map((p) => ({ value: p, label: DEMAND_PRIORITY_LABELS[p] }))} />
          <SelectInput name="op-recurso" label="Recurso necessário" value={draft.resourceType} onValue={set("resourceType")} placeholder="Todos"
            options={NEEDED.map((r) => ({ value: r, label: RESOURCE_TYPE_LABELS[r] }))} />
          <SelectInput name="op-uf" label="UF" value={draft.uf} onValue={set("uf")} placeholder="Todas" options={UFS.map((u) => ({ value: u, label: u }))} />
          <TextInput name="op-municipio" label="Município" value={draft.municipality} onValue={set("municipality")} maxLength={255} />
          <TextInput name="op-territorio" label="Território ou bairro" value={draft.territory} onValue={set("territory")} maxLength={255} />
          <TextInput name="op-min" label="Valor total mínimo (R$)" value={draft.minValue} onValue={set("minValue")} inputMode="decimal" />
          <TextInput name="op-max" label="Valor total máximo (R$)" value={draft.maxValue} onValue={set("maxValue")} inputMode="decimal" />
          <TextInput name="op-busca" label="Busca" value={draft.q} onValue={set("q")} maxLength={200} placeholder="Título ou descrição" />
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--th-text)" }}>
              <input type="checkbox" className="h-4 w-4 accent-[#f4841a]" checked={draft.includeConnected} onChange={(e) => set("includeConnected")(e.target.checked)} />
              Incluir {DEMAND_STATUS_LABELS.conectada.toLowerCase()} e {DEMAND_STATUS_LABELS.em_execucao.toLowerCase()}
            </label>
            <SelectInput name="op-ordem" label="Ordenar por" value={draft.sort} onValue={(v) => set("sort")(v as Draft["sort"])}
              options={[{ value: "compatibilidade", label: "Compatibilidade" }, { value: "recentes", label: "Mais recentes" }]} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => { setDraft(EMPTY); setItems([]); setFilter({ sort: "compatibilidade", limit: PAGE }); }}>Limpar</Button>
            <Button type="submit" icon="filter">Filtrar</Button>
          </div>
        </div>
      </form>

      <div aria-live="polite" className="space-y-2">
        {error && <FormAlert message={error} />}
        {gate && <InstitutionGateNotice action="interesse" status={gate.status} />}
        {page && !page.compatibilityAvailable && (
          <FormAlert tone="info" message="A compatibilidade está indisponível no momento; as oportunidades aparecem das mais recentes para as mais antigas." />
        )}
        {page && <p className="text-xs" style={{ color: "var(--th-muted)" }}>{page.total} {page.total === 1 ? "oportunidade" : "oportunidades"}{page.truncated ? " (as 500 mais recentes)" : ""}</p>}
      </div>

      {!loading && page && items.length === 0 && !error && (
        <EmptyState icon="search" title="Nenhuma oportunidade com estes filtros" hint="Amplie o território, retire filtros ou inclua demandas conectadas." />
      )}
      <ul className="space-y-3">
        {items.map((item) => <OpportunityCard key={item.demand.id} item={item} />)}
      </ul>
      {loading && <div className="flex justify-center py-6"><span className="app-spinner" aria-label="Carregando oportunidades" /></div>}
      {!loading && page?.nextOffset != null && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" onClick={() => void load({ ...filter, offset: page.nextOffset ?? 0 }, true)}>Carregar mais</Button>
        </div>
      )}

      <section aria-labelledby="op-minhas" className="space-y-2">
        <h2 id="op-minhas" className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Minhas manifestações</h2>
        {mine && mine.length === 0 && <p className="text-sm" style={{ color: "var(--th-muted)" }}>Você ainda não demonstrou interesse em nenhuma demanda.</p>}
        {mine && mine.length > 0 && (
          <ul className="space-y-2">
            {mine.map((i) => (
              <li key={i.id} className="app-card flex flex-wrap items-center justify-between gap-2 rounded-xl p-3">
                <div className="min-w-0">
                  <Link href={demandPublicPath(i.demand.id)} className="text-sm font-bold hover:underline" style={{ color: "var(--th-text)" }}>{i.demand.title}</Link>
                  <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                    {INTEREST_KIND_LABELS[i.kind]}
                    {i.offerTypes.length ? ` · ${i.offerTypes.map((o) => OFFER_TYPE_LABELS[o]).join(", ")}` : ""}
                    {i.withdrawnAt ? " · retirada" : i.connectionStatus ? ` · ${INTEREST_CONNECTION_LABELS[i.connectionStatus]}` : ""}
                  </p>
                </div>
                <DemandStatusBadge status={i.demand.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
