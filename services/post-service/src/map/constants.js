// Mapa inteligente (T20). Fonte da verdade: Apresentação Institucional,
// slide 19 ("Mapa inteligente — visualização geográfica das demandas"), com a
// legenda literal e a exigência de "leitura rápida para governo, empresas,
// mídia e comunidade"; slide 18 ("Demandas e conteúdos") separa as demandas
// dos conteúdos do feed (postagens, fotos, atualizações), que aqui são uma
// camada à parte.
//
// As cinco classes da legenda são as do slide 19, literais; cada uma agrupa
// categorias da demanda (os 12 tipos do Modelo de Conexão §03, decisão 15) pelo
// mapa `CATEGORY_MAP_CLASS` de src/demand/constants.js, que a função SQL
// `demand_map_class` (migração 031) repete. Cores: manual de marca (docs/manual-marca.md);
// `shape` existe para o mapa continuar legível sem depender só de cor.
//
// `src/lib/app/map.ts` espelha este arquivo no frontend; `src/lib/app/map.test.mjs`
// compara os dois.

const {
  CATEGORIES, CATEGORY_LABELS, CATEGORY_MAP_CLASS, MAP_CLASSES, PRIORITIES, PUBLIC_STATUSES, THEMES, THEME_LABELS,
} = require('../demand/constants');

/** Categorias de uma classe da legenda, na ordem do §03. */
const categoriesOf = (classId) => CATEGORIES.filter((c) => CATEGORY_MAP_CLASS[c] === classId);

/** Classes da legenda, na ordem do slide 19, com as categorias de cada uma. */
const LEGEND_BASE = [
  {
    id: 'problemas_urgentes',
    label: 'Problemas urgentes',
    color: '#E53935',
    shape: 'triangulo',
  },
  {
    id: 'problemas_urbanos',
    label: 'Problemas urbanos',
    color: '#1B4F72',
    shape: 'quadrado',
  },
  {
    id: 'projetos_sociais',
    label: 'Projetos sociais',
    color: '#2E9E5B',
    shape: 'circulo',
  },
  {
    id: 'acoes_ambientais',
    label: 'Ações ambientais',
    color: '#2E7BA8',
    shape: 'losango',
  },
  {
    id: 'necessidades',
    label: 'Necessidades (Oportunidades de patrocínio)',
    color: '#F4841A',
    shape: 'estrela',
  },
];

const LEGEND = LEGEND_BASE.map((item) => ({
  ...item,
  categories: categoriesOf(item.id),
}));

if (LEGEND.map((item) => item.id).join() !== MAP_CLASSES.join()) {
  throw new Error('legenda do mapa fora da ordem de MAP_CLASSES');
}

/**
 * Eixos temáticos como filtro do mapa (T26, slide 26). Não são uma sexta classe
 * da legenda: a legenda do slide 19 continua sendo a das cinco classes. O
 * eixo é um recorte que se cruza com ela — o mapa mostra "Saneamento" dentro
 * das mesmas cinco formas e cores, e a contagem por eixo vem em `counts.theme`.
 * Como o eixo é opcional, `counts.themed` diz quantas demandas do recorte já
 * têm eixo marcado.
 */
const THEME_FILTERS = THEMES.map((theme) => ({ id: theme, label: THEME_LABELS[theme] }));

/** Camada do feed (slide 18, "Conteúdos"): publicações comuns, sem demanda. */
const FEED_LAYER = { id: 'feed', label: 'Conteúdos do feed', color: '#5A9BC4', shape: 'ponto' };

/**
 * Atalhos de leitura rápida por público (slide 19). Cada atalho pré-aplica
 * filtros coerentes com o que a fonte permite àquele público (slides 9–12):
 * o Poder Público articula e responde problemas do seu território; Parceiros
 * apoiam, financiam e viabilizam (patrocínio e projetos abertos a parceria);
 * a Comunicação amplifica demandas, projetos e resultados; os Membros da
 * Comunidade participam do que acontece perto deles.
 */
const AUDIENCES = [
  {
    id: 'governo',
    label: 'Governo',
    description: 'Problemas urgentes e urbanos de maior prioridade, ainda em aberto.',
    filter: {
      category: [...categoriesOf('problemas_urgentes'), ...categoriesOf('problemas_urbanos')],
      priority: ['alta', 'urgente'],
      status: ['publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao'],
    },
    layers: { demands: true, feed: false },
  },
  {
    id: 'empresas',
    label: 'Empresas',
    description: 'Oportunidades de patrocínio e projetos em busca de parceiro.',
    filter: {
      category: [
        ...categoriesOf('necessidades'), ...categoriesOf('projetos_sociais'), ...categoriesOf('acoes_ambientais'),
      ],
      priority: [],
      status: ['publicada', 'em_busca_de_parceiro'],
    },
    layers: { demands: true, feed: false },
  },
  {
    id: 'imprensa',
    label: 'Imprensa',
    description: 'Demandas publicadas, em execução e com resultados para divulgar.',
    filter: {
      category: [],
      priority: [],
      status: ['publicada', 'em_execucao', 'concluida', 'prestacao_de_contas'],
    },
    layers: { demands: true, feed: true },
  },
  {
    id: 'comunidade',
    label: 'Comunidade',
    description: 'Tudo o que acontece no território, com as publicações do feed.',
    filter: { category: [], priority: [], status: [] },
    layers: { demands: true, feed: true },
  },
];

/** Agrupamento: célula da grade em graus, a partir do zoom do mapa. */
const ZOOM_MIN = 1;
const ZOOM_MAX = 18;
/** Acima deste total de pontos no recorte, a resposta vem agrupada em células. */
const CLUSTER_THRESHOLD = 300;
const POINTS_MAX = 500;
const CELLS_MAX = 400;
const TERRITORIES_MAX = 500;

function cellSizeDegrees(zoom) {
  const z = Math.min(Math.max(Math.trunc(Number(zoom) || ZOOM_MIN), ZOOM_MIN), ZOOM_MAX);
  return 360 / 2 ** z;
}

/** Identificador estável do território numa URL pública (`/mapa/<slug>`). */
function territorySlug({ territory, municipality, uf }) {
  const parts = [territory, municipality, uf].filter((v) => typeof v === 'string' && v.trim());
  return parts
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

module.exports = {
  LEGEND,
  FEED_LAYER,
  THEME_FILTERS,
  THEMES,
  THEME_LABELS,
  AUDIENCES,
  CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_MAP_CLASS,
  MAP_CLASSES,
  categoriesOf,
  PRIORITIES,
  PUBLIC_STATUSES,
  ZOOM_MIN,
  ZOOM_MAX,
  CLUSTER_THRESHOLD,
  POINTS_MAX,
  CELLS_MAX,
  TERRITORIES_MAX,
  cellSizeDegrees,
  territorySlug,
};
