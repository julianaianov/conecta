import { MAP_THEME_FILTERS } from "@/lib/app/map";
import {
  type DemandStatus,
  type DemandTheme,
  type ThemeIntelligence,
} from "@/lib/app/types";

const THEME_COLORS: Record<DemandTheme, string> = {
  iluminacao: "var(--c-pat)",
  seguranca: "var(--c-sau)",
  saneamento: "var(--c-soc)",
  limpeza: "var(--c-ali)",
  esporte: "var(--c-esp)",
  educacao: "var(--c-edu)",
  mobilidade: "var(--c-urb)",
  cultura: "var(--c-cul)",
  meio_ambiente: "var(--c-amb)",
};

const STATUS_COLORS: Record<DemandStatus, string> = {
  em_analise: "var(--muted)",
  publicada: "var(--c-soc)",
  em_busca_de_parceiro: "var(--orange)",
  conectada: "var(--c-edu)",
  em_execucao: "var(--c-amb)",
  concluida: "var(--c-cul)",
  prestacao_de_contas: "var(--c-pat)",
  arquivada: "var(--muted)",
  encerrada: "var(--petro-600)",
};

const PUBLIC_STAGES: { id: DemandStatus; label: string }[] = [
  { id: "publicada", label: "Publicadas" },
  { id: "em_busca_de_parceiro", label: "Buscando apoio" },
  { id: "conectada", label: "Conectadas" },
  { id: "em_execucao", label: "Em execução" },
  { id: "concluida", label: "Concluídas" },
  { id: "prestacao_de_contas", label: "Prestação de contas" },
  { id: "encerrada", label: "Encerradas" },
];

const ACTION_KIND_LABELS: Record<string, string> = {
  acao: "Ação pública",
  programa: "Programa público",
  servico: "Serviço público",
  obra: "Obra pública",
  evento_publico: "Evento público",
  edital: "Edital público",
};

function countLabel(value: number): string {
  return value.toLocaleString("pt-BR");
}

function monthLabel(value: string): string {
  const date = new Date(`${value}-01T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
    .format(date)
    .replace(".", "");
}

function dateLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(date);
}

function DataUnavailable() {
  return (
    <div className="dg-empty" role="status">
      Os indicadores públicos não estão disponíveis agora.
    </div>
  );
}

export function DataGovSection({ intelligence }: { intelligence: ThemeIntelligence | null }) {
  const totalsByTheme = new Map(intelligence?.themes.map((theme) => [theme.theme, theme.total]) ?? []);
  const totalsByStatus = new Map(intelligence?.byStatus.map((item) => [item.status, item.total]) ?? []);
  const months = intelligence?.byMonth ?? [];
  const maxMonth = Math.max(1, ...months.map((item) => item.total));
  const chartLeft = 34;
  const chartRight = 552;
  const chartTop = 10;
  const chartBottom = 190;
  const monthStep = (chartRight - chartLeft) / 12;
  const monthBarWidth = monthStep * 0.56;
  const yValue = (value: number) => chartBottom - (value / maxMonth) * (chartBottom - chartTop);
  const ticks = [...new Set([0, Math.ceil(maxMonth / 2), maxMonth])];
  const hasPublicDemands = (intelligence?.demandsTotal ?? 0) > 0;
  const maxStage = Math.max(1, ...(intelligence?.byStatus.map((item) => item.total) ?? []));

  return (
    <section className="sec band">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Inteligência territorial</span>
          <h2 className="h2">Dados que orientam onde e como investir.</h2>
          <p className="lede">
            Indicadores agregados das demandas públicas cadastradas no DM Conecta.
          </p>
        </div>

        <div className="temas">
          <span className="k">Eixos de impacto · registros por eixo</span>
          <ul>
            {MAP_THEME_FILTERS.map(({ id, label }) => (
              <li key={id}>
                <i className="dg-theme-dot" aria-hidden="true" style={{ backgroundColor: THEME_COLORS[id] }} />
                {label}
                <b>{intelligence ? countLabel(totalsByTheme.get(id) ?? 0) : "—"}</b>
              </li>
            ))}
          </ul>
          <p>
            Uma demanda pode ser associada a mais de um eixo. Os indicadores mostram registros publicados, estágio e território, sem expor dados pessoais.
          </p>
        </div>

        <div className="eq">
          <div className="eqb">
            <span className="ico"><svg className="ico"><use href="#i-doc" /></svg></span>
            <h3>Dados organizados</h3>
            <p>Demandas públicas com eixo, território, estágio e atores envolvidos.</p>
          </div>
          <div className="eqop" aria-hidden="true">+</div>
          <div className="eqb">
            <span className="ico"><svg className="ico"><use href="#i-link" /></svg></span>
            <h3>Histórico de projetos e apoios</h3>
            <p>O que foi estruturado, apoiado e realizado.</p>
          </div>
          <div className="eqop" aria-hidden="true">+</div>
          <div className="eqb">
            <span className="ico"><svg className="ico"><use href="#i-activity" /></svg></span>
            <h3>Inteligência territorial</h3>
            <p>Pessoas, iniciativas, potencial, recursos e impacto de cada território.</p>
          </div>
          <div className="eqop" aria-hidden="true">=</div>
          <div className="eqb res">
            <span className="ico"><svg className="ico"><use href="#i-target" /></svg></span>
            <h3>Base para orientar investimentos sociais e ambientais e acompanhar impacto</h3>
          </div>
        </div>

        <div className="charts">
          <div className="cpanel">
            <div className="ch">
              <div>
                <h3>Demandas publicadas por mês</h3>
                <p className="sub">Últimos 12 meses · dados públicos</p>
              </div>
              <span className="tag-ex">Banco atualizado</span>
            </div>
            {intelligence === null ? <DataUnavailable /> : !hasPublicDemands ? (
              <div className="dg-empty" role="status">Ainda não há demandas públicas para compor a série histórica.</div>
            ) : (
              <svg id="chMonth" viewBox="0 0 580 220" role="img" aria-label="Demandas públicas publicadas por mês nos últimos doze meses">
                {ticks.map((tick) => (
                  <g key={tick}>
                    <line x1={chartLeft} x2={chartRight} y1={yValue(tick)} y2={yValue(tick)} className={tick ? "grid-l" : "base-l"} />
                    <text x={chartLeft - 8} y={yValue(tick) + 4} textAnchor="end" className="ax">{tick}</text>
                  </g>
                ))}
                {months.map((item, index) => {
                  const x = chartLeft + index * monthStep + (monthStep - monthBarWidth) / 2;
                  const top = yValue(item.total);
                  return (
                    <g key={item.month}>
                      <rect x={x} y={top} width={monthBarWidth} height={chartBottom - top} rx={4} className={`vbar ${index === months.length - 1 ? "last" : ""}`} />
                      <text x={x + monthBarWidth / 2} y={chartBottom + 18} textAnchor="middle" className="ax">{monthLabel(item.month)}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          <div className="cpanel">
            <div className="ch">
              <div>
                <h3>Demandas por eixo de impacto</h3>
                <p className="sub">Contagem direta dos registros públicos</p>
              </div>
              <span className="tag-ex">Dados públicos</span>
            </div>
            {intelligence === null ? <DataUnavailable /> : (
              <svg id="chType" viewBox="0 0 390 365" role="img" aria-label="Quantidade de demandas públicas por eixo de impacto">
                {MAP_THEME_FILTERS.map(({ id, label }, index) => {
                  const y = 8 + index * 39;
                  const total = totalsByTheme.get(id) ?? 0;
                  const width = intelligence.demandsWithTheme ? (total / Math.max(1, ...intelligence.themes.map((theme) => theme.total))) * 250 : 0;
                  const color = THEME_COLORS[id];
                  return (
                    <g key={id}>
                      <circle cx={6} cy={y + 7} r={5} fill={color} />
                      <text x={18} y={y + 11} className="hbl">{label}</text>
                      <rect x={0} y={y + 19} width={250} height={9} rx={5} className="dg-axis-track" />
                      <rect x={0} y={y + 19} width={width} height={9} rx={5} fill={color} />
                      <text x={262} y={y + 27} className="hbv">{countLabel(total)}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>

        <p className="band-foot">
          {intelligence
            ? `Fonte: demandas públicas do banco do DM Conecta · ${intelligence.demandsTotal.toLocaleString("pt-BR")} demandas · atualização ${dateLabel(intelligence.generatedAt)}.`
            : "Fonte: indicadores públicos do DM Conecta."}
        </p>
      </div>

      <div className="wrap gov dg-gov" id="gestao">
        <div>
          <span className="eyebrow" style={{ color: "#FF9A5C" }}>Área de governo e gestão pública</span>
          <h2 className="h2" style={{ color: "#fff", marginTop: 16 }}>
            O poder público articula e participa de projetos de interesse público.
          </h2>
          <p className="lede" style={{ color: "#B5D0D6", marginTop: 18 }}>
            Tudo dentro da competência de cada órgão, com critérios claros e registro formal.
          </p>
          <ul className="govlist">
            <li><svg className="ico"><use href="#i-map" /></svg><div><b>Mapa de projetos</b><span>Iniciativas de interesse público por território.</span></div></li>
            <li><svg className="ico"><use href="#i-link" /></svg><div><b>Articulação institucional</b><span>Aproximação com as iniciativas.</span></div></li>
            <li><svg className="ico"><use href="#i-activity" /></svg><div><b>Políticas públicas</b><span>Integração de projetos a políticas públicas.</span></div></li>
            <li><svg className="ico"><use href="#i-target" /></svg><div><b>Programas e editais</b><span>Divulgação de programas, editais e oportunidades.</span></div></li>
            <li><svg className="ico"><use href="#i-target" /></svg><div><b>Resultados e impacto</b><span>Acompanhamento de indicadores e resultados.</span></div></li>
          </ul>
        </div>

        <div className="dash">
          <div className="appbar" style={{ background: "var(--surface)" }}>
            <div className="ttl"><svg className="ico" style={{ width: 18, height: 18 }}><use href="#i-gov" /></svg>Painel de gestão</div>
            <div className="tabs" aria-hidden="true"><span className="on">Visão geral</span><span>Territórios</span><span>Programas e editais</span></div>
            <span className="tag-ex sp">Indicadores públicos</span>
          </div>

          <div className="scrollx" aria-label="Demandas públicas por estágio">
            <div className="pipe" id="pipe">
              <div className="pstage pstage-total">
                <span className="k"><i style={{ background: "var(--petro-600)" }} />Demandas públicas</span>
                <b>{intelligence ? countLabel(intelligence.demandsTotal) : "—"}</b>
                <div className="meter" aria-hidden="true"><i style={{ width: intelligence?.demandsTotal ? "100%" : "0%" }} /></div>
              </div>
              {PUBLIC_STAGES.map((stage) => {
                const total = totalsByStatus.get(stage.id) ?? 0;
                const color = STATUS_COLORS[stage.id];
                return (
                  <div className={`pstage ${stage.id === "concluida" || stage.id === "encerrada" ? "done" : ""}`} key={stage.id}>
                    <span className="k"><i style={{ background: color }} />{stage.label}</span>
                    <b>{intelligence ? countLabel(total) : "—"}</b>
                    <div className="meter" aria-hidden="true"><i style={{ width: `${intelligence?.demandsTotal ? (total / maxStage) * 100 : 0}%`, background: color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dcols">
            <div>
              <h4>Demandas por território</h4>
              {intelligence === null ? <DataUnavailable /> : intelligence.territories.length ? (
                <div className="scrollx">
                  <table className="pri">
                    <thead><tr><th>Território</th><th>Demandas</th><th>Em execução</th><th>Concluídas</th></tr></thead>
                    <tbody>
                      {intelligence.territories.slice(0, 4).map((item) => (
                        <tr key={`${item.territory}-${item.municipality ?? ""}-${item.uf ?? ""}`}>
                          <td>{[item.territory, item.municipality, item.uf].filter(Boolean).join(" · ")}</td>
                          <td>{countLabel(item.total)}</td>
                          <td>{countLabel(item.inExecution)}</td>
                          <td>{countLabel(item.concluded)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="dg-empty" role="status">Ainda não há demandas públicas com território informado.</div>}
            </div>

            <div>
              <h4>Articulações institucionais publicadas</h4>
              {intelligence === null ? <DataUnavailable /> : intelligence.recentGovernmentActions.length ? (
                <ul className="resp">
                  {intelligence.recentGovernmentActions.map((action) => (
                    <li className="ritem" key={action.id}>
                      <div className="who"><span>{action.organizationName}</span><span>{ACTION_KIND_LABELS[action.kind] ?? "Ação pública"}</span></div>
                      <b>{action.title}</b>
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        {[action.territory, action.municipality, action.uf].filter(Boolean).join(" · ") || "Território não informado"}
                        {action.publishedAt ? ` · ${dateLabel(action.publishedAt)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : <div className="dg-empty" role="status">Ainda não há articulações institucionais públicas.</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
