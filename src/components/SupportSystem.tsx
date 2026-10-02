"use client";

export function SupportSystem() {
  const openCad = () => {
    window.dispatchEvent(new CustomEvent("dmc:open-cad", { detail: { profile: "parceiro" } }));
  };

  const forms = [
    { title: "Apoio financeiro", icon: "i-spark" },
    { title: "Doação de materiais", icon: "i-box" },
    { title: "Espaço físico", icon: "i-city" },
    { title: "Serviços técnicos", icon: "i-bolt" },
    { title: "Voluntariado", icon: "i-heart" },
    { title: "Articulação institucional", icon: "i-gov" },
    { title: "Conexão com redes", icon: "i-link" },
    { title: "Mentoria", icon: "i-bulb" },
    { title: "Divulgação", icon: "i-mega" },
    { title: "Monitoramento", icon: "i-target" },
  ];

  return (
    <section className="sec who" id="apoio">
      <div className="wrap">
        <div className="apoio">
          <div>
            <span className="eyebrow">Sistema de apoio</span>
            <h2 className="h2" style={{ marginTop: 16 }}>
              Dez formas de apoiar um projeto.
            </h2>
            <p className="lede" style={{ marginTop: 18 }}>
              Apoiar vai muito além de recursos financeiros. Empresas,
              institutos, poder público e comunidade podem contribuir de diversas
              maneiras:
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
