// Domínio puro da área de governo e gestão pública (T22): os 10 indicadores do
// slide 14, período, recorte, priorização de áreas, exportação e validação da
// divulgação de ações. O ciclo contra PostgreSQL está em government-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  ACTION_KINDS, ACTION_RESPONSE_TYPE, INDICATORS, INDICATOR_IDS, INDICATOR_SOURCES, PERIODS, SCOPES,
} = require('../src/government/constants');
const {
  actionResponse, cacheKey, createIndicatorCache, impactCsv, indicatorsCsv, priorityCsv, priorityScore,
  rankAreas, resolvePeriod, validateAction, validateIndicatorQuery,
} = require('../src/government');

const MIGRATION = fs.readFileSync(
  path.join(__dirname, '../migrations/019-government-indicators.sql'), 'utf8',
);

test('os 10 indicadores são os do slide 14, na ordem da fonte', () => {
  assert.deepEqual(INDICATOR_IDS, [
    'demandas_recebidas', 'demandas_por_territorio', 'demandas_por_categoria', 'demandas_urgentes',
    'demandas_encaminhadas', 'demandas_em_execucao', 'demandas_concluidas', 'projetos_apoiados',
    'beneficiarios_alcancados', 'resultados_registrados',
  ]);
  assert.equal(INDICATORS.length, 10);
  assert.equal(INDICATORS.filter((i) => i.kind === 'distribuicao').length, 2);
  // Transparência (slide 25): todo indicador declara de onde sai o número.
  for (const id of INDICATOR_IDS) assert.ok(INDICATOR_SOURCES[id], id);
});

test('os tipos de ação e o enum da migração 019 são a mesma lista', () => {
  const enumValues = /CREATE TYPE government_action_kind AS ENUM \(([^)]+)\)/s.exec(MIGRATION)[1]
    .split(',').map((v) => v.trim().replace(/'/g, '')).filter(Boolean);
  assert.deepEqual(enumValues, ACTION_KINDS);
  for (const kind of ACTION_KINDS) assert.ok(ACTION_RESPONSE_TYPE[kind], kind);
});

test('a migração 019 não cria tabela de agregação e guarda a divulgação de ações', () => {
  assert.match(MIGRATION, /CREATE TABLE IF NOT EXISTS government_actions/);
  assert.match(MIGRATION, /acao_institucional_divulgada/);
  assert.doesNotMatch(MIGRATION, /government_indicator_snapshots/);
  // O painel é consulta com índices, não materialização.
  assert.match(MIGRATION, /idx_demands_indicators_place_published/);
});

test('período: padrão de 30 dias, períodos da lista, datas próprias e erros', () => {
  const now = new Date('2026-09-22T12:34:56.789Z');
  const padrao = resolvePeriod({}, now).value;
  assert.equal(padrao.key, '30d');
  assert.equal(padrao.to, '2026-09-22T12:35:00.000Z'); // minuto seguinte, para incluir o agora
  assert.equal(padrao.from, '2026-08-23T12:35:00.000Z');

  assert.equal(resolvePeriod({ period: 'tudo' }, now).value.from, null);
  for (const period of PERIODS) assert.deepEqual(resolvePeriod({ period }, now).errors, {});

  const proprio = resolvePeriod({ from: '2026-01-01', to: '2026-01-31' }, now).value;
  assert.equal(proprio.key, 'personalizado');
  assert.equal(proprio.from, '2026-01-01T00:00:00.000Z');
  assert.equal(proprio.to, '2026-01-31T23:59:59.999Z');

  assert.ok(resolvePeriod({ period: 'ontem' }, now).errors.period);
  assert.ok(resolvePeriod({ from: '01/01/2026' }, now).errors.from);
  assert.ok(resolvePeriod({ from: '2026-02-01', to: '2026-01-01' }, now).errors.from);
});

test('o período relativo é estável dentro do minuto, para o cache acertar', () => {
  const a = resolvePeriod({ period: '7d' }, new Date('2026-09-22T12:00:01.000Z')).value;
  const b = resolvePeriod({ period: '7d' }, new Date('2026-09-22T12:00:59.000Z')).value;
  assert.deepEqual(a, b);
  const c = resolvePeriod({ period: '7d' }, new Date('2026-09-22T12:01:01.000Z')).value;
  assert.notEqual(c.to, a.to);
});

test('filtros do painel: recorte, categoria, prioridade e território', () => {
  const now = new Date('2026-09-22T00:00:00.000Z');
  const ok = validateIndicatorQuery({ scope: 'competencia', category: 'projeto_social,problema_urbano', territory: ' Centro ' }, now);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.scope, 'competencia');
  assert.deepEqual(ok.value.categories, ['projeto_social', 'problema_urbano']);
  assert.equal(ok.value.territory, 'Centro');

  assert.equal(validateIndicatorQuery({}, now).value.scope, 'jurisdicao');
  for (const scope of SCOPES) assert.deepEqual(validateIndicatorQuery({ scope }, now).errors, {});
  assert.ok(validateIndicatorQuery({ scope: 'todos' }, now).errors.scope);
  assert.ok(validateIndicatorQuery({ category: 'inexistente' }, now).errors.category);
  assert.ok(validateIndicatorQuery({ priority: 'altissima' }, now).errors.priority);
  assert.ok(validateIndicatorQuery({ territory: 'x'.repeat(256) }, now).errors.territory);
});

test('priorização de áreas: urgência e espera pesam mais que volume, sem comparar órgãos', () => {
  const volumoso = { label: 'Centro', total: 30, urgent: 0, withoutResponse: 0, oldestWaitDays: 0 };
  const urgente = { label: 'Vila Nova', total: 6, urgent: 6, withoutResponse: 6, oldestWaitDays: 60 };
  assert.ok(priorityScore(urgente) > priorityScore(volumoso));

  const ranked = rankAreas([volumoso, urgente]);
  assert.equal(ranked[0].label, 'Vila Nova');
  assert.ok(typeof ranked[0].score === 'number');

  // Empate: ordem alfabética, para a lista não dançar entre requisições.
  const [a, b] = rankAreas([
    { label: 'Zona Sul', total: 1, urgent: 0, withoutResponse: 0, oldestWaitDays: 0 },
    { label: 'Alto da Boa Vista', total: 1, urgent: 0, withoutResponse: 0, oldestWaitDays: 0 },
  ]);
  assert.equal(a.label, 'Alto da Boa Vista');
  assert.equal(b.label, 'Zona Sul');
  assert.equal(rankAreas([volumoso, urgente], { limit: 1 }).length, 1);
});

test('cache curto: acerta na mesma chave, expira pelo TTL e é invalidado por órgão', () => {
  let clock = 1_000;
  const cache = createIndicatorCache({ ttlMs: 60_000, maxEntries: 3, now: () => clock });
  const filters = { scope: 'jurisdicao', period: { from: 'A', to: 'B' }, categories: null, priorities: null, territory: null };
  const key = cacheKey('org-1', 'indicators', filters);
  assert.equal(cacheKey('org-1', 'indicators', filters), key);
  assert.notEqual(cacheKey('org-2', 'indicators', filters), key);

  cache.set(key, { total: 3 });
  assert.deepEqual(cache.get(key), { total: 3 });
  clock += 60_001;
  assert.equal(cache.get(key), null);

  cache.set(key, { total: 4 });
  cache.invalidate('org-1::');
  assert.equal(cache.get(key), null);

  // Teto de entradas: o cache não cresce sem limite.
  for (let i = 0; i < 10; i += 1) cache.set(`org-${i}::x`, i);
  assert.ok(cache.size <= 3);
});

test('divulgação de ação: campos obrigatórios, https, datas e programa', () => {
  const base = { kind: 'acao', title: 'Mutirão de limpeza', summary: 'Ação da secretaria no bairro.' };
  const ok = validateAction({ ...base, uf: 'rj', territory: 'Centro', startsOn: '2026-10-01', endsOn: '2026-10-10' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.uf, 'RJ');

  assert.ok(validateAction({}).errors.kind);
  assert.ok(validateAction({ ...base, kind: 'inventado' }).errors.kind);
  assert.ok(validateAction({ kind: 'acao', summary: 'x' }).errors.title);
  assert.ok(validateAction({ kind: 'acao', title: 'x' }).errors.summary);
  assert.ok(validateAction({ ...base, programUrl: 'http://exemplo.gov.br' }).errors.programUrl);
  assert.ok(validateAction({ ...base, uf: 'RJX' }).errors.uf);
  assert.ok(validateAction({ ...base, demandId: 'nao-e-uuid' }).errors.demandId);
  assert.ok(validateAction({ ...base, startsOn: '2026-10-10', endsOn: '2026-10-01' }).errors.endsOn);
  assert.ok(validateAction({ ...base, title: 'x'.repeat(201) }).errors.title);

  // Programa ligado a demanda vira resposta `programa_publico_relacionado`,
  // que a T13 só aceita com o nome do programa.
  const demandId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  assert.ok(validateAction({ ...base, kind: 'programa', demandId }).errors.programName);
  const programa = validateAction({ ...base, kind: 'programa', demandId, programName: 'Bairro Limpo' });
  assert.deepEqual(programa.errors, {});
  const response = actionResponse(programa.value);
  assert.equal(response.type, 'programa_publico_relacionado');
  assert.equal(response.programName, 'Bairro Limpo');
  assert.ok(response.body.includes('Mutirão de limpeza'));
  assert.ok(response.body.length <= 5000);
});

const report = {
  organization: { name: 'Secretaria de Obras' },
  scopeLabel: 'Território de atuação do órgão',
  period: { label: 'Últimos 30 dias' },
  generatedAt: '2026-09-22T12:00:00.000Z',
  sources: INDICATOR_SOURCES,
  indicators: {
    demandas_recebidas: 12, demandas_urgentes: 3, demandas_encaminhadas: 2, demandas_em_execucao: 1,
    demandas_concluidas: 4, projetos_apoiados: 5, beneficiarios_alcancados: 900, resultados_registrados: 7,
  },
  byTerritory: [{ label: 'Centro; Zona 1', total: 8, urgent: 2, concluded: 3 }],
  byCategory: [{ category: 'projeto_social', total: 4, urgent: 0, concluded: 2 }],
};

test('CSV dos indicadores: só agregado, sem dado pessoal, com separador e escape', () => {
  const csv = indicatorsCsv(report);
  assert.ok(csv.includes('Demandas recebidas;12'));
  assert.ok(csv.includes('Beneficiários alcançados;900'));
  assert.ok(csv.includes('Projeto Social'));
  // O `;` dentro do rótulo é escapado, não quebra a coluna.
  assert.ok(csv.includes('"Centro; Zona 1"'));
  assert.ok(!/@|CPF|e-mail/i.test(csv));

  const priority = priorityCsv({
    ...report,
    territories: [{ label: 'Centro', total: 8, urgent: 2, withoutResponse: 5, oldestWaitDays: 12.5, averageWaitDays: 4 }],
    categories: [],
  });
  assert.ok(priority.includes('Centro;Território;8;2;5;12.5;4'));

  const impact = impactCsv({ ...report, impact: { demandsActedOn: 6, beneficiariesReached: 900, offers: 2 } });
  assert.ok(impact.includes('Demandas com atuação do órgão;6'));
  assert.ok(impact.includes('Apoios viabilizados pelo órgão;2'));
});
