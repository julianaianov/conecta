export function Solution() {
  return (
    <section className="sec solx" id="solucao">
      <div className="wrap">
        <div className="solx-head">
          <div>
            <span className="eyebrow">O DM Conecta</span>
            <h2 className="h2 solx-t">
              Uma ponte entre quem desenvolve projetos e{" "}
              <span className="hl">quem pode apoiá-los.</span>
            </h2>
          </div>
          <div className="solx-pos">
            <p className="lede">
              Um hub de projetos de impacto nos territórios: organiza
              iniciativas, conecta pessoas, recursos e oportunidades e acompanha
              a execução em um único sistema de impacto mensurável.
            </p>
          </div>
        </div>

        <div className="solx-caps">
          <span className="solx-k">A plataforma</span>
          <ul>
            <li>
              <span className="sc-ic">
                <svg className="ico">
                  <use href="#i-doc" />
                </svg>
              </span>
              <b>Organiza</b>
              <p>Projetos de impacto em dossiês digitais estruturados.</p>
            </li>
            <li>
              <span className="sc-ic">
                <svg className="ico">
                  <use href="#i-link" />
                </svg>
              </span>
              <b>Conecta</b>
              <p>Quem transforma a quem pode apoiar.</p>
            </li>
            <li>
              <span className="sc-ic">
                <svg className="ico">
                  <use href="#i-spark" />
                </svg>
              </span>
              <b>Sugere</b>
              <p>
                Conexões entre projetos e parceiros com apoio de inteligência
                artificial.
              </p>
              <span className="sc-dev">Em desenvolvimento</span>
            </li>
            <li>
              <span className="sc-ic">
                <svg className="ico">
                  <use href="#i-map" />
                </svg>
              </span>
              <b>Mapeia</b>
              <p>Informações territoriais em um mapa de projetos e impacto.</p>
            </li>
            <li>
              <span className="sc-ic">
                <svg className="ico">
                  <use href="#i-bars" />
                </svg>
              </span>
              <b>Acompanha e mensura</b>
              <p>
                A execução, transformando resultados em dados e histórico.
              </p>
            </li>
          </ul>
        </div>

        <p className="solx-dif" aria-label="Diferencial">
          <span>Organizar</span>
          <i />
          <span>Conectar</span>
          <i />
          <span>Viabilizar</span>
          <i />
          <span>Acompanhar</span>
          <i />
          <span>Mensurar impacto</span>
        </p>
      </div>
    </section>
  );
}
