"use client";

import { useState } from "react";

export function Challenge() {
  const [connected, setConnected] = useState(false);

  return (
    <section className="sec" id="sobre">
      <div className="wrap challenge">
        <div>
          <span className="eyebrow">O desafio</span>
          <h2 className="h2 ch-t" style={{ marginTop: 16 }}>
            Existem projetos. Existem recursos.{" "}
            <span className="hl">Falta conexão.</span>
          </h2>
          <p className="lede" style={{ marginTop: 18 }}>
            Há iniciativas de impacto em todos os territórios, mas muitas não
            têm estrutura, recursos ou conexões para crescer. E quem quer apoiar
            não conta com uma infraestrutura única para encontrar, acompanhar e
            medir esses projetos.
          </p>
          <dl className="trio">
            <div>
              <span className="tb">
                <svg className="ico">
                  <use href="#i-target" />
                </svg>
              </span>
              <dt>Projetos</dt>
              <dd>
                Iniciativas sociais e ambientais com grande potencial, mas sem a
                estrutura necessária para crescer.
              </dd>
            </div>
            <div>
              <span className="tb">
                <svg className="ico">
                  <use href="#i-box" />
                </svg>
              </span>
              <dt>Recursos</dt>
              <dd>
                Empresas, institutos, patrocinadores e poder público querem
                apoiar, mas não encontram os projetos.
              </dd>
            </div>
            <div>
              <span className="tb">
                <svg className="ico">
                  <use href="#i-people" />
                </svg>
              </span>
              <dt>Pessoas e organizações</dt>
              <dd>
                Atuam de forma dispersa, sem acompanhamento nem resultados
                comprovados.
              </dd>
            </div>
          </dl>
        </div>

        <figure className="conn-card" style={{ margin: 0 }}>
          <div className="conn-top">
            <div className="seg" role="group" aria-label="Comparar cenários">
              <button
                type="button"
                id="segA"
                aria-pressed={!connected}
                onClick={() => setConnected(false)}
              >
                Hoje
              </button>
              <button
                type="button"
                id="segB"
                aria-pressed={connected}
                onClick={() => setConnected(true)}
              >
                Com o DM Conecta
              </button>
            </div>
            <span className="tag-ex">Diagrama conceitual</span>
          </div>

          <div
            id="connSvg"
            className={`dx ${connected ? "on" : ""}`}
            role="group"
            aria-labelledby="connCap"
          >
            {/* SVG Connecting lines overlay */}
            <svg
              className="dx-lines"
              id="dxLines"
              viewBox="0 0 500 360"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {connected ? (
                <>
                  {/* From Demanda to Core */}
                  <path
                    d="M 120 90 C 120 120, 180 120, 180 150"
                    className="dx-ln in"
                  />
                  {/* From Recursos to Core */}
                  <path
                    d="M 380 90 C 380 120, 320 120, 320 150"
                    className="dx-ln in"
                  />
                  {/* From Core to Atores */}
                  <path
                    d="M 250 215 C 250 240, 250 250, 250 270"
                    className="dx-ln out"
                  />
                </>
              ) : (
                <>
                  {/* Broken / Disconnected lines */}
                  <path
                    d="M 120 90 L 120 135"
                    className="dx-ln in"
                    strokeDasharray="4 4"
                  />
                  <g className="dx-x">
                    <circle cx="120" cy="140" r="7" />
                    <path d="M 117 137 L 123 143 M 123 137 L 117 143" />
                  </g>
                  <path
                    d="M 380 90 L 380 135"
                    className="dx-ln in"
                    strokeDasharray="4 4"
                  />
                  <g className="dx-x">
                    <circle cx="380" cy="140" r="7" />
                    <path d="M 377 137 L 383 143 M 383 137 L 377 143" />
                  </g>
                  <path
                    d="M 250 260 L 250 275"
                    className="dx-ln out"
                    strokeDasharray="4 4"
                  />
                  <g className="dx-x">
                    <circle cx="250" cy="255" r="7" />
                    <path d="M 247 252 L 253 258 M 253 252 L 247 258" />
                  </g>
                </>
              )}
            </svg>

            {/* Projetos */}
            <section
              className="dx-card dx-dem"
              id="dxDem"
              aria-label="Projetos"
            >
              <header>
                <span className="dx-ic">
                  <svg className="ico">
                    <use href="#i-target" />
                  </svg>
                </span>
                <h4>Projetos</h4>
                <span className="dx-tag">Entrada</span>
              </header>
              <ul className="dx-list">
                <li>
                  <svg
                    className="mini-pin"
                    viewBox="-12 -31 24 32"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                      style={{ fill: "var(--c-esp)" }}
                    />
                    <circle cy="-19" r="4.4" fill="#fff" />
                  </svg>
                  Escolinha de futebol
                </li>
                <li>
                  <svg
                    className="mini-pin"
                    viewBox="-12 -31 24 32"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                      style={{ fill: "var(--c-edu)" }}
                    />
                    <circle cy="-19" r="4.4" fill="#fff" />
                  </svg>
                  Reforço escolar
                </li>
                <li>
                  <svg
                    className="mini-pin"
                    viewBox="-12 -31 24 32"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                      style={{ fill: "var(--c-ani)" }}
                    />
                    <circle cy="-19" r="4.4" fill="#fff" />
                  </svg>
                  Castração solidária
                </li>
              </ul>
            </section>

            {/* Recursos */}
            <section
              className="dx-card dx-rec"
              id="dxRec"
              aria-label="Recursos"
            >
              <header>
                <span className="dx-ic">
                  <svg className="ico">
                    <use href="#i-box" />
                  </svg>
                </span>
                <h4>Recursos</h4>
                <span className="dx-tag">Entrada</span>
              </header>
              <ul className="dx-list">
                <li>
                  <svg
                    className="mini-pin"
                    viewBox="-12 -31 24 32"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                      style={{ fill: "var(--c-pat)" }}
                    />
                    <circle cy="-19" r="4.4" fill="#fff" />
                  </svg>
                  Patrocínio
                </li>
                <li>
                  <svg
                    className="mini-pin"
                    viewBox="-12 -31 24 32"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                      style={{ fill: "var(--c-soc)" }}
                    />
                    <circle cy="-19" r="4.4" fill="#fff" />
                  </svg>
                  Voluntariado
                </li>
                <li>
                  <svg
                    className="mini-pin"
                    viewBox="-12 -31 24 32"
                    aria-hidden="true"
                  >
                    <path
                      d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                      style={{ fill: "var(--c-urb)" }}
                    />
                    <circle cy="-19" r="4.4" fill="#fff" />
                  </svg>
                  Programas públicos
                </li>
              </ul>
            </section>

            {/* Core: DM Conecta */}
            <section
              className="dx-core"
              id="dxCore"
              aria-label="DM Conecta"
            >
              <header>
                <svg className="dx-logo" aria-hidden="true">
                  <use href="#logo-mark" />
                </svg>
                <div>
                  <strong>DM Conecta</strong>
                  <span>Infraestrutura digital</span>
                </div>
              </header>
              <div className="dx-mods">
                <div className="dx-mod" id="dxModO">
                  <svg className="ico">
                    <use href="#i-layers" />
                  </svg>
                  Estrutura
                </div>
                <div className="dx-mod" id="dxModC">
                  <svg className="ico">
                    <use href="#i-link" />
                  </svg>
                  Conecta
                </div>
                <div className="dx-mod" id="dxModD">
                  <svg className="ico">
                    <use href="#i-activity" />
                  </svg>
                  Acompanha
                </div>
              </div>
              <p className="dx-empty">Sem ponto de encontro</p>
            </section>

            {/* Atores: Pessoas e organizações */}
            <section
              className="dx-card dx-act"
              id="dxAct"
              aria-label="Pessoas e organizações"
            >
              <header>
                <span className="dx-ic">
                  <svg className="ico">
                    <use href="#i-people" />
                  </svg>
                </span>
                <h4>Pessoas e organizações</h4>
                <span className="dx-tag">Rede</span>
              </header>
              <ul className="dx-chips">
                <li>
                  <svg className="ico">
                    <use href="#i-people" />
                  </svg>
                  Agentes
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-heart" />
                  </svg>
                  Comunidade
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-gov" />
                  </svg>
                  Poder Público
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-brief" />
                  </svg>
                  Parceiros
                </li>
                <li>
                  <svg className="ico">
                    <use href="#i-mega" />
                  </svg>
                  Comunicação
                </li>
              </ul>
            </section>
          </div>

          <div className="dx-legend" aria-hidden="true">
            <span>
              <i className="lg-in" />
              Entrada no sistema
            </span>
            <span>
              <i className="lg-out" />
              Conexão com atores
            </span>
            <span className="lg-off">
              <i className="lg-x">×</i>
              Sem conexão
            </span>
          </div>

          <figcaption className="conn-cap">
            <span className="cc-dot" aria-hidden="true" />
            <span id="connCap">
              {connected
                ? "Com o DM Conecta: projetos são estruturados, conectados a quem pode apoiar e acompanhados até o impacto."
                : "Hoje: projetos, recursos, pessoas e organizações existem, mas seguem caminhos separados."}
            </span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
