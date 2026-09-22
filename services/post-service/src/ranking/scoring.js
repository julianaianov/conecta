// Cálculo puro dos rankings (T21): período, pontuação e empate.
//
// Separado do banco de propósito: é aqui que o critério publicado na interface
// vira número, e é isto que os testes verificam sem PostgreSQL.

const { BOARDS, PERIODS, DEFAULT_PERIOD } = require('./constants');

const BOARD_BY_ID = new Map(BOARDS.map((board) => [board.id, board]));

/** Períodos aceitos na consulta; qualquer outro valor cai no padrão. */
function normalizePeriod(value) {
  return PERIODS.includes(value) ? value : DEFAULT_PERIOD;
}

/**
 * Início do período (inclusive) em UTC, ou `null` para `sempre`. O recorte é
 * sempre o período **corrente** — "este mês" e "este ano" —, não uma janela
 * móvel: é o que a interface promete.
 */
function periodStart(period, now = new Date()) {
  const reference = now instanceof Date ? now : new Date(now);
  if (period === 'mes') return new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), 1));
  if (period === 'ano') return new Date(Date.UTC(reference.getUTCFullYear(), 0, 1));
  return null;
}

function count(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** Valor declarado em reais (a coluna é DECIMAL(10,2)); o ponto é o real inteiro. */
function amountPoints(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * Pontos do assunto num ranking, a partir das métricas agregadas. As fórmulas
 * são as descritas em `BOARDS[].criteria` — mudar uma exige mudar as duas.
 */
function pointsFor(boardId, metrics = {}) {
  switch (boardId) {
    case 'usuarios_mais_ativos':
      return count(metrics.reactions) * 1
        + count(metrics.comments) * 3
        + count(metrics.shares) * 5
        + count(metrics.interests) * 8
        + count(metrics.supports) * 10
        + count(metrics.demands) * 15;
    case 'maiores_apoiadores':
      return count(metrics.confirmedSupports) * 10 + count(metrics.supportedDemands) * 5;
    case 'empresas_em_destaque':
      return count(metrics.confirmedSupports) * 10
        + count(metrics.supportedDemands) * 5
        + count(metrics.modalities) * 5;
    case 'voluntarios_mais_participativos':
      return count(metrics.interests) * 5
        + count(metrics.acceptedConnections) * 15
        + count(metrics.confirmedSupports) * 10;
    case 'maiores_patrocinadores':
      return amountPoints(metrics.amount);
    case 'bairros_mais_engajados':
      return count(metrics.demands) * 10
        + count(metrics.confirmedSupports) * 5
        + count(metrics.interests) * 3
        + count(metrics.shares) * 2;
    case 'projetos_mais_apoiados':
      return count(metrics.confirmedSupports) * 10
        + count(metrics.interests) * 5
        + count(metrics.shares) * 3
        + count(metrics.reactions) * 1
        + count(metrics.comments) * 1;
    default:
      throw new Error(`ranking desconhecido: ${boardId}`);
  }
}

/**
 * Ordena e numera, tratando empate: quem tem a mesma pontuação divide a mesma
 * posição (1, 1, 3 — numeração de competição) e a linha vem marcada com
 * `tied`. O desempate da ordem de exibição é o `subjectId`, para a lista ser
 * estável entre duas passadas com os mesmos dados.
 */
function rankEntries(entries) {
  const ordered = [...entries]
    .filter((entry) => Number(entry.points) > 0)
    .sort((a, b) => Number(b.points) - Number(a.points)
      || String(a.subjectId).localeCompare(String(b.subjectId)));

  const result = [];
  let position = 0;
  let previousPoints = null;
  let previousPosition = 0;
  ordered.forEach((entry, index) => {
    position = index + 1;
    const points = Number(entry.points);
    if (previousPoints !== null && points === previousPoints) position = previousPosition;
    previousPoints = points;
    previousPosition = position;
    result.push({ ...entry, points, position, tied: false });
  });
  const shared = new Map();
  for (const entry of result) shared.set(entry.position, (shared.get(entry.position) ?? 0) + 1);
  return result.map((entry) => ({ ...entry, tied: (shared.get(entry.position) ?? 0) > 1 }));
}

/** Descrição do ranking (rótulo, subtítulo e critério), para a interface. */
function boardDefinition(boardId) {
  return BOARD_BY_ID.get(boardId) ?? null;
}

module.exports = { normalizePeriod, periodStart, pointsFor, rankEntries, boardDefinition };
