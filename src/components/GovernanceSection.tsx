export function GovernanceSection() {
  return (
    <section className="sec band" id="governanca">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow"><i className="eb-n" aria-hidden="true">09</i>Governança, LGPD e neutralidade</span>
          <h2 className="h2">Confiança para empresas, organizações e poder público.</h2>
        </div>
        <div className="govn">
          <div className="pillar">
            <svg className="ico"><use href="#i-shield" /></svg>
            <h3>LGPD</h3>
            <p>Conformidade em toda a coleta, uso e compartilhamento de dados.</p>
          </div>
          <div className="pillar">
            <svg className="ico"><use href="#i-scale" /></svg>
            <h3>Neutralidade político-partidária</h3>
            <p>A plataforma atende qualquer gestão, independentemente de alinhamento político.</p>
          </div>
          <div className="pillar">
            <svg className="ico"><use href="#i-doc" /></svg>
            <h3>Relação com o poder público</h3>
            <p>Critérios claros, processos transparentes e registro formal das parcerias.</p>
          </div>
          <div className="pillar">
            <svg className="ico"><use href="#i-eye" /></svg>
            <h3>Transparência nos indicadores</h3>
            <p>Apenas dados verificáveis são publicados; funcionalidades em desenvolvimento são identificadas.</p>
          </div>
        </div>
      </div>
    </section>

  );
}
