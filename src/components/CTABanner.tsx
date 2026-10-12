import Image from "next/image";

export function CTABanner() {
  return (
    <section id="participar" className="cta-sec">
      {/* Posicionamento literal da Apresentação Institucional (slides 28 e 29), para leitores de tela e buscadores. */}
      <span className="sr-only">
        Plataforma de impacto local
        Ponte entre comunidade e oportunidades
        Hub de transformação urbana
        É um ecossistema de transformação social local, conectando pessoas, dados e oportunidades em um sistema único de impacto mensurável.
      </span>
      <div className="wrap">
        <div className="cta is-on">
          <figure className="cta-img">
            <Image src="/images/landing/cta-voluntario.webp" alt="Voluntário sorri abraçado a uma cadela em um abrigo de animais" width={1672} height={941} sizes="(max-width: 900px) 100vw, 50vw" />
            <div className="ci-ov" aria-hidden="true">
              <ol className="ci-flow" aria-label="Projeto, conexão, execução e impacto">
                <li className="d" title="Projeto"><i><svg className="ico"><use href="#i-target" /></svg></i></li>
                <li title="Conexão"><i><svg className="ico"><use href="#i-link" /></svg></i></li>
                <li title="Execução"><i><svg className="ico"><use href="#i-activity" /></svg></i></li>
                <li className="r" title="Impacto"><i><svg className="ico"><use href="#i-check" /></svg></i></li>
              </ol>
            </div>
          </figure>
          <div className="cta-txt">
            <div className="slogan cta-slogan" aria-label="Slogan"><span>Conecte-se.</span><span>Participe.</span><span>Transforme.</span></div>
            <h2 id="ctaH">Um <span className="w-dem">projeto</span> pode ser o começo de uma <span className="w-tr">transformação</span>.</h2>
          </div>
          <nav className="routes" aria-labelledby="jrH">
            <div className="jr-head">
              <span className="routes-h">Como participar</span>
              <h3 id="jrH">Qual é o seu papel no DM Conecta?</h3>
            </div>
            <a className="jr jr-main" href="#contato" data-cad="agente" data-journey="agente">
              <span className="jr-tag">Comece por aqui</span>
              <span className="jr-ic"><svg className="ico" aria-hidden="true"><use href="#i-people" /></svg></span>
              <b>Sou Agente de Transformação</b>
              <span className="jr-d">Cadastre e estruture seu projeto, conecte-se a apoiadores e registre resultados.</span>
              <span className="jr-cta">Cadastrar projeto<svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></span>
            </a>
            <div className="jr-grid">
              <a className="jr" href="#contato" data-cad="comunidade" data-journey="comunidade">
                <span className="jr-ic"><svg className="ico" aria-hidden="true"><use href="#i-heart" /></svg></span>
                <b>Sou da comunidade</b>
                <span className="jr-d">Participe, seja voluntário e acompanhe projetos do seu território.</span>
                <span className="jr-cta">Quero participar<svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></span>
              </a>
              <a className="jr" href="#contato" data-cad="poder-publico" data-journey="poder-publico">
                <span className="jr-ic"><svg className="ico" aria-hidden="true"><use href="#i-gov" /></svg></span>
                <b>Represento o Poder Público</b>
                <span className="jr-d">Articule, participe e acompanhe projetos de interesse público.</span>
                <span className="jr-cta">Acessar como gestor<svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></span>
              </a>
              <a className="jr" href="#contato" data-cad="parceiro" data-journey="parceiro">
                <span className="jr-ic"><svg className="ico" aria-hidden="true"><use href="#i-brief" /></svg></span>
                <b>Sou empresa ou parceiro</b>
                <span className="jr-d">Encontre projetos compatíveis e acompanhe o impacto do seu apoio.</span>
                <span className="jr-cta">Quero apoiar<svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></span>
              </a>
              <a className="jr" href="#contato" data-cad="comunicacao" data-journey="comunicacao">
                <span className="jr-ic"><svg className="ico" aria-hidden="true"><use href="#i-mega" /></svg></span>
                <b>Trabalho com comunicação</b>
                <span className="jr-d">Identifique pautas de impacto e dê visibilidade a projetos e resultados.</span>
                <span className="jr-cta">Acompanhar projetos<svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></span>
              </a>
            </div>
          </nav>
        </div>
        <aside className="lc2" aria-labelledby="lcT">
          <span className="lc-badge"><svg className="ico" aria-hidden="true"><use href="#i-clock" /></svg>Em desenvolvimento</span>
          <p><b id="lcT">Seja avisado no lançamento.</b> A plataforma está em construção. Deixe seu contato para saber quando o cadastro abrir.</p>
          <a className="btn btn-primary" href="#contato" data-cad="aviso">Quero ser avisado <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></a>
        </aside>
      </div>
    </section>

  );
}
