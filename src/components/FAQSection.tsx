"use client";

export function FAQSection() {
  const openCadAviso = () => {
    window.dispatchEvent(
      new CustomEvent("dmc:open-cad", { detail: { profile: "aviso" } }),
    );
  };

  return (
    <section className="sec" id="faq">
      <div className="wrap fq-wrap">
        <div className="fq-main">
          <div className="sec-head">
            <span className="eyebrow">Perguntas frequentes</span>
            <h2 className="h2">Dúvidas sobre o DM Conecta.</h2>
          </div>
          <div className="fq-list">
            <details className="fq" open>
              <summary>
                Quem pode cadastrar um projeto?
                <span className="fq-ic" aria-hidden="true" />
              </summary>
              <p>
                Agentes de Transformação: associações, ONGs, institutos,
                coletivos, projetos sociais, organizações comunitárias e
                iniciativas socioambientais. Antes de cadastrar um projeto, o
                Agente realiza seu cadastro institucional (dados da
                instituição, CNPJ e CNAE, responsável e documentação) e passa
                por validação. Membros da comunidade não cadastram projetos em
                nome de uma organização sem vínculo ou autorização.
              </p>
            </details>

            <details className="fq">
              <summary>
                Que tipos de projeto podem participar?
                <span className="fq-ic" aria-hidden="true" />
              </summary>
              <p>
                Projetos de educação, esporte, cultura, proteção animal, meio
                ambiente, saúde e bem-estar, segurança alimentar e população em
                situação de rua. Outros projetos de impacto social e ambiental
                alinhados ao propósito também são bem-vindos.
              </p>
            </details>

            <details className="fq">
              <summary>
                Como acompanho os resultados de um projeto?
                <span className="fq-ic" aria-hidden="true" />
              </summary>
              <p>
                Cada projeto tem um dossiê digital com etapas de execução,
                atualizações, fotos, vídeos, documentos, evidências, recursos
                recebidos, pessoas beneficiadas e resultados alcançados.
              </p>
            </details>

            <details className="fq">
              <summary>
                Como os dados são protegidos?
                <span className="fq-ic" aria-hidden="true" />
              </summary>
              <p>
                A plataforma segue a LGPD em toda a coleta, uso e
                compartilhamento de dados. Apenas dados verificáveis são
                publicados, e funcionalidades em desenvolvimento são
                identificadas como tal.
              </p>
            </details>
          </div>
        </div>

        <aside className="lc" aria-labelledby="lcT">
          <span className="lc-badge">
            <svg className="ico" aria-hidden="true">
              <use href="#i-clock" />
            </svg>
            Em desenvolvimento
          </span>
          <h3 id="lcT">Seja avisado no lançamento</h3>
          <p>
            A plataforma está em construção. Deixe seu contato para saber quando
            o cadastro abrir.
          </p>
          <button
            type="button"
            className="btn btn-primary lc-btn"
            data-cad="aviso"
            onClick={openCadAviso}
          >
            Quero ser avisado{" "}
            <svg className="ico">
              <use href="#i-arrow" />
            </svg>
          </button>
          <p className="lc-lgpd">
            <svg className="ico" aria-hidden="true">
              <use href="#i-shield" />
            </svg>
            Seus dados serão tratados conforme a LGPD.
          </p>
        </aside>
      </div>
    </section>
  );
}
