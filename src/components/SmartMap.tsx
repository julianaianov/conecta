"use client";

import { useState } from "react";
import type { Post } from "@/lib/app/types";

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

const STG = [
  "Em estruturação",
  "Buscando apoio",
  "Em execução",
  "Concluído com resultados",
];

const NEXT = [
  "Definir orçamento, cronograma e resultados esperados",
  "Conexão com parceiros e apoiadores",
  "Registro de etapas, evidências e atualizações",
  "Apresentação de resultados e mensuração de impacto",
];

const PTS: Array<[string, number, number, string, number]> = [
  ["edu", 95, 112, "Reforço escolar", 2],
  ["edu", 335, 300, "Inclusão digital", 1],
  ["edu", 470, 222, "Formação profissional", 0],
  ["edu", 178, 392, "Oficinas de leitura", 2],
  ["esp", 150, 78, "Escolinha de futebol", 2],
  ["esp", 292, 92, "Inclusão pelo esporte", 1],
  ["esp", 432, 92, "Equipamentos esportivos", 1],
  ["esp", 255, 215, "Judô comunitário", 3],
  ["cul", 372, 392, "Oficina de música", 2],
  ["cul", 92, 250, "Oficina de dança", 3],
  ["cul", 212, 262, "Teatro comunitário", 1],
  ["cul", 448, 302, "Oficina de audiovisual", 2],
  ["ani", 118, 352, "Castração solidária", 2],
  ["ani", 335, 182, "Feira de adoção", 3],
  ["ani", 82, 196, "Resgate e bem-estar animal", 1],
  ["amb", 262, 330, "Educação ambiental", 2],
  ["amb", 480, 390, "Reciclagem comunitária", 1],
  ["amb", 338, 62, "Preservação de nascente", 0],
  ["amb", 200, 140, "Horta comunitária", 3],
  ["sau", 415, 196, "Campanha de prevenção", 1],
  ["sau", 262, 408, "Saúde comunitária", 2],
  ["sau", 482, 132, "Bem-estar e qualidade de vida", 0],
  ["ali", 140, 300, "Cozinha comunitária", 2],
  ["ali", 395, 345, "Horta comunitária", 1],
  ["ali", 300, 245, "Distribuição de alimentos", 3],
  ["rua", 235, 60, "Acolhimento e higiene", 1],
  ["rua", 440, 420, "Documentação e cidadania", 0],
  ["rua", 60, 410, "Capacitação e geração de renda", 2],
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

export function SmartMap({ posts = [] }: { posts?: Post[] }) {
  const [activeCats, setActiveCats] = useState<Set<string>>(
    () => new Set(Object.keys(CATS)),
  );
  const [activeStages, setActiveStages] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3]),
  );
  const [selectedIdx, setSelectedIdx] = useState<number>(4);

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

  const toggleStage = (st: number) => {
    setActiveStages((prev) => {
      const next = new Set(prev);
      if (next.has(st)) {
        if (next.size > 1) next.delete(st);
      } else {
        next.add(st);
      }
      return next;
    });
  };

  // Filter visible points
  const visiblePoints = PTS.filter(
    (p) => activeCats.has(p[0]) && activeStages.has(p[4]),
  );
  const urgentCount = visiblePoints.filter((p) => p[4] === 1).length;

  // Selected project info
  const cur = PTS[selectedIdx] || PTS[0];
  const curCat = CATS[cur[0]];
  const curHood = sectorOf(cur[1], cur[2]);
  const curStage = STG[cur[4]];
  const curNext = NEXT[cur[4]];

  // Counts per category
  const catCounts: Record<string, number> = {};
  for (const p of PTS) {
    catCounts[p[0]] = (catCounts[p[0]] || 0) + 1;
  }
  const maxCount = Math.max(...Object.values(catCounts), 1);

  return (
    <section className="sec mapsec" id="territorio">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Território</span>
          <h2 className="h2">Impacto mapeado no território.</h2>
          <p className="lede">
            Projetos, demandas e resultados geolocalizados por bairro e eixo de
            impacto.
          </p>
        </div>

        <div className="mapapp" id="territorioApp">
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
              Território · Mapa de projetos e demandas
            </div>
            <span className="tag-ex sp">Visualização territorial</span>
          </div>

          {/* Filters by impact axis */}
          <div
            className="filters"
            id="filters"
            role="group"
            aria-label="Filtro por eixo de impacto"
          >
            {Object.entries(CATS).map(([k, c]) => {
              const isOn = activeCats.has(k);
              const count = catCounts[k] || 0;
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

          {/* Filters by stage */}
          <div
            className="filters st-filters"
            id="stFilters"
            role="group"
            aria-label="Filtro por estágio do projeto"
          >
            <span className="st-lbl">Estágio:</span>
            {STG.map((stName, stIdx) => {
              const count = PTS.filter((p) => p[4] === stIdx).length;
              const isOn = activeStages.has(stIdx);
              return (
                <button
                  key={stIdx}
                  type="button"
                  className="fchip st-chip"
                  data-st={stIdx}
                  aria-pressed={isOn}
                  onClick={() => toggleStage(stIdx)}
                >
                  <i className="st-dot" aria-hidden="true" />
                  {stName}
                  <span className="cnt">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mapbody">
            <div className="mapview">
              <svg
                id="terrMap"
                viewBox="-120 18 800 440"
                role="group"
                aria-label="Mapa territorial de projetos com eixos de impacto"
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

                {/* Pins */}
                <g>
                  {PTS.map((p, idx) => {
                    const [k, x, y, title, st] = p;
                    const isVisible =
                      activeCats.has(k) && activeStages.has(st);
                    if (!isVisible) return null;
                    const isSelected = selectedIdx === idx;
                    const c = CATS[k];
                    return (
                      <g
                        key={idx}
                        className={`pin ${isSelected ? "sel" : ""}`}
                        transform={`translate(${x} ${y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${title}. ${c.name}. ${sectorOf(x, y)}. ${STG[st]}`}
                        onClick={() => setSelectedIdx(idx)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedIdx(idx);
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

              <div className="map-scale" aria-hidden="true">
                <i />
                escala ilustrativa
              </div>
            </div>

            {/* Side dashboard */}
            <aside className="side" aria-label="Painel territorial">
              <div>
                <h4>Indicadores do território</h4>
                <div className="kpis">
                  <div className="kpi">
                    <b id="kVis">{visiblePoints.length}</b>
                    <span>Projetos visíveis</span>
                  </div>
                  <div className="kpi">
                    <b id="kUrg">{urgentCount}</b>
                    <span>Buscando apoio</span>
                  </div>
                </div>
              </div>

              <div>
                <h4>Distribuição por eixo</h4>
                <div className="catbars" id="catbars">
                  {Object.entries(CATS).map(([k, c]) => {
                    const count = catCounts[k] || 0;
                    const isOn = activeCats.has(k);
                    const pct = (count / maxCount) * 100;
                    return (
                      <div
                        key={k}
                        className="catbar"
                        style={{ opacity: isOn ? 1 : 0.35 }}
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
                            style={{ fill: c.c }}
                          />
                          <circle cy="-19" r="4.4" fill="#fff" />
                        </svg>
                        <span className="nm">{c.name}</span>
                        <div className="bar">
                          <i style={{ background: c.c, width: `${pct}%` }} />
                        </div>
                        <span className="v">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Detail on selected project */}
              <div>
                <h4>Detalhes do projeto</h4>
                <div className="detail" id="detail">
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
                        style={{ fill: curCat.c }}
                      />
                      <circle cy="-19" r="4.4" fill="#fff" />
                    </svg>
                    <span
                      style={{
                        font: "500 11px/1 var(--f-mono)",
                        color: "var(--muted)",
                      }}
                    >
                      {curCat.name}
                    </span>
                    <span className={`chip ${cur[4] === 1 ? "o" : ""}`}>
                      {curStage}
                    </span>
                  </div>
                  <div className="dt">{cur[3]}</div>
                  <dl>
                    <dt>Território</dt>
                    <dd>{curHood}</dd>
                    <dt>Estágio</dt>
                    <dd>{curStage}</dd>
                    <dt>Próximo passo</dt>
                    <dd>{curNext}</dd>
                  </dl>
                </div>
              </div>

              {posts && posts.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <h4>Sinais registrados ({posts.length})</h4>
                  <p style={{ fontSize: 13, color: "var(--muted)" }}>
                    {posts.length} sinal(is) público(s) na base do sistema.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </section>
  );
}
