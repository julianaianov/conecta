"use client";

import React, { useState, useMemo, useCallback } from "react";

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
const ROADS: [number, number, number, number][] = [
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

const CATS: Record<string, { name: string; c: string; shape: string }> = {
  edu: { name: "Educação", c: "var(--c-edu)", shape: "ci" },
  esp: { name: "Esporte", c: "var(--c-esp)", shape: "sq" },
  cul: { name: "Cultura", c: "var(--c-cul)", shape: "di" },
  ani: { name: "Proteção Animal", c: "var(--c-ani)", shape: "he" },
  amb: { name: "Meio Ambiente", c: "var(--c-amb)", shape: "tr" },
  sau: { name: "Saúde e Bem-estar", c: "var(--c-sau)", shape: "cr" },
  ali: { name: "Segurança Alimentar", c: "var(--c-ali)", shape: "st" },
  rua: { name: "População em Situação de Rua", c: "var(--c-rua)", shape: "ci" },
};

const CAT_IC: Record<string, string> = {
  edu: "i-book",
  esp: "i-ball",
  cul: "i-music",
  ani: "i-paw",
  amb: "i-leaf",
  sau: "i-activity",
  ali: "i-meal",
  rua: "i-shelter",
};

const PIN_D =
  "M0 0 C -2.6 -5.2 -10.5 -10.6 -10.5 -19 A10.5 10.5 0 1 1 10.5 -19 C 10.5 -10.6 2.6 -5.2 0 0Z";

const STG = [
  "Em estruturação",
  "Buscando apoio",
  "Em execução",
  "Concluído com resultados",
];

const ST_SHORT = ["Estruturação", "Apoio", "Execução", "Resultados"];

const NEXT = [
  "Definir orçamento, cronograma e resultados esperados",
  "Conexão com parceiros e apoiadores",
  "Registro de etapas, evidências e atualizações",
  "Resultados e impacto publicados",
];

const PTS: [string, number, number, string, number][] = [
  ["edu", 95, 112, "Reforço escolar", 2],
  ["edu", 335, 300, "Inclusão digital", 1],
  ["edu", 470, 222, "Formação profissional", 0],
  ["edu", 178, 392, "Oficinas de capacitação", 3],
  ["esp", 150, 78, "Escolinha de futebol", 2],
  ["esp", 292, 92, "Inclusão pelo esporte", 1],
  ["esp", 432, 92, "Equipamentos esportivos", 1],
  ["esp", 255, 215, "Atividades para jovens", 0],
  ["cul", 372, 392, "Oficina de música", 2],
  ["cul", 92, 250, "Oficina de dança", 3],
  ["cul", 212, 262, "Teatro comunitário", 1],
  ["cul", 448, 302, "Oficina de audiovisual", 0],
  ["ani", 118, 352, "Castração solidária", 2],
  ["ani", 335, 182, "Feira de adoção", 3],
  ["ani", 82, 196, "Resgate e bem-estar animal", 1],
  ["amb", 262, 330, "Educação ambiental", 2],
  ["amb", 480, 390, "Reciclagem comunitária", 1],
  ["amb", 338, 62, "Preservação de nascente", 0],
  ["amb", 200, 140, "Recuperação ambiental", 3],
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

const ORC = [
  18, 24, 36, 12, 45, 30, 60, 22, 15, 28, 40, 52, 20, 34, 26, 48, 16, 38, 55, 25,
  32, 44, 21, 58, 27, 35, 19, 42,
];
const BEN = [
  60, 45, 80, 30, 120, 90, 150, 40, 35, 70, 110, 95, 50, 85, 65, 130, 40, 75,
  140, 55, 90, 100, 45, 160, 70, 80, 35, 105,
];

function inPoly(x: number, y: number, p: number[][]): boolean {
  let c = false;
  let j = p.length - 1;
  for (let i = 0; i < p.length; i++) {
    const [xi, yi] = p[i];
    const [xj, yj] = p[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      c = !c;
    }
    j = i;
  }
  return c;
}

function sectorOf(x: number, y: number): string {
  const i = HOODS.findIndex((p) => inPoly(x, y, p));
  return i < 0 ? "—" : "Bairro " + LET[i];
}

function cen(p: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  p.forEach((q) => {
    x += q[0];
    y += q[1];
  });
  return [x / p.length, y / p.length];
}

export interface ProjectItem {
  i: number;
  k: string;
  x: number;
  y: number;
  t: string;
  st: number;
  sec: string;
  orc: number;
  mob: number;
  ben: number;
  prev: number;
  per: number;
}

const PX_DATA: ProjectItem[] = PTS.map((p, i) => {
  const [k, x, y, t, st] = p;
  const orc = ORC[i % ORC.length];
  return {
    i,
    k,
    x,
    y,
    t,
    st,
    sec: sectorOf(x, y),
    orc,
    mob:
      st === 0
        ? 0
        : st === 1
        ? Math.round(orc * [0.25, 0.4, 0.35][i % 3])
        : orc,
    ben:
      st === 3
        ? BEN[i % BEN.length]
        : st === 2
        ? Math.round(BEN[i % BEN.length] * 0.6)
        : 0,
    prev: BEN[i % BEN.length],
    per: i % 2 ? 2 : 1,
  };
});

function fmtR(v: number): string {
  if (!v) return "R$ 0";
  if (v >= 1000) return "R$ " + (v / 1000).toFixed(1).replace('.', ',') + " mi";
  return "R$ " + v + " mil";
}

function MiniPinGlyph({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <svg
      className="mini-pin"
      viewBox="-12 -31 24 32"
      width={size}
      height={Math.round(size * 1.3)}
      aria-hidden="true"
    >
      <path d={PIN_D} style={{ fill: color }} />
      <circle cy={-19} r={4.4} fill="#fff" />
    </svg>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SmartMap(_props?: { view?: unknown; intelligence?: unknown }) {
  const [fTerr, setFTerr] = useState("");
  const [fEixo, setFEixo] = useState("");
  const [fSt, setFSt] = useState("");
  const [fRec, setFRec] = useState("");
  const [fPer, setFPer] = useState("");
  const [fRes, setFRes] = useState(false);
  const [advOpen, setAdvOpen] = useState(false);

  const [z, setZ] = useState(1);
  const [center, setCenter] = useState<[number, number]>([280, 240]);
  const [selI, setSelI] = useState(4); // default 4 = Escolinha de futebol

  const advCount = (fRec ? 1 : 0) + (fPer ? 1 : 0) + (fRes ? 1 : 0);
  const hasAnyFilter = advCount > 0 || !!fTerr || !!fEixo || fSt !== "";

  const match = useCallback(
    (p: ProjectItem, ignoreEixo = false): boolean => {
      if (fTerr && p.sec !== fTerr) return false;
      if (!ignoreEixo && fEixo && p.k !== fEixo) return false;
      if (fSt !== "" && p.st !== Number(fSt)) return false;
      if (fRec === "a" && p.orc > 20) return false;
      if (fRec === "b" && (p.orc <= 20 || p.orc > 40)) return false;
      if (fRec === "c" && p.orc <= 40) return false;
      if (fPer !== "" && p.per !== Number(fPer)) return false;
      if (fRes && p.st !== 3) return false;
      return true;
    },
    [fTerr, fEixo, fSt, fRec, fPer, fRes]
  );

  const vis = useMemo(() => PX_DATA.filter((p) => match(p)), [match]);

  const baseWithoutEixo = useMemo(() => PX_DATA.filter((p) => match(p, true)), [match]);

  const maxCatCount = useMemo(() => {
    return Math.max(
      1,
      ...Object.keys(CATS).map(
        (k) => baseWithoutEixo.filter((p) => p.k === k).length
      )
    );
  }, [baseWithoutEixo]);

  // ViewBox
  const [W, H] = [560, 480];
  const w = W / z;
  const h = H / z;
  const vx = z === 1 ? 0 : Math.max(0, Math.min(W - w, center[0] - w / 2));
  const vy = z === 1 ? 0 : Math.max(0, Math.min(H - h, center[1] - h / 2));
  const viewBoxStr = `${vx} ${vy} ${w} ${h}`;

  // Clusters
  const th = z <= 1 ? 64 : 30 / z;
  const groups = useMemo(() => {
    const list: { x: number; y: number; items: ProjectItem[] }[] = [];
    vis.forEach((p) => {
      const g = list.find((item) => Math.hypot(item.x - p.x, item.y - p.y) < th);
      if (g) {
        g.items.push(p);
        g.x = (g.x * (g.items.length - 1) + p.x) / g.items.length;
        g.y = (g.y * (g.items.length - 1) + p.y) / g.items.length;
      } else {
        list.push({ x: p.x, y: p.y, items: [p] });
      }
    });
    return list;
  }, [vis, th]);

  // Current selected project
  const currentSelected = useMemo(() => {
    const p = PX_DATA[selI];
    if (p && match(p)) return p;
    if (vis.length) return vis[0];
    return null;
  }, [selI, vis, match]);

  // Flow summary stats
  const totalMob = useMemo(() => vis.reduce((a, p) => a + p.mob, 0), [vis]);
  const totalOrc = useMemo(() => vis.reduce((a, p) => a + p.orc, 0), [vis]);
  const execCount = useMemo(() => vis.filter((p) => p.st === 2).length, [vis]);
  const resCount = useMemo(() => vis.filter((p) => p.st === 3).length, [vis]);
  const benCount = useMemo(() => vis.reduce((a, p) => a + p.ben, 0), [vis]);

  const clearAllFilters = () => {
    setFTerr("");
    setFEixo("");
    setFSt("");
    setFRec("");
    setFPer("");
    setFRes(false);
    setZ(1);
    setCenter([280, 240]);
  };

  const handleTerrChange = (newTerr: string) => {
    setFTerr(newTerr);
    if (newTerr) {
      const idx = LET.indexOf(newTerr.slice(-1));
      if (idx >= 0) {
        const c = cen(HOODS[idx]);
        setZ(1.8);
        setCenter(c);
      }
    } else {
      setZ(1);
    }
  };

  return (
    <section className="sec mapsec" id="territorio">
      <div className="wrap">
        <div className="sec-head">
          <span className="eyebrow">Mapa de projetos e impacto</span>
          <h2 className="h2">Onde estão os projetos, os recursos e os resultados.</h2>
          <p className="lede">
            Dados territoriais viram inteligência: filtre por território, área de
            impacto e estágio e veja projetos, recursos e resultados no mesmo
            mapa.
          </p>
        </div>

        <div className="mapapp" id="territorioApp">
          <div className="appbar">
            <div className="dots" aria-hidden="true">
              <i /><i /><i />
            </div>
            <div className="ttl">
              <svg className="ico" style={{ width: 18, height: 18 }}>
                <use href="#i-map" />
              </svg>
              Mapa de projetos e impacto
            </div>
            <span className="tag-ex sp">Dados fictícios de demonstração</span>
          </div>

          <form className="mf" id="mf" aria-label="Filtros do mapa" onSubmit={(e) => e.preventDefault()}>
            <div className="mf-row">
              <label className="mf-f">
                <span>Território</span>
                <select
                  id="fTerr"
                  value={fTerr}
                  onChange={(e) => handleTerrChange(e.target.value)}
                >
                  <option value="">Todos os bairros</option>
                  {LET.split("").map((char) => (
                    <option key={char} value={`Bairro ${char}`}>
                      Bairro {char}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mf-f">
                <span>Área de impacto</span>
                <select
                  id="fEixo"
                  value={fEixo}
                  onChange={(e) => setFEixo(e.target.value)}
                >
                  <option value="">Todos os eixos</option>
                  {Object.entries(CATS).map(([k, C]) => (
                    <option key={k} value={k}>
                      {C.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mf-f">
                <span>Estágio</span>
                <select
                  id="fSt"
                  value={fSt}
                  onChange={(e) => setFSt(e.target.value)}
                >
                  <option value="">Todos os estágios</option>
                  <option value="0">Em estruturação</option>
                  <option value="1">Buscando apoio</option>
                  <option value="2">Em execução</option>
                  <option value="3">Concluído com resultados</option>
                </select>
              </label>

              <button
                type="button"
                className="mf-more"
                id="mfMore"
                aria-expanded={advOpen}
                aria-controls="mfAdv"
                onClick={() => setAdvOpen(!advOpen)}
              >
                <svg className="ico" aria-hidden="true">
                  <use href="#i-layers" />
                </svg>
                Mais filtros
                {advCount > 0 && (
                  <span className="mf-n" id="mfN">
                    {advCount}
                  </span>
                )}
              </button>

              <div className="mf-res">
                <b id="mfCount">{vis.length}</b>{" "}
                <span id="mfCountL">
                  {vis.length === 1 ? "projeto" : "projetos"}
                </span>
                {hasAnyFilter && (
                  <button
                    type="button"
                    className="mf-clear"
                    id="mfClear"
                    onClick={clearAllFilters}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </div>

            <div className="mf-row mf-adv" id="mfAdv" hidden={!advOpen}>
              <label className="mf-f">
                <span>Recursos (orçamento)</span>
                <select
                  id="fRec"
                  value={fRec}
                  onChange={(e) => setFRec(e.target.value)}
                >
                  <option value="">Todas as faixas</option>
                  <option value="a">Até R$ 20 mil</option>
                  <option value="b">De R$ 20 mil a R$ 40 mil</option>
                  <option value="c">Acima de R$ 40 mil</option>
                </select>
              </label>

              <label className="mf-f">
                <span>Período</span>
                <select
                  id="fPer"
                  value={fPer}
                  onChange={(e) => setFPer(e.target.value)}
                >
                  <option value="">Todo o período</option>
                  <option value="1">1º semestre de 2026</option>
                  <option value="2">2º semestre de 2026</option>
                </select>
              </label>

              <label className="mf-chk">
                <input
                  type="checkbox"
                  id="fRes"
                  checked={fRes}
                  onChange={(e) => setFRes(e.target.checked)}
                />
                <span>Somente com resultados registrados</span>
              </label>
            </div>
          </form>

          <ol
            className="mflow"
            id="mflow"
            aria-label="Resumo dos projetos filtrados: projetos, recursos, execução, resultados e impacto"
          >
            <li>
              <span className="mflow-k">Projetos</span>
              <b id="kProj">{vis.length}</b>
              <span className="mflow-s">no recorte selecionado</span>
            </li>
            <li>
              <span className="mflow-k">Recursos</span>
              <b id="kRec">{fmtR(totalMob)}</b>
              <span className="mflow-s" id="kRecS">
                mobilizados de {fmtR(totalOrc)}
              </span>
            </li>
            <li>
              <span className="mflow-k">Execução</span>
              <b id="kExec">{execCount}</b>
              <span className="mflow-s">em execução</span>
            </li>
            <li>
              <span className="mflow-k">Resultados</span>
              <b id="kRes">{resCount}</b>
              <span className="mflow-s">concluídos com resultados</span>
            </li>
            <li className="is-end">
              <span className="mflow-k">Impacto</span>
              <b id="kBen">{benCount}</b>
              <span className="mflow-s">pessoas beneficiadas</span>
            </li>
          </ol>

          <div className="mapbody">
            <div className="mapview">
              <svg
                id="terrMap"
                viewBox={viewBoxStr}
                preserveAspectRatio="xMidYMid slice"
                role="group"
                aria-label="Mapa ilustrativo com projetos por eixo de impacto e estágio"
              >
                {/* Context Polygons */}
                <g className="hm-ctx">
                  {CTX.map((poly, idx) => (
                    <polygon
                      key={idx}
                      points={poly.map((pt) => pt.join(",")).join(" ")}
                      className="hood"
                    />
                  ))}
                </g>

                {/* Neighborhood Polygons */}
                <g>
                  {HOODS.map((poly, idx) => {
                    const isSel = fTerr === `Bairro ${LET[idx]}`;
                    return (
                      <polygon
                        key={idx}
                        points={poly.map((pt) => pt.join(",")).join(" ")}
                        className={`hood ${isSel ? "is-sel" : ""}`}
                        style={{ cursor: "pointer" }}
                        onClick={() => {
                          const hoodName = `Bairro ${LET[idx]}`;
                          setFTerr((cur) => (cur === hoodName ? "" : hoodName));
                          const c = cen(poly);
                          setZ(1.8);
                          setCenter(c);
                        }}
                      />
                    );
                  })}
                </g>

                {/* River */}
                <path d={RIVER} className="river" />

                {/* Roads */}
                {ROADS.map(([x1, y1, x2, y2], idx) => (
                  <line
                    key={idx}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    className="road"
                  />
                ))}

                {/* Pins and Clusters */}
                <g>
                  {groups.map((G, gIdx) => {
                    if (G.items.length > 1) {
                      const n = G.items.length;
                      const names = G.items.map((p) => p.t).join(", ");
                      const go = () => {
                        setZ(Math.min(2.5, z + 1));
                        setCenter([G.x, G.y]);
                      };
                      return (
                        <g
                          key={`clu-${gIdx}`}
                          className="clu"
                          transform={`translate(${G.x} ${G.y})`}
                          tabIndex={0}
                          role="button"
                          aria-label={`${n} projetos próximos: ${names}. Aproximar.`}
                          onClick={go}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              go();
                            }
                          }}
                        >
                          <circle r={19} className="clu-h" />
                          <circle r={13} className="clu-c" />
                          <text y={4} textAnchor="middle" className="clu-t">
                            {n}
                          </text>
                        </g>
                      );
                    }

                    const p = G.items[0];
                    const C = CATS[p.k];
                    const isSel = currentSelected?.i === p.i;
                    const pick = () => setSelI(p.i);

                    return (
                      <g
                        key={`pin-${p.i}`}
                        className={`pin ${isSel ? "sel" : ""}`}
                        transform={`translate(${p.x} ${p.y})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${p.t}. ${C.name}. ${p.sec}. Estágio: ${STG[p.st]}.`}
                        onClick={pick}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            pick();
                          }
                        }}
                      >
                        {p.st === 1 && <circle cy={-19} r={9} className="pulse" />}
                        <circle cy={-17} r={18} className="ring" />
                        <g className="pb">
                          <ellipse cx={0} cy={0} rx={4.5} ry={1.6} className="p-sh" />
                          <path d={PIN_D} className="p-body" style={{ fill: C.c }} />
                          <circle cy={-19} r={7.6} className="p-in" />
                          <use
                            href={`#${CAT_IC[p.k]}`}
                            x={-5.5}
                            y={-24.5}
                            width={11}
                            height={11}
                            className="p-ic"
                            style={{ color: C.c }}
                          />
                        </g>
                      </g>
                    );
                  })}
                </g>
              </svg>

              <div className="map-zoom tm-zoom" role="group" aria-label="Zoom do mapa">
                <button
                  type="button"
                  id="tmIn"
                  aria-label="Aproximar"
                  disabled={z >= 2.5}
                  onClick={() => setZ((cur) => Math.min(2.5, cur + 0.75))}
                >
                  +
                </button>
                <button
                  type="button"
                  id="tmOut"
                  aria-label="Afastar"
                  disabled={z <= 1}
                  onClick={() => setZ((cur) => Math.max(1, cur - 0.75))}
                >
                  −
                </button>
              </div>

              <ul className="tm-leg" aria-label="Legenda">
                <li>
                  <i className="tm-cl">3</i>Grupo de projetos
                </li>
                <li>
                  <i className="tm-pu" />Buscando apoio
                </li>
              </ul>

              <div className="map-scale" aria-hidden="true">
                <i />escala ilustrativa
              </div>

              {vis.length === 0 && (
                <p className="tm-empty" id="tmEmpty">
                  Nenhum projeto com esses filtros.
                  <button type="button" id="tmEmptyClear" onClick={clearAllFilters}>
                    Limpar filtros
                  </button>
                </p>
              )}
            </div>

            <aside className="side" aria-label="Painel do território">
              <div>
                <h4>
                  Por eixo de impacto <small className="cb-hint">clique para filtrar</small>
                </h4>
                <div className="catbars" id="catbars">
                  {Object.entries(CATS).map(([k, C]) => {
                    const count = baseWithoutEixo.filter((p) => p.k === k).length;
                    const isPressed = !fEixo || fEixo === k;
                    return (
                      <button
                        key={k}
                        type="button"
                        className={`catbar ${count === 0 ? "is-zero" : ""}`}
                        data-cat={k}
                        aria-pressed={isPressed}
                        title={`Filtrar por ${C.name}`}
                        onClick={() => setFEixo((cur) => (cur === k ? "" : k))}
                      >
                        <MiniPinGlyph color={C.c} />
                        <span className="nm">{C.name}</span>
                        <span className="bar">
                          <i
                            style={{
                              background: C.c,
                              width: `${(count / maxCatCount) * 100}%`,
                            }}
                          />
                        </span>
                        <span className="v">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <h4>Projeto selecionado</h4>
                <div className="detail" id="detail" aria-live="polite">
                  {currentSelected ? (
                    (() => {
                      const p = currentSelected;
                      const C = CATS[p.k];
                      const pct = p.orc ? Math.round((p.mob / p.orc) * 100) : 0;
                      return (
                        <>
                          <div className="pd-top">
                            <MiniPinGlyph color={C.c} size={14} />
                            <span>{C.name}</span>
                          </div>
                          <div className="dt">{p.t}</div>
                          <p className="pd-meta">
                            {p.sec} · {p.per}º semestre de 2026
                          </p>
                          <ol className="pd-steps" aria-label={`Estágio: ${STG[p.st]}`}>
                            {ST_SHORT.map((name, k) => (
                              <li
                                key={name}
                                className={
                                  k < p.st ? "done" : k === p.st ? "now" : ""
                                }
                              >
                                <i />
                                {name}
                              </li>
                            ))}
                          </ol>
                          <div className="pd-rec">
                            <div className="pd-l">
                              <span>Recursos mobilizados</span>
                              <b>
                                {fmtR(p.mob)} <small>de {fmtR(p.orc)}</small>
                              </b>
                            </div>
                            <div
                              className="pd-bar"
                              role="img"
                              aria-label={`${pct}% do orçamento mobilizado`}
                            >
                              <i style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <dl>
                            <dt>Pessoas beneficiadas</dt>
                            <dd>
                              {p.ben ? (
                                p.ben
                              ) : (
                                <>
                                  {p.prev} <small>previstas</small>
                                </>
                              )}
                            </dd>
                            <dt>Próximo passo</dt>
                            <dd>{NEXT[p.st]}</dd>
                          </dl>
                        </>
                      );
                    })()
                  ) : (
                    <p className="hint">Nenhum projeto no recorte selecionado.</p>
                  )}
                </div>
              </div>
            </aside>
          </div>
        </div>

        <p className="legend-note" style={{ marginTop: 14 }}>
          Cada eixo tem cor e ícone próprios, para que a leitura não dependa apenas da cor. Valores de recursos e pessoas beneficiadas são fictícios, apenas para demonstração.
        </p>
      </div>
    </section>
  );
}
