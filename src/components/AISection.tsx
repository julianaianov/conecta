import { AISimulation } from "@/components/AISimulation";

export function AISection() {
  return (
    <section className="sec ai-sec" id="ia">
      <div className="wrap">
        <div className="ai-hero">
          <div className="ai-intro">
            <span className="eyebrow"><i className="eb-n" aria-hidden="true">07</i>Inteligência artificial</span>
            <h2 className="h2">A IA sugere conexões. <span className="hl">As pessoas decidem.</span></h2>
            <p className="lede">A IA ajuda a identificar possíveis conexões entre projetos e parceiros, com base em:</p>
            <ul className="ai-cons" aria-label="O que a IA considera">
              <li>Categoria</li>
              <li>Território</li>
              <li>Público</li>
              <li>Objetivos</li>
              <li>Orçamento</li>
              <li>Necessidades</li>
              <li>Impacto esperado</li>
            </ul>
          </div>
          <AISimulation />
        </div>
        <div className="ai-stack">
          <div className="ai-tier">
            <div className="aic-h">
              <span className="ai-tl"><svg className="ico" aria-hidden="true"><use href="#i-layers" /></svg>Camada de apoio</span>
              <span>Funcionalidades de IA previstas</span>
              <span className="dev">Fase 1 · Em desenvolvimento</span>
            </div>
            <ol className="aic aic5">
              <li>
                <span className="aic-ic"><svg className="ico" aria-hidden="true"><use href="#i-link" /></svg></span>
                <b>Sugestão de conexões</b>
                <p>Relaciona projetos e parceiros compatíveis.</p>
              </li>
              <li>
                <span className="aic-ic"><svg className="ico" aria-hidden="true"><use href="#i-brief" /></svg></span>
                <b>Afinidade temática</b>
                <p>Identifica empresas, institutos e patrocinadores com afinidade ao tema do projeto.</p>
              </li>
              <li>
                <span className="aic-ic"><svg className="ico" aria-hidden="true"><use href="#i-doc" /></svg></span>
                <b>Editais e programas</b>
                <p>Sugere editais e programas compatíveis com o projeto.</p>
              </li>
              <li>
                <span className="aic-ic"><svg className="ico" aria-hidden="true"><use href="#i-layers" /></svg></span>
                <b>Apoio à estruturação</b>
                <p>Ajuda o agente a organizar objetivo, orçamento e cronograma.</p>
              </li>
              <li>
                <span className="aic-ic"><svg className="ico" aria-hidden="true"><use href="#i-bars" /></svg></span>
                <b>Relatórios Inteligentes</b>
                <p>Gera relatórios específicos para Poder Público, parceiros e gestão do DM Conecta.</p>
              </li>
            </ol>
          </div>
          <span className="ai-join" aria-hidden="true"><svg className="ico"><use href="#i-arrow" /></svg></span>
          <aside className="ai-warn" role="note" aria-label="Aviso sobre o uso da IA">
            <span className="ai-tl"><svg className="ico" aria-hidden="true"><use href="#i-people" /></svg>Decisão das pessoas</span>
            <p><b>A tecnologia apoia a análise e a conexão. A decisão continua sendo das pessoas.</b> A IA não aprova projetos, não promete recursos e não formaliza parcerias.</p>
          </aside>
        </div>
      </div>
    </section>

  );
}
