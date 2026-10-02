export function DataGovSection() {
  const months = [
    { m: "Jan", v: 18 },
    { m: "Fev", v: 22 },
    { m: "Mar", v: 19 },
    { m: "Abr", v: 27 },
    { m: "Mai", v: 31 },
    { m: "Jun", v: 29 },
    { m: "Jul", v: 35 },
    { m: "Ago", v: 38 },
    { m: "Set", v: 34 },
    { m: "Out", v: 41 },
    { m: "Nov", v: 44 },
    { m: "Dez", v: 47 },
  ];

  const axes = [
    { name: "Educação", c: "var(--c-edu)", v: 4 },
    { name: "Esporte", c: "var(--c-esp)", v: 4 },
    { name: "Cultura", c: "var(--c-cul)", v: 4 },
    { name: "Proteção Animal", c: "var(--c-ani)", v: 3 },
    { name: "Meio Ambiente", c: "var(--c-amb)", v: 4 },
    { name: "Saúde e Bem-estar", c: "var(--c-sau)", v: 3 },
    { name: "Segurança Alimentar", c: "var(--c-ali)", v: 3 },
    { name: "População de Rua", c: "var(--c-rua)", v: 3 },
  ];

  const maxMonth = 50;
  const L = 34;
  const R = 552;
  const T = 10;
  const B = 190;
  const step = (R - L) / 12;
  const bw = step * 0.56;
  const yVal = (v: number) => B - (v / maxMonth) * (B - T);

  return (
    <section className="sec band">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Inteligência territorial</span>
          <h2 className="h2">Dados que orientam onde e como investir.</h2>
          <p className="lede">
            Quanto mais a plataforma é usada, mais completo fica o mapa dos
            projetos e do impacto nos territórios.
          </p>
        </div>

        <div className="temas">
          <span className="k">Eixos de impacto</span>
          <ul>
            <li>Educação</li>
            <li>Esporte</li>
            <li>Cultura</li>
            <li>Proteção Animal</li>
            <li>Meio Ambiente</li>
            <li>Saúde e Bem-estar</li>
            <li>Segurança Alimentar</li>
            <li>População em Situação de Rua</li>
          </ul>
          <p>
            Os dados mostram: distribuição e número de projetos por eixo,
            público beneficiado, recursos mobilizados, projetos em execução e
            resultados alcançados.
          </p>
        </div>

        {/* Equação do Impacto */}
        <div className="eq">
          <div className="eqb">
            <span className="ico">
              <svg className="ico">
                <use href="#i-doc" />
              </svg>
            </span>
            <h3>Dados organizados</h3>
            <p>
              Projetos com eixo, território, público, estágio e atores
              envolvidos.
            </p>
          </div>
          <div className="eqop" aria-hidden="true">
            +
          </div>
          <div className="eqb">
            <span className="ico">
              <svg className="ico">
                <use href="#i-link" />
              </svg>
            </span>
            <h3>Histórico de projetos e apoios</h3>
            <p>O que foi estruturado, apoiado e realizado.</p>
          </div>
          <div className="eqop" aria-hidden="true">
            +
          </div>
          <div className="eqb">
            <span className="ico">
              <svg className="ico">
                <use href="#i-activity" />
              </svg>
            </span>
            <h3>Inteligência territorial</h3>
            <p>Pessoas, iniciativas, potencial, recursos e impacto de cada território.</p>
          </div>
          <div className="eqop" aria-hidden="true">
            =
          </div>
          <div className="eqb res">
            <span className="ico">
              <svg className="ico">
                <use href="#i-target" />
              </svg>
            </span>
            <h3>Base para orientar investimentos sociais e ambientais e acompanhar impacto</h3>
          </div>
        </div>

        {/* Gráficos */}
        <div className="charts">
          {/* Gráfico mensal */}
          <div className="cpanel">
            <div className="ch">
              <div>
                <h3>Projetos cadastrados por mês</h3>
                <p className="sub">
                  Série histórica de um território
                </p>
              </div>
              <span className="tag-ex">Exemplo</span>
            </div>
            <svg
              id="chMonth"
              viewBox="0 0 580 220"
              role="img"
              aria-label="Gráfico de barras mostrando projetos cadastrados ao longo do ano"
            >
              {[0, 25, 50].map((t) => (
                <g key={t}>
                  <line
                    x1={L}
                    x2={R}
                    y1={yVal(t)}
                    y2={yVal(t)}
                    className={t ? "grid-l" : "base-l"}
                  />
                  <text
                    x={L - 8}
                    y={yVal(t) + 4}
                    textAnchor="end"
                    className="ax"
                  >
                    {t}
                  </text>
                </g>
              ))}
              {months.map((item, i) => {
                const x = L + i * step + (step - bw) / 2;
                const top = yVal(item.v);
                const isLast = i === months.length - 1;
                return (
                  <g key={item.m}>
                    <rect
                      x={x}
                      y={top}
                      width={bw}
                      height={B - top}
                      rx={4}
                      className={`vbar ${isLast ? "last" : ""}`}
                    />
                    <text
                      x={x + bw / 2}
                      y={B + 18}
                      textAnchor="middle"
                      className="ax"
                    >
                      {item.m}
                    </text>
                  </g>
                );
              })}
              <text
                x={L + 11 * step + step / 2}
                y={yVal(47) - 8}
                textAnchor="middle"
                className="hbv"
              >
                47
              </text>
            </svg>
          </div>

          {/* Gráfico por eixo */}
          <div className="cpanel">
            <div className="ch">
              <div>
                <h3>Projetos por eixo de impacto</h3>
                <p className="sub">
                  Projetos do mapa de demonstração
                </p>
              </div>
              <span className="tag-ex">Exemplo</span>
            </div>
            <svg
              id="chType"
              viewBox="0 0 360 320"
              role="img"
              aria-label="Distribuição de projetos por eixo de impacto"
            >
              {axes.map((ax, i) => {
                const y0 = 10 + i * 38;
                const w = (ax.v / 4) * 220;
                return (
                  <g key={ax.name}>
                    <text x={0} y={y0 + 12} className="hbl">
                      {ax.name}
                    </text>
                    <rect
                      x={0}
                      y={y0 + 18}
                      width={w}
                      height={10}
                      rx={5}
                      style={{ fill: ax.c }}
                    />
                    <text x={w + 10} y={y0 + 27} className="hbv">
                      {ax.v}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        <p className="band-foot">
          Valores ilustrativos, usados apenas para demonstrar a visualização.
          Não representam dados reais.
        </p>
      </div>

      {/* Gestão Pública */}
      <div className="wrap gov dg-gov" id="gestao">
        <div>
          <span className="eyebrow" style={{ color: "#FF9A5C" }}>
            Área de governo e gestão pública
          </span>
          <h2 className="h2" style={{ color: "#fff", marginTop: 16 }}>
            O poder público articula e participa de projetos de interesse público.
          </h2>
          <p className="lede" style={{ color: "#B5D0D6", marginTop: 18 }}>
            Tudo dentro da competência de cada órgão, com critérios claros e
            registro formal.
          </p>
          <ul className="govlist">
            <li>
              <svg className="ico">
                <use href="#i-map" />
              </svg>
              <div>
                <b>Mapa de projetos</b>
                <span>
                  Iniciativas de interesse público por território.
                </span>
              </div>
            </li>
            <li>
              <svg className="ico">
                <use href="#i-link" />
              </svg>
              <div>
                <b>Articulação institucional</b>
                <span>Aproximação com as iniciativas.</span>
              </div>
            </li>
            <li>
              <svg className="ico">
                <use href="#i-activity" />
              </svg>
              <div>
                <b>Políticas públicas</b>
                <span>Integração de projetos a políticas públicas.</span>
              </div>
            </li>
            <li>
              <svg className="ico">
                <use href="#i-target" />
              </svg>
              <div>
                <b>Programas e editais</b>
                <span>Divulgação de programas, editais e oportunidades.</span>
              </div>
            </li>
            <li>
              <svg className="ico">
                <use href="#i-target" />
              </svg>
              <div>
                <b>Resultados e impacto</b>
                <span>Acompanhamento de indicadores e resultados.</span>
              </div>
            </li>
          </ul>
        </div>

        <div className="dash">
          <div className="appbar" style={{ background: "var(--surface)" }}>
            <div className="ttl">
              <svg className="ico" style={{ width: 18, height: 18 }}>
                <use href="#i-gov" />
              </svg>
              Painel de gestão
            </div>
            <div className="tabs">
              <span className="on">Visão geral</span>
              <span>Territórios</span>
              <span>Programas e editais</span>
            </div>
            <span className="tag-ex sp">Dados fictícios</span>
          </div>

          <div className="scrollx">
            <div className="pipe" id="pipe">
              <div className="pstage">
                <span className="k">Projetos no território</span>
                <b>48</b>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: "100%" }} />
                </div>
              </div>
              <div className="pstage">
                <span className="k">Em estruturação</span>
                <b>14</b>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: "29%" }} />
                </div>
              </div>
              <div className="pstage">
                <span className="k">Buscando apoio</span>
                <b>11</b>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: "23%" }} />
                </div>
              </div>
              <div className="pstage">
                <span className="k">Em execução</span>
                <b>12</b>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: "25%" }} />
                </div>
              </div>
              <div className="pstage done">
                <span className="k">Concluídos</span>
                <b>11</b>
                <div className="meter" aria-hidden="true">
                  <i style={{ width: "23%" }} />
                </div>
              </div>
            </div>
          </div>

          <div className="dcols">
            <div>
              <h4>Projetos por território</h4>
              <div className="scrollx">
                <table className="pri">
                  <thead>
                    <tr>
                      <th>Bairro</th>
                      <th>Projetos</th>
                      <th>Em execução</th>
                      <th>Eixo principal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Bairro J</td>
                      <td>9</td>
                      <td>2</td>
                      <td><span className="prio md">Esporte</span></td>
                    </tr>
                    <tr>
                      <td>Bairro B</td>
                      <td>7</td>
                      <td>1</td>
                      <td><span className="prio md">Educação</span></td>
                    </tr>
                    <tr>
                      <td>Bairro G</td>
                      <td>6</td>
                      <td>3</td>
                      <td><span className="prio md">Cultura</span></td>
                    </tr>
                    <tr>
                      <td>Bairro I</td>
                      <td>4</td>
                      <td>2</td>
                      <td><span className="prio md">Meio Ambiente</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4>Articulações recentes</h4>
              <ul className="resp">
                <li className="ritem">
                  <div className="who">
                    <span>Secretaria (exemplo)</span>
                    <span>Em articulação</span>
                  </div>
                  <b>Escolinha de futebol · Bairro C</b>
                  <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    Projeto relacionado a programa municipal de esporte e juventude.
                  </span>
                </li>
                <li className="ritem">
                  <div className="who">
                    <span>Órgão público (exemplo)</span>
                    <span>Divulgado</span>
                  </div>
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
