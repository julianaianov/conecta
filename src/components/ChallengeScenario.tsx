"use client";

import { useEffect, useRef, useState } from "react";

/** "E se…": compara o cenário de hoje com o do DM Conecta (diagrama conceitual, sem dado). */
export function ChallengeScenario() {
  const [connected, setConnected] = useState(false);
  const touched = useRef(false);
  const row = useRef<HTMLDivElement>(null);

  // Mostra a virada sozinho na primeira vez em que a faixa aparece, se ninguém escolheu antes.
  useEffect(() => {
    const el = row.current;
    if (!el || !("IntersectionObserver" in window)) return;
    let timer: number | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      timer = window.setTimeout(() => { if (!touched.current) setConnected(true); }, 900);
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, []);

  const choose = (next: boolean) => { touched.current = true; setConnected(next); };

  return (
    <div className="ws" id="eSe">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ws-bg" src="/images/landing/desafio-e-se.webp" alt="" width={1853} height={849} loading="lazy" decoding="async" />
      <span className="ws-il"><svg className="ico" aria-hidden="true"><use href="#i-camera" /></svg>Imagem ilustrativa</span>
      <span className="dz-tk">E se…</span>
      <h3>E se informações, pessoas, recursos e oportunidades estivessem conectados em <em>um único ambiente?</em></h3>
      <div className="seg ws-seg" role="group" aria-label="Comparar cenários">
        <button type="button" id="segA" aria-pressed={!connected} onClick={() => choose(false)}>Hoje</button>
        <button type="button" id="segB" aria-pressed={connected} onClick={() => choose(true)}>Com o DM Conecta</button>
      </div>
      <div ref={row} className={connected ? "ws-row on" : "ws-row"} id="connSvg" role="img" aria-labelledby="connCap">
        <span className="ws-p"><svg className="ico" aria-hidden="true"><use href="#i-target" /></svg>Projetos</span>
        <span className="ws-lk" aria-hidden="true"><i className="ws-x">×</i><i className="ws-dm"><svg><use href="#logo-mark" /></svg></i></span>
        <span className="ws-p"><svg className="ico" aria-hidden="true"><use href="#i-box" /></svg>Recursos</span>
        <span className="ws-lk" aria-hidden="true"><i className="ws-x">×</i><i className="ws-dm"><svg><use href="#logo-mark" /></svg></i></span>
        <span className="ws-p"><svg className="ico" aria-hidden="true"><use href="#i-people" /></svg>Pessoas e organizações</span>
      </div>
      <p key={connected ? "com" : "hoje"} className="ws-cap sw" id="connCap" aria-live="polite">
        {connected ? (
          <>Projetos <b>estruturados</b>, <b>conectados</b> a quem pode apoiar e <b>acompanhados</b> até o impacto.</>
        ) : (
          "Existem, mas seguem caminhos separados."
        )}
      </p>
      <a className="btn btn-light ws-go" href="#para-quem">Veja quem participa <svg className="ico" aria-hidden="true"><use href="#i-arrow" /></svg></a>
    </div>
  );
}
