// Pautas da Comunicação e divulgação registrada (T28). Vocabulário espelhado
// em src/lib/app/media.ts (o teste media.test.mjs compara).
//
// Fonte: Arquitetura de Perfis §3.5 — Comunicação (Imprensa, Veículos de
// Comunicação, Jornalistas): "Identificar pautas", "Compartilhar iniciativas",
// "Divulgar projetos e resultados", "Acompanhar informações públicas do
// território"; §6, etapa 6 (AMPLIFICAÇÃO).

/** Categorias de conta que identificam pautas. */
const MEDIA_ROLES = ['media'];

const TARGET_KINDS = ['demanda', 'evento'];
const TARGET_LABELS = { demanda: 'Demanda', evento: 'Evento' };

/** identificada → em_apuracao → publicada | descartada (publicada é final). */
const STATUSES = ['identificada', 'em_apuracao', 'publicada', 'descartada'];
const STATUS_LABELS = {
  identificada: 'Pauta identificada',
  em_apuracao: 'Em apuração',
  publicada: 'Divulgação publicada',
  descartada: 'Descartada',
};
const FINAL_STATUSES = ['publicada'];
const STATUS_TRANSITIONS = {
  identificada: ['em_apuracao', 'publicada', 'descartada'],
  em_apuracao: ['publicada', 'descartada'],
  publicada: [],
  descartada: ['identificada', 'em_apuracao'],
};

/** Sinais que fazem de uma demanda ou evento uma pauta, com o rótulo mostrado. */
const SIGNALS = ['urgente', 'antes_e_depois', 'resultados', 'mais_apoiada', 'evento_proximo'];
const SIGNAL_LABELS = {
  urgente: 'Problema urgente publicado nos últimos 30 dias',
  antes_e_depois: 'Execução com registro de antes e depois',
  resultados: 'Resultados e prestação de contas publicados',
  mais_apoiada: 'Entre as demandas mais apoiadas',
  evento_proximo: 'Evento do território nos próximos 30 dias',
};

const ANGLE_MAX = 1000;
const OUTLET_MAX = 200;
const URL_MAX = 500;
/** Janela dos sinais (dias) e teto de candidatos por sinal. */
const DISCOVER_WINDOW_DAYS = 30;
const DISCOVER_LIMIT = 10;
const MINE_LIMIT = 200;

/** Evento público da linha do tempo da demanda (migração post 025). */
const EVENT_TYPES = ['divulgacao_registrada'];

module.exports = {
  MEDIA_ROLES,
  TARGET_KINDS,
  TARGET_LABELS,
  STATUSES,
  STATUS_LABELS,
  FINAL_STATUSES,
  STATUS_TRANSITIONS,
  SIGNALS,
  SIGNAL_LABELS,
  ANGLE_MAX,
  OUTLET_MAX,
  URL_MAX,
  DISCOVER_WINDOW_DAYS,
  DISCOVER_LIMIT,
  MINE_LIMIT,
  EVENT_TYPES,
};
