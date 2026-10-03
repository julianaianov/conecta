import Link from "next/link";
import { MAP_LEGEND, MAP_THEME_FILTERS } from "@/lib/app/map";
import type { MapView, ThemeIntelligence } from "@/lib/app/types";
import { PublicDemandMapCanvas } from "@/components/PublicDemandMapCanvas";

export function SmartMap({
  view,
  intelligence,
}: {
  view: MapView | null;
  intelligence: ThemeIntelligence | null;
}) {
  const themeCounts = new Map(intelligence?.themes.map((theme) => [theme.theme, theme.total]) ?? []);
  const categoryCounts = view?.counts.mapClass;

  return (
    <section className="sec mapsec" id="territorio">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Território</span>
          <h2 className="h2">Onde estão as demandas e as iniciativas públicas.</h2>
          <p className="lede">
            O mapa mostra demandas publicadas com localização e fotografia. Os pontos, contagens e eixos são lidos do banco do DM Conecta.
          </p>
        </div>

        <div className="mapapp" id="territorioApp">
          <div className="appbar">
            <div className="dots" aria-hidden="true"><i /><i /><i /></div>
            <div className="ttl">
              <svg className="ico" style={{ width: 18, height: 18 }}><use href="#i-map" /></svg>
              Território · Demandas públicas
            </div>
            <span className="tag-ex sp">Fonte: banco público</span>
          </div>

          <div className="mapbody">
            <div className="mapview landing-map-view">
              <PublicDemandMapCanvas
                view={view}
                publicDemandTotal={intelligence?.demandsTotal ?? null}
                height={480}
              />
            </div>

            <aside className="side" aria-label="Indicadores e legenda do mapa">
              <div>
                <h4>Demandas públicas</h4>
                <div className="landing-map-kpis">
                  <div className="kpi">
                    <b>{intelligence ? intelligence.demandsTotal.toLocaleString("pt-BR") : "—"}</b>
                    <span>Publicadas</span>
                  </div>
                  <div className="kpi">
                    <b>{view ? view.counts.total.toLocaleString("pt-BR") : "—"}</b>
                    <span>No mapa</span>
                  </div>
                </div>
              </div>

              <div>
                <h4>Legenda · categoria</h4>
                <ul className="landing-map-legend">
                  {MAP_LEGEND.map((item) => (
                    <li key={item.id}>
                      <span className="landing-map-legend-mark" style={{ backgroundColor: item.color }} aria-hidden="true" />
                      <span>{item.label}</span>
                      <b>{categoryCounts ? categoryCounts[item.id].toLocaleString("pt-BR") : "—"}</b>
                    </li>
                  ))}
                </ul>
                <p className="legend-note">A forma e a cor trabalham juntas para identificar a categoria.</p>
              </div>

              <div>
                <h4>Eixos de impacto</h4>
                <div className="landing-map-themes">
                  {MAP_THEME_FILTERS.map(({ id, label }) => (
                    <Link href={`/mapa?theme=${encodeURIComponent(id)}`} key={id}>
                      {label}<b>{intelligence ? (themeCounts.get(id) ?? 0).toLocaleString("pt-BR") : "—"}</b>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="landing-map-action">
                <p>Abra o mapa completo para filtrar por eixo, estágio e território.</p>
                <Link className="btn btn-primary" href="/mapa">
                  Abrir mapa completo
                  <svg className="ico"><use href="#i-arrow" /></svg>
                </Link>
              </div>
            </aside>
          </div>
        </div>
        <p className="legend-note">A localização exata só é exibida quando a demanda publicada possui coordenadas e fotografia.</p>
      </div>
    </section>
  );
}
