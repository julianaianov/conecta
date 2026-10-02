"use client";

import { useEffect, useState } from "react";

export function AISection() {
  const fullText =
    "Projeto de esporte para jovens: aulas de futebol no contraturno para 60 crianças no Bairro C. Precisamos de material esportivo e lanche.";
  const [displayText, setDisplayText] = useState("");
  const [isPending, setIsPending] = useState(true);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      i += 3;
      setDisplayText(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(interval);
        setTimeout(() => setIsPending(false), 300);
      }
    }, 40);

    return () => clearInterval(interval);
  }, []);

  return (
    <section className="sec ai-sec" id="ia">
      <div className="wrap">
        <div className="ai-hero">
          <div className="ai-intro">
            <span className="eyebrow">Inteligência artificial</span>
            <h2 className="h2">
              A IA sugere conexões. <span className="hl">As pessoas decidem.</span>
            </h2>
            <p className="lede">
              A IA ajuda a identificar possíveis conexões entre projetos e
              parceiros, com base em:
            </p>
            <ul className="ai-cons" aria-label="O que a IA considera">
              <li>Categoria</li>
              <li>Território</li>
              <li>Público</li>
              <li>Objetivos</li>
              <li>Orçamento</li>
            </ul>
          </div>

          {/* Simulação Conceitual */}
          <div className={`sim ${isPending ? "pending" : ""}`} id="sim">
            <div className="k">
              <span>Simulação conceitual</span>
              <span>Funcionalidade em desenvolvimento</span>
            </div>
            <div className="in" aria-label="Texto de exemplo de um projeto">
              <span id="simText">{displayText}</span>
              <span className="cur" aria-hidden="true" />
            </div>
            <div className="arrow">Conexões sugeridas</div>
            <div className="out">
              <div className="o">
                <span className="kk">Eixo</span>
                <b>Esporte</b>
              </div>
              <div className="o">
                <span className="kk">Público</span>
                <b>Jovens</b>
              </div>
              <div className="o">
                <span className="kk">Afinidade temática</span>
                <b>Esporte, juventude e inclusão</b>
              </div>
              <div className="o urg">
                <span className="kk">Possíveis apoiadores</span>
                <b>
                  <svg className="ico" style={{ width: 16, height: 16 }}>
                    <use href="#i-link" />
                  </svg>
                  Empresas e editais
                </b>
              </div>
            </div>
            <p className="note">Exemplo ilustrativo de sugestão de conexões.</p>
          </div>
        </div>

        {/* Funcionalidades Fase 1 */}
        <div className="aic-h" style={{ marginTop: 48 }}>
          <span className="dev">Fase 1 · Em desenvolvimento</span>
          <span>Funcionalidades de IA previstas</span>
        </div>

        <ol className="aic aic5">
          <li>
            <span className="aic-ic">
              <svg className="ico" aria-hidden="true">
                <use href="#i-link" />
              </svg>
            </span>
            <b>Sugestão de conexões</b>
            <span>Cruzamento entre objetivos do projeto e foco do apoiador.</span>
          </li>
          <li>
            <span className="aic-ic">
              <svg className="ico" aria-hidden="true">
                <use href="#i-doc" />
              </svg>
            </span>
            <b>Estruturação inicial</b>
            <span>Apoio ao Agente na organização de metas, prazos e orçamento.</span>
          </li>
          <li>
            <span className="aic-ic">
              <svg className="ico" aria-hidden="true">
                <use href="#i-search" />
              </svg>
            </span>
            <b>Identificação de editais</b>
            <span>Mapeamento de oportunidades públicas e privadas compatíveis.</span>
          </li>
          <li>
            <span className="aic-ic">
              <svg className="ico" aria-hidden="true">
                <use href="#i-activity" />
              </svg>
            </span>
            <b>Apoio na prestação</b>
            <span>Organização de relatórios e evidências de execução.</span>
          </li>
          <li>
            <span className="aic-ic">
              <svg className="ico" aria-hidden="true">
                <use href="#i-target" />
              </svg>
            </span>
            <b>Visibilidade de impacto</b>
            <span>Síntese de dados territoriais e resultados comprovados.</span>
          </li>
        </ol>

        {/* Aviso de Governança */}
        <aside className="ai-warn" role="note" aria-label="Aviso sobre o uso da IA">
          <svg className="ico" aria-hidden="true">
            <use href="#i-shield" />
          </svg>
          <p>
            <b>Limites da IA:</b> ela não aprova projetos, não promete recursos e
            não formaliza parcerias. A decisão de apoiar é sempre das pessoas e
            organizações envolvidas.
          </p>
        </aside>
      </div>
    </section>
  );
}
