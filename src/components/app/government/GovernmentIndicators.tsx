"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/app/auth";
import { useEffectiveRole } from "../institution/useInstitutionAccess";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import { INSTITUTIONAL_AREA_PATH } from "@/lib/app/institutional";
import {
  COUNT_INDICATORS,
  GOVERNMENT_ACTIONS_PATH,
  GOVERNMENT_SCOPES,
  GOVERNMENT_SCOPE_LABELS,
  INDICATOR_PERIODS,
  INDICATOR_PERIOD_LABELS,
  categoryLabel,
  formatIndicator,
  generatedAtLabel,
  governmentErrorMessage,
  waitLabel,
  type GovernmentScope,
  type ImpactReport,
  type IndicatorFilter,
  type IndicatorPeriod,
  type IndicatorReport,
  type PriorityReport,
} from "@/lib/app/government";
import { governmentApi, type ExportFormat } from "@/lib/app/government-client";
import type { InstitutionValidationStatus } from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { Card, EmptyState, SectionTitle } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { FormAlert, SelectInput, TextInput } from "../demand/fields";
import { IndicatorBarChart, IndicatorCard } from "./IndicatorCharts";

type Filters = { scope: GovernmentScope; period: IndicatorPeriod; territory: string };

const EMPTY: Filters = { scope: "jurisdicao", period: "30d", territory: "" };

const toQuery = (f: Filters): IndicatorFilter => ({
  scope: f.scope,
  period: f.period,
  ...(f.territory.trim() ? { territory: f.territory.trim() } : {}),
});

/**
 * Painel de indicadores do órgão (T22): os 10 indicadores do slide 14
 * calculados das demandas reais, recortados pela competência/território do
 * órgão e pelo período; priorização de áreas; medição de impacto; exportação
 * CSV/PDF. "Monitoramento em tempo real" é consulta a cada abertura, com cache
 * curto no servidor — o painel mostra a hora da leitura e tem "Atualizar".
 *
 * Nada aqui compara órgãos: são os números do próprio órgão.
 */
export function GovernmentIndicators() {
  const { user, status } = useAuth();
  // Papel efetivo (T29): a própria categoria ou a que o vínculo empresta.
  const { role: effective, resolving: roleResolving } = useEffectiveRole();
  const isGovernment = effective === "government";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [report, setReport] = useState<IndicatorReport | null>(null);
  const [priority, setPriority] = useState<PriorityReport | null>(null);
  const [impact, setImpact] = useState<ImpactReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const fail = useCallback((err: unknown) => {
    if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) });
    else setError(governmentErrorMessage(err));
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !isGovernment) return undefined;
    let alive = true;
    setLoading(true);
    const query = toQuery(applied);
    Promise.all([
      governmentApi.indicators(query),
      governmentApi.priorityAreas(query),
      governmentApi.impact(query),
    ])
      .then(([indicators, areas, measured]) => {
        if (!alive) return;
        setReport(indicators);
        setPriority(areas);
        setImpact(measured);
        setError(null);
      })
      .catch((err) => { if (alive) fail(err); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, isGovernment, applied, reloadKey, fail]);

  async function download(format: ExportFormat) {
    setExporting(format);
    try {
      const { blob, fileName } = await governmentApi.exportIndicators(format, toQuery(applied));
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(governmentErrorMessage(err, "Não foi possível exportar os indicadores agora."));
    } finally {
      setExporting(null);
    }
  }

  if (status === "unknown") {
    return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Indicadores do território</h1>
          <div className="mt-4"><AuthPrompt action="acompanhar os indicadores do território" returnTo="/governo/indicadores" /></div>
        </Card>
      </div>
    );
  }
  if (roleResolving) return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!isGovernment) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Indicadores do território</h1>
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
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Indicadores do território</h1>
        <InstitutionGateNotice action="atuar" status={gate.status} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <nav aria-label="Área do Poder Público" className="mb-2 flex flex-wrap gap-2 text-sm">
          <Link href={INSTITUTIONAL_AREA_PATH} className="font-semibold" style={{ color: "#2e7ba8" }}>Atuação institucional</Link>
          <span style={{ color: "var(--th-muted)" }}>·</span>
          <Link href={GOVERNMENT_ACTIONS_PATH} className="font-semibold" style={{ color: "#2e7ba8" }}>Divulgação de ações</Link>
        </nav>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Indicadores e resultados do território</h1>
        {report && (
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            <strong style={{ color: "var(--th-text)" }}>{report.organization.name}</strong>
            {report.organization.department ? ` · ${report.organization.department}` : ""}
            {report.organization.competenceAreas.length ? ` · competência: ${report.organization.competenceAreas.join(", ")}` : ""}
          </p>
        )}
      </header>

      <form
        className="app-card grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Recorte dos indicadores"
        onSubmit={(e) => { e.preventDefault(); setApplied(filters); }}
      >
        <SelectInput
          name="scope" label="Recorte" value={filters.scope}
          onValue={(v) => setFilters({ ...filters, scope: v as GovernmentScope })}
          options={GOVERNMENT_SCOPES.map((s) => ({ value: s, label: GOVERNMENT_SCOPE_LABELS[s] }))}
        />
        <SelectInput
          name="period" label="Período" value={filters.period}
          onValue={(v) => setFilters({ ...filters, period: v as IndicatorPeriod })}
          options={INDICATOR_PERIODS.map((p) => ({ value: p, label: INDICATOR_PERIOD_LABELS[p] }))}
        />
        <TextInput
          name="territory" label="Território" value={filters.territory} maxLength={255}
          onValue={(v) => setFilters({ ...filters, territory: v })} placeholder="Bairro ou região"
        />
        <div className="flex items-end gap-2">
          <Button type="submit" icon="filter">Aplicar</Button>
          <Button type="button" variant="ghost" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); }}>Limpar</Button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--th-muted)" }} aria-live="polite">
          {loading ? "Carregando os indicadores…" : `Leitura das ${generatedAtLabel(report?.generatedAt)} · ${report?.period.label ?? ""}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" icon="clock" onClick={() => setReloadKey((k) => k + 1)}>Atualizar</Button>
          <Button type="button" variant="outline" icon="download" loading={exporting === "csv"} onClick={() => void download("csv")}>
            Exportar CSV
          </Button>
          <Button type="button" variant="outline" icon="download" loading={exporting === "pdf"} onClick={() => void download("pdf")}>
            Exportar PDF
          </Button>
        </div>
      </div>

      {error && <FormAlert message={error} />}
      {loading && !report && <div className="flex justify-center py-16"><span className="app-spinner" aria-label="Carregando indicadores" /></div>}

      {report && (
        <>
          <section aria-label="Indicadores do órgão" className="space-y-3">
            <SectionTitle icon="inventory">Os 10 indicadores do território</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {COUNT_INDICATORS.map((indicator) => (
                <IndicatorCard
                  key={indicator.id}
                  label={indicator.label}
                  value={report.indicators[indicator.id as keyof typeof report.indicators] ?? 0}
                  source={report.sources?.[indicator.id]}
                />
              ))}
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="app-card rounded-2xl p-4">
                <IndicatorBarChart
                  id="territorio"
                  caption="Demandas por território"
                  rows={report.byTerritory.map((t) => ({
                    label: t.uf ? `${t.label} (${t.uf})` : t.label,
                    value: t.total,
                    extras: { urgent: t.urgent, concluded: t.concluded },
                  }))}
                  columns={[{ key: "urgent", label: "Urgentes" }, { key: "concluded", label: "Concluídas" }]}
                />
              </div>
              <div className="app-card rounded-2xl p-4">
                <IndicatorBarChart
                  id="categoria"
                  caption="Demandas por categoria"
                  rows={report.byCategory.map((c) => ({
                    label: categoryLabel(c.category),
                    value: c.total,
                    extras: { urgent: c.urgent, concluded: c.concluded },
                  }))}
                  columns={[{ key: "urgent", label: "Urgentes" }, { key: "concluded", label: "Concluídas" }]}
                />
              </div>
            </div>
          </section>

          {priority && (
            <section aria-label="Priorização de áreas" className="space-y-3">
              <SectionTitle icon="flag">Priorização de áreas</SectionTitle>
              <p className="text-sm" style={{ color: "var(--th-muted)" }}>
                Ordem sugerida de trabalho do próprio órgão, por urgência, volume e tempo sem resposta institucional.
                Não é comparação entre órgãos.
              </p>
              {priority.territories.length === 0 ? (
                <EmptyState icon="map" title="Nenhuma área no recorte" hint="Amplie o período ou o recorte." />
              ) : (
                <div className="app-card overflow-x-auto rounded-2xl p-4">
                  <table className="w-full border-collapse text-sm">
                    <caption className="mb-2 text-left text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
                      Áreas por prioridade de atendimento
                    </caption>
                    <thead>
                      <tr>
                        {["Área", "Demandas", "Urgentes", "Sem resposta do órgão", "Maior espera"].map((label, i) => (
                          <th
                            key={label} scope="col"
                            className={`py-1 font-semibold ${i === 0 ? "text-left" : "text-right"}`}
                            style={{ color: "var(--th-muted)" }}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {priority.territories.map((area) => (
                        <tr key={area.label} className="border-t" style={{ borderColor: "var(--th-border)" }}>
                          <th scope="row" className="py-2 pr-3 text-left font-medium" style={{ color: "var(--th-text)" }}>
                            {area.uf ? `${area.label} (${area.uf})` : area.label}
                          </th>
                          <td className="py-2 text-right font-numeric" style={{ color: "var(--th-text)" }}>{formatIndicator(area.total)}</td>
                          <td className="py-2 text-right font-numeric" style={{ color: "var(--th-text)" }}>{formatIndicator(area.urgent)}</td>
                          <td className="py-2 text-right font-numeric" style={{ color: "var(--th-text)" }}>{formatIndicator(area.withoutResponse)}</td>
                          <td className="py-2 text-right" style={{ color: "var(--th-muted)" }}>{waitLabel(area.oldestWaitDays)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="app-card rounded-2xl p-4">
                <IndicatorBarChart
                  id="prioridade-categoria"
                  caption="Categorias por prioridade de atendimento"
                  rows={priority.categories.map((c) => ({
                    label: categoryLabel(c.label as Parameters<typeof categoryLabel>[0]),
                    value: c.total,
                    extras: { urgent: c.urgent, withoutResponse: c.withoutResponse },
                  }))}
                  columns={[{ key: "urgent", label: "Urgentes" }, { key: "withoutResponse", label: "Sem resposta" }]}
                />
              </div>
            </section>
          )}

          {impact && (
            <section aria-label="Medição de impacto" className="space-y-3">
              <SectionTitle icon="check">Medição de impacto</SectionTitle>
              <p className="text-sm" style={{ color: "var(--th-muted)" }}>
                Resultados das demandas em que o órgão atuou, a partir da prestação de contas do Agente.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <IndicatorCard label="Demandas com atuação" value={impact.impact.demandsActedOn} />
                <IndicatorCard label="Demandas concluídas" value={impact.impact.concluded} />
                <IndicatorCard label="Beneficiários alcançados" value={impact.impact.beneficiariesReached} />
                <IndicatorCard label="Resultados registrados" value={impact.impact.resultsRecorded} />
                <IndicatorCard label="Metas atingidas" value={impact.impact.goalsAchieved} />
                <IndicatorCard label="Apoios viabilizados pelo órgão" value={impact.impact.offers} />
                <IndicatorCard label="Apoios nas demandas" value={impact.impact.supports} />
                <IndicatorCard label="Ações divulgadas" value={impact.impact.actions} />
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
