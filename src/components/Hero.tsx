import type { CSSProperties } from "react";

export function Hero() {
  return (
    <section className="hero" id="top">
      <span className="sr-only">
        Infraestrutura Digital de Impacto Local. Conecte-se · Participe · <br /> <span className="gradient-text">Transforme</span>
        O DM Conecta identifica demandas reais das comunidades, estrutura projetos e conecta empresas, organizações e poder público para transformar recursos em impacto local mensurável.
      </span>

      <div className="wrap">
        <div className="hp">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="hp-img" src="/images/landing/hero-agente.webp" alt="Agente com colete orienta jovens diante de um notebook em um espaço comunitário; ao fundo, outro grupo trabalha em um quadro" width={2192} height={941} fetchPriority="high" decoding="async" />
          <div className="hp-t">
            <span className="eyebrow">Infraestrutura digital de impacto social e ambiental</span>
            <h1>Conectando projetos locais a quem pode <em>transformar</em>.</h1>
            <p className="lede">O DM Conecta estrutura projetos de impacto social e ambiental e os conecta a empresas, institutos, poder público e comunidade, transformando iniciativas em impacto mensurável nos territórios.</p>
            <div className="slogan" aria-label="Slogan"><span>Conecte-se.</span><span>Participe.</span><span>Transforme.</span></div>
          </div>
          <span className="hp-il"><svg className="ico" aria-hidden="true"><use href="#i-camera" /></svg>Imagem ilustrativa</span>
        </div>
        <ol className="hflow" aria-label="Do projeto ao impacto">
          <li style={{ "--i": 0 } as CSSProperties}><span><svg className="ico" aria-hidden="true"><use href="#i-target" /></svg></span>Projeto</li>
          <li style={{ "--i": 1 } as CSSProperties}><span><svg className="ico" aria-hidden="true"><use href="#i-link" /></svg></span>Conexão</li>
          <li style={{ "--i": 2 } as CSSProperties}><span><svg className="ico" aria-hidden="true"><use href="#i-box" /></svg></span>Recurso</li>
          <li style={{ "--i": 3 } as CSSProperties}><span><svg className="ico" aria-hidden="true"><use href="#i-activity" /></svg></span>Execução</li>
          <li style={{ "--i": 4 } as CSSProperties}><span><svg className="ico" aria-hidden="true"><use href="#i-bars" /></svg></span>Impacto</li>
        </ol>
      </div>
    </section>

  );
}
