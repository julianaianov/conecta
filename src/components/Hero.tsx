import { DEMAND_STATUS_LABELS, type MapView, type ThemeIntelligence } from "@/lib/app/types";
import { PublicDemandMapCanvas } from "@/components/PublicDemandMapCanvas";

interface HeroProps {
  mapView: MapView | null;
  intelligence: ThemeIntelligence | null;
  stats: Array<{ value: string; label: string }>;
}

function publishedDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

export function Hero({ mapView, intelligence, stats }: HeroProps) {
  const recentDemand = intelligence?.recentDemand ?? null;
  const recentPlace = [recentDemand?.territory].filter(Boolean).join(" · ");

  return (
    <section className="hero" id="top">
      <span className="sr-only">
        Infraestrutura Digital de Impacto Local. Conecte-se · Participe · <br /> <span className="gradient-text">Transforme</span>
        O DM Conecta identifica demandas reais das comunidades, estrutura projetos e conecta empresas, organizações e poder público para transformar recursos em impacto local mensurável.
      </span>

      <div className="wrap">
        <div className="hx-head">
          <div>
            <span className="eyebrow">Infraestrutura digital de impacto social e ambiental</span>
            <h1>Conectando projetos locais a quem pode <em>transformar</em>.</h1>
          </div>
          <div className="hx-side">
            <p className="lede">
              O DM Conecta estrutura projetos de impacto social e ambiental e os conecta a empresas, institutos, poder público e comunidade, transformando iniciativas em impacto mensurável nos territórios.
            </p>
            <div className="slogan" aria-label="Slogan">
              <span>Conecte-se.</span><span>Participe.</span><span>Transforme.</span>
            </div>
          </div>
        </div>

        <div className="mapapp hx-app" id="mx">
          <div className="appbar">
            <div className="dots" aria-hidden="true"><i /><i /><i /></div>
            <div className="ttl">
              <svg className="ico" style={{ width: 18, height: 18 }}><use href="#i-map" /></svg>
              Território · Demandas publicadas
            </div>
            <span className="tag-ex sp">Dados públicos</span>
          </div>

          <div className="mapbody">
            <div className="mapview landing-map-view">
              <PublicDemandMapCanvas
                view={mapView}
                publicDemandTotal={intelligence?.demandsTotal ?? null}
                height="clamp(320px, 38vw, 500px)"
              />
            </div>

            <aside className="side" aria-label="Resumo público do território">
              <div>
                <h4>Demanda pública recente</h4>
                {recentDemand ? (
                  <div className="detail landing-recent-demand">
                    <div className="hx-row">
                      <span className="hx-k">{recentPlace || "Território não informado"}</span>
                      <span className="chip">{DEMAND_STATUS_LABELS[recentDemand.status]}</span>
                    </div>
                    <div className="dt">{recentDemand.title}</div>
                    {recentDemand.publishedAt ? <p className="hx-sub">Publicada em {publishedDate(recentDemand.publishedAt)}</p> : null}
                  </div>
                ) : (
                  <div className="detail landing-recent-demand" role="status">
                    <div className="dt">{intelligence ? "Nenhuma demanda pública cadastrada" : "Dados públicos indisponíveis"}</div>
                    <p className="hx-sub">As demandas aprovadas aparecem aqui depois da publicação.</p>
                  </div>
                )}
              </div>

              <div>
                <h4>Indicadores do território</h4>
                <div className="landing-hero-stats">
                  {stats.map((stat) => (
                    <div className="kpi" key={stat.label}>
                      <b>{stat.value}</b>
                      <span>{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
