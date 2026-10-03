"use client";

import React from "react";
import {
  type DemandStatus,
  type ThemeIntelligence,
} from "@/lib/app/types";

const CATS: Record<string, { name: string; c: string }> = {
  edu: { name: "Educação", c: "var(--c-edu)" },
  esp: { name: "Esporte", c: "var(--c-esp)" },
  cul: { name: "Cultura", c: "var(--c-cul)" },
  ani: { name: "Proteção Animal", c: "var(--c-ani)" },
  amb: { name: "Meio Ambiente", c: "var(--c-amb)" },
  sau: { name: "Saúde e Bem-estar", c: "var(--c-sau)" },
  ali: { name: "Segurança Alimentar", c: "var(--c-ali)" },
  rua: { name: "População em Situação de Rua", c: "var(--c-rua)" },
};

const PTS_DEMO = [
  { k: "edu", sec: "Bairro A", st: 2, orc: 18, mob: 18 },
  { k: "edu", sec: "Bairro J", st: 1, orc: 24, mob: 10 },
  { k: "edu", sec: "Bairro G", st: 0, orc: 36, mob: 0 },
  { k: "edu", sec: "Bairro H", st: 3, orc: 12, mob: 12 },
  { k: "esp", sec: "Bairro A", st: 2, orc: 45, mob: 45 },
  { k: "esp", sec: "Bairro B", st: 1, orc: 30, mob: 8 },
  { k: "esp", sec: "Bairro C", st: 1, orc: 60, mob: 24 },
  { k: "esp", sec: "Bairro E", st: 0, orc: 22, mob: 0 },
  { k: "cul", sec: "Bairro J", st: 2, orc: 15, mob: 15 },
  { k: "cul", sec: "Bairro D", st: 3, orc: 28, mob: 28 },
  { k: "cul", sec: "Bairro E", st: 1, orc: 40, mob: 14 },
  { k: "cul", sec: "Bairro K", st: 0, orc: 52, mob: 0 },
  { k: "ani", sec: "Bairro H", st: 2, orc: 20, mob: 20 },
  { k: "ani", sec: "Bairro F", st: 3, orc: 34, mob: 34 },
  { k: "ani", sec: "Bairro D", st: 1, orc: 26, mob: 10 },
  { k: "amb", sec: "Bairro I", st: 2, orc: 48, mob: 48 },
  { k: "amb", sec: "Bairro K", st: 1, orc: 16, mob: 4 },
  { k: "amb", sec: "Bairro B", st: 0, orc: 38, mob: 0 },
  { k: "amb", sec: "Bairro A", st: 3, orc: 55, mob: 55 },
  { k: "sau", sec: "Bairro G", st: 1, orc: 25, mob: 9 },
  { k: "sau", sec: "Bairro I", st: 2, orc: 32, mob: 32 },
  { k: "sau", sec: "Bairro C", st: 0, orc: 44, mob: 0 },
  { k: "ali", sec: "Bairro D", st: 2, orc: 21, mob: 21 },
  { k: "ali", sec: "Bairro J", st: 1, orc: 58, mob: 20 },
  { k: "ali", sec: "Bairro F", st: 3, orc: 27, mob: 27 },
  { k: "rua", sec: "Bairro B", st: 1, orc: 35, mob: 12 },
  { k: "rua", sec: "Bairro G", st: 0, orc: 19, mob: 0 },
  { k: "rua", sec: "Bairro A", st: 2, orc: 42, mob: 42 },
];

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

function countLabel(value: number): string {
  return value.toLocaleString("pt-BR");
}

function fmtR(v: number): string {
  if (!v) return "R$ 0";
  if (v >= 1000) return "R$ " + (v / 1000).toFixed(1).replace('.', ',') + " mi";
  return "R$ " + v + " mil";
}

export function DataGovSection({ intelligence }: { intelligence: ThemeIntelligence | null }) {
  // Chart 1: Months data
  const M = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const V = [18, 22, 19, 27, 31, 29, 35, 38, 34, 41, 44, 47];
  const L = 34, R = 552, T = 10, B = 190, maxM = 50;
  const step = (R - L) / 12;
  const bw = step * 0.56;
  const yVal = (v: number) => B - (v / maxM) * (B - T);

  // Chart 2 & 4: Categories & resources
  const byE = Object.entries(CATS).map(([k, C]) => {
    const list = PTS_DEMO.filter((p) => p.k === k);
    return {
      k,
      n: C.name,
      v: list.length,
      orc: list.reduce((a, p) => a + p.orc, 0),
      mob: list.reduce((a, p) => a + p.mob, 0),
    };
  });
  const mE = Math.max(...byE.map((r) => r.v));
  const sortedByE = [...byE].sort((a, b) => b.v - a.v);

  const mR = Math.max(...byE.map((r) => r.orc));
  const sortedRec = [...byE].sort((a, b) => b.orc - a.orc);

  // Chart 3: Territories x stages
  const secs: Record<string, [number, number, number, number]> = {};
  PTS_DEMO.forEach((p) => {
    if (!secs[p.sec]) secs[p.sec] = [0, 0, 0, 0];
    secs[p.sec][p.st]++;
  });
  const terrRows = Object.entries(secs)
    .filter(([k]) => k !== "—")
    .map(([k, a]) => ({ n: k, a, v: a.reduce((x, y) => x + y, 0) }))
    .sort((a, b) => b.v - a.v)
    .slice(0, 7);
  const mT = Math.max(...terrRows.map((r) => r.v));

  // Gov Dashboard Data
  const totalsByStatus = new Map(intelligence?.byStatus.map((item) => [item.status, item.total]) ?? []);
  const maxStage = Math.max(1, ...(intelligence?.byStatus.map((item) => item.total) ?? []));

  return (
    <section className="sec band">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Inteligência territorial</span>
          <h2 className="h2">Dados que orientam onde e como investir.</h2>
          <p className="lede">
            Quanto mais a plataforma é usada, mais completo fica o mapa dos projetos e do impacto nos territórios.
          </p>
        </div>

        <div className="temas">
          <p>
            <b>Os dados mostram:</b> distribuição e número de projetos por eixo, público beneficiado, recursos mobilizados, projetos em execução e resultados alcançados.
          </p>
        </div>

        <div className="eq">
          <div className="eqb">
            <svg className="ico"><use href="#i-layers" /></svg>
            <h3>Dados organizados</h3>
            <p>Projetos com eixo, território, público, estágio e atores envolvidos.</p>
          </div>
          <div className="eqop" aria-hidden="true">+</div>
          <div className="eqb">
            <svg className="ico"><use href="#i-clock" /></svg>
            <h3>Histórico de projetos e apoios</h3>
            <p>O que foi estruturado, apoiado e realizado.</p>
          </div>
          <div className="eqop" aria-hidden="true">+</div>
          <div className="eqb">
            <svg className="ico"><use href="#i-radar" /></svg>
            <h3>Inteligência territorial</h3>
            <p>Pessoas, iniciativas, potencial, recursos e impacto de cada território.</p>
          </div>
          <div className="eqop" aria-hidden="true">=</div>
          <div className="eqb res">
            <svg className="ico" style={{ color: "#FF9A5C" }}><use href="#i-target" /></svg>
            <h3>Base para orientar investimentos sociais e ambientais e acompanhar impacto</h3>
          </div>
        </div>

        <div className="charts charts4">
          <div className="cpanel">
            <div className="ch">
              <div>
                <span className="cq">Como os projetos evoluem?</span>
                <h3>Projetos cadastrados por mês</h3>
              </div>
              <span className="tag-ex">Exemplo</span>
            </div>
            <svg id="chMonth" viewBox="0 0 560 220" role="img" aria-label="Gráfico de barras ilustrativo com projetos cadastrados por mês.">
              {[0, 25, 50].map((t) => (
                <g key={t}>
                  <line x1={L} x2={R} y1={yVal(t)} y2={yVal(t)} className={t ? "grid-l" : "base-l"} />
                  <text x={L - 8} y={yVal(t) + 4} textAnchor="end" className="ax">{t}</text>
                </g>
              ))}
              {V.map((v, i) => {
                const x = L + i * step + (step - bw) / 2;
                const top = yVal(v);
                const r = 4;
                const d = `M${x} ${B} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + bw - r} Q${x + bw} ${top} ${x + bw} ${top + r} V${B}Z`;
                return (
                  <g key={M[i]}>
                    <path d={d} className={`vbar ${i === 11 ? "last" : ""}`} />
                    <text x={x + bw / 2} y={B + 18} textAnchor="middle" className="ax">{M[i]}</text>
                  </g>
                );
              })}
              <text x={L + 11 * step + step / 2} y={yVal(47) - 8} textAnchor="middle" className="hbv">47</text>
            </svg>
          </div>

          <div className="cpanel">
            <div className="ch">
              <div>
                <span className="cq">Em que áreas estão?</span>
                <h3>Projetos por eixo de impacto</h3>
              </div>
              <span className="tag-ex">Exemplo</span>
            </div>
            <div className="hb" id="chType" role="list" aria-label="Quantidade de projetos por eixo de impacto no mapa de demonstração">
              {sortedByE.map((r) => (
                <div className="hb-r" role="listitem" key={r.n} data-tip={`<b>${r.n}</b> · ${r.v} projetos (exemplo)`}>
                  <span className="hb-n">{r.n}</span>
                  <span className="hb-t"><i style={{ width: `${(r.v / mE) * 100}%` }} /></span>
                  <span className="hb-v">{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cpanel">
            <div className="ch">
              <div>
                <span className="cq">Onde estão e em que estágio?</span>
                <h3>Projetos por território</h3>
              </div>
              <span className="tag-ex">Exemplo</span>
            </div>
            <ul className="hb-leg" aria-label="Estágios">
              <li><i className="s0" />Em estruturação</li>
              <li><i className="s1" />Buscando apoio</li>
              <li><i className="s2" />Em execução</li>
              <li><i className="s3" />Concluído</li>
            </ul>
            <div className="hb" id="chTerr" role="list" aria-label="Projetos por bairro, divididos por estágio">
              {terrRows.map((r) => (
                <div className="hb-r" role="listitem" key={r.n} data-tip={`<b>${r.n}</b> · ${r.v} projetos`}>
                  <span className="hb-n">{r.n}</span>
                  <span className="hb-t hb-stack" style={{ width: `${(r.v / mT) * 100}%` }}>
                    {r.a.map((c, i) => c ? <i key={i} className={`s${i}`} style={{ flex: c }} /> : null)}
                  </span>
                  <span className="hb-v">{r.v}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="cpanel">
            <div className="ch">
              <div>
                <span className="cq">Quanto já foi mobilizado?</span>
                <h3>Recursos por eixo de impacto</h3>
              </div>
              <span className="tag-ex">Exemplo</span>
            </div>
            <ul className="hb-leg" aria-label="Legenda">
              <li><i className="m1" />Mobilizado</li>
              <li><i className="m0" />Orçamento total</li>
            </ul>
            <div className="hb" id="chRec" role="list" aria-label="Recursos mobilizados em relação ao orçamento, por eixo de impacto">
              {sortedRec.map((r) => {
                const pct = r.orc > 0 ? Math.round((r.mob / r.orc) * 100) : 0;
                return (
                  <div className="hb-r hb-rec" role="listitem" key={r.n} data-tip={`<b>${r.n}</b> · Mobilizado: ${fmtR(r.mob)} · Orçamento: ${fmtR(r.orc)} (exemplo)`}>
                    <span className="hb-n">{r.n}</span>
                    <span className="hb-t hb-bullet" style={{ width: `${(r.orc / mR) * 100}%` }}>
                      <i style={{ width: `${pct}%` }} />
                    </span>
                    <span className="hb-v">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <p className="band-foot">
          Valores ilustrativos, usados apenas para demonstrar a visualização. Não representam dados reais.
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
            <span className="tag-ex sp">Dados fictícios</span>
          </div>

          <div className="scrollx" aria-label="Demandas públicas por estágio">
            <div className="pipe" id="pipe">
              <div className="pstage pstage-total">
                <span className="k"><i style={{ background: "var(--petro-600)" }} />Demandas públicas</span>
                <b>{intelligence ? countLabel(intelligence.demandsTotal) : "28"}</b>
                <div className="meter" aria-hidden="true"><i style={{ width: "100%" }} /></div>
              </div>
              {PUBLIC_STAGES.map((stage) => {
                const total = totalsByStatus.get(stage.id) ?? (stage.id === "publicada" ? 7 : stage.id === "em_busca_de_parceiro" ? 9 : stage.id === "em_execucao" ? 8 : 4);
                const color = STATUS_COLORS[stage.id];
                return (
                  <div className={`pstage ${stage.id === "concluida" || stage.id === "encerrada" ? "done" : ""}`} key={stage.id}>
                    <span className="k"><i style={{ background: color }} />{stage.label}</span>
                    <b>{countLabel(total)}</b>
                    <div className="meter" aria-hidden="true"><i style={{ width: `${(total / (maxStage || 10)) * 100}%`, background: color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dcols">
            <div>
              <h4>Projetos por território</h4>
              <div className="scrollx">
                <table className="pri">
                  <thead><tr><th>Bairro</th><th>Projetos</th><th>Em execução</th><th>Eixo principal</th></tr></thead>
                  <tbody>
                    <tr><td>Bairro J</td><td>9</td><td>2</td><td><span className="prio md">Esporte</span></td></tr>
                    <tr><td>Bairro B</td><td>7</td><td>1</td><td><span className="prio md">Educação</span></td></tr>
                    <tr><td>Bairro G</td><td>6</td><td>3</td><td><span className="prio md">Cultura</span></td></tr>
                    <tr><td>Bairro I</td><td>4</td><td>2</td><td><span className="prio md">Meio Ambiente</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4>Articulações recentes</h4>
              <ul className="resp">
                <li className="ritem">
                  <div className="who"><span>SECRETARIA (EXEMPLO)</span><span>Em articulação</span></div>
                  <b>Escolinha de futebol · Bairro C</b>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    Projeto relacionado a programa municipal de esporte e juventude.
                  </span>
                </li>
                <li className="ritem">
                  <div className="who"><span>ÓRGÃO PÚBLICO (EXEMPLO)</span><span>Divulgado</span></div>
                  <b>Educação ambiental · Bairro J</b>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    Edital de iniciativas socioambientais compartilhado com o projeto.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
