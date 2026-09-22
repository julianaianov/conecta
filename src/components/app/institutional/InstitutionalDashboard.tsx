"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { DEMAND_CATEGORIES, DEMAND_PRIORITIES } from "@/lib/app/demand";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  INSTITUTIONAL_AREA_PATH,
  INSTITUTIONAL_STATUSES,
  INSTITUTIONAL_STATUS_LABELS,
  WITHOUT_TRACK,
  institutionalDemandPath,
  institutionalErrorMessage,
} from "@/lib/app/institutional";
import {
  DEMAND_CATEGORY_LABELS,
  DEMAND_PRIORITY_LABELS,
  DEMAND_PUBLIC_STATUSES,
  DEMAND_STATUS_LABELS,
  normalizeRole,
  type DemandCategory,
  type DemandPriority,
  type DemandStatus,
  type InstitutionalContext,
  type InstitutionalDemandFilter,
  type InstitutionalDemandSummary,
  type InstitutionalScope,
  type InstitutionalStatus,
  type InstitutionValidationStatus,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Card, EmptyState } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { CategoryBadge, DemandStatusBadge, PriorityBadge } from "../demand/DemandParts";
import { FormAlert, SelectInput, TextInput } from "../demand/fields";
import { InstitutionalStatusBadge } from "./InstitutionalParts";

const InstitutionalMap = dynamic(() => import("./InstitutionalMapInner"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse" style={{ background: "var(--th-card-alt)" }} />,
});

type Filters = {
  scope: InstitutionalScope;
  institutionalStatus: InstitutionalStatus | typeof WITHOUT_TRACK | "";
  category: DemandCategory | "";
  priority: DemandPriority | "";
  status: DemandStatus | "";
  territory: string;
  q: string;
};

const EMPTY_FILTERS: Filters = { scope: "jurisdicao", institutionalStatus: "", category: "", priority: "", status: "", territory: "", q: "" };

function toQuery(f: Filters, cursor?: string | null): InstitutionalDemandFilter {
  return {
    scope: f.scope,
    ...(f.institutionalStatus ? { institutionalStatus: [f.institutionalStatus] } : {}),
    ...(f.category ? { category: [f.category] } : {}),
    ...(f.priority ? { priority: [f.priority] } : {}),
    ...(f.status ? { status: [f.status] } : {}),
    ...(f.territory.trim() ? { territory: f.territory.trim() } : {}),
    ...(f.q.trim() ? { q: f.q.trim() } : {}),
    limit: 50,
    ...(cursor ? { cursor } : {}),
  };
}

function jurisdictionText(ctx: InstitutionalContext): string {
  const j = ctx.jurisdiction;
  if (j.governmentSphere === "municipal" && j.municipality) return `${j.municipality}${j.uf ? `/${j.uf}` : ""}`;
  if (j.governmentSphere === "estadual" && j.uf) return `Estado: ${j.uf}`;
  if (j.governmentSphere === "federal") return "Todo o país";
  return j.uf ?? "Território não informado no cadastro";
}

function DemandListItem({ demand }: { demand: InstitutionalDemandSummary }) {
  const place = [demand.territory, [demand.municipality, demand.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ");
  return (
    <li>
      <Link href={institutionalDemandPath(demand.id)} className="app-card block rounded-2xl p-4 transition-shadow hover:shadow-md">
        <div className="flex flex-wrap items-center gap-1.5">
          {demand.institutional
            ? <InstitutionalStatusBadge status={demand.institutional.status} />
            : <span className="rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}>Sem acompanhamento</span>}
          <CategoryBadge category={demand.category} />
          <PriorityBadge priority={demand.priority} />
          <DemandStatusBadge status={demand.status} />
        </div>
        <h3 className="mt-2 text-base font-bold leading-snug" style={{ color: "var(--th-text)" }}>{demand.title}</h3>
        {place && <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{place}</p>}
        <p className="mt-1 line-clamp-2 text-sm" style={{ color: "var(--th-muted)" }}>{demand.description}</p>
      </Link>
    </li>
  );
}

/**
 * Área institucional do Poder Público (T13; Fluxo 3, etapas 03 a 07): mapa e
 * lista filtrável das demandas do território, fila por status do
 * acompanhamento do órgão e acesso à análise de cada demanda.
 */
export function InstitutionalDashboard() {
  const { user, status } = useAuth();
  const isGovernment = Boolean(user && normalizeRole(user.role, user.profileType) === "government");
  const [ctx, setCtx] = useState<InstitutionalContext | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [demands, setDemands] = useState<InstitutionalDemandSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  const [view, setView] = useState<"lista" | "mapa">("lista");

  const fail = useCallback((err: unknown) => {
    if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
    else setError(institutionalErrorMessage(err, "Não foi possível carregar as demandas agora."));
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isGovernment) return;
    let alive = true;
    api.institutionalContext().then((c) => { if (alive) setCtx(c); }).catch((err) => { if (alive) fail(err); });
    return () => { alive = false; };
  }, [status, isGovernment, fail]);

  useEffect(() => {
    if (status !== "authenticated" || !isGovernment) return;
    let alive = true;
    api.institutionalDemands(toQuery(applied))
      .then((page) => {
        if (!alive) return;
        setDemands(page.demands);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((err) => { if (alive) fail(err); });
    return () => { alive = false; };
  }, [status, isGovernment, applied, fail]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const page = await api.institutionalDemands(toQuery(applied, cursor));
      setDemands((list) => [...(list ?? []), ...page.demands]);
      setCursor(page.nextCursor);
    } catch (err) {
      fail(err);
    } finally {
      setLoadingMore(false);
    }
  }

  const apply = (next: Filters) => {
    setDemands(null);
    setFilters(next);
    setApplied(next);
  };

  const mapped = useMemo(() => (demands ?? []).filter((d) => d.latitude != null && d.longitude != null), [demands]);

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Atuação institucional</h1>
          <div className="mt-4"><AuthPrompt action="acompanhar as demandas do território" returnTo={INSTITUTIONAL_AREA_PATH} /></div>
        </Card>
      </div>
    );
  }
  if (!isGovernment) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Atuação institucional</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Esta área é do Poder Público: prefeituras, secretarias, órgãos públicos e seus representantes, com cadastro institucional validado.
          </p>
          <Button className="mt-4" href="/mapa">Ver o território</Button>
        </Card>
      </div>
    );
  }
  if (gate) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Atuação institucional</h1>
        <InstitutionGateNotice action="atuar" status={gate.status} />
      </div>
    );
  }

  const received = ctx?.counts.recebida ?? 0;
  const followed = ctx ? Object.values(ctx.counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Atuação institucional</h1>
        {ctx ? (
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            <strong style={{ color: "var(--th-text)" }}>{ctx.organization.name}</strong>
            {ctx.organization.department ? ` · ${ctx.organization.department}` : ""} · território de atuação: {jurisdictionText(ctx)}
          </p>
        ) : (
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Visualize, analise, responda, articule e acompanhe as demandas do território.</p>
        )}
      </header>

      {ctx && (
        <section aria-label="Acompanhamentos do órgão" className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => apply({ ...filters, institutionalStatus: "recebida" })}
            aria-pressed={applied.institutionalStatus === "recebida"}
            className="rounded-xl border px-3 py-2 text-left"
            style={{ borderColor: applied.institutionalStatus === "recebida" ? "#f4841a" : "var(--th-border)", background: "var(--th-card)" }}
          >
            <span className="block text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Fila: recebidas</span>
            <span className="font-numeric text-xl font-bold" style={{ color: "var(--th-text)" }}>{received}</span>
          </button>
          <button
            type="button"
            onClick={() => apply({ ...filters, institutionalStatus: WITHOUT_TRACK })}
            aria-pressed={applied.institutionalStatus === WITHOUT_TRACK}
            className="rounded-xl border px-3 py-2 text-left"
            style={{ borderColor: applied.institutionalStatus === WITHOUT_TRACK ? "#f4841a" : "var(--th-border)", background: "var(--th-card)" }}
          >
            <span className="block text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Ainda sem acompanhamento</span>
            <span className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Ver novas demandas</span>
          </button>
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--th-border)", background: "var(--th-card)" }}>
            <span className="block text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>Acompanhadas pelo órgão</span>
            <span className="font-numeric text-xl font-bold" style={{ color: "var(--th-text)" }}>{followed}</span>
          </div>
        </section>
      )}

      <form
        className="app-card grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => { e.preventDefault(); apply(filters); }}
        aria-label="Filtros das demandas"
      >
        <SelectInput
          name="scope" label="Alcance" value={filters.scope}
          onValue={(v) => setFilters({ ...filters, scope: v as InstitutionalScope })}
          options={[{ value: "jurisdicao", label: "Território de atuação do órgão" }, { value: "todas", label: "Todas as demandas publicadas" }]}
        />
        <SelectInput
          name="institutionalStatus" label="Acompanhamento do órgão" value={filters.institutionalStatus} placeholder="Todos"
          onValue={(v) => setFilters({ ...filters, institutionalStatus: v as Filters["institutionalStatus"] })}
          options={[{ value: WITHOUT_TRACK, label: "Sem acompanhamento" }, ...INSTITUTIONAL_STATUSES.map((s) => ({ value: s, label: INSTITUTIONAL_STATUS_LABELS[s] }))]}
        />
        <SelectInput
          name="category" label="Categoria" value={filters.category} placeholder="Todas"
          onValue={(v) => setFilters({ ...filters, category: v as DemandCategory | "" })}
          options={DEMAND_CATEGORIES.map((c) => ({ value: c, label: DEMAND_CATEGORY_LABELS[c] }))}
        />
        <SelectInput
          name="priority" label="Prioridade" value={filters.priority} placeholder="Todas"
          onValue={(v) => setFilters({ ...filters, priority: v as DemandPriority | "" })}
          options={DEMAND_PRIORITIES.map((p) => ({ value: p, label: DEMAND_PRIORITY_LABELS[p] }))}
        />
        <SelectInput
          name="status" label="Status da demanda" value={filters.status} placeholder="Todos"
          onValue={(v) => setFilters({ ...filters, status: v as DemandStatus | "" })}
          options={DEMAND_PUBLIC_STATUSES.map((s) => ({ value: s, label: DEMAND_STATUS_LABELS[s] }))}
        />
        <TextInput name="territory" label="Território" value={filters.territory} maxLength={255} onValue={(v) => setFilters({ ...filters, territory: v })} />
        <TextInput name="q" label="Buscar" value={filters.q} maxLength={200} onValue={(v) => setFilters({ ...filters, q: v })} placeholder="Título ou descrição" />
        <div className="flex items-end gap-2">
          <Button type="submit" icon="filter">Filtrar</Button>
          <Button type="button" variant="ghost" onClick={() => apply(EMPTY_FILTERS)}>Limpar</Button>
        </div>
      </form>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--th-muted)" }} aria-live="polite">
          {demands ? `${demands.length}${cursor ? "+" : ""} demanda(s)` : "Carregando…"}
        </p>
        <div role="tablist" aria-label="Visualização" className="flex gap-1">
          {(["lista", "mapa"] as const).map((v) => (
            <button
              key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold"
              style={{ color: view === v ? "#f4841a" : "var(--th-muted)", background: view === v ? "rgba(244,132,26,0.10)" : "transparent" }}
            >
              {v === "lista" ? "Lista" : "Mapa"}
            </button>
          ))}
        </div>
      </div>

      {error && <FormAlert message={error} />}
      {!demands && !error && <div className="flex justify-center py-16"><span className="app-spinner" aria-label="Carregando demandas" /></div>}
      {demands && demands.length === 0 && (
        <EmptyState icon="map" title="Nenhuma demanda com esses filtros" hint="Amplie o alcance para todas as demandas publicadas ou limpe os filtros." />
      )}
      {demands && demands.length > 0 && view === "mapa" && (
        <div className="relative h-[28rem] overflow-hidden rounded-2xl border" style={{ borderColor: "var(--th-border)" }}>
          <InstitutionalMap demands={mapped} />
        </div>
      )}
      {demands && demands.length > 0 && view === "mapa" && mapped.length < demands.length && (
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>{demands.length - mapped.length} demanda(s) sem coordenadas aparecem só na lista.</p>
      )}
      {demands && demands.length > 0 && view === "lista" && (
        <ul className="grid gap-3 md:grid-cols-2">
          {demands.map((d) => <DemandListItem key={d.id} demand={d} />)}
        </ul>
      )}
      {cursor && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" loading={loadingMore} onClick={() => void loadMore()}>Carregar mais</Button>
        </div>
      )}
    </div>
  );
}
