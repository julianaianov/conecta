"use client";

import React, { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLandingData } from "@/components/LandingData";
import {
  countLabel,
  formatCompactBRL,
  governmentActionRows,
  monthBars,
  niceMax,
  resourceRows,
  stageTotals,
  territoryRows,
} from "@/lib/app/landing";
import { type DemandStatus } from "@/lib/app/types";

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

function dateLabel(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(date);
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="dg-empty" role="status">{children}</div>;
}

// As três perguntas que os dados respondem: uma por vez, em abas.
const QUESTIONS = [
  { question: "Como os projetos evoluem?", title: "Projetos publicados por mês" },
  { question: "Onde estão e em que estágio?", title: "Projetos por território" },
  { question: "Quanto já foi mobilizado?", title: "Recursos por eixo de impacto" },
] as const;

/** Inteligência territorial e painel de gestão: só contagens agregadas do banco público. */
export function DataGovSection() {
  const { intelligence, recovering } = useLandingData();
  const [tab, setTab] = useState(0);
  const [seen, setSeen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);

  // As barras crescem na primeira vez em que o bloco aparece e a cada troca de aba.
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setSeen(true);
    }, { threshold: 0.25 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (tab + step + QUESTIONS.length) % QUESTIONS.length;
    setTab(next);
    tabButtons.current[next]?.focus();
  };
  const panel = (index: number) => ({
    className: seen ? "cpanel grow" : "cpanel",
    id: `ixP${index}`,
    role: "tabpanel",
    "aria-labelledby": `ixT${index}`,
    hidden: tab !== index,
  });
  const unavailable = intelligence === null
    ? (recovering ? "Carregando os indicadores públicos…" : "Os indicadores públicos não estão disponíveis agora.")
    : null;

  // Gráfico 1: demandas publicadas por mês (últimos 12 meses).
  const bars = monthBars(intelligence);
  const L = 34, R = 552, T = 10, B = 190;
  const maxM = niceMax(Math.max(0, ...bars.map((bar) => bar.total)));
  const step = (R - L) / Math.max(bars.length, 1);
  const bw = step * 0.56;
  const yVal = (v: number) => B - (v / maxM) * (B - T);
  const lastBar = bars.at(-1);

  // Gráfico 2: território × estágio.
  const territories = territoryRows(intelligence);
  const maxTerritory = Math.max(1, ...territories.map((row) => row.total));

  // Gráfico 3: orçamento × apoio confirmado por eixo.
  const resources = resourceRows(intelligence);
  const maxBudget = Math.max(1, ...resources.map((row) => row.budgetCents));

  // Painel de gestão.
  const stages = stageTotals(intelligence);
  const maxStage = Math.max(1, ...stages.map((stage) => stage.total));
  const actions = governmentActionRows(intelligence);
  const updatedAt = dateLabel(intelligence?.generatedAt ?? null);

  return (
    <section className="sec band">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow"><i className="eb-n" aria-hidden="true">06</i>Inteligência territorial</span>
          <h2 className="h2">Dados que orientam decisões nos territórios.</h2>
          <p className="lede">
            Quanto mais a plataforma é usada, mais completo fica o mapa dos projetos e do impacto nos territórios.
          </p>
        </div>

        {unavailable ? <Empty>{unavailable}</Empty> : (
        <div className="ix is-tabs" id="ix" ref={box}>
        <div className="ix-tabs" id="ixTabs" role="tablist" aria-label="Perguntas que os dados respondem">
          {QUESTIONS.map((item, index) => (
            <button
              type="button"
              className="ix-t"
              id={`ixT${index}`}
              role="tab"
              aria-controls={`ixP${index}`}
              aria-selected={tab === index}
              tabIndex={tab === index ? 0 : -1}
              key={item.question}
              ref={(el) => { tabButtons.current[index] = el; }}
              onClick={() => setTab(index)}
              onKeyDown={onTabKey}
            >
              <span className="n">{String(index + 1).padStart(2, "0")}</span>
              <span className="q">{item.question}</span>
              <span className="s">{item.title}</span>
            </button>
          ))}
        </div>
        <div className="charts charts4 ix-pans">
          <div {...panel(0)}>
            <div className="ch">
              <div>
                <span className="cq">{QUESTIONS[0].question}</span>
                <h3>{QUESTIONS[0].title}</h3>
              </div>
              <span className="tag-ex">Dados públicos</span>
            </div>
            <svg id="chMonth" viewBox="0 0 560 220" role="img" aria-label="Gráfico de barras com os projetos publicados por mês nos últimos 12 meses.">
              {[...new Set([0, maxM / 2, maxM])].map((t) => (
                <g key={t}>
                  <line x1={L} x2={R} y1={yVal(t)} y2={yVal(t)} className={t ? "grid-l" : "base-l"} />
                  <text x={L - 8} y={yVal(t) + 4} textAnchor="end" className="ax">{t}</text>
                </g>
              ))}
              {bars.map((bar, i) => {
                const x = L + i * step + (step - bw) / 2;
                const top = yVal(bar.total);
                const r = Math.min(4, B - top);
                const d = `M${x} ${B} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${B}Z`;
                return (
                  <g key={bar.month}>
                    <path d={d} className={`vbar ${i === bars.length - 1 ? "last" : ""}`} />
                    <text x={x + bw / 2} y={B + 18} textAnchor="middle" className="ax">{bar.label}</text>
                  </g>
                );
              })}
              {lastBar ? (
                <text x={L + (bars.length - 1) * step + step / 2} y={yVal(lastBar.total) - 8} textAnchor="middle" className="hbv">{lastBar.total}</text>
              ) : null}
            </svg>
          </div>

          <div {...panel(1)}>
            <div className="ch">
              <div>
                <span className="cq">{QUESTIONS[1].question}</span>
                <h3>{QUESTIONS[1].title}</h3>
              </div>
              <span className="tag-ex">Dados públicos</span>
            </div>
            <ul className="hb-leg" aria-label="Estágios">
              <li><i className="s0" />Ainda não iniciadas</li>
              <li><i className="s2" />Em execução</li>
              <li><i className="s3" />Concluídas</li>
            </ul>
            {territories.length === 0 ? (
              <Empty>Nenhuma demanda pública com território informado.</Empty>
            ) : (
              <div className="hb" id="chTerr" role="list" aria-label="Demandas por território, divididas por estágio">
                {territories.map((row) => (
                  <div
                    className="hb-r"
                    role="listitem"
                    key={row.key}
                    title={`${row.name}${row.place ? ` · ${row.place}` : ""} · ${countLabel(row.total)} demandas`}
                  >
                    <span className="hb-n">{row.name}</span>
                    <span className="hb-t hb-stack" style={{ width: `${(row.total / maxTerritory) * 100}%` }}>
                      {row.open ? <i className="s0" style={{ flex: row.open }} /> : null}
                      {row.inExecution ? <i className="s2" style={{ flex: row.inExecution }} /> : null}
                      {row.concluded ? <i className="s3" style={{ flex: row.concluded }} /> : null}
                    </span>
                    <span className="hb-v">{countLabel(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div {...panel(2)}>
            <div className="ch">
              <div>
                <span className="cq">{QUESTIONS[2].question}</span>
                <h3>{QUESTIONS[2].title}</h3>
              </div>
              <span className="tag-ex">Dados públicos</span>
            </div>
            <ul className="hb-leg" aria-label="Legenda">
              <li><i className="m1" />Apoio confirmado</li>
              <li><i className="m0" />Orçamento das demandas</li>
            </ul>
            {resources.length === 0 ? (
              <Empty>Nenhuma demanda pública com eixo e orçamento informados.</Empty>
            ) : (
              <div className="hb" id="chRec" role="list" aria-label="Apoio confirmado em relação ao orçamento, por eixo de impacto">
                {resources.map((row) => (
                  <div
                    className="hb-r hb-rec"
                    role="listitem"
                    key={row.theme}
                    title={`${row.label} · Apoio confirmado: ${formatCompactBRL(row.mobilizedCents)} · Orçamento: ${formatCompactBRL(row.budgetCents)}`}
                  >
                    <span className="hb-n">{row.label}</span>
                    <span className="hb-t hb-bullet" style={{ width: `${(row.budgetCents / maxBudget) * 100}%` }}>
                      <i style={{ width: `${Math.min(100, row.percent)}%` }} />
                    </span>
                    <span className="hb-v">{row.percent}%</span>
                  </div>
                ))}
              </div>
            )}
            <p className="legend-note">Só entra apoio já confirmado pelo Agente, com valor autorizado para exibição.</p>
          </div>
        </div>
        </div>
        )}

        <p className="band-foot">
          Contagens agregadas das demandas públicas do DM Conecta, sem dados pessoais
          {updatedAt ? `. Atualizado em ${updatedAt}.` : "."}
        </p>
      </div>

      <div className="wrap gov dg-gov" id="gestao">
        <div>
          <span className="eyebrow">Área de governo e gestão pública</span>
          <h2 className="h2" style={{ marginTop: 16 }}>
            O poder público articula e participa de projetos de interesse público.
          </h2>
          <p className="lede" style={{ marginTop: 16 }}>
            Tudo dentro da competência de cada órgão, com critérios claros e registro formal.
          </p>
          <ul className="govlist">
            <li><svg className="ico"><use href="#i-eye" /></svg><div><b>Mapa de projetos</b><span>Iniciativas de interesse público por território.</span></div></li>
            <li><svg className="ico"><use href="#i-link" /></svg><div><b>Articulação institucional</b><span>Aproximação com as iniciativas.</span></div></li>
            <li><svg className="ico"><use href="#i-gov" /></svg><div><b>Políticas públicas</b><span>Integração de projetos a políticas públicas.</span></div></li>
            <li><svg className="ico"><use href="#i-mega" /></svg><div><b>Programas e editais</b><span>Divulgação de programas, editais e oportunidades.</span></div></li>
            <li><svg className="ico"><use href="#i-bars" /></svg><div><b>Resultados e impacto</b><span>Acompanhamento de indicadores e resultados.</span></div></li>
          </ul>
        </div>

        <div className="dash">
          <div className="appbar">
            <div className="ttl"><svg className="ico" style={{ width: 18, height: 18 }}><use href="#i-gov" /></svg>Painel de gestão</div>
            <div className="tabs" aria-hidden="true"><span className="on">Visão geral</span><span>Territórios</span><span>Programas e editais</span></div>
            <span className="tag-ex sp">Dados públicos</span>
          </div>

          {unavailable ? <Empty>{unavailable}</Empty> : (
            <>
              <div className="scrollx" tabIndex={0} aria-label="Indicadores do painel, role horizontalmente se necessário">
                <div className="pipe" id="pipe">
                  <div className="pstage pstage-total">
                    <span className="k"><i style={{ background: "var(--petro-600)" }} />Demandas públicas</span>
                    <b>{countLabel(intelligence?.demandsTotal ?? 0)}</b>
                    <div className="meter" aria-hidden="true"><i style={{ width: "100%" }} /></div>
                  </div>
                  {stages.map((stage) => {
                    const color = STATUS_COLORS[stage.id];
                    return (
                      <div className={`pstage ${stage.id === "concluida" || stage.id === "encerrada" ? "done" : ""}`} key={stage.id}>
                        <span className="k"><i style={{ background: color }} />{stage.label}</span>
                        <b>{countLabel(stage.total)}</b>
                        <div className="meter" aria-hidden="true"><i style={{ width: `${(stage.total / maxStage) * 100}%`, background: color }} /></div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="dcols">
                <div>
                  <h4>Projetos por território</h4>
                  {territories.length === 0 ? (
                    <Empty>Nenhuma demanda pública com território informado.</Empty>
                  ) : (
                    <div className="scrollx">
                      <table className="pri">
                        <thead><tr><th>Território</th><th>Projetos</th><th>Em execução</th><th>Eixo principal</th></tr></thead>
                        <tbody>
                          {territories.slice(0, 4).map((row) => (
                            <tr key={row.key}>
                              <td>{row.name}{row.place ? <small> · {row.place}</small> : null}</td>
                              <td>{countLabel(row.total)}</td>
                              <td>{countLabel(row.inExecution)}</td>
                              <td>{row.mainTheme ? <span className="prio md">{row.mainTheme}</span> : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div>
                  <h4>Articulações recentes</h4>
                  {actions.length === 0 ? (
                    <Empty>Nenhuma ação de órgão público divulgada até agora.</Empty>
                  ) : (
                    <ul className="resp">
                      {actions.slice(0, 2).map((action) => (
                        <li className="ritem" key={action.id}>
                          <div className="who"><span>{action.organizationName}</span><span>{action.kindLabel}</span></div>
                          <b>{action.title}</b>
                          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                            {[action.place, dateLabel(action.publishedAt)].filter(Boolean).join(" · ")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
