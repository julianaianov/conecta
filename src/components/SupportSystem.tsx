"use client";

export function SupportSystem() {
  const openCad = () => {
    window.dispatchEvent(new CustomEvent("dmc:open-cad", { detail: { profile: "parceiro" } }));
  };

  const forms = [
    { title: "Patrocínio", icon: "i-spark" },
    { title: "Investimento social", icon: "i-brief" },
    { title: "Doações financeiras", icon: "i-box" },
    { title: "Doação de materiais e equipamentos", icon: "i-box" },
    { title: "Apoio técnico e conhecimento especializado", icon: "i-bolt" },
    { title: "Cessão de espaço e infraestrutura", icon: "i-city" },
    { title: "Apoio logístico", icon: "i-link" },
    { title: "Voluntariado", icon: "i-heart" },
    { title: "Divulgação", icon: "i-mega" },
    { title: "Apoio institucional e parcerias estratégicas", icon: "i-gov" },
  ];

  return (
    <section className="sec who" id="apoio">
      <div className="wrap">
        <div className="apoio">
          <div>
            <span className="eyebrow">Sistema de apoio</span>
            <h2 className="h2" style={{ marginTop: 16 }}>
              Formas de apoiar projetos de impacto.
            </h2>
            <p className="lede" style={{ marginTop: 18 }}>
              Cada projeto indica o que precisa. Parceiros, poder público e
              comunidade escolhem como contribuir.
            </p>
            <div className="hero-ctas" style={{ marginTop: 28 }}>
              <button
                type="button"
                className="btn btn-primary"
                data-cad="parceiro"
                onClick={openCad}
              >
                Quero apoiar projetos
                <svg className="ico">
                  <use href="#i-arrow" />
                </svg>
              </button>
              <a className="btn btn-ghost" href="#projetos">
                Ver projetos disponíveis
              </a>
            </div>
          </div>

          <div className="agrid agrid10">
            {forms.map((item, idx) => (
              <article key={idx} className="aitem">
                <span className="bx">
                  <svg className="ico">
                    <use href={`#${item.icon}`} />
                  </svg>
                </span>
                <h3>{item.title}</h3>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
