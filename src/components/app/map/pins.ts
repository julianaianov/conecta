// Desenho dos pinos do mapa inteligente (T20).
//
// Cada classe da legenda tem cor **e** forma (manual de marca + slide 19): o
// mapa precisa ser legível para quem não distingue as cores. As mesmas formas
// aparecem na legenda em texto.

import { MAP_SHAPE_LABELS, type MapShape } from "@/lib/app/map";

/** Glifo branco no centro do pino, em um sistema de 30×40 com centro (15,15). */
const GLYPHS: Record<MapShape, string> = {
  circulo: '<circle cx="15" cy="15" r="6" fill="#fff"/>',
  quadrado: '<rect x="9.5" y="9.5" width="11" height="11" rx="1.5" fill="#fff"/>',
  triangulo: '<path d="M15 8.4 L21.2 19.6 L8.8 19.6 Z" fill="#fff"/>',
  losango: '<path d="M15 8 L22 15 L15 22 L8 15 Z" fill="#fff"/>',
  estrela: '<path d="M15 8.2 L16.9 13.1 L22.1 13.4 L18.1 16.8 L19.4 21.9 L15 19 L10.6 21.9 L11.9 16.8 L7.9 13.4 L13.1 13.1 Z" fill="#fff"/>',
  ponto: '<circle cx="15" cy="15" r="4.5" fill="#fff"/>',
};

/** Pino completo (gota + glifo), para o `divIcon` do Leaflet. */
export function pinSvg(color: string, shape: MapShape): string {
  return `<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 25 15 25s15-14.5 15-25C30 6.7 23.3 0 15 0Z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
      ${GLYPHS[shape] ?? GLYPHS.circulo}
    </svg>`;
}

/** Mesmo desenho em tamanho de amostra, para a legenda e a lista. */
export function swatchSvg(color: string, shape: MapShape, size = 18): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
      <rect x="0" y="0" width="30" height="30" rx="6" fill="${color}"/>
      ${GLYPHS[shape] ?? GLYPHS.circulo}
    </svg>`;
}

export function shapeLabel(shape: MapShape): string {
  return MAP_SHAPE_LABELS[shape] ?? shape;
}
