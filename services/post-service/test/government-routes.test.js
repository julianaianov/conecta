// Rotas da área de governo e gestão pública (T22) com banco simulado: gate do
// Poder Público, recorte, cache curto, exportação CSV/PDF e divulgação de
// ações. O ciclo completo contra PostgreSQL está em government-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { baseClauses } = require('../src/government/store');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG = '88888888-8888-4888-8888-888888888888';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const VALIDATED = { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG };
const PROFILE = {
  name: 'Secretaria de Obras', governmentSphere: 'municipal', department: 'Zeladoria',
  competenceAreas: ['Obras', 'Iluminação'], territory: null, municipality: 'Niterói', uf: 'RJ',
};

const TOTALS = {
  received: 12, urgent: 3, forwarded: 2, in_execution: 1, concluded: 4, supported: 5,
};

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
    const result = await handler(text, params);
    if (!result) throw new Error(`Consulta inesperada: ${text}`);
    return result;
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

const indicatorPool = () => fakePool((text) => {
  if (/WITH\s+base AS/.test(text) && /totals AS/.test(text)) {
    return {
      rows: [{
        totals: TOTALS,
        by_territory: [{ label: 'Centro', uf: 'RJ', total: 8, urgent: 2, concluded: 3 }],
        by_category: [{ category: 'problema_urbano', total: 6, urgent: 2, concluded: 1 }],
        accountability: { beneficiaries: '900', reports: 2 },
        results: 7,
      }],
    };
  }
  if (/UNION ALL/.test(text)) {
    return {
      rows: [
        { kind: 'territorio', label: 'Centro', uf: 'RJ', total: 8, urgent: 2, without_response: 5, oldest_wait_days: 12.53, average_wait_days: 4.2 },
        { kind: 'categoria', label: 'problema_urbano', uf: null, total: 6, urgent: 2, without_response: 4, oldest_wait_days: 9, average_wait_days: 3 },
      ],
    };
  }
  if (/WITH acted AS/.test(text)) {
    return {
      rows: [{
        demands_acted_on: 6, concluded: 3, supports: 4,
        reports: { concluded_reports: 2, beneficiaries: '900', executed_cents: '1000000' },
        results: { registered: 7, achieved: 5 },
        own: { responses: 9, offers: 2, forwardings: 3, actions: 1 },
      }],
    };
  }
  return null;
});

async function withServer(pool, callback, { access = VALIDATED, profile = PROFILE } = {}) {
  const server = createApp({
    pool,
    secret: SECRET,
    institutionStatus: async () => {
      if (access instanceof Error) throw access;
      return access;
    },
    governmentProfile: async () => profile,
    dossierService: null,
    uploadStorage: null,
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const REPRESENTATIVE = 'Ana Representante';
const headers = (role = 'government', profileType = 'secretaria') => ({
  authorization: `Bearer ${jwt.sign({ userId: GOV, role, profileType, name: REPRESENTATIVE }, SECRET)}`,
  'content-type': 'application/json',
});
const send = (base, method, path, body, h = headers()) => fetch(`${base}${path}`, {
  method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
});

test('painel do governo: 401 sem token, 403 fora do Poder Público e sem validação', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', '/government/indicators', undefined, { 'content-type': 'application/json' })).status, 401);
    for (const [role, profileType] of [['agent', 'ong'], ['member', 'morador'], ['partner', 'empresa'], ['media', 'jornalista']]) {
      const res = await send(base, 'GET', '/government/indicators', undefined, headers(role, profileType));
      assert.equal(res.status, 403, profileType);
      assert.equal((await res.json()).code, 'not_government');
    }
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'GET', '/government/indicators');
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'institution_not_validated');
  }, { access: { kind: 'poder_publico', status: 'pendente', canActInstitutionally: false, organizationId: ORG } });
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', '/government/indicators')).status, 503);
  }, { access: new Error('user-service fora do ar') });
});

test('indicadores: os 10 números do slide 14, recorte do órgão e origem de cada número', async () => {
  await withServer(indicatorPool(), async (base) => {
    const res = await send(base, 'GET', '/government/indicators');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.organizationId, ORG);
    assert.equal(body.organization.name, 'Secretaria de Obras');
    assert.deepEqual(body.organization.competenceAreas, ['Obras', 'Iluminação']);
    assert.equal(body.scope, 'jurisdicao');
    assert.equal(body.period.key, '30d');
    assert.equal(body.indicators.demandas_recebidas, 12);
    assert.equal(body.indicators.demandas_urgentes, 3);
    assert.equal(body.indicators.demandas_encaminhadas, 2);
    assert.equal(body.indicators.demandas_em_execucao, 1);
    assert.equal(body.indicators.demandas_concluidas, 4);
    assert.equal(body.indicators.projetos_apoiados, 5);
    assert.equal(body.indicators.beneficiarios_alcancados, 900);
    assert.equal(body.indicators.resultados_registrados, 7);
    // As 5 categorias sempre aparecem, mesmo zeradas (tabela alternativa do gráfico).
    assert.equal(body.byCategory.length, 5);
    assert.equal(body.byCategory.find((c) => c.category === 'problema_urbano').total, 6);
    assert.equal(body.byTerritory[0].label, 'Centro');
    assert.ok(body.sources.demandas_recebidas);
    assert.ok(body.generatedAt);
    // Nenhuma conta, nome de pessoa ou contato sai do painel.
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes(GOV));
    assert.ok(!raw.includes(REPRESENTATIVE));
  });
});

test('recorte e período: filtro inválido é 422; a consulta usa a jurisdição e o intervalo', async () => {
  const pool = indicatorPool();
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', '/government/indicators?scope=tudo')).status, 422);
    assert.equal((await send(base, 'GET', '/government/indicators?period=ontem')).status, 422);
    assert.equal((await send(base, 'GET', '/government/indicators?category=inexistente')).status, 422);

    await send(base, 'GET', '/government/indicators?scope=competencia&period=7d&category=problema_urbano');
    const last = pool.calls[pool.calls.length - 1];
    assert.match(last.text, /ct\.organization_id = \$1/);
    assert.match(last.text, /d\.published_at >= \$4/);
    assert.ok(last.params.includes(ORG));
    assert.ok(last.params.some((p) => Array.isArray(p) && p.includes('problema_urbano')));
  });
  await withServer(pool, async (base) => {
    await send(base, 'GET', '/government/indicators?scope=todas');
    const last = pool.calls[pool.calls.length - 1];
    assert.doesNotMatch(last.text, /ct\.organization_id/);
  });
});

test('cache curto: a segunda leitura do mesmo recorte não repete a consulta', async () => {
  const pool = indicatorPool();
  await withServer(pool, async (base) => {
    const first = await (await send(base, 'GET', '/government/indicators?period=30d')).json();
    const before = pool.calls.length;
    const second = await (await send(base, 'GET', '/government/indicators?period=30d')).json();
    assert.equal(pool.calls.length, before, 'a segunda leitura veio do cache');
    assert.equal(second.cached, true);
    assert.equal(first.generatedAt, second.generatedAt);
    // Recorte diferente consulta de novo.
    await send(base, 'GET', '/government/indicators?period=7d');
    assert.ok(pool.calls.length > before);
  });
});

test('priorização de áreas: ordenada por urgência e espera, sem comparar órgãos', async () => {
  await withServer(indicatorPool(), async (base) => {
    const body = await (await send(base, 'GET', '/government/priority-areas')).json();
    assert.equal(body.territories[0].label, 'Centro');
    assert.equal(body.territories[0].withoutResponse, 5);
    assert.equal(body.territories[0].oldestWaitDays, 12.5);
    assert.ok(typeof body.territories[0].score === 'number');
    assert.equal(body.categories[0].label, 'problema_urbano');
    const raw = JSON.stringify(body);
    assert.ok(!/posicao|ranking|outros órgãos/i.test(raw));
  });
});

test('medição de impacto: resultados, beneficiários e apoios das demandas em que o órgão atuou', async () => {
  await withServer(indicatorPool(), async (base) => {
    const body = await (await send(base, 'GET', '/government/impact')).json();
    assert.equal(body.impact.demandsActedOn, 6);
    assert.equal(body.impact.accountabilityConcluded, 2);
    assert.equal(body.impact.beneficiariesReached, 900);
    assert.equal(body.impact.resultsRecorded, 7);
    assert.equal(body.impact.goalsAchieved, 5);
    assert.equal(body.impact.offers, 2);
    assert.equal(body.impact.supports, 4);
    assert.equal(body.impact.executedAmountCents, 1000000);
  });
});

test('exportação: CSV com BOM e PDF, sem dado pessoal; formato inválido é 422', async () => {
  await withServer(indicatorPool(), async (base) => {
    assert.equal((await send(base, 'GET', '/government/indicators/export?format=xlsx')).status, 422);

    const csvRes = await send(base, 'GET', '/government/indicators/export?format=csv');
    assert.equal(csvRes.status, 200);
    assert.match(csvRes.headers.get('content-type'), /text\/csv/);
    assert.match(csvRes.headers.get('content-disposition'), /dmconecta-indicadores-\d{4}-\d{2}-\d{2}\.csv/);
    // `text()` do fetch descarta a marca; a checagem é nos bytes enviados.
    const csvBytes = Buffer.from(await csvRes.arrayBuffer());
    assert.deepEqual([...csvBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
    const csv = csvBytes.toString('utf8');
    assert.ok(csv.includes('Demandas recebidas;12'));
    assert.ok(csv.includes('priorização de áreas'));
    assert.ok(csv.includes('Beneficiários alcançados;900'));
    assert.ok(!csv.includes(GOV));

    const pdfRes = await send(base, 'GET', '/government/indicators/export?format=pdf');
    assert.equal(pdfRes.status, 200);
    assert.match(pdfRes.headers.get('content-type'), /application\/pdf/);
    const pdf = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF');
    assert.ok(pdf.length > 1000);
  });
});

test('divulgação de ação: validação do corpo e recusa fora do Poder Público', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', '/government/actions', { kind: 'acao' });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.fields.title);
    assert.ok(body.fields.summary);

    const forbidden = await send(base, 'POST', '/government/actions', { kind: 'acao', title: 'x', summary: 'y' }, headers('agent', 'ong'));
    assert.equal(forbidden.status, 403);
  });
});

test('divulgação de ação do território: grava post `message` e o vínculo, sem demanda', async () => {
  const inserted = {};
  const pool = fakePool((text, params) => {
    if (/INSERT INTO posts/.test(text)) {
      inserted.post = { text, params };
      return { rows: [{ id: '11111111-1111-4111-8111-111111111111' }] };
    }
    if (/INSERT INTO government_actions/.test(text)) {
      inserted.action = { text, params };
      return {
        rows: [{
          id: '22222222-2222-4222-8222-222222222222', organization_id: ORG,
          organization_name: 'Secretaria de Obras', department: 'Zeladoria',
          post_id: '11111111-1111-4111-8111-111111111111', demand_id: null, response_id: null,
          kind: 'programa', title: 'Bairro Limpo', summary: 'Programa permanente.',
          program_name: 'Bairro Limpo', program_url: null, territory: 'Centro',
          municipality: 'Niterói', uf: 'RJ', starts_on: null, ends_on: null,
          author_name: REPRESENTATIVE, published_at: new Date('2026-09-22T12:00:00Z'),
        }],
      };
    }
    if (/SELECT[\s\S]*FROM government_actions/.test(text)) return { rows: [] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', '/government/actions', {
      kind: 'programa', title: 'Bairro Limpo', summary: 'Programa permanente.',
      programName: 'Bairro Limpo', territory: 'Centro',
    });
    assert.equal(res.status, 201);
    const action = await res.json();
    assert.equal(action.kind, 'programa');
    assert.equal(action.postId, '11111111-1111-4111-8111-111111111111');
    assert.equal(action.demandId, null);
    // Reusa o `message` do post_type (T13) e não toca em resposta institucional.
    assert.match(inserted.post.text, /'message'/);
    assert.ok(!pool.calls.some((c) => /INSERT INTO demand_institutional_responses/.test(c.text)));
    assert.equal(inserted.action.params[5], null); // demand_id
  });
});

test('ações públicas da demanda: 404 fora de demanda publicada, cache curto quando existe', async () => {
  const pool = fakePool((text) => {
    if (/FROM demands/.test(text) && /WHERE d\.id = \$1/.test(text)) {
      return { rows: [{ id: DEMAND, status: 'publicada', author_id: GOV }] };
    }
    if (/FROM government_actions/.test(text)) {
      return {
        rows: [{
          id: '22222222-2222-4222-8222-222222222222', organization_name: 'Secretaria de Obras',
          department: null, post_id: '11111111-1111-4111-8111-111111111111', demand_id: DEMAND,
          response_id: null, kind: 'acao', title: 'Mutirão', summary: 'Ação prevista.',
          program_name: null, program_url: null, territory: 'Centro', municipality: 'Niterói',
          uf: 'RJ', starts_on: null, ends_on: null, author_name: 'Rep',
          published_at: new Date('2026-09-22T12:00:00Z'),
        }],
      };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/demands/nao-uuid/government-actions`)).status, 404);
    const res = await fetch(`${base}/demands/${DEMAND}/government-actions`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age=60/);
    const body = await res.json();
    assert.equal(body.actions[0].title, 'Mutirão');
    // Rota pública: nada de conta nem de representante além do nome do órgão.
    assert.ok(!JSON.stringify(body).includes(GOV));
  });
});

test('baseClauses: cada recorte gera o filtro certo e nada de SQL vindo do usuário', () => {
  const period = { from: '2026-01-01T00:00:00.000Z', to: '2026-09-22T00:00:00.000Z' };
  const competencia = baseClauses({
    organizationId: ORG, profile: PROFILE,
    filters: { scope: 'competencia', period, categories: null, priorities: null, territory: null },
  });
  assert.ok(competencia.where.some((w) => /ct\.organization_id = \$1/.test(w)));

  const jurisdicao = baseClauses({
    organizationId: ORG, profile: PROFILE,
    filters: { scope: 'jurisdicao', period, categories: null, priorities: null, territory: "Centro' OR 1=1--" },
  });
  assert.ok(jurisdicao.where.some((w) => /d\.uf = \$/.test(w)));
  assert.ok(jurisdicao.where.some((w) => /lower\(btrim\(d\.municipality\)\)/.test(w)));
  assert.ok(jurisdicao.params.some((p) => typeof p === 'string' && p.includes("OR 1=1")));
  assert.ok(!jurisdicao.where.join(' ').includes('1=1'));

  const estadual = baseClauses({
    organizationId: ORG, profile: { ...PROFILE, governmentSphere: 'estadual' },
    filters: { scope: 'jurisdicao', period, categories: null, priorities: null, territory: null },
  });
  assert.ok(!estadual.where.some((w) => /municipality/.test(w)));

  const federal = baseClauses({
    organizationId: ORG, profile: { ...PROFILE, governmentSphere: 'federal' },
    filters: { scope: 'jurisdicao', period, categories: null, priorities: null, territory: null },
  });
  assert.ok(!federal.where.some((w) => /d\.uf/.test(w)));
});
