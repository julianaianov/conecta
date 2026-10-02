export function GovernanceSection() {
  return (
    <section className="sec band" id="governanca">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Governança, LGPD e neutralidade</span>
          <h2 className="h2">
            Confiança para empresas, organizações e poder público.
          </h2>
        </div>
        <div className="govn">
          <div className="pillar">
            <svg className="ico">
              <use href="#i-shield" />
            </svg>
            <h3>LGPD</h3>
            <p>
              Conformidade em toda a coleta, uso e compartilhamento de dados.
              Consentimento expresso e proteção da privacidade dos participantes.
            </p>
          </div>
          <div className="pillar">
            <svg className="ico">
              <use href="#i-scale" />
            </svg>
            <h3>Neutralidade político-partidária</h3>
            <p>
              A plataforma atende qualquer gestão pública democraticamente
              eleita, sem preferências partidárias ou direcionamentos
              ideológicos.
            </p>
          </div>
          <div className="pillar">
            <svg className="ico">
              <use href="#i-doc" />
            </svg>
            <h3>Relação com o poder público</h3>
            <p>
              Critérios claros, processos transparentes e respeito às normas de
              cooperação institucional e transparência pública.
            </p>
          </div>
          <div className="pillar">
            <svg className="ico">
              <use href="#i-eye" />
            </svg>
            <h3>Transparência nos indicadores</h3>
            <p>
              Apenas dados verificáveis são publicados. Metas, recursos e
              evidências são registrados com critérios auditáveis.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
