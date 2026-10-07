"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLandingData } from "@/components/LandingData";
import { PublicDemandMapCanvas } from "@/components/PublicDemandMapCanvas";
import { api } from "@/lib/app/api";
import {
  LANDING_PERIODS,
  LANDING_PUBLIC_STAGES,
  LANDING_RESULT_STATUSES,
  countLabel,
  emptyLandingMapFilter,
  landingMapFilterCount,
  landingMapQueryFilter,
  mapFlow,
  normalizeMapView,
  normalizeThemeIntelligence,
  publishedDateLabel,
  themeRows,
  type LandingMapFilter,
  type LandingPeriodId,
} from "@/lib/app/landing";
import { MAP_THEME_FILTERS } from "@/lib/app/map";
import { DEMAND_STATUS_LABELS, type DemandStatus, type DemandTheme, type MapView, type ThemeIntelligence } from "@/lib/app/types";

// Cor de cada eixo temático (T26) na barra lateral; o nome vai sempre junto da cor.
const THEME_COLORS: Record<DemandTheme, string> = {
  iluminacao: "var(--c-pat)",
  seguranca: "var(--c-urb)",
  saneamento: "var(--c-soc)",
  limpeza: "var(--c-rua)",
  esporte: "var(--c-esp)",
  educacao: "var(--c-edu)",
  mobilidade: "var(--c-sau)",
  cultura: "var(--c-cul)",
  meio_ambiente: "var(--c-amb)",
};

interface FilteredRead {
  key: string;
  view: MapView | null;
  intelligence: ThemeIntelligence | null;
}

/**
 * Mapa de projetos e impacto. Pontos, indicadores e eixos são lidos do banco
 * pelas rotas públicas; cada filtro refaz a leitura no servidor. Nada é amostra.
 */
export function SmartMap() {
  const base = useLandingData();
  const [filter, setFilter] = useState<LandingMapFilter>(emptyLandingMapFilter);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [read, setRead] = useState<FilteredRead | null>(null);

  const applied = landingMapFilterCount(filter);
  const filterKey = applied.total ? JSON.stringify(filter) : "";

  useEffect(() => {
    if (!filterKey) return;
    let active = true;
    const query = landingMapQueryFilter(JSON.parse(filterKey) as LandingMapFilter, base.territories);
    Promise.all([
      api.demandMap(query).then(normalizeMapView).catch(() => null),
      api.themeIntelligence(query).then(normalizeThemeIntelligence).catch(() => null),
    ]).then(([view, intelligence]) => {
      if (active) setRead({ key: filterKey, view, intelligence });
    });
    return () => { active = false; };
  }, [filterKey, base.territories]);

  // Sem filtro vale a leitura do SSR; com filtro, só a resposta daquele recorte.
  const current = filterKey ? (read?.key === filterKey ? read : null) : null;
  const loading = filterKey ? current === null : base.recovering && base.view === null;
  const view = filterKey ? current?.view ?? null : base.view;
  const intelligence = filterKey ? current?.intelligence ?? null : base.intelligence;

  const flow = mapFlow(intelligence);
  const themes = useMemo(() => {
    const rows = new Map(themeRows(intelligence).map((row) => [row.theme, row.total]));
    return MAP_THEME_FILTERS.map(({ id, label }) => ({ id, label, total: rows.get(id) ?? 0 }));
  }, [intelligence]);
  const maxTheme = Math.max(1, ...themes.map((theme) => theme.total));
  const recent = intelligence?.recentDemand ?? null;

  const set = (patch: Partial<LandingMapFilter>) => setFilter((value) => ({ ...value, ...patch }));
  const clear = () => setFilter(emptyLandingMapFilter());
  const stageOptions = filter.withResults
    ? LANDING_PUBLIC_STAGES.filter((stage) => LANDING_RESULT_STATUSES.includes(stage.id))
    : LANDING_PUBLIC_STAGES;

  return (
    <section className="sec mapsec" id="territorio">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow"><i className="eb-n" aria-hidden="true">05</i>Mapa de projetos e impacto</span>
          <h2 className="h2">Onde estão os projetos, os recursos e os resultados.</h2>
          <p className="lede">Dados territoriais viram inteligência: filtre por território, área de impacto e estágio e veja projetos, recursos e resultados no mesmo mapa.</p>
        </div>

        <div className="mapapp" id="territorioApp">
          <div className="appbar">
            <div className="dots" aria-hidden="true"><i /><i /><i /></div>
            <div className="ttl"><svg className="ico" style={{ width: 18, height: 18 }}><use href="#i-map" /></svg>Mapa de projetos e impacto</div>
            <span className="tag-ex sp">Dados públicos</span>
          </div>

          <form className="mf" id="mf" aria-label="Filtros do mapa" onSubmit={(event) => event.preventDefault()}>
            <div className="mf-row">
              <label className="mf-f">
                <span>Território</span>
                <select id="fTerr" value={filter.territory} onChange={(event) => set({ territory: event.target.value })}>
                  <option value="">Todos os territórios</option>
                  {base.territories.map((place) => (
                    <option value={place.slug} key={place.slug}>
                      {[place.territory, [place.municipality, place.uf].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mf-f">
                <span>Área de impacto</span>
                <select id="fEixo" value={filter.theme} onChange={(event) => set({ theme: event.target.value as DemandTheme | "" })}>
                  <option value="">Todos os eixos</option>
                  {MAP_THEME_FILTERS.map(({ id, label }) => <option value={id} key={id}>{label}</option>)}
                </select>
              </label>
              <label className="mf-f">
                <span>Estágio</span>
                <select id="fSt" value={filter.status} onChange={(event) => set({ status: event.target.value as DemandStatus | "" })}>
                  <option value="">Todos os estágios</option>
                  {stageOptions.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}
                </select>
              </label>
              <button type="button" className="mf-more" id="mfMore" aria-expanded={advancedOpen} aria-controls="mfAdv" onClick={() => setAdvancedOpen((value) => !value)}>
                <svg className="ico" aria-hidden="true"><use href="#i-layers" /></svg>Mais filtros
                {applied.advanced ? <span className="mf-n" id="mfN">{applied.advanced}</span> : null}
              </button>
              <div className="mf-res" aria-live="polite">
                <b id="mfCount">{intelligence ? countLabel(intelligence.demandsTotal) : "—"}</b>{" "}
                <span id="mfCountL">{intelligence?.demandsTotal === 1 ? "projeto" : "projetos"}</span>
                {applied.total ? <button type="button" className="mf-clear" id="mfClear" onClick={clear}>Limpar filtros</button> : null}
              </div>
            </div>
            <div className="mf-row mf-adv" id="mfAdv" hidden={!advancedOpen}>
              <label className="mf-f">
                <span>Período de publicação</span>
                <select id="fPer" value={filter.period} onChange={(event) => set({ period: event.target.value as LandingPeriodId | "" })}>
                  <option value="">Todo o período</option>
                  {LANDING_PERIODS.map((period) => <option value={period.id} key={period.id}>{period.label}</option>)}
                </select>
              </label>
              <label className="mf-chk">
                <input
                  type="checkbox"
                  id="fRes"
                  checked={filter.withResults}
                  onChange={(event) => set({
                    withResults: event.target.checked,
                    status: event.target.checked && filter.status && !LANDING_RESULT_STATUSES.includes(filter.status) ? "" : filter.status,
                  })}
                />
                <span>Somente com resultados registrados</span>
              </label>
            </div>
          </form>

          <ol className="mflow" id="mflow" aria-label="Resumo dos projetos filtrados: projetos, recursos, execução, resultados e impacto">
            {flow.map((item) => (
              <li key={item.key} className={item.key === "impacto" ? "is-end" : undefined}>
                <span className="mflow-k">{item.label}</span>
                <b>{item.value}</b>
                <span className="mflow-s">{item.hint}</span>
              </li>
            ))}
          </ol>

          <div className="mapbody">
            <div className="mapview landing-map-view">
              <PublicDemandMapCanvas
                view={view}
                loading={loading}
                publicDemandTotal={intelligence?.demandsTotal ?? null}
                filtered={applied.total > 0}
                onClear={clear}
                height={480}
              />
            </div>

            <aside className="side" aria-label="Painel do território">
              <div>
                <h4>Por eixo de impacto <small className="cb-hint">clique para filtrar</small></h4>
                <div className="catbars" id="catbars">
                  {themes.map((theme) => (
                    <button
                      type="button"
                      className={theme.total ? "catbar" : "catbar is-zero"}
                      key={theme.id}
                      aria-pressed={!filter.theme || filter.theme === theme.id}
                      title={`Filtrar por ${theme.label}`}
                      onClick={() => set({ theme: filter.theme === theme.id ? "" : theme.id })}
                    >
                      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill={THEME_COLORS[theme.id]} /></svg>
                      <span className="nm">{theme.label}</span>
                      <span className="bar"><i style={{ width: `${(theme.total / maxTheme) * 100}%`, background: THEME_COLORS[theme.id] }} /></span>
                      <span className="v">{intelligence ? countLabel(theme.total) : "—"}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h4>Publicação mais recente</h4>
                <div className="detail" id="detail" aria-live="polite">
                  {recent ? (
                    <>
                      <div className="dt">{recent.title}</div>
                      <dl>
                        <dt>Estágio</dt><dd>{DEMAND_STATUS_LABELS[recent.status]}</dd>
                        <dt>Território</dt><dd>{recent.territory || "Não informado"}</dd>
                        {recent.publishedAt ? <><dt>Publicada</dt><dd>{publishedDateLabel(recent.publishedAt)}</dd></> : null}
                      </dl>
                      <p className="hint" style={{ marginTop: 10 }}><Link href={`/demandas/${recent.id}`}>Ver recursos, estágio e resultados</Link></p>
                    </>
                  ) : (
                    <p className="hint">
                      {intelligence
                        ? "Nenhum projeto publicado neste recorte."
                        : loading ? "Carregando dados públicos…" : "Dados públicos indisponíveis agora."}
                    </p>
                  )}
                </div>
              </div>

              <div className="landing-map-action">
                <Link className="btn btn-primary" href="/mapa">
                  Abrir mapa completo
                  <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
                </Link>
              </div>
            </aside>
          </div>
        </div>
        <p className="legend-note" style={{ marginTop: 14 }}>
          Cada ponto é uma demanda publicada com localização e fotografia. Recursos somam o apoio confirmado com valor autorizado para exibição;
          pessoas beneficiadas vêm das prestações de contas concluídas.
        </p>
      </div>
    </section>
  );
}
