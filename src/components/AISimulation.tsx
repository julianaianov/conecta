"use client";

import { useEffect, useRef, useState } from "react";

// O que entra na análise: os campos que o Agente já preenche no projeto (sem dado pessoal).
const SAMPLE = "O Agente descreve o projeto: objetivo, público, território, orçamento e necessidades de apoio.";

/** Como a sugestão de IA funciona: o que entra e o que volta, sem resultado de exemplo. */
export function AISimulation() {
  const [text, setText] = useState(SAMPLE);
  const [pending, setPending] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Digita o texto na primeira vez em que o cartão aparece; sem movimento, fica como está.
  useEffect(() => {
    const el = box.current;
    if (!el || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let interval: number | undefined;
    let timeout: number | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      setPending(true);
      setText("");
      let index = 0;
      interval = window.setInterval(() => {
        index += 2;
        setText(SAMPLE.slice(0, index));
        if (index < SAMPLE.length) return;
        window.clearInterval(interval);
        timeout = window.setTimeout(() => setPending(false), 350);
      }, 28);
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearInterval(interval); window.clearTimeout(timeout); };
  }, []);

  return (
    <div className={pending ? "sim pending" : "sim"} id="sim" ref={box}>
      <div className="k"><span>Como a sugestão funciona</span><span>Funcionalidade em desenvolvimento</span></div>
      <div className="in" aria-label="O que a IA recebe">
        <span id="simText">{text}</span>
        <span className="cur" aria-hidden="true" />
      </div>
      <div className="arrow">A IA devolve como sugestão</div>
      <div className="out">
        <div className="o"><span className="kk">Organização</span><b>Categoria e eixos de impacto sugeridos</b></div>
        <div className="o"><span className="kk">Prioridade</span><b>Critérios de urgência identificados</b></div>
        <div className="o"><span className="kk">Editais</span><b>Programas e editais compatíveis</b></div>
        <div className="o urg"><span className="kk">Possíveis apoiadores</span><b><svg className="ico" style={{ width: 16, height: 16 }}><use href="#i-link" /></svg>Parceiros com afinidade ao projeto</b></div>
      </div>
      <p className="note">Toda sugestão é revisada por uma pessoa antes de valer.</p>
    </div>
  );
}
