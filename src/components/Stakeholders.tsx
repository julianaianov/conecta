export function Stakeholders() {
  return (
    <section className="sec cx-sec" id="para-quem">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Quem participa</span>
          <h2 className="h2">
            Quem tem o projeto encontra quem pode apoiar. E o projeto acontece.
          </h2>
          <p className="lede">
            Cinco grupos, cada um com seu papel, conectados pela mesma infraestrutura.
          </p>
        </div>

        <div className="cx" id="conexao" aria-label="Fluxo de conexão entre atores">
          <div className="cx-row cx-r1">
            <article className="cx-n cx-agt">
              <span className="cx-ic">
                <svg className="ico">
                  <use href="#i-people" />
                </svg>
              </span>
              <span className="cx-k">Tem o projeto</span>
              <h3>Agente de Transformação</h3>
              <p>Cadastra a iniciativa com objetivo, público e território.</p>
            </article>

            <span className="cx-ar" aria-hidden="true">
              <i />
            </span>

            <article className="cx-n cx-core">
              <svg className="cx-logo" aria-hidden="true">
                <use href="#logo-mark" />
              </svg>
              <span className="cx-k">Estrutura e conecta</span>
              <h3>DM Conecta</h3>
              <ul>
                <li>Dossiê digital</li>
                <li>Sugestão de conexões</li>
                <li>Acompanhamento</li>
              </ul>
            </article>

            <span className="cx-ar cx-split" aria-hidden="true">
              <i />
            </span>

            <div className="cx-pair">
              <article className="cx-n cx-par">
                <span className="cx-ic">
                  <svg className="ico">
                    <use href="#i-brief" />
                  </svg>
                </span>
                <span className="cx-k">Apoiam e viabilizam</span>
                <h3>Parceiros</h3>
                <p>
                  Recursos, conhecimento, infraestrutura, divulgação ou parcerias.
                </p>
              </article>
              <article className="cx-n cx-pp">
                <span className="cx-ic">
                  <svg className="ico">
                    <use href="#i-gov" />
                  </svg>
                </span>
                <span className="cx-k">Articula e participa</span>
                <h3>Poder Público</h3>
                <p>Articulação institucional, programas e políticas públicas.</p>
              </article>
            </div>
          </div>

          <div className="cx-turn" aria-hidden="true">
            <i />
          </div>

          <ol className="cx-row cx-r2">
            <li className="cx-o">
              <span className="cx-ic">
                <svg className="ico">
                  <use href="#i-activity" />
                </svg>
              </span>
              <div>
                <h3>Projeto executado</h3>
                <p>Realizado no território, com etapas, evidências e atualizações.</p>
              </div>
            </li>
            <li className="cx-o">
              <span className="cx-ic">
                <svg className="ico">
                  <use href="#i-check" />
                </svg>
              </span>
              <div>
                <h3>Resultados</h3>
                <p>Metas cumpridas e pessoas beneficiadas registradas.</p>
              </div>
            </li>
            <li className="cx-o is-end">
              <span className="cx-ic">
                <svg className="ico">
                  <use href="#i-target" />
                </svg>
              </span>
              <div>
                <h3>Impacto</h3>
                <p>Transformação mensurada e visível no território.</p>
              </div>
            </li>
          </ol>

          <ul className="qp" aria-label="Perfis de cada grupo">
            <li>
              <span className="qp-ic">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-people" />
                </svg>
              </span>
              <div>
                <b>Agentes de Transformação</b>
                <span>
                  Associações, ONGs, institutos, coletivos, projetos sociais e
                  iniciativas socioambientais.
                </span>
              </div>
            </li>
            <li>
              <span className="qp-ic">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-brief" />
                </svg>
              </span>
              <div>
                <b>Parceiros</b>
                <span>
                  Empresas, marcas, institutos, patrocinadores, organizações e,
                  futuramente, investidores.
                </span>
              </div>
            </li>
            <li>
              <span className="qp-ic">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-gov" />
                </svg>
              </span>
              <div>
                <b>Poder Público</b>
                <span>
                  Prefeituras, secretarias, órgãos públicos e instituições
                  governamentais.
                </span>
              </div>
            </li>
            <li>
              <span className="qp-ic">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-heart" />
                </svg>
              </span>
              <div>
                <b>Comunidade</b>
                <span>Moradores, voluntários, jovens e participantes.</span>
              </div>
            </li>
            <li>
              <span className="qp-ic">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-mega" />
                </svg>
              </span>
              <div>
                <b>Comunicação</b>
                <span>Veículos, jornalistas e criadores de conteúdo.</span>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </section>
  );
}
