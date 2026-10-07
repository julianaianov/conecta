// Vocabulário da área de governo e gestão pública (T22). Fonte:
// 01-apresentacao-institucional.html slide 24 (monitoramento em tempo real,
// respostas oficiais, priorização de áreas, divulgação de ações e medição de
// impacto) e 03-fluxo-cadastro-poder-publico.html slide 14 (os 10 indicadores).
// test/government-domain.test.js confere as listas contra a migração 019.

// Os 10 indicadores do slide 14, na ordem da fonte. `kind`: `contagem` é um
// número; `distribuicao` é uma lista (território e categoria).
const INDICATORS = [
  { id: 'demandas_recebidas', label: 'Demandas recebidas', kind: 'contagem' },
  { id: 'demandas_por_territorio', label: 'Demandas por território', kind: 'distribuicao' },
  { id: 'demandas_por_categoria', label: 'Demandas por categoria', kind: 'distribuicao' },
  { id: 'demandas_urgentes', label: 'Demandas urgentes', kind: 'contagem' },
  { id: 'demandas_encaminhadas', label: 'Demandas encaminhadas', kind: 'contagem' },
  { id: 'demandas_em_execucao', label: 'Demandas em execução', kind: 'contagem' },
  { id: 'demandas_concluidas', label: 'Demandas concluídas', kind: 'contagem' },
  { id: 'projetos_apoiados', label: 'Projetos apoiados', kind: 'contagem' },
  { id: 'beneficiarios_alcancados', label: 'Beneficiários alcançados', kind: 'contagem' },
  { id: 'resultados_registrados', label: 'Resultados registrados', kind: 'contagem' },
];

const INDICATOR_IDS = INDICATORS.map((i) => i.id);

// Como cada número é obtido — o painel mostra esta frase junto do indicador,
// porque "apenas dados verificáveis são publicados" (slide 25 da apresentação).
const INDICATOR_SOURCES = {
  demandas_recebidas: 'Demandas publicadas no recorte e no período.',
  demandas_por_territorio: 'Mesmas demandas, agrupadas pelo território informado na demanda.',
  demandas_por_categoria: 'Mesmas demandas, agrupadas pela categoria da demanda (todas as categorias aparecem, inclusive as sem demanda no recorte).',
  demandas_urgentes: 'Demandas com prioridade urgente ou da categoria Problema Urgente.',
  demandas_encaminhadas: 'Demandas com encaminhamento registrado pelo órgão ou acompanhamento em Encaminhada.',
  demandas_em_execucao: 'Demandas em execução (status da demanda ou do acompanhamento do órgão).',
  demandas_concluidas: 'Demandas concluídas ou em prestação de contas, e acompanhamentos concluídos.',
  projetos_apoiados: 'Demandas com ao menos um apoio registrado e não cancelado.',
  beneficiarios_alcancados: 'Soma dos beneficiários alcançados nas prestações de contas concluídas.',
  resultados_registrados: 'Resultados de metas registrados nas prestações de contas.',
};

// Recorte do painel. `competencia` é o que o órgão de fato acompanha (a
// competência declarada no cadastro é texto livre e não classifica demanda);
// `jurisdicao` é o território da esfera; `todas` é a plataforma inteira.
const SCOPES = ['competencia', 'jurisdicao', 'todas'];

const SCOPE_LABELS = {
  competencia: 'Demandas da competência do órgão (com atuação registrada)',
  jurisdicao: 'Território de atuação do órgão',
  todas: 'Todas as demandas publicadas',
};

// Períodos do painel. `tudo` não tem início.
const PERIODS = ['7d', '30d', '90d', '12m', 'tudo'];

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

const PERIOD_LABELS = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  '12m': 'Últimos 12 meses',
  tudo: 'Desde o início',
};

const DEFAULT_PERIOD = '30d';
const DEFAULT_SCOPE = 'jurisdicao';

// Divulgação de ações (slide 24): o que o órgão publica.
const ACTION_KINDS = ['acao', 'programa', 'servico', 'obra', 'evento_publico', 'edital'];

const ACTION_KIND_LABELS = {
  acao: 'Ação',
  programa: 'Programa público',
  servico: 'Serviço público',
  obra: 'Obra',
  evento_publico: 'Evento público',
  edital: 'Edital ou chamamento',
};

// Tipo de resposta institucional (T13) gravado junto da ação ligada a uma
// demanda: é ela que leva a ação à linha do tempo pública.
const ACTION_RESPONSE_TYPE = {
  acao: 'acao_prevista',
  programa: 'programa_publico_relacionado',
  servico: 'programa_publico_relacionado',
  obra: 'acao_prevista',
  evento_publico: 'acao_prevista',
  edital: 'programa_publico_relacionado',
};

// Evento que a divulgação de ação grava em demand_events (gatilho da migração
// 019). Público: o `payload->'public'` vira `details` na linha do tempo.
const GOVERNMENT_EVENT_TYPES = ['acao_institucional_divulgada'];

// Tipo do post no feed. O Poder Público publica como `message` (migração 005).
const ACTION_POST_TYPE = 'message';

const LIMITS = {
  title: 200,
  summary: 5000,
  programName: 255,
  programUrl: 1000,
  territory: 255,
  municipality: 120,
  groups: 20,
  areas: 50,
  actions: 50,
};

// Cache curto do painel: "monitoramento em tempo real" é consulta com cache
// curto e índices, sem agregação pesada por requisição nem laço de
// pré-agregação (ver o cabeçalho da migração 019).
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;

module.exports = {
  INDICATORS,
  INDICATOR_IDS,
  INDICATOR_SOURCES,
  SCOPES,
  SCOPE_LABELS,
  PERIODS,
  PERIOD_DAYS,
  PERIOD_LABELS,
  DEFAULT_PERIOD,
  DEFAULT_SCOPE,
  ACTION_KINDS,
  ACTION_KIND_LABELS,
  ACTION_RESPONSE_TYPE,
  ACTION_POST_TYPE,
  GOVERNMENT_EVENT_TYPES,
  LIMITS,
  CACHE_TTL_MS,
  CACHE_MAX_ENTRIES,
};
