import Image from "next/image";

export function Projects() {
  const axes = [
    {
      id: "edu",
      title: "Educação",
      icon: "i-book",
      img: "/images/landing/eixo-educacao.webp",
      alt: "Educador orienta jovens em aula de tecnologia e reforço escolar",
      desc: "Reforço escolar, oficinas de leitura, inclusão digital e apoio pedagógico para crianças e jovens.",
      tags: ["Reforço escolar", "Inclusão digital", "Oficinas"],
    },
    {
      id: "esp",
      title: "Esporte",
      icon: "i-ball",
      img: "/images/landing/eixo-esporte.webp",
      alt: "Jovens jogam basquete em cadeira de rodas em quadra comunitária",
      desc: "Escolinhas esportivas, artes marciais, inclusão e atividades no contraturno escolar.",
      tags: ["Escolinha de futebol", "Judô comunitário", "Basquete em cadeira de rodas"],
    },
    {
      id: "cul",
      title: "Cultura",
      icon: "i-music",
      img: "/images/landing/eixo-cultura.webp",
      alt: "Jovens e professora em aula de dança em centro comunitário",
      desc: "Música, dança, teatro, audiovisual, literatura e valorização da identidade local.",
      tags: ["Oficina de música", "Dança comunitária", "Audiovisual"],
    },
    {
      id: "ani",
      title: "Proteção Animal",
      icon: "i-paw",
      img: "/images/landing/eixo-protecao-animal.webp",
      alt: "Voluntário abraça uma cadela em um abrigo de proteção animal",
      desc: "Castração, resgate, feiras de adoção, vacinação e conscientização comunitária.",
      tags: ["Castração solidária", "Feira de adoção", "Resgate animal"],
    },
    {
      id: "amb",
      title: "Meio Ambiente",
      icon: "i-leaf",
      img: "/images/landing/eixo-meio-ambiente.webp",
      alt: "Voluntários recolhendo resíduos na areia da praia em mutirão ambiental",
      desc: "Coleta seletiva, reciclagem, hortas urbanas, preservação e educação ambiental.",
      tags: ["Horta comunitária", "Reciclagem", "Educação ambiental"],
    },
    {
      id: "sau",
      title: "Saúde e Bem-estar",
      icon: "i-activity",
      img: "/images/landing/eixo-saude.webp",
      alt: "Ação de saúde comunitária com aferição de pressão e orientação",
      desc: "Prevenção, apoio psicológico, saúde comunitária e qualidade de vida nos territórios.",
      tags: ["Prevenção à saúde", "Apoio psicológico", "Saúde comunitária"],
    },
    {
      id: "ali",
      title: "Segurança Alimentar",
      icon: "i-meal",
      img: "/images/landing/eixo-seguranca-alimentar.webp",
      alt: "Voluntário entrega cesta básica a uma moradora em ação comunitária",
      desc: "Cozinhas comunitárias, hortas produtivas e combate à fome nos territórios.",
      tags: ["Cozinha comunitária", "Distribuição de alimentos", "Horta produtiva"],
    },
    {
      id: "rua",
      title: "População de Rua",
      icon: "i-shelter",
      img: "/images/landing/eixo-populacao-rua.webp",
      alt: "Voluntários servem refeições a pessoas em situação de rua",
      desc: "Acolhimento, dignidade, documentação, alimentação e reinserção social.",
      tags: ["Acolhimento e higiene", "Documentação", "Capacitação e renda"],
    },
  ];

  return (
    <section className="sec" id="projetos">
      <div className="wrap">
        <div className="sec-head px-head">
          <span className="eyebrow">Projetos e eixos de impacto</span>
          <h2 className="h2">Projetos de impacto social e ambiental, organizados por eixo.</h2>
          <p className="lede">
            Cada projeto ganha um dossiê digital com tudo o que um apoiador precisa para conhecê-lo, apoiá-lo e acompanhá-lo.
          </p>
        </div>

        <div className="dgrid pgrid">
          {axes.map((ax) => (
            <article key={ax.id} className="dcard pcard" data-ex={ax.id}>
              <div className="dart">
                <Image
                  src={ax.img}
                  alt={ax.alt}
                  width={400}
                  height={225}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="dbody">
                <div className="lbl">
                  <span className="px-ic">
                    <svg className="ico">
                      <use href={`#${ax.icon}`} />
                    </svg>
                  </span>
                  <h3>{ax.title}</h3>
                </div>
                <p>{ax.desc}</p>
                <ul className="tags">
                  {ax.tags.map((t, idx) => (
                    <li key={idx}>{t}</li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        <p className="px-note">
          Imagens ilustrativas, sem relação com projetos reais cadastrados no DM Conecta.
        </p>
        <p className="px-note">
          <svg className="ico" aria-hidden="true">
            <use href="#i-spark" />
          </svg>
          Outros projetos alinhados ao propósito socioambiental também são bem-vindos na plataforma.
        </p>

        {/* Dossiê Digital */}
        <div className="px-foot">
          <section className="dos" aria-labelledby="dosT">
            <header className="dos-h">
              <span className="dos-badge">
                <svg className="ico" aria-hidden="true">
                  <use href="#i-doc" />
                </svg>
              </span>
              <div>
                <span className="dos-k">Dossiê digital do projeto</span>
                <h3 id="dosT">Cada iniciativa tem seu histórico estruturado</h3>
              </div>
            </header>

            <ol className="dos-list">
              <li className="dos-i">
                <div className="dos-top">
                  <span className="dos-ic">
                    <svg className="ico">
                      <use href="#i-pin" />
                    </svg>
                  </span>
                  <span className="dos-n">01</span>
                </div>
                <b>Identificação</b>
                <ul>
                  <li>Nome</li>
                  <li>Agente responsável</li>
                  <li>Território</li>
                  <li>Eixo</li>
                  <li>Público beneficiado</li>
                </ul>
              </li>

              <li className="dos-i">
                <div className="dos-top">
                  <span className="dos-ic">
                    <svg className="ico">
                      <use href="#i-layers" />
                    </svg>
                  </span>
                  <span className="dos-n">02</span>
                </div>
                <b>Estruturação</b>
                <ul>
                  <li>Objetivo</li>
                  <li>Justificativa</li>
                  <li>Metas</li>
                  <li>Orçamento detalhado</li>
                  <li>Cronograma</li>
                </ul>
              </li>

              <li className="dos-i">
                <div className="dos-top">
                  <span className="dos-ic">
                    <svg className="ico">
                      <use href="#i-link" />
                    </svg>
                  </span>
                  <span className="dos-n">03</span>
                </div>
                <b>Apoio e conexões</b>
                <ul>
                  <li>Parceiros conectados</li>
                  <li>Recursos captados</li>
                  <li>Formas de apoio</li>
                  <li>Contrapartidas</li>
                </ul>
              </li>

              <li className="dos-i">
                <div className="dos-top">
                  <span className="dos-ic">
                    <svg className="ico">
                      <use href="#i-activity" />
                    </svg>
                  </span>
                  <span className="dos-n">04</span>
                </div>
                <b>Execução</b>
                <ul>
                  <li>Etapas realizadas</li>
                  <li>Evidências (fotos/docs)</li>
                  <li>Frequência</li>
                  <li>Atualizações</li>
                </ul>
              </li>

              <li className="dos-i">
                <div className="dos-top">
                  <span className="dos-ic">
                    <svg className="ico">
                      <use href="#i-target" />
                    </svg>
                  </span>
                  <span className="dos-n">05</span>
                </div>
                <b>Resultados</b>
                <ul>
                  <li>Metas cumpridas</li>
                  <li>Pessoas atendidas</li>
                  <li>Transformação mensurada</li>
                  <li>Prestação de contas</li>
                </ul>
              </li>
            </ol>
          </section>

          <div className="px-more">
            <svg className="ico" aria-hidden="true">
              <use href="#i-check" />
            </svg>
            Mais do que uma página de projeto: um histórico completo, transparente e verificável de cada iniciativa.
          </div>
        </div>
      </div>
    </section>
  );
}
