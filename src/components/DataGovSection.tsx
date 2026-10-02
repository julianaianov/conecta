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
          <span className="eyebrow">Dados e inteligência territorial</span>
          <h2 className="h2">Dados que orientam decisões.</h2>
          <p className="lede">
            Indicadores territoriais que apoiam poder público, empresas e
            parceiros na alocação de recursos onde o impacto é mais necessário.
          </p>
        </div>

        <div className="temas">
          <span className="k">Temas mapeados no território</span>
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
            Dados gerados pela própria dinâmica territorial: demandas
            identificadas, projetos estruturados, apoios viabilizados e
            resultados comprovados.
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
            <h3>Projetos estruturados</h3>
            <p>
              Objetivo claro, orçamento, cronograma e metas definidas.
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
            <h3>Apoiadores conectados</h3>
            <p>
              Empresas, poder público e comunidade viabilizando recursos.
            </p>
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
            <h3>Execução acompanhada</h3>
            <p>
              Etapas registradas com evidências, fotos e frequência.
            </p>
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
            <h3>Impacto mensurável</h3>
            <p>
              Pessoas beneficiadas, metas alcançadas e prestação de contas
              verificável.
            </p>
          </div>
        </div>

        {/* Gráficos */}
        <div className="charts">
          {/* Gráfico mensal */}
          <div className="cpanel">
            <div className="ch">
              <div>
                <h3>Projetos estruturados por mês</h3>
                <p className="sub">
                  Evolução de iniciativas registradas e estruturadas
                </p>
              </div>
              <span className="tag-ex">Indicador territorial</span>
            </div>
            <svg
              id="chMonth"
              viewBox="0 0 580 220"
              role="img"
              aria-label="Gráfico de barras mostrando projetos estruturados ao longo do ano"
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
                  Distribuição das iniciativas cadastradas
                </p>
              </div>
              <span className="tag-ex">Indicador territorial</span>
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
          Painel territorial com dados atualizados a partir do cadastro,
          validação e acompanhamento de cada iniciativa.
        </p>

        {/* Gestão Pública */}
        <div className="dg-gov" id="gestao">
          <div className="gov">
            <div>
              <span className="eyebrow" style={{ color: "#FF9A5C" }}>
                Gestão pública
              </span>
              <h2 className="h2" style={{ color: "#fff", marginTop: 16 }}>
                Articulação institucional para transformar o território.
              </h2>
              <p className="lede" style={{ color: "#B5D0D6", marginTop: 18 }}>
                O DM Conecta organiza as demandas do território em uma visão
                única para secretarias, prefeituras e órgãos públicos,
                facilitando o planejamento, a articulação e a prestação de
                contas.
              </p>
              <ul className="govlist">
                <li>
                  <svg className="ico">
                    <use href="#i-map" />
                  </svg>
                  <div>
                    <b>Visão territorial unificada</b>
                    <span>
                      Mapa de demandas e projetos por bairro e eixo de impacto.
                    </span>
                  </div>
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-link" />
                  </svg>
                  <div>
                    <b>Articulação intersetorial</b>
                    <span>
                      Conexão entre secretarias, parceiros e iniciativas da
                      sociedade civil.
                    </span>
                  </div>
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-activity" />
                  </svg>
                  <div>
                    <b>Acompanhamento de entregas</b>
                    <span>
                      Linha do tempo, evidências e relatórios de execução em
                      tempo real.
                    </span>
                  </div>
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-target" />
                  </svg>
                  <div>
                    <b>Decisões baseadas em evidências</b>
                    <span>
                      Indicadores para planejar, priorizar e alocar recursos
                      públicos.
                    </span>
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
                  Painel de Gestão do Território
                </div>
                <div className="tabs">
                  <span className="on">Território</span>
                  <span>Demandas</span>
                  <span>Projetos</span>
                  <span>Indicadores</span>
                </div>
                <span className="tag-ex sp">Visualização de gestão</span>
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
                  <h4>Prioridades territoriais</h4>
                  <div className="scrollx">
                    <table className="pri">
                      <thead>
                        <tr>
                          <th>Bairro</th>
                          <th>Eixo prioritário</th>
                          <th>Projetos</th>
                          <th>Urgência</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td>Bairro C</td>
                          <td>Esporte e Juventude</td>
                          <td>3</td>
                          <td>
                            <span className="prio hi">Alta</span>
                          </td>
                        </tr>
                        <tr>
                          <td>Bairro A</td>
                          <td>Educação</td>
                          <td>4</td>
                          <td>
                            <span className="prio md">Média</span>
                          </td>
                        </tr>
                        <tr>
                          <td>Bairro G</td>
                          <td>Segurança Alimentar</td>
                          <td>2</td>
                          <td>
                            <span className="prio hi">Alta</span>
                          </td>
                        </tr>
                        <tr>
                          <td>Bairro E</td>
                          <td>Cultura</td>
                          <td>3</td>
                          <td>
                            <span className="prio lo">Normal</span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4>Respostas recentes e encaminhamentos</h4>
                  <ul className="resp">
                    <li className="ritem">
                      <div className="who">
                        <span>Secretaria de Esporte</span>
                        <span>Há 2 dias</span>
                      </div>
                      <b>Articulação para uso da quadra comunitária</b>
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        Vinculado ao projeto Escolinha de Futebol Comunitária.
                      </span>
                    </li>
                    <li className="ritem">
                      <div className="who">
                        <span>Secretaria de Educação</span>
                        <span>Há 4 dias</span>
                      </div>
                      <b>Apoio com espaço para oficinas de leitura</b>
                      <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        Cessão de sala no contraturno escolar no Bairro A.
                      </span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
