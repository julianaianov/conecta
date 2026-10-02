"use client";

import { useState } from "react";

export function Steps() {
  const [highlightActor, setHighlightActor] = useState<string | null>(null);

  const actors = [
    { id: "agt", name: "Agentes de Transformação", icon: "i-people" },
    { id: "par", name: "Parceiros", icon: "i-brief" },
    { id: "pp", name: "Poder Público", icon: "i-gov" },
    { id: "com", name: "Comunidade", icon: "i-heart" },
    { id: "cmn", name: "Comunicação", icon: "i-mega" },
    { id: "dm", name: "DM Conecta", isSys: true },
  ];

  const isMatch = (actsStr: string) => {
    if (!highlightActor) return true;
    return actsStr.split(" ").includes(highlightActor);
  };

  return (
    <section className="sec" id="como-funciona">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Como funciona</span>
          <h2 className="h2">Do projeto ao impacto, em oito etapas acompanháveis.</h2>
          <p className="lede">
            Cada etapa tem responsáveis definidos e fica registrada na plataforma.
          </p>
        </div>

        <div className="cf-actorsbar">
          <span className="cf-lbl">Atores no fluxo</span>
          <ul
            className="cf-actors"
            id="cfLegend"
            aria-label="Passe o mouse ou toque para destacar as etapas de cada ator"
          >
            {actors.map((actor) => (
              <li
                key={actor.id}
                tabIndex={0}
                className={`cf-a ${actor.isSys ? "is-sys" : ""} ${
                  highlightActor === actor.id ? "is-hl" : ""
                }`}
                data-a={actor.id}
                onMouseEnter={() => setHighlightActor(actor.id)}
                onMouseLeave={() => setHighlightActor(null)}
                onFocus={() => setHighlightActor(actor.id)}
                onBlur={() => setHighlightActor(null)}
                onClick={() =>
                  setHighlightActor((prev) => (prev === actor.id ? null : actor.id))
                }
              >
                {actor.isSys ? (
                  <svg className="lg" aria-hidden="true">
                    <use href="#logo-mark" />
                  </svg>
                ) : (
                  <svg className="ico" aria-hidden="true">
                    <use href={`#${actor.icon}`} />
                  </svg>
                )}
                {actor.name}
              </li>
            ))}
          </ul>
        </div>

        <div
          className={`cf ${highlightActor ? "is-filtering" : ""}`}
          id="cf"
        >
          <span className="cf-rail" aria-hidden="true">
            <i id="cfProg" />
          </span>

          {/* Fase: Estruturar */}
          <section className="cf-group" aria-label="Fase: Estruturar">
            <h3 className="cf-phase">
              <span className="cf-dia" aria-hidden="true" />
              Estruturar
              <small>Etapas 01 – 02</small>
            </h3>
            <ol className="cf-list" start={1}>
              <li
                className={`cf-step is-seen ${isMatch("agt") ? "is-match" : ""}`}
                data-acts="agt"
              >
                <span className="cf-num" aria-hidden="true">
                  01
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 01</span>
                    <h4>Projeto</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a" data-a="agt">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-people" />
                        </svg>
                        Agentes de Transformação
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>
                      Após o cadastro institucional e a validação, o Agente de
                      Transformação cadastra a iniciativa e apresenta seu
                      objetivo.
                    </p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 02 · Estruturação
                    </span>
                  </div>
                </article>
              </li>

              <li
                className={`cf-step is-seen ${isMatch("agt dm") ? "is-match" : ""}`}
                data-acts="agt dm"
              >
                <span className="cf-num" aria-hidden="true">
                  02
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 02</span>
                    <h4>Estruturação</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a" data-a="agt">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-people" />
                        </svg>
                        Agentes de Transformação
                      </li>
                      <li className="cf-a is-sys" data-a="dm">
                        <svg className="lg" aria-hidden="true">
                          <use href="#logo-mark" />
                        </svg>
                        DM Conecta
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>
                      O projeto é organizado com orçamento, cronograma, público
                      beneficiado e resultados esperados.
                    </p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 03 · Conexão
                    </span>
                  </div>
                </article>
              </li>
            </ol>
          </section>

          {/* Fase: Conectar */}
          <section className="cf-group" aria-label="Fase: Conectar">
            <h3 className="cf-phase">
              <span className="cf-dia" aria-hidden="true" />
              Conectar
              <small>Etapas 03 – 04</small>
            </h3>
            <ol className="cf-list" start={3}>
              <li
                className={`cf-step is-seen ${isMatch("dm") ? "is-match" : ""}`}
                data-acts="dm"
              >
                <span className="cf-num" aria-hidden="true">
                  03
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 03</span>
                    <h4>Conexão</h4>
                    <a className="cf-ia" href="#ia">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-spark" />
                      </svg>
                      IA · em desenvolvimento
                    </a>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a is-sys" data-a="dm">
                        <svg className="lg" aria-hidden="true">
                          <use href="#logo-mark" />
                        </svg>
                        DM Conecta
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>
                      O DM Conecta identifica possíveis parceiros e apoiadores
                      para o projeto.
                    </p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 04 · Apoio
                    </span>
                  </div>
                </article>
              </li>

              <li
                className={`cf-step is-seen ${isMatch("par pp com") ? "is-match" : ""}`}
                data-acts="par pp com"
              >
                <span className="cf-num" aria-hidden="true">
                  04
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 04</span>
                    <h4>Apoio</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a" data-a="par">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-brief" />
                        </svg>
                        Parceiros
                      </li>
                      <li className="cf-a" data-a="pp">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-gov" />
                        </svg>
                        Poder Público
                      </li>
                      <li className="cf-a" data-a="com">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-heart" />
                        </svg>
                        Comunidade
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>
                      Parceiros, poder público e comunidade oferecem recursos
                      financeiros, materiais, técnicos, institucionais ou humanos.
                    </p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 05 · Execução
                    </span>
                  </div>
                </article>
              </li>
            </ol>
          </section>

          {/* Fase: Executar */}
          <section className="cf-group" aria-label="Fase: Executar">
            <h3 className="cf-phase">
              <span className="cf-dia" aria-hidden="true" />
              Executar
              <small>Etapas 05 – 06</small>
            </h3>
            <ol className="cf-list" start={5}>
              <li
                className={`cf-step is-seen ${isMatch("agt par") ? "is-match" : ""}`}
                data-acts="agt par"
              >
                <span className="cf-num" aria-hidden="true">
                  05
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 05</span>
                    <h4>Execução</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a" data-a="agt">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-people" />
                        </svg>
                        Agentes de Transformação
                      </li>
                      <li className="cf-a" data-a="par">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-brief" />
                        </svg>
                        Parceiros
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>
                      O projeto é realizado no território pelo Agente de
                      Transformação com os parceiros envolvidos.
                    </p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 06 · Acompanhamento
                    </span>
                  </div>
                </article>
              </li>

              <li
                className={`cf-step is-seen ${isMatch("agt dm") ? "is-match" : ""}`}
                data-acts="agt dm"
              >
                <span className="cf-num" aria-hidden="true">
                  06
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 06</span>
                    <h4>Acompanhamento</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a" data-a="agt">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-people" />
                        </svg>
                        Agentes de Transformação
                      </li>
                      <li className="cf-a is-sys" data-a="dm">
                        <svg className="lg" aria-hidden="true">
                          <use href="#logo-mark" />
                        </svg>
                        DM Conecta
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>Etapas, evidências e atualizações são registradas.</p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 07 · Resultados
                    </span>
                  </div>
                </article>
              </li>
            </ol>
          </section>

          {/* Fase: Mensurar */}
          <section className="cf-group" aria-label="Fase: Mensurar">
            <h3 className="cf-phase">
              <span className="cf-dia" aria-hidden="true" />
              Mensurar
              <small>Etapas 07 – 08</small>
            </h3>
            <ol className="cf-list" start={7}>
              <li
                className={`cf-step is-seen ${isMatch("agt") ? "is-match" : ""}`}
                data-acts="agt"
              >
                <span className="cf-num" aria-hidden="true">
                  07
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 07</span>
                    <h4>Resultados</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a" data-a="agt">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-people" />
                        </svg>
                        Agentes de Transformação
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>O Agente apresenta os resultados alcançados.</p>
                    <span className="cf-next">
                      <svg className="ico" aria-hidden="true">
                        <use href="#i-arrow" />
                      </svg>
                      Próxima etapa: 08 · Impacto
                    </span>
                  </div>
                </article>
              </li>

              <li
                className={`cf-step is-seen ${isMatch("dm cmn") ? "is-match" : ""}`}
                data-acts="dm cmn"
              >
                <span className="cf-num" aria-hidden="true">
                  08
                </span>
                <article className="cf-card">
                  <div className="cf-title">
                    <span className="cf-kicker">Etapa 08</span>
                    <h4>Impacto</h4>
                  </div>
                  <div className="cf-who">
                    <span className="cf-lbl">Quem atua</span>
                    <ul className="cf-actors">
                      <li className="cf-a is-sys" data-a="dm">
                        <svg className="lg" aria-hidden="true">
                          <use href="#logo-mark" />
                        </svg>
                        DM Conecta
                      </li>
                      <li className="cf-a" data-a="cmn">
                        <svg className="ico" aria-hidden="true">
                          <use href="#i-mega" />
                        </svg>
                        Comunicação
                      </li>
                    </ul>
                  </div>
                  <div className="cf-what">
                    <span className="cf-lbl">O que acontece</span>
                    <p>
                      O DM Conecta mensura e dá visibilidade à transformação
                      gerada.
                    </p>
                    <span className="cf-next is-end">Etapa final do fluxo</span>
                  </div>
                </article>
              </li>
            </ol>
          </section>
        </div>
      </div>
    </section>
  );
}
