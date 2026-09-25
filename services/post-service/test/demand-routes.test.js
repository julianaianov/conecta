const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { mapDbError } = require('../src/demand/store');
const { PUBLIC_STATUSES } = require('../src/demand/constants');

// Rotas da demanda (T07) com banco simulado. O ciclo completo contra
// PostgreSQL está em demand-e2e.test.js (npm run test:e2e).

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const POST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const VALIDATED = { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG };
const PENDING = { kind: 'agente_transformacao', status: 'em_analise', canActInstitutionally: false, organizationId: null };

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
    const result = await handler(text, params);
    if (!result) throw new Error(`Consulta inesperada: ${text}`);
    return result;
  };
  return {
    calls,
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

async function withServer(pool, callback, access = VALIDATED) {
  const server = createApp({ pool, secret: SECRET, institutionStatus: async () => access }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function headers(userId = AGENT, role = 'agent', profileType = 'associacao') {
  return {
    authorization: `Bearer ${jwt.sign({ userId, role, profileType, name: 'Ana' }, SECRET)}`,
    'content-type': 'application/json',
  };
}

const send = (base, method, path, body, h = headers()) => fetch(`${base}${path}`, {
  method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
});

function demandRow(overrides = {}) {
  return {
    id: DEMAND,
    author_id: AGENT,
    status: 'em_analise',
    review_state: 'rascunho',
    budget_amount_cents: '0',
    agent_fee_bps: 400,
    platform_fee_bps: 600,
    agent_fee_cents: '0',
    platform_fee_cents: '0',
    total_amount_cents: '0',
    has_physical_execution: true,
    created_at: new Date('2026-09-22T12:00:00Z'),
    updated_at: new Date('2026-09-22T12:00:00Z'),
    ...overrides,
  };
}

test('só Agente de Transformação cria demanda; sem token é 401', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'POST', '/demands', {}, { 'content-type': 'application/json' })).status, 401);
    for (const [role, profileType] of [['member', 'morador'], ['partner', 'empresa'], ['government', 'prefeitura'], ['media', 'jornalista']]) {
      const res = await send(base, 'POST', '/demands', { title: 'x' }, headers(AGENT, role, profileType));
      assert.equal(res.status, 403, profileType);
      assert.equal((await res.json()).code, 'demand_author_not_agent');
    }
  });
  assert.equal(pool.calls.length, 0);
});

test('rascunho inválido: 422 com erros por campo, sem tocar no banco', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', '/demands', {
      category: 'festa', cep: '123', uf: 'XX', photoRef: 'http://inseguro', latitude: 10,
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, 'validation_failed');
    for (const field of ['category', 'cep', 'uf', 'photoRef', 'latitude']) assert.ok(body.fields[field], field);
  });
  assert.equal(pool.calls.length, 0);
});

test('id malformado é 404; demanda de outra conta é 404 (não revela)', async () => {
  const pool = fakePool((text) => (/FROM demands d WHERE d.id = \$1/.test(text)
    ? { rows: [demandRow({ author_id: OTHER })] } : null));
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', '/demands/mine/nao-e-uuid')).status, 404);
    assert.equal((await send(base, 'GET', '/demands/nao-e-uuid', undefined, {})).status, 404);
    assert.equal((await send(base, 'GET', `/demands/mine/${DEMAND}`)).status, 404);
    assert.equal((await send(base, 'PUT', `/demands/${DEMAND}`, { title: 'x' })).status, 404);
  });
  assert.ok(!pool.calls.some(({ text }) => text.startsWith('UPDATE')));
});

test('editar fora de rascunho/devolvida: 409 demand_not_editable, em transação desfeita', async () => {
  const pool = fakePool((text) => (/FOR UPDATE OF d/.test(text)
    ? { rows: [demandRow({ review_state: 'aguardando_analise' })] } : null));
  await withServer(pool, async (base) => {
    const put = await send(base, 'PUT', `/demands/${DEMAND}`, { title: 'Mudança' });
    assert.equal(put.status, 409);
    assert.equal((await put.json()).code, 'demand_not_editable');
    const item = await send(base, 'POST', `/demands/${DEMAND}/goals`, {
      goal: 'a', expectedResult: 'b', indicator: 'c', measurementMethod: 'd',
    });
    assert.equal(item.status, 409);
  });
  const texts = pool.calls.map(({ text }) => text);
  assert.ok(texts.includes('ROLLBACK'));
  assert.ok(!texts.includes('COMMIT'));
  assert.ok(!texts.some((t) => /^\s*(UPDATE|INSERT)/.test(t)));
});

test('item inválido: 422 com o campo sem o prefixo da lista', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/demands/${DEMAND}/budget-items`, {
      description: '', quantity: 0, unit: 'un', unitPriceCents: -1, scheduleItemId: 'x',
    });
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    assert.ok(fields.description && fields.quantity && fields.unitPriceCents && fields.scheduleItemId);
    const kind = await send(base, 'POST', `/demands/${DEMAND}/resources`, { kind: 'contrapartida', type: 'mao_de_obra' });
    assert.ok((await kind.json()).fields.type);
  });
  assert.equal(pool.calls.length, 0);
});

test('enviar exige instituição validada: 403 institution_not_validated antes do banco', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/demands/${DEMAND}/submit`);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'institution_not_validated');
    assert.equal(body.validationStatus, 'em_analise');
    assert.equal((await send(base, 'POST', `/demands/${DEMAND}/transitions`, { action: 'concluir' })).status, 403);
  }, PENDING);
  assert.equal(pool.calls.length, 0);
});

test('enviar incompleto: 422 demand_incomplete com os campos pendentes', async () => {
  const pool = fakePool((text) => {
    if (/FOR UPDATE OF d/.test(text)) return { rows: [demandRow({ title: 'Só título' })] };
    if (/FROM demand_/.test(text)) return { rows: [] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/demands/${DEMAND}/submit`);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, 'demand_incomplete');
    for (const field of ['category', 'photoRef', 'cep', 'budgetItems', 'scheduleItems', 'goals']) assert.ok(body.fields[field], field);
  });
  assert.ok(!pool.calls.some(({ text }) => /review_state = 'aguardando_analise'/.test(text)));
});

test('transição fora da ordem: 409; ação da gestão: 403; desconhecida: 422', async () => {
  const pool = fakePool((text) => (/FOR UPDATE OF d/.test(text)
    ? { rows: [demandRow({ status: 'publicada', review_state: 'aprovada' })] } : null));
  await withServer(pool, async (base) => {
    const early = await send(base, 'POST', `/demands/${DEMAND}/transitions`, { action: 'concluir' });
    assert.equal(early.status, 409);
    assert.equal((await early.json()).code, 'invalid_transition');
    assert.equal((await send(base, 'POST', `/demands/${DEMAND}/transitions`, { action: 'arquivar' })).status, 403);
    const unknown = await send(base, 'POST', `/demands/${DEMAND}/transitions`, { action: 'voar' });
    assert.equal(unknown.status, 422);
    assert.ok((await unknown.json()).fields.action);
  });
  assert.ok(!pool.calls.some(({ text }) => text.startsWith('UPDATE')));
});

test('lista pública: só status públicos, filtros parametrizados e keyset', async () => {
  const pool = fakePool((text) => (/FROM demands d/.test(text) ? { rows: [] } : null));
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/demands?category=projeto_social,problema_urgente&priority=alta&territory=50%25_off&q=horta&bbox=-44,-23.5,-43,-22.5&limit=5`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { demands: [], nextCursor: null });
  });
  const { text, params } = pool.calls[0];
  assert.match(text, /d\.status = ANY\(\$1::demand_status\[\]\)/);
  assert.deepEqual(params[0], PUBLIC_STATUSES);
  assert.match(text, /ORDER BY d\.published_at DESC, d\.id DESC/);
  assert.ok(params.includes('%50\\%\\_off%'), 'curinga do LIKE escapado');
  assert.equal(params[params.length - 1], 6);
  assert.ok(!/review_note|reviewed_by|organization_id|d\.cep|d\.street/.test(text));
});

test('lista pública: filtro inválido é 422 com campos', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/demands?status=em_analise,arquivada&bbox=a,b&cursor=lixo&limit=500&uf=Rio`);
    assert.equal(res.status, 422);
    const { fields } = await res.json();
    for (const field of ['status', 'bbox', 'cursor', 'limit', 'uf']) assert.ok(fields[field], field);
  });
  assert.equal(pool.calls.length, 0);
});

test('detalhe e linha do tempo públicos: 404 fora do público, projeção sem dados privados', async () => {
  const pool = fakePool((text) => {
    if (/FROM demands/.test(text)) return { rows: [] };
    return null;
  });
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/demands/${DEMAND}`)).status, 404);
    assert.equal((await fetch(`${base}/demands/${DEMAND}/timeline`)).status, 404);
  });
  const detail = pool.calls[0];
  assert.match(detail.text, /d\.status = ANY\(\$2::demand_status\[\]\)/);
  assert.deepEqual(detail.params[1], PUBLIC_STATUSES);
  assert.ok(!/review_note|organization_id|d\.cep|d\.street|address_number/.test(detail.text));
});

test('post-vitrine: editar e excluir respondem 409 com o id da demanda', async () => {
  const pool = fakePool((text) => {
    if (text.includes('SELECT author_id, demand_id FROM posts')) return { rows: [{ author_id: AGENT, demand_id: DEMAND }] };
    return null;
  });
  await withServer(pool, async (base) => {
    for (const method of ['PUT', 'DELETE']) {
      const res = await send(base, method, `/${POST_ID}`, method === 'PUT' ? { title: 'x' } : undefined);
      assert.equal(res.status, 409, method);
      assert.deepEqual(await res.json(), {
        error: 'Este post é a vitrine de uma demanda: o conteúdo é mantido pela demanda',
        code: 'demand_showcase',
        demandId: DEMAND,
      });
    }
    // Outra conta: 403 antes do conflito.
    assert.equal((await send(base, 'PUT', `/${POST_ID}`, { title: 'x' }, headers(OTHER))).status, 403);
  });
  assert.ok(!pool.calls.some(({ text }) => text.startsWith('UPDATE posts')));
});

test('corrida com a publicação: o trigger do post-vitrine vira 409, não 500', async () => {
  const pool = fakePool((text) => {
    if (text.includes('SELECT author_id, demand_id FROM posts')) return { rows: [{ author_id: AGENT, demand_id: null }] };
    if (text.includes('UPDATE posts')) {
      throw Object.assign(new Error('post-vitrine de demanda: o conteúdo vem da demanda'), { code: '23514' });
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'PUT', `/${POST_ID}`, { title: 'x' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'demand_showcase');
  });
});

test('feed expõe demand_id na projeção pública', async () => {
  const { POST_PUBLIC_COLUMNS } = require('../src/routes/posts');
  assert.ok(POST_PUBLIC_COLUMNS.includes('demand_id'));
  assert.ok(!POST_PUBLIC_COLUMNS.includes('zipcode'));
});

test('erros do banco: estado → 409, dado → 422, desconhecido → 500', () => {
  const pg = (code, message) => Object.assign(new Error(message), { code });
  assert.equal(mapDbError(pg('23514', 'a demanda só é editada em rascunho ou devolvida (estado: publicada/aprovada)')).status, 409);
  assert.equal(mapDbError(pg('23514', 'demand_goals só muda com a demanda em rascunho ou devolvida')).status, 409);
  assert.equal(mapDbError(pg('23514', 'transição não permitida (agente): publicada/aprovada → concluida/aprovada')).status, 409);
  assert.equal(mapDbError(pg('23514', 'demanda incompleta para envio: cep')).body.code, 'demand_incomplete');
  assert.equal(mapDbError(pg('42501', 'demandas não são excluídas')).status, 409);
  assert.equal(mapDbError(pg('23503', 'fk')).status, 422);
  assert.equal(mapDbError(new Error('rede')), null);
});

test('módulo (T-05-08): PUT grava moduleDetails como JSONB; leitura traz o módulo derivado da categoria', async () => {
  let details = {};
  let update = null;
  const pool = fakePool((text, params) => {
    if (/^\s*UPDATE demands SET/.test(text)) {
      update = { text, params };
      details = params[1];
      return { rows: [], rowCount: 1 };
    }
    if (/FROM demands d WHERE d.id = \$1/.test(text)) {
      return { rows: [demandRow({ category: 'recuperacao_ambiental', module_details: details })] };
    }
    return { rows: [] };
  });
  await withServer(pool, async (base) => {
    const bad = await send(base, 'PUT', `/demands/${DEMAND}`, { moduleDetails: { area_m2: 'muito', cor: 'azul' } });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys((await bad.json()).fields).sort(), ['moduleDetails.area_m2', 'moduleDetails.cor']);

    const res = await send(base, 'PUT', `/demands/${DEMAND}`, {
      moduleDetails: { area_m2: 800, diagnostico: 'Duna sem vegetação', responsavel_tecnico: { nome: 'Ana', registro: 'CRBio 1' } },
    });
    assert.equal(res.status, 200, await res.clone().text());
    const body = await res.json();
    assert.equal(body.module, 'ambiental');
    assert.equal(body.moduleLabel, 'Módulo Ambiental');
    assert.deepEqual(body.moduleDetails, {
      area_m2: 800, diagnostico: 'Duna sem vegetação', responsavel_tecnico: { nome: 'Ana', registro: 'CRBio 1' },
    });
  });
  assert.match(update.text, /module_details = \$2/);
});
