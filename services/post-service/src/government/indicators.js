// Domínio puro do painel do Poder Público (T22): período, recorte, ordenação
// da priorização de áreas e exportação CSV. Nada aqui toca o banco nem o HTTP;
// as consultas ficam em ./store.js e as rotas em ../routes/government-indicators.js.

const {
  CATEGORIES, CATEGORY_LABELS, PRIORITIES, THEMES, THEME_LABELS,
} = require('../demand/constants');
const {
  DEFAULT_PERIOD, DEFAULT_SCOPE, INDICATORS, LIMITS, PERIODS, PERIOD_DAYS, PERIOD_LABELS,
  SCOPES, SCOPE_LABELS,
} = require('./constants');

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Início/fim do recorte temporal. `from` nulo em `tudo`; `to` é o agora (ou o
 * `to` informado). O agora é arredondado **para cima** no passo de `quantizeMs`
 * (1 min, o mesmo do cache): sem isso, cada requisição teria um recorte
 * diferente por milissegundos e o cache nunca acertaria; arredondar para baixo
 * deixaria de fora o que acabou de ser publicado no minuto corrente.
 */
function resolvePeriod({ period, from, to } = {}, now = new Date(), quantizeMs = 60_000) {
  const errors = {};
  const step = Number.isFinite(quantizeMs) && quantizeMs > 0 ? quantizeMs : 1;
  const anchor = new Date(Math.ceil(now.getTime() / step) * step);
  const end = to === undefined || to === '' ? anchor : new Date(`${String(to)}T23:59:59.999Z`);
  if (to !== undefined && to !== '' && (!ISO_DATE.test(String(to)) || Number.isNaN(end.getTime()))) {
    errors.to = 'Use uma data AAAA-MM-DD';
  }
  let start = null;
  let key = period === undefined || period === '' ? DEFAULT_PERIOD : String(period);
  if (from !== undefined && from !== '') {
    if (!ISO_DATE.test(String(from))) {
      errors.from = 'Use uma data AAAA-MM-DD';
    } else {
      start = new Date(`${String(from)}T00:00:00.000Z`);
      if (Number.isNaN(start.getTime())) errors.from = 'Use uma data AAAA-MM-DD';
      else key = 'personalizado';
    }
  } else if (!PERIODS.includes(key)) {
    errors.period = `Valores aceitos: ${PERIODS.join(', ')}`;
  } else if (key !== 'tudo') {
    start = new Date(anchor.getTime() - PERIOD_DAYS[key] * DAY_MS);
  }
  if (!Object.keys(errors).length && start && end && start.getTime() > end.getTime()) {
    errors.from = 'O início do período vem antes do fim';
  }
  if (Object.keys(errors).length) return { errors };
  return {
    errors: {},
    value: {
      key,
      from: start ? start.toISOString() : null,
      to: end.toISOString(),
      label: key === 'personalizado'
        ? `${String(from)} a ${to ? String(to) : 'hoje'}`
        : PERIOD_LABELS[key],
    },
  };
}

/** Filtros do painel: recorte, período, categoria e território. */
function validateIndicatorQuery(query = {}, now = new Date()) {
  const errors = {};
  const scope = query.scope === undefined || query.scope === '' ? DEFAULT_SCOPE : String(query.scope);
  if (!SCOPES.includes(scope)) errors.scope = `Valores aceitos: ${SCOPES.join(', ')}`;

  let categories = null;
  if (query.category !== undefined && query.category !== '') {
    const list = String(query.category).split(',').map((v) => v.trim()).filter(Boolean);
    if (!list.length || list.some((v) => !CATEGORIES.includes(v))) {
      errors.category = `Valores aceitos: ${CATEGORIES.join(', ')}`;
    } else {
      categories = [...new Set(list)];
    }
  }

  let priorities = null;
  if (query.priority !== undefined && query.priority !== '') {
    const list = String(query.priority).split(',').map((v) => v.trim()).filter(Boolean);
    if (!list.length || list.some((v) => !PRIORITIES.includes(v))) {
      errors.priority = `Valores aceitos: ${PRIORITIES.join(', ')}`;
    } else {
      priorities = [...new Set(list)];
    }
  }

  // Eixo temático (T26, slide 26): recorte do painel e base da priorização por
  // eixo. Opcional, como o campo na demanda.
  let themes = null;
  if (query.theme !== undefined && query.theme !== '') {
    const list = String(query.theme).split(',').map((v) => v.trim()).filter(Boolean);
    if (!list.length || list.some((v) => !THEMES.includes(v))) {
      errors.theme = `Valores aceitos: ${THEMES.join(', ')}`;
    } else {
      themes = [...new Set(list)];
    }
  }

  const territory = typeof query.territory === 'string' ? query.territory.trim() : '';
  if (territory.length > LIMITS.territory) errors.territory = `Use no máximo ${LIMITS.territory} caracteres`;

  const period = resolvePeriod(query, now);
  Object.assign(errors, period.errors);
  if (Object.keys(errors).length) return { errors };
  return {
    errors: {},
    value: {
      scope,
      scopeLabel: SCOPE_LABELS[scope],
      period: period.value,
      categories,
      priorities,
      themes,
      territory: territory || null,
    },
  };
}

/**
 * Priorização de áreas (slide 24): ordena os grupos (território ou categoria)
 * por urgência, volume e tempo sem resposta institucional do órgão. Não é
 * ranking entre órgãos — é a fila de trabalho de um órgão sobre o território.
 *
 * `score` é só a ordenação da lista, exibida com os três números que a geram.
 */
function priorityScore(group) {
  const urgent = Number(group.urgent) || 0;
  const total = Number(group.total) || 0;
  const withoutResponse = Number(group.withoutResponse) || 0;
  const oldestWaitDays = Number(group.oldestWaitDays) || 0;
  return urgent * 3 + withoutResponse * 2 + total + Math.min(oldestWaitDays, 365) / 30;
}

/** Ordena decrescente por `score`; empate desfeito pelo nome, para a lista ser estável. */
function rankAreas(groups, { limit = LIMITS.areas } = {}) {
  return [...groups]
    .map((g) => ({ ...g, score: Number(priorityScore(g).toFixed(3)) }))
    .sort((a, b) => b.score - a.score || String(a.label ?? '').localeCompare(String(b.label ?? ''), 'pt-BR'))
    .slice(0, limit);
}

// ── Exportação ──────────────────────────────────────────────────────────────

/** Célula CSV com separador `;` (o mesmo do painel da operação). */
function csvCell(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\r?\n/g, ' ').trim();
  return /[";]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const csvRow = (cells) => cells.map(csvCell).join(';');

/**
 * CSV dos indicadores do próprio órgão. Só números agregados e rótulos
 * públicos: nenhum dado pessoal (nome, contato ou conta) sai daqui.
 */
function indicatorsCsv(report) {
  const lines = [
    csvRow(['DM Conecta — indicadores do Poder Público']),
    csvRow(['Órgão', report.organization?.name ?? '']),
    csvRow(['Recorte', report.scopeLabel ?? '']),
    csvRow(['Período', report.period?.label ?? '']),
    csvRow(['Gerado em', report.generatedAt ?? '']),
    '',
    csvRow(['Indicador', 'Valor', 'Como é obtido']),
  ];
  for (const indicator of INDICATORS) {
    if (indicator.kind !== 'contagem') continue;
    lines.push(csvRow([indicator.label, report.indicators?.[indicator.id] ?? 0, report.sources?.[indicator.id] ?? '']));
  }
  lines.push('', csvRow(['Demandas por território', 'Total', 'Urgentes', 'Concluídas']));
  for (const row of report.byTerritory ?? []) {
    lines.push(csvRow([row.label, row.total, row.urgent, row.concluded]));
  }
  lines.push('', csvRow(['Demandas por categoria', 'Total', 'Urgentes', 'Concluídas']));
  for (const row of report.byCategory ?? []) {
    lines.push(csvRow([CATEGORY_LABELS[row.category] ?? row.category, row.total, row.urgent, row.concluded]));
  }
  return lines.join('\n');
}

/** CSV da priorização de áreas. */
function priorityCsv(report) {
  const lines = [
    csvRow(['DM Conecta — priorização de áreas']),
    csvRow(['Órgão', report.organization?.name ?? '']),
    csvRow(['Recorte', report.scopeLabel ?? '']),
    csvRow(['Período', report.period?.label ?? '']),
    '',
    csvRow(['Área', 'Tipo', 'Demandas', 'Urgentes', 'Sem resposta do órgão', 'Maior espera (dias)', 'Espera média (dias)']),
  ];
  for (const [kind, rows] of [
    ['Território', report.territories ?? []],
    ['Categoria', report.categories ?? []],
    ['Eixo temático', report.themes ?? []],
  ]) {
    for (const row of rows) {
      const label = kind === 'Eixo temático' ? THEME_LABELS[row.label] ?? row.label : row.label;
      lines.push(csvRow([label, kind, row.total, row.urgent, row.withoutResponse, row.oldestWaitDays, row.averageWaitDays]));
    }
  }
  return lines.join('\n');
}

/** CSV da medição de impacto. */
function impactCsv(report) {
  const i = report.impact ?? {};
  const lines = [
    csvRow(['DM Conecta — medição de impacto do Poder Público']),
    csvRow(['Órgão', report.organization?.name ?? '']),
    csvRow(['Período', report.period?.label ?? '']),
    '',
    csvRow(['Medida', 'Valor']),
    csvRow(['Demandas com atuação do órgão', i.demandsActedOn ?? 0]),
    csvRow(['Demandas concluídas', i.concluded ?? 0]),
    csvRow(['Prestações de contas concluídas', i.accountabilityConcluded ?? 0]),
    csvRow(['Beneficiários alcançados', i.beneficiariesReached ?? 0]),
    csvRow(['Resultados registrados', i.resultsRecorded ?? 0]),
    csvRow(['Metas atingidas', i.goalsAchieved ?? 0]),
    csvRow(['Apoios viabilizados pelo órgão', i.offers ?? 0]),
    csvRow(['Apoios registrados nas demandas', i.supports ?? 0]),
    csvRow(['Ações divulgadas pelo órgão', i.actions ?? 0]),
    csvRow(['Respostas institucionais', i.responses ?? 0]),
    csvRow(['Encaminhamentos enviados', i.forwardings ?? 0]),
  ];
  return lines.join('\n');
}

module.exports = {
  resolvePeriod,
  validateIndicatorQuery,
  priorityScore,
  rankAreas,
  csvCell,
  csvRow,
  indicatorsCsv,
  priorityCsv,
  impactCsv,
};
