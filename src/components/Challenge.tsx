import type { CSSProperties } from "react";
import { ChallengeScenario } from "@/components/ChallengeScenario";

export function Challenge() {
  return (
    <section className="sec dz-sec" id="sobre">
      <div className="wrap">
        <div className="dz-hero">
          <div className="dz-ht">
            <span className="eyebrow"><i className="eb-n" aria-hidden="true">01</i>O desafio</span>
            <h2 className="h2 ch-t">Existem projetos.<br />Existem recursos.<br /><span className="hl">Falta conexão.</span></h2>
            <p className="lede">Há iniciativas de impacto em todos os territórios e há quem queira apoiá-las. Mas não existe uma infraestrutura única que aproxime uns dos outros.</p>
          </div>
          <div className="dz-sc" id="dzSc" role="img" aria-label="Projetos, recursos, pessoas e organizações dispersos, sem um ponto de encontro">
            <svg className="dz-ln" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <line x1="20" y1="13" x2="32.6" y2="28.5" />
              <line x1="81" y1="13" x2="68.0" y2="28.5" />
              <line x1="13" y1="53" x2="28.5" y2="51.7" />
              <line x1="89" y1="51" x2="72.6" y2="50.6" />
              <line x1="23" y1="89" x2="34.3" y2="72.6" />
              <line x1="77" y1="89" x2="65.7" y2="72.6" />
            </svg>
            <i className="dz-x" style={{ left: "32.6%", top: "28.5%" }}>×</i>
            <i className="dz-x" style={{ left: "68.0%", top: "28.5%" }}>×</i>
            <i className="dz-x" style={{ left: "28.5%", top: "51.7%" }}>×</i>
            <i className="dz-x" style={{ left: "72.6%", top: "50.6%" }}>×</i>
            <i className="dz-x" style={{ left: "34.3%", top: "72.6%" }}>×</i>
            <i className="dz-x" style={{ left: "65.7%", top: "72.6%" }}>×</i>
            <span className="dz-mid">Sem ponto<br />de encontro</span>
            <ul>
              <li className="dz-c dz-p" style={{ left: "20%", top: "13%", "--r": "-3deg", "--i": 0 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-target" /></svg>Escolinha de futebol</li>
              <li className="dz-c dz-a" style={{ left: "49%", top: "9%", "--r": "2deg", "--i": 1 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-people" /></svg>Agentes</li>
              <li className="dz-c dz-r" style={{ left: "81%", top: "13%", "--r": "3deg", "--i": 2 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-box" /></svg>Patrocínio</li>
              <li className="dz-c dz-a" style={{ left: "27%", top: "33%", "--r": "2deg", "--i": 3 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-heart" /></svg>Comunidade</li>
              <li className="dz-c dz-a" style={{ left: "73%", top: "32%", "--r": "-2deg", "--i": 4 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-brief" /></svg>Parceiros</li>
              <li className="dz-c dz-p" style={{ left: "13%", top: "53%", "--r": "3deg", "--i": 5 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-target" /></svg>Reforço escolar</li>
              <li className="dz-c dz-r" style={{ left: "89%", top: "51%", "--r": "-3deg", "--i": 6 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-box" /></svg>Voluntariado</li>
              <li className="dz-c dz-a" style={{ left: "29%", top: "70%", "--r": "-2deg", "--i": 7 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-mega" /></svg>Comunicação</li>
              <li className="dz-c dz-a" style={{ left: "72%", top: "69%", "--r": "2deg", "--i": 8 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-gov" /></svg>Poder Público</li>
              <li className="dz-c dz-p" style={{ left: "23%", top: "89%", "--r": "2deg", "--i": 9 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-target" /></svg>Castração solidária</li>
              <li className="dz-c dz-r" style={{ left: "77%", top: "89%", "--r": "-2deg", "--i": 10 } as CSSProperties}><svg className="ico" aria-hidden="true"><use href="#i-box" /></svg>Programas públicos</li>
            </ul>
            <p className="dz-key" aria-hidden="true"><span className="k-p">Projetos</span><span className="k-r">Recursos</span><span className="k-a">Pessoas e organizações</span></p>
          </div>
        </div>
        <ol className="dz-pts" id="dzPts" aria-label="O problema em uma visão rápida">
          <li style={{ "--i": 0 } as CSSProperties}>
            <span className="dz-pn">01</span>
            <span className="dz-pi"><svg className="ico" aria-hidden="true"><use href="#i-layers" /></svg></span>
            <h3>Projetos sem estrutura</h3>
            <p>Iniciativas sociais e ambientais com grande potencial, mas sem a <b>estrutura</b> necessária para crescer.</p>
            <span className="dz-pa"><i>Afeta</i>Quem realiza</span>
          </li>
          <li style={{ "--i": 1 } as CSSProperties}>
            <span className="dz-pn">02</span>
            <span className="dz-pi"><svg className="ico" aria-hidden="true"><use href="#i-search" /></svg></span>
            <h3>Recursos que não chegam</h3>
            <p>Empresas, institutos, patrocinadores e poder público <b>querem apoiar</b>, mas não encontram os projetos.</p>
            <span className="dz-pa"><i>Afeta</i>Quem apoia</span>
          </li>
          <li style={{ "--i": 2 } as CSSProperties}>
            <span className="dz-pn">03</span>
            <span className="dz-pi"><svg className="ico" aria-hidden="true"><use href="#i-route" /></svg></span>
            <h3>Atuação dispersa</h3>
            <p>Pessoas e organizações atuam de forma <b>dispersa</b>, cada uma por um caminho.</p>
            <span className="dz-pa"><i>Afeta</i>Pessoas e organizações</span>
          </li>
          <li style={{ "--i": 3 } as CSSProperties}>
            <span className="dz-pn">04</span>
            <span className="dz-pi"><svg className="ico" aria-hidden="true"><use href="#i-eye" /></svg></span>
            <h3>Sem acompanhamento</h3>
            <p>Falta uma infraestrutura única para <b>acompanhar e medir</b> os resultados dos projetos.</p>
            <span className="dz-pa"><i>Afeta</i>Quem apoia e quem realiza</span>
          </li>
        </ol>
        <ChallengeScenario />
      </div>
    </section>
  );
}
