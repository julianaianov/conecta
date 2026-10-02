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
      alt: "Imagem ilustrativa de uma atividade esportiva comunitária",
      caption: "Fotos",
      kind: "fotos",
      full: "Registro fotográfico ilustrativo do projeto.",
    },
    {
      src: "/images/landing/evidencia-relatorio.webp",
      alt: "Imagem ilustrativa de um relatório de acompanhamento",
      caption: "Documentos",
      kind: "documentos",
      full: "Exemplo ilustrativo de documento de acompanhamento.",
    },
    {
      src: "/images/landing/evidencia-lista.webp",
      alt: "Imagem ilustrativa de um registro de participantes",
      caption: "Registros",
      kind: "registros",
      full: "Exemplo ilustrativo de registro de participantes.",
    },
  ];

  const rankings = [
    { label: "Parceiros com maior apoio a projetos", icon: "i-brief" },
    { label: "Empresas em destaque por impacto", icon: "i-target" },
    { label: "Voluntários mais participativos", icon: "i-heart" },
    { label: "Projetos com resultados comprovados", icon: "i-activity" },
    { label: "Projetos mais apoiados", icon: "i-link" },
    { label: "Territórios mais engajados", icon: "i-map" },
  ];

  return (
    <section className="sec" id="impacto">
      <div className="wrap trans">
        <div>
          <span className="eyebrow">Transparência e reconhecimento</span>
          <h2 className="h2">Resultados documentados. Apoio efetivo reconhecido.</h2>
          <p className="lede">
            Quem apoiou, quem executou e o que mudou no território ficam
            registrados em cada projeto. Quem participa e entrega resultados
            ganha visibilidade.
          </p>

          <div className="tr-eng">
            <span className="er-k">Engajamento</span>
            <ul className="er-eng-list">
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-activity" /></svg>
                </span>
                Participação em projetos
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-heart" /></svg>
                </span>
                Voluntariado
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-mega" /></svg>
                </span>
                Compartilhamentos
              </li>
              <li>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href="#i-shield" /></svg>
                </span>
                Selos de impacto social
              </li>
            </ul>
          </div>
        </div>

        <article className="ficha" aria-label="Exemplo de ficha de impacto">
          <div className="ficha-h">
            <div className="k">
              <span>Ficha de impacto</span>
              <span className="tag-ex">Exemplo ilustrativo</span>
            </div>
            <h3>Projeto esportivo comunitário</h3>
            <span className="status">Em execução</span>
          </div>

          <div className="fgrid">
            <div className="fcell">
              <span className="k">Localização</span>
              <span className="v">Território X · Bairro C</span>
            </div>
            <div className="fcell">
              <span className="k">Eixo de impacto</span>
              <span className="v">Esporte</span>
            </div>
            <div className="fcell">
              <span className="k">Meta</span>
              <span className="v">Definida pelo agente responsável</span>
              <div className="prog" aria-hidden="true"><i /></div>
            </div>
            <div className="fcell">
              <span className="k">Pessoas beneficiadas</span>
              <span className="v">Registradas a cada etapa</span>
            </div>
          </div>

          <div className="evid">
            <span className="k">Evidências</span>
            <div className="thumbs">
              {evidences.map((ev) => (
                <button
                  key={ev.kind}
                  type="button"
                  className="thumb text-left"
                  data-full={ev.kind}
                  onClick={() => openLightbox(ev.src, ev.alt, ev.full)}
                  aria-label={`Ver evidência ilustrativa: ${ev.caption}`}
                >
                  <Image
                    src={ev.src}
                    alt={ev.alt}
                    width={300}
                    height={200}
                    className="w-full object-cover"
                  />
                  <span className="tl">
                    <svg className="ico" aria-hidden="true"><use href="#i-camera" /></svg>
                    {ev.caption}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="hist">
            <span className="k">Histórico</span>
            <ol>
              <li>
                <div><b>Projeto cadastrado pelo agente</b></div>
                <span>Etapa 01</span>
              </li>
              <li>
                <div><b>Projeto estruturado</b></div>
                <span>Etapa 02</span>
              </li>
              <li>
                <div><b>Apoio formalizado com parceiro</b></div>
                <span>Etapa 04</span>
              </li>
              <li className="now">
                <div><b>Execução em andamento</b></div>
                <span>Etapa 05</span>
              </li>
            </ol>
          </div>
        </article>
      </div>

      <div className="wrap tr-rank" id="reconhecimento">
        <article className="er-card er-rec">
          <header>
            <div className="er-rk">
              <span className="er-k">Reconhecimento</span>
              <span className="er-soon">Em breve</span>
            </div>
            <h3>Ranking de impacto</h3>
            <p className="er-sub">
              O DM Conecta terá um ranking para destacar quem mais transforma
              os territórios:
            </p>
          </header>
          <ol className="er-rec-list">
            {rankings.map((item, index) => (
              <li key={item.label}>
                <span className="er-n">{String(index + 1).padStart(2, "0")}</span>
                <span className="er-ic">
                  <svg className="ico" aria-hidden="true"><use href={`#${item.icon}`} /></svg>
                </span>
                <b>{item.label}</b>
              </li>
            ))}
          </ol>
        </article>
        <p className="er-note">
          <svg className="ico" aria-hidden="true"><use href="#i-shield" /></svg>
          O reconhecimento prioriza o apoio efetivo e o impacto comprovado.
          Órgãos públicos não entram em rankings competitivos: para o Poder
          Público, são usados indicadores de participação, articulação e
          resultados.
        </p>
      </div>
    </section>
  );
}
