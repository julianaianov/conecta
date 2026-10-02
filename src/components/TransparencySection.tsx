"use client";

import Image from "next/image";

export function TransparencySection() {
  const openLightbox = (src: string, alt: string, caption: string) => {
    window.dispatchEvent(
      new CustomEvent("dmc:open-lightbox", {
        detail: { src, alt, caption },
      }),
    );
  };

  const evidences = [
    {
      src: "/images/landing/evidencia-treino.webp",
      alt: "Treino com alunos e professor no campo de terra",
      caption: "Fotos da execução",
      full: "Treino no campo de terra com os 60 alunos e o professor responsável.",
    },
    {
      src: "/images/landing/evidencia-relatorio.webp",
      alt: "Relatório da aula com presença e atividades realizadas",
      caption: "Relatório técnico",
      full: "Relatório de acompanhamento semanal com metas alcançadas e atividades pedagógicas.",
    },
    {
      src: "/images/landing/evidencia-lista.webp",
      alt: "Lista de presença preenchida à mão durante o treino",
      caption: "Lista de presença",
      full: "Lista de presença assinada pelos responsáveis e frequência dos alunos.",
    },
  ];

  return (
    <section className="sec" id="impacto">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Transparência e prestação de contas</span>
          <h2 className="h2">Acompanhamento transparente do projeto ao resultado.</h2>
          <p className="lede">
            Cada projeto tem registro público de etapas, evidências, recursos e
            resultados alcançados.
          </p>
          <ul className="tcyc" aria-label="Ciclo de prestação de contas">
            <li>Estruturação</li>
            <li>Apoio</li>
            <li>Execução</li>
            <li>Evidências</li>
            <li>Prestação de contas</li>
            <li className="e">Resultados</li>
          </ul>
        </div>

        <div className="trans">
          <div>
            <ul className="evlist evlist7">
              <div>
                <svg className="ico">
                  <use href="#i-target" />
                </svg>
                Metas públicas e acompanháveis
              </div>
              <div>
                <svg className="ico">
                  <use href="#i-camera" />
                </svg>
                Evidências em fotos e documentos
              </div>
              <div>
                <svg className="ico">
                  <use href="#i-people" />
                </svg>
                Registro de frequência e participantes
              </div>
              <div>
                <svg className="ico">
                  <use href="#i-box" />
                </svg>
                Recursos e apoios aplicados
              </div>
              <div>
                <svg className="ico">
                  <use href="#i-clock" />
                </svg>
                Histórico e linha do tempo de entregas
              </div>
              <div>
                <svg className="ico">
                  <use href="#i-bars" />
                </svg>
                Indicadores e impacto mensurável
              </div>
              <div>
                <svg className="ico">
                  <use href="#i-shield" />
                </svg>
                Dados auditáveis e verificáveis
              </div>
            </ul>
          </div>

          {/* Ficha do projeto */}
          <div className="ficha">
            <div className="ficha-h">
              <span className="k">
                <span>Projeto comunitário · Bairro C</span>
                <span>Iniciado em Mar/2026</span>
              </span>
              <h3>Escolinha de Futebol Comunitária</h3>
              <span className="status">Em execução</span>
            </div>

            <div className="fgrid">
              <div className="fcell">
                <span className="k">Pessoas beneficiadas</span>
                <span className="v">60 crianças e jovens</span>
              </div>
              <div className="fcell">
                <span className="k">Recursos aplicados</span>
                <span className="v">R$ 18.400 / R$ 24.000</span>
                <div className="prog" aria-hidden="true">
                  <i style={{ width: "76%" }} />
                </div>
              </div>
              <div className="fcell">
                <span className="k">Eixo de impacto</span>
                <span className="v">Esporte e inclusão</span>
              </div>
              <div className="fcell">
                <span className="k">Apoiador principal</span>
                <span className="v">Parceiro local + Comunidade</span>
              </div>
            </div>

            {/* Evidências */}
            <div className="evid">
              <span className="k">Evidências registradas (fotos e documentos)</span>
              <div className="thumbs">
                {evidences.map((ev, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="thumb text-left"
                    onClick={() => openLightbox(ev.src, ev.alt, ev.full)}
                    aria-label={`Ver evidência: ${ev.caption}`}
                  >
                    <Image
                      src={ev.src}
                      alt={ev.alt}
                      width={300}
                      height={200}
                      className="w-full object-cover"
                    />
                    <span className="tl">
                      <svg className="ico">
                        <use href="#i-camera" />
                      </svg>
                      {ev.caption}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Histórico */}
            <div className="hist">
              <span className="k">Histórico de atualizações</span>
              <ol>
                <li className="now">
                  <div>
                    <b>Aferição de frequência e entrega de coletes</b>
                    <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13 }}>
                      58 alunos presentes no treino de sábado no campo comunitário.
                    </p>
                  </div>
                  <span>Hoje</span>
                </li>
                <li>
                  <div>
                    <b>Conexão com empresa parceira para material esportivo</b>
                    <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13 }}>
                      Doação de bolas, cones e redes viabilizada através do DM Conecta.
                    </p>
                  </div>
                  <span>15d atrás</span>
                </li>
                <li>
                  <div>
                    <b>Estruturação do projeto e cadastro do dossiê</b>
                    <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13 }}>
                      Metas, cronograma e público cadastrados pelo Agente de Transformação.
                    </p>
                  </div>
                  <span>30d atrás</span>
                </li>
              </ol>
            </div>
          </div>
        </div>

        {/* Reconhecimento e Engajamento */}
        <div className="er" style={{ marginTop: 48 }}>
          <div className="er-card">
            <header>
              <span className="er-k">Engajamento contínuo</span>
              <h3>Critérios claros para toda a rede</h3>
            </header>
            <ul className="er-eng-list">
              <li>
                <span className="er-ic">
                  <svg className="ico">
                    <use href="#i-activity" />
                  </svg>
                </span>
                Pontuação e histórico ativo
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico">
                    <use href="#i-link" />
                  </svg>
                </span>
                Conexão e apoio comprovado
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico">
                    <use href="#i-shield" />
                  </svg>
                </span>
                Prestação de contas em dia
              </li>
            </ul>
          </div>

          <div className="er-card er-rec">
            <header>
              <span className="er-k">Reconhecimento por impacto real</span>
              <h3>Selos e certificação de iniciativas</h3>
            </header>
            <ul className="er-rec-list">
              <li>
                <span className="er-n">01</span>
                <span className="er-ic">
                  <svg className="ico">
                    <use href="#i-target" />
                  </svg>
                </span>
                <b>Selo de Impacto Comunitário</b>
              </li>
              <li>
                <span className="er-n">02</span>
                <span className="er-ic">
                  <svg className="ico">
                    <use href="#i-brief" />
                  </svg>
                </span>
                <b>Selo Parceiro Transformador</b>
              </li>
              <li>
                <span className="er-n">03</span>
                <span className="er-ic">
                  <svg className="ico">
                    <use href="#i-shield" />
                  </svg>
                </span>
                <b>Selo Transparência Ativa</b>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
