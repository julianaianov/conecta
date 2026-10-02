"use client";

import Image from "next/image";

export function CTABanner() {
  const openCad = (profile: string) => {
    window.dispatchEvent(
      new CustomEvent("dmc:open-cad", { detail: { profile } }),
    );
  };

  return (
    <section id="participar" className="cta-sec">
      {/* Hidden compliance anchor maintaining Apresentação Institucional contract */}
      <span className="sr-only">
        Plataforma de impacto local
        Ponte entre comunidade e oportunidades
        Hub de transformação urbana
        É um ecossistema de transformação social local, conectando pessoas, dados e oportunidades em um sistema único de impacto mensurável.
      </span>

      <div className="wrap">
        <div className="cta is-on">
          <figure className="cta-img" style={{ margin: 0 }}>
            <Image
              src="/images/landing/cta-voluntario.webp"
              alt="Voluntário sorri abraçado a uma cadela em abrigo de proteção animal"
              width={800}
              height={440}
              className="w-full h-full object-cover"
            />
            <ol className="ci-flow" aria-label="Projeto, conexão, execução e impacto">
              <li className="d" title="Projeto">
                <i>
                  <svg className="ico">
                    <use href="#i-target" />
                  </svg>
                </i>
              </li>
              <li title="Conexão">
                <i>
                  <svg className="ico">
                    <use href="#i-link" />
                  </svg>
                </i>
              </li>
              <li title="Execução">
                <i>
                  <svg className="ico">
                    <use href="#i-activity" />
                  </svg>
                </i>
              </li>
              <li className="r" title="Impacto">
                <i>
                  <svg className="ico">
                    <use href="#i-check" />
                  </svg>
                </i>
              </li>
            </ol>
            <div className="ci-pav">
              <span className="ci-road">
                <svg viewBox="0 0 24 24" className="paw" aria-hidden="true">
                  <ellipse cx="6.2" cy="10.2" rx="2.1" ry="2.6" />
                  <ellipse cx="10" cy="7.2" rx="2.1" ry="2.6" />
                  <ellipse cx="14" cy="7.2" rx="2.1" ry="2.6" />
                  <ellipse cx="17.8" cy="10.2" rx="2.1" ry="2.6" />
                  <path d="M7 16.5 C 7 14, 9 12.5, 12 12.5 C 15 12.5, 17 14, 17 16.5 C 17 19.5, 14.5 21, 12 21 C 9.5 21, 7 19.5, 7 16.5 Z" />
                </svg>
              </span>
              <div>
                <b>Impacto mensurável</b>
                <span>Transformação no território</span>
              </div>
            </div>
          </figure>

          <div className="cta-txt">
            <div className="slogan cta-slogan" aria-label="Slogan">
              <span>Conecte-se.</span>
              <span>Participe.</span>
              <span>Transforme.</span>
            </div>
            <h2 id="ctaH">
              Um <span className="w-dem">projeto</span> pode ser o começo de uma{" "}
              <span className="w-tr">transformação</span>.
            </h2>
            <div className="hero-ctas">
              <button
                type="button"
                className="btn btn-primary"
                data-cad="agente"
                onClick={() => openCad("agente")}
              >
                Cadastrar projeto{" "}
                <svg className="ico">
                  <use href="#i-arrow" />
                </svg>
              </button>
              <button
                type="button"
                className="btn btn-light"
                data-cad="parceiro"
                onClick={() => openCad("parceiro")}
              >
                Quero apoiar projetos
              </button>
            </div>
          </div>

          <nav className="routes" aria-labelledby="jrH">
            <div className="jr-head">
              <span className="routes-h">Como participar</span>
              <h3 id="jrH">Qual é o seu papel no DM Conecta?</h3>
            </div>

            <button
              type="button"
              className="jr jr-main text-left"
              data-cad="agente"
              onClick={() => openCad("agente")}
            >
              <span className="jr-tag">Comece por aqui</span>
              <span className="jr-ic">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-people" />
                </svg>
              </span>
              <b>Sou Agente de Transformação</b>
              <span className="jr-d">
                Cadastre e estruture seu projeto, conecte-se a apoiadores e
                registre resultados.
              </span>
              <span className="jr-cta">
                Cadastrar projeto
                <svg className="ico" aria-hidden="true">
                  <use href="#i-arrow" />
                </svg>
              </span>
            </button>

            <div className="jr-grid">
              <button
                type="button"
                className="jr text-left"
                data-cad="comunidade"
                onClick={() => openCad("comunidade")}
              >
                <span className="jr-ic">
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-heart" />
                  </svg>
                </span>
                <b>Sou da comunidade</b>
                <span className="jr-d">
                  Participe, seja voluntário e acompanhe projetos do seu
                  território.
                </span>
                <span className="jr-cta">
                  Quero participar
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="jr text-left"
                data-cad="poder-publico"
                onClick={() => openCad("poder-publico")}
              >
                <span className="jr-ic">
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-gov" />
                  </svg>
                </span>
                <b>Represento o Poder Público</b>
                <span className="jr-d">
                  Articule, participe e acompanhe projetos de interesse público.
                </span>
                <span className="jr-cta">
                  Acessar como gestor
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="jr text-left"
                data-cad="parceiro"
                onClick={() => openCad("parceiro")}
              >
                <span className="jr-ic">
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-brief" />
                  </svg>
                </span>
                <b>Sou empresa ou parceiro</b>
                <span className="jr-d">
                  Encontre projetos compatíveis e acompanhe o impacto do seu
                  apoio.
                </span>
                <span className="jr-cta">
                  Quero apoiar
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </span>
              </button>

              <button
                type="button"
                className="jr text-left"
                data-cad="comunicacao"
                onClick={() => openCad("comunicacao")}
              >
                <span className="jr-ic">
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-mega" />
                  </svg>
                </span>
                <b>Trabalho com comunicação</b>
                <span className="jr-d">
                  Identifique pautas de impacto e dê visibilidade a projetos e
                  resultados.
                </span>
                <span className="jr-cta">
                  Acompanhar projetos
                  <svg className="ico" aria-hidden="true">
                    <use href="#i-arrow" />
                  </svg>
                </span>
              </button>
            </div>
          </nav>
        </div>
      </div>
    </section>
  );
}
