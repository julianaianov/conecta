"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type ActorId = "agt" | "par" | "pp" | "com" | "cmn" | "dm";

const ACTORS: { id: ActorId; name: string; icon?: string }[] = [
  { id: "agt", name: "Agentes de Transformação", icon: "i-people" },
  { id: "par", name: "Parceiros", icon: "i-brief" },
  { id: "pp", name: "Poder Público", icon: "i-gov" },
  { id: "com", name: "Comunidade", icon: "i-heart" },
  { id: "cmn", name: "Comunicação", icon: "i-mega" },
  { id: "dm", name: "DM Conecta" },
];

const STAGES: { title: string; phase: string; actors: ActorId[]; text: string; ai?: boolean }[] = [
  { title: "Projeto", phase: "Estruturar", actors: ["agt"], text: "Após o cadastro institucional e a validação, o Agente de Transformação cadastra a iniciativa e apresenta seu objetivo." },
  { title: "Estruturação", phase: "Estruturar", actors: ["agt", "dm"], text: "O projeto é organizado com orçamento, cronograma, público beneficiado e resultados esperados." },
  { title: "Conexão", phase: "Conectar", actors: ["dm"], text: "O DM Conecta identifica possíveis parceiros e apoiadores para o projeto.", ai: true },
  { title: "Apoio", phase: "Conectar", actors: ["par", "pp", "com"], text: "Parceiros, poder público e comunidade oferecem recursos financeiros, materiais, técnicos, institucionais ou humanos." },
  { title: "Execução", phase: "Executar", actors: ["agt", "par"], text: "O projeto é realizado no território pelo Agente de Transformação com os parceiros envolvidos." },
  { title: "Acompanhamento", phase: "Executar", actors: ["agt", "dm"], text: "Etapas, evidências e atualizações são registradas." },
  { title: "Resultados", phase: "Mensurar", actors: ["agt"], text: "O Agente apresenta os resultados alcançados." },
  { title: "Impacto", phase: "Mensurar", actors: ["dm", "cmn"], text: "O DM Conecta mensura e dá visibilidade à transformação gerada." },
];

const two = (value: number) => String(value).padStart(2, "0");

function ActorChip({ id }: { id: ActorId }) {
  const actor = ACTORS.find((item) => item.id === id);
  if (!actor) return null;
  return (
    <li className={actor.icon ? "cf-a" : "cf-a is-sys"} data-a={actor.id}>
      {actor.icon
        ? <svg className="ico" aria-hidden="true"><use href={`#${actor.icon}`} /></svg>
        : <svg className="lg" aria-hidden="true"><use href="#logo-mark" /></svg>}
      {actor.name}
    </li>
  );
}

export function Steps() {
  const [current, setCurrent] = useState(0);
  const [highlight, setHighlight] = useState<ActorId | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const list = useRef<HTMLOListElement>(null);
  const focusNext = useRef(false);

  const go = (index: number, focus = false) => {
    focusNext.current = focus;
    setCurrent((index + STAGES.length) % STAGES.length);
  };

  // No celular a régua rola na horizontal: mantém a etapa escolhida à vista.
  useEffect(() => {
    const tab = tabs.current[current];
    const ol = list.current;
    if (focusNext.current) { tab?.focus(); focusNext.current = false; }
    const item = tab?.parentElement;
    if (!ol || !item || ol.scrollWidth <= ol.clientWidth) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ol.scrollTo({ left: item.offsetLeft - ol.clientWidth / 2 + item.clientWidth / 2, behavior: reduce ? "auto" : "smooth" });
  }, [current]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const target = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: STAGES.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    go(target, true);
  };

  return (
    <section className="sec" id="como-funciona">
      <span id="solucao" className="anc" aria-hidden="true" />
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow"><i className="eb-n" aria-hidden="true">03</i>Como funciona</span>
          <h2 className="h2">Do projeto ao impacto, <span className="hl">em oito etapas.</span></h2>
          <p className="lede">O DM Conecta estrutura o projeto, conecta a quem pode apoiar e acompanha até o resultado. Selecione uma etapa.</p>
        </div>

        <div className="cf-actorsbar">
          <span className="cf-lbl">Atores no fluxo</span>
          <ul className="cf-actors" id="cfLegend" aria-label="Passe o mouse ou toque para destacar as etapas de cada ator">
            {ACTORS.map((actor) => (
              <li
                key={actor.id}
                tabIndex={0}
                className={["cf-a", actor.icon ? "" : "is-sys", highlight === actor.id ? "is-hl" : ""].filter(Boolean).join(" ")}
                data-a={actor.id}
                onMouseEnter={() => setHighlight(actor.id)}
                onMouseLeave={() => setHighlight(null)}
                onFocus={() => setHighlight(actor.id)}
                onBlur={() => setHighlight(null)}
              >
                {actor.icon
                  ? <svg className="ico" aria-hidden="true"><use href={`#${actor.icon}`} /></svg>
                  : <svg className="lg" aria-hidden="true"><use href="#logo-mark" /></svg>}
                {actor.name}
              </li>
            ))}
          </ul>
        </div>

        <div className={highlight ? "hw is-filtering" : "hw"} id="hw">
          <div className="hw-rail" aria-hidden="true">
            <i id="hwProg" style={{ width: `${(current / (STAGES.length - 1)) * 100}%` }} />
          </div>
          <ol className="hw-steps" role="tablist" aria-label="Etapas do fluxo" ref={list}>
            {STAGES.map((stage, index) => {
              const selected = index === current;
              const match = highlight !== null && stage.actors.includes(highlight);
              return (
                <li role="presentation" key={stage.title}>
                  <button
                    type="button"
                    className={["hw-s", index < current ? "is-done" : "", match ? "is-match" : ""].filter(Boolean).join(" ")}
                    role="tab"
                    id={`hwT${index}`}
                    aria-controls={`hwP${index}`}
                    aria-selected={selected}
                    tabIndex={selected ? 0 : -1}
                    ref={(el) => { tabs.current[index] = el; }}
                    onClick={() => go(index)}
                    onKeyDown={onKeyDown}
                  >
                    <span className="hw-n">{two(index + 1)}</span>
                    <span className="hw-t">{stage.title}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="hw-panels">
            {STAGES.map((stage, index) => (
              <article className="hw-p" role="tabpanel" id={`hwP${index}`} aria-labelledby={`hwT${index}`} hidden={index !== current} key={stage.title}>
                <div className="hw-main">
                  <span className="hw-ph">Fase · {stage.phase}</span>
                  <div className="hw-title">
                    <span className="hw-big" aria-hidden="true">{two(index + 1)}</span>
                    <h3>{stage.title}</h3>
                    {stage.ai ? (
                      <a className="cf-ia" href="#ia"><svg className="ico" aria-hidden="true"><use href="#i-spark" /></svg>IA · em desenvolvimento</a>
                    ) : null}
                  </div>
                  <p>{stage.text}</p>
                </div>
                <div className="hw-who">
                  <span className="cf-lbl">Quem atua</span>
                  <ul className="cf-actors">
                    {stage.actors.map((id) => <ActorChip id={id} key={id} />)}
                  </ul>
                </div>
              </article>
            ))}
            <div className="hw-nav">
              <button type="button" className="hw-prev" id="hwPrev" aria-label="Etapa anterior" onClick={() => go(current - 1)}>
                <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
              </button>
              <span className="hw-count" id="hwCount">Etapa {two(current + 1)} de {two(STAGES.length)}</span>
              <button type="button" className="hw-next" id="hwNext" onClick={() => go(current + 1)}>
                {current === STAGES.length - 1 ? "Voltar ao início" : "Próxima etapa"}
                <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
