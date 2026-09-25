// Legenda do mapa inteligente (T20), com as cinco classes do slide 19. Cada
// classe agrupa categorias da demanda (12 tipos do Modelo §03, decisão 15),
// listadas abaixo do nome da classe e no `title` do símbolo.
//
// A legenda é uma tabela de verdade (não só cores no mapa): cada linha tem o
// símbolo, o nome da classe, a forma em texto e a contagem do recorte atual.
// É o que permite ler o mapa sem enxergar as cores e sem usar o mouse.

import {
  countsByLegend, isLegendActive, isLegendSelected, MAP_FEED_LAYER, MAP_LEGEND, type MapLegendClass,
} from "@/lib/app/map";
import { DEMAND_CATEGORY_LABELS, type DemandCategory } from "@/lib/app/types";
import { shapeLabel, swatchSvg } from "./pins";

const categoryNames = (item: MapLegendClass) => item.categories.map((c) => DEMAND_CATEGORY_LABELS[c]).join(", ");

function Swatch({ color, shape }: { color: string; shape: MapLegendClass["shape"] }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block align-middle"
      dangerouslySetInnerHTML={{ __html: swatchSvg(color, shape) }}
    />
  );
}

export interface MapLegendProps {
  /** Contagem por categoria; a legenda soma por classe. */
  counts: Partial<Record<DemandCategory, number>>;
  feedCount: number | null;
  /** Categorias ligadas no filtro; vazio = todas. */
  active: DemandCategory[];
  onToggle?: (legend: MapLegendClass) => void;
}

export function MapLegend({ counts, feedCount, active, onToggle }: MapLegendProps) {
  const byClass = countsByLegend(counts);
  return (
    <section className="app-card rounded-2xl p-4" aria-labelledby="map-legend-title">
      <h2 id="map-legend-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
        Legenda do mapa
      </h2>
      <table className="mt-3 w-full text-left text-sm">
        <caption className="sr-only">
          Classes do mapa inteligente, com o símbolo, a forma do pino e quantas demandas há no recorte atual.
        </caption>
        <thead>
          <tr style={{ color: "var(--th-muted)" }}>
            <th scope="col" className="pb-1 text-xs font-semibold">Classe</th>
            <th scope="col" className="pb-1 text-xs font-semibold">Pino</th>
            <th scope="col" className="pb-1 text-right text-xs font-semibold">Demandas</th>
          </tr>
        </thead>
        <tbody>
          {MAP_LEGEND.map((item) => (
            <tr key={item.id} style={{ opacity: isLegendActive(active, item) ? 1 : 0.5 }}>
              <th scope="row" className="py-1 pr-2 font-medium" style={{ color: "var(--th-text)" }}>
                {onToggle ? (
                  <button
                    type="button"
                    className="flex items-center gap-2 rounded px-1 py-0.5 text-left underline-offset-2 hover:underline"
                    aria-pressed={isLegendSelected(active, item)}
                    onClick={() => onToggle(item)}
                    title={categoryNames(item)}
                  >
                    <Swatch color={item.color} shape={item.shape} />
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-2" title={categoryNames(item)}>
                    <Swatch color={item.color} shape={item.shape} />
                    <span>{item.label}</span>
                  </span>
                )}
                {item.categories.length > 1 ? (
                  <span className="mt-0.5 block pl-7 text-xs font-normal" style={{ color: "var(--th-muted)" }}>
                    {categoryNames(item)}
                  </span>
                ) : null}
              </th>
              <td className="py-1 pr-2 text-xs" style={{ color: "var(--th-muted)" }}>{shapeLabel(item.shape)}</td>
              <td className="py-1 text-right font-numeric" style={{ color: "var(--th-text)" }}>
                {byClass[item.id].toLocaleString("pt-BR")}
              </td>
            </tr>
          ))}
          {feedCount === null ? null : (
            <tr>
              <th scope="row" className="py-1 pr-2 font-medium" style={{ color: "var(--th-text)" }}>
                <span className="flex items-center gap-2">
                  <Swatch color={MAP_FEED_LAYER.color} shape={MAP_FEED_LAYER.shape} />
                  <span>{MAP_FEED_LAYER.label}</span>
                </span>
              </th>
              <td className="py-1 pr-2 text-xs" style={{ color: "var(--th-muted)" }}>{shapeLabel(MAP_FEED_LAYER.shape)}</td>
              <td className="py-1 text-right font-numeric" style={{ color: "var(--th-text)" }}>
                {feedCount.toLocaleString("pt-BR")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
