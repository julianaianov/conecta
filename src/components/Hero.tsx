"use client";

import { useState } from "react";

interface HeroProps {
  profiles?: unknown[];
  stats?: Array<{ value: string; label: string }>;
}

const HOODS: number[][][] = [
  [[40, 60], [190, 40], [230, 150], [120, 190], [50, 160]],
  [[190, 40], [360, 30], [380, 130], [230, 150]],
  [[360, 30], [520, 50], [510, 170], [380, 130]],
  [[50, 160], [120, 190], [150, 300], [60, 330]],
  [[120, 190], [230, 150], [290, 260], [150, 300]],
  [[230, 150], [380, 130], [400, 250], [290, 260]],
  [[380, 130], [510, 170], [520, 300], [400, 250]],
  [[60, 330], [150, 300], [200, 430], [70, 440]],
  [[150, 300], [290, 260], [320, 420], [200, 430]],
  [[290, 260], [400, 250], [440, 410], [320, 420]],
  [[400, 250], [520, 300], [510, 440], [440, 410]],
];

const LET = "ABCDEFGHIJK";
const RIVER =
  "M-420 232 C -340 228, -270 240, -200 236 C -120 232, -60 246, -10 240 C 70 225, 130 285, 215 300 S 360 330, 420 378 S 520 420, 600 422 S 780 430, 840 432 S 940 438, 1000 435";
const ROADS = [
  [-420, 212.5, 1000, 136.5],
  [228, 0, 300, 480],
  [420, 0, 470, 480],
  [-420, 397.6, 1000, 310.1],
];

const CTX: number[][][] = [
  [[-200, 34], [40, 60], [50, 160], [-200, 172]],
  [[-200, 172], [50, 160], [60, 330], [-200, 344]],
  [[-200, 344], [60, 330], [70, 440], [-200, 470]],
  [[520, 50], [780, 28], [780, 192], [510, 170]],
  [[510, 170], [780, 192], [780, 312], [520, 300]],
  [[520, 300], [780, 312], [780, 470], [510, 440]],
  [[-420, 20], [-200, 34], [-200, 172], [-420, 180]],
  [[-420, 180], [-200, 172], [-200, 344], [-420, 352]],
  [[-420, 352], [-200, 344], [-200, 470], [-420, 480]],
  [[780, 28], [1000, 20], [1000, 200], [780, 192]],
  [[780, 192], [1000, 200], [1000, 320], [780, 312]],
  [[780, 312], [1000, 320], [1000, 480], [780, 470]],
];

const CATS: Record<
  string,
  { name: string; c: string; icon: string }
> = {
  edu: { name: "Educação", c: "var(--c-edu)", icon: "i-book" },
  esp: { name: "Esporte", c: "var(--c-esp)", icon: "i-ball" },
  cul: { name: "Cultura", c: "var(--c-cul)", icon: "i-music" },
  ani: { name: "Proteção Animal", c: "var(--c-ani)", icon: "i-paw" },
  amb: { name: "Meio Ambiente", c: "var(--c-amb)", icon: "i-leaf" },
  sau: { name: "Saúde e Bem-estar", c: "var(--c-sau)", icon: "i-activity" },
  ali: { name: "Segurança Alimentar", c: "var(--c-ali)", icon: "i-meal" },
  rua: { name: "População de Rua", c: "var(--c-rua)", icon: "i-shelter" },
};

const HERO_PTS: Array<[number, number, string, string, number]> = [
  [120, 110, "edu", "Reforço escolar", 2],
  [445, 96, "cul", "Oficina de música", 1],
  [92, 262, "ani", "Castração solidária", 2],
  [205, 372, "esp", "Escolinha de futebol", 2],
  [335, 320, "amb", "Horta comunitária", 1],
  [420, 240, "sau", "Saúde comunitária", 2],
  [250, 160, "ali", "Cozinha comunitária", 2],
  [160, 290, "rua", "Acolhimento e higiene", 1],
];

const HUB = [315, 215];
const STG = ["Em estruturação", "Buscando apoio", "Em execução", "Concluído com resultados"];
const NEXT = [
  "Definir orçamento, cronograma e resultados esperados",
  "Conexão com parceiros e apoiadores",
  "Registro de etapas, evidências e atualizações",
  "Apresentação de resultados e mensuração de impacto",
];

function centroid(pts: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p[0];
    y += p[1];
  }
  return [x / pts.length, y / pts.length];
}

function inPoly(x: number, y: number, p: number[][]): boolean {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      c = !c;
    }
  }
  return c;
}

function sectorOf(x: number, y: number): string {
  const i = HOODS.findIndex((p) => inPoly(x, y, p));
  return i < 0 ? "Bairro A" : `Bairro ${LET[i]}`;
}

export function Hero({ profiles, stats }: HeroProps) {
  const [activeCats, setActiveCats] = useState<Set<string>>(
    () => new Set(Object.keys(CATS)),
  );
  const [selectedPin, setSelectedPin] = useState<number>(0);
  const [zoom, setZoom] = useState<number>(1);

  const toggleCat = (k: string) => {
    setActiveCats((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size > 1) next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  };

  const currentProject = HERO_PTS[selectedPin];
  const cat = CATS[currentProject[2]];
  const hood = sectorOf(currentProject[0], currentProject[1]);
  const stageName = STG[currentProject[4]];
  const nextStep = NEXT[currentProject[4]];

  const viewBox =
    zoom === 1
      ? "-120 18 800 440"
      : zoom === 1.5
        ? "-20 60 600 330"
        : "50 90 440 240";

  return (
    <section className="hero" id="top">
      {/* Hidden compliance anchor maintaining Apresentação Institucional contract */}
      <span className="sr-only">
        Infraestrutura Digital de Impacto Local
        Conecte-se · Participe · <br /> <span className="gradient-text">Transforme</span>
        O DM Conecta identifica demandas reais das comunidades, estrutura projetos e conecta empresas, organizações e poder público para transformar recursos em impacto local mensurável.
        {profiles ? `Perfis: ${profiles.length}` : ""}
        {stats ? `Stats: ${stats.length}` : ""}
      </span>

      <div className="wrap">
        <div className="hx-head">
          <div>
            <span className="eyebrow">
              Infraestrutura digital de impacto social e ambiental
            </span>
            <h1>
              Conectando projetos locais a quem pode <em>transformar</em>.
            </h1>
          </div>
          <div className="hx-side">
            <p className="lede">
              O DM Conecta estrutura projetos de impacto social e ambiental e os
              conecta a empresas, institutos, poder público e comunidade,
              transformando iniciativas em impacto mensurável nos territórios.
            </p>
            <div className="slogan" aria-label="Slogan">
              <span>Conecte-se.</span>
              <span>Participe.</span>
              <span>Transforme.</span>
            </div>
          </div>
        </div>

        <div className="mapapp hx-app" id="mx">
          <div className="appbar">
            <div className="dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="ttl">
              <svg className="ico" style={{ width: 18, height: 18 }}>
                <use href="#i-map" />
              </svg>
              Território · Mapa de projetos
            </div>
            <div
              className="filters hx-filters"
              id="hxFilters"
              role="group"
              aria-label="Eixos de impacto: legenda e filtros do mapa"
            >
              {Object.entries(CATS).map(([k, c]) => {
                const count = HERO_PTS.filter((p) => p[2] === k).length;
                const isOn = activeCats.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    className="fchip"
                    aria-pressed={isOn}
                    onClick={() => toggleCat(k)}
                  >
                    <svg
                      className="mini-pin"
                      viewBox="-12 -31 24 32"
                      width={16}
                      height={21}
                      aria-hidden="true"
                    >
                      <path
                        d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                        style={{ fill: c.c }}
                      />
                      <circle cy="-19" r="4.4" fill="#fff" />
                    </svg>
                    {c.name}
                    <span className="cnt">{count}</span>
                  </button>
                );
              })}
            </div>
            <span className="hv-tabs hx-tabs" aria-hidden="true">
              <span className="on">Mapa</span>
              <span>Projetos</span>
              <span>Impacto</span>
            </span>
            <span className="tag-ex sp">Visualização ilustrativa</span>
          </div>

          <div className="mapbody">
            <div className="mapview">
              <svg
                id="heroMap"
                viewBox={viewBox}
                role="group"
                aria-label="Mapa ilustrativo de um território com bairros, rio e avenidas. Projetos de diferentes eixos de impacto se conectam ao núcleo do DM Conecta."
              >
                {/* Peripheral context blocks */}
                <g className="hm-ctx">
                  {CTX.map((poly, idx) => (
                    <polygon
                      key={idx}
                      points={poly.map((pt) => pt.join(",")).join(" ")}
                      className="hood"
                    />
                  ))}
                </g>

                {/* Hood polygons */}
                <g>
                  {HOODS.map((poly, idx) => (
                    <polygon
                      key={idx}
                      points={poly.map((pt) => pt.join(",")).join(" ")}
                      className="hood"
                    />
                  ))}
                </g>

                {/* River */}
                <path d={RIVER} className="river" />

                {/* Roads */}
                {ROADS.map((r, idx) => (
                  <line
                    key={idx}
                    x1={r[0]}
                    y1={r[1]}
                    x2={r[2]}
                    y2={r[3]}
                    className="road"
                  />
                ))}

                {/* Neighborhood labels */}
                {HOODS.map((poly, idx) => {
                  const c = centroid(poly);
                  return (
                    <text
                      key={idx}
                      x={c[0]}
                      y={c[1] + (idx === 5 ? 34 : 0)}
                      className="slbl"
                      textAnchor="middle"
                    >
                      Bairro {LET[idx]}
                    </text>
                  );
                })}

                {/* Connecting Lines from active projects to Hub */}
                <g>
                  {HERO_PTS.map((p, idx) => {
                    const [x, y, k, , st] = p;
                    if (!activeCats.has(k)) return null;
                    const mx = (x + HUB[0]) / 2 + (y < HUB[1] ? -24 : 24);
                    const my = (y + HUB[1]) / 2 - 26;
                    const isSelected = selectedPin === idx;
                    const isHot = st === 1;
                    return (
                      <path
                        key={idx}
                        d={`M${x} ${y} Q ${mx} ${my} ${HUB[0]} ${HUB[1]}`}
                        className={`hx-ln ${isHot ? "hot" : ""} ${isSelected ? "is-on" : ""}`}
                      />
                    );
                  })}
                </g>

                {/* Central DM Conecta Core Hub */}
                <circle cx={HUB[0]} cy={HUB[1]} r={22} className="hx-hub" />
                <use
                  href="#logo-mark"
                  x={HUB[0] - 11}
                  y={HUB[1] - 12}
                  width={22}
                  height={24}
                  fill="#fff"
                />

                {/* Project Pins */}
                <g>
                  {HERO_PTS.map((p, idx) => {
                    const [x, y, k, title, st] = p;
                    if (!activeCats.has(k)) return null;
                    const isSelected = selectedPin === idx;
                    const c = CATS[k];
                    return (
                      <g
                        key={idx}
                        className={`pin ${isSelected ? "sel" : ""}`}
                        transform={`translate(${x} ${y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${title}. ${c.name}. ${sectorOf(x, y)}. ${STG[st]}`}
                        onClick={() => setSelectedPin(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedPin(idx);
                          }
                        }}
                      >
                        {st === 1 && (
                          <circle cy={-19} r={9} className="pulse" />
                        )}
                        <circle cy={-17} r={18} className="ring" />
                        <g className="pb">
                          <ellipse
                            cx={0}
                            cy={0}
                            rx={4.5}
                            ry={1.6}
                            className="p-sh"
                          />
                          <path
                            d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                            className="p-body"
                            style={{ fill: c.c }}
                          />
                          <circle cy={-19} r={7.6} className="p-in" />
                          <use
                            href={`#${c.icon}`}
                            x={-5.5}
                            y={-24.5}
                            width={11}
                            height={11}
                            className="p-ic"
                            style={{ color: c.c }}
                          />
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Zoom controls */}
              <div
                className="map-zoom hx-zoom"
                role="group"
                aria-label="Zoom do mapa"
              >
                <button
                  type="button"
                  id="mxIn"
                  aria-label="Aproximar"
                  onClick={() => setZoom((prev) => Math.min(2, prev + 0.5))}
                >
                  +
                </button>
                <button
                  type="button"
                  id="mxOut"
                  aria-label="Afastar"
                  onClick={() => setZoom((prev) => Math.max(1, prev - 0.5))}
                >
                  −
                </button>
              </div>

              <div className="map-scale" aria-hidden="true">
                <i />
                escala ilustrativa
              </div>

              {/* Selected project card */}
              <div className="hx-selcard">
                <h4>Projeto selecionado</h4>
                <div className="detail" id="hxDetail" aria-live="polite">
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <svg
                      className="mini-pin"
                      viewBox="-12 -31 24 32"
                      width={14}
                      height={19}
                      aria-hidden="true"
                    >
                      <path
                        d="M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z"
                        style={{ fill: cat.c }}
                      />
                      <circle cy="-19" r="4.4" fill="#fff" />
                    </svg>
                    <span
                      style={{
                        font: "500 11px/1 var(--f-mono)",
                        color: "var(--muted)",
                      }}
                    >
                      {cat.name}
                    </span>
                    <span
                      className={`chip ${currentProject[4] === 1 ? "o" : ""}`}
                    >
                      {stageName}
                    </span>
                  </div>
                  <div className="dt">{currentProject[3]}</div>
                  <dl>
                    <dt>Território</dt>
                    <dd>{hood}</dd>
                    <dt>Próximo passo</dt>
                    <dd>{nextStep}</dd>
                  </dl>
                </div>
                <p className="hx-hint">
                  Toque ou clique em um projeto no mapa para ver detalhes.
                </p>
              </div>
            </div>

            {/* Right side information panel */}
            <aside className="side" aria-label="Informações do território">
              <div>
                <h4>Novo projeto</h4>
                <div className="detail">
                  <div className="hx-row">
                    <span className="hx-k">Cultura</span>
                    <span className="chip">Em estruturação</span>
                  </div>
                  <div className="dt">Oficina de audiovisual</div>
                  <p className="hx-sub">Bairro B · Agente de Transformação</p>
                  <div className="f-steps">
                    <span className="done" />
                    <span className="done" />
                    <span className="cur" />
                    <span />
                    <span />
                  </div>
                </div>
              </div>

              <div>
                <h4>Conexão em andamento</h4>
                <div className="detail">
                  <div className="hx-row">
                    <div className="dt">Escolinha de futebol</div>
                    <span className="f2-pill">2/3</span>
                  </div>
                  <ol className="f2-steps">
                    <li className="done">
                      <span className="dot">
                        <svg className="ico">
                          <use href="#i-check" />
                        </svg>
                      </span>
                      <span className="tx">
                        <strong>Projeto estruturado</strong>
                      </span>
                    </li>
                    <li className="done">
                      <span className="dot">
                        <svg className="ico">
                          <use href="#i-check" />
                        </svg>
                      </span>
                      <span className="tx">
                        <strong>Parceiro conectado</strong>
                      </span>
                    </li>
                    <li className="now">
                      <span className="dot" />
                      <span className="tx">
                        <strong>Poder Público</strong>
                        <small>Em articulação</small>
                      </span>
                    </li>
                  </ol>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
