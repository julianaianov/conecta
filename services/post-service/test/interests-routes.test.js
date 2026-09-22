const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { opportunityQuery } = require('../src/routes/interests');

// Rotas de interesse e oportunidades (T15) com banco simulado: autenticação,
// permissões por categoria, gate do Poder Público e validação antes do banco.
// O ciclo completo contra PostgreSQL está em interest-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '22222222-2222-4222-8222-222222222222';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function noDbPool() {
  const fail = async (text) => { throw new Error(`Consulta inesperada: ${text}`); };
  return { query: fail, async connect() { return { query: fail, release() {} }; } };
}

async function withServer(callback, { access = { kind: null, status: null, canActInstitutionally: true, organizationId: null }, pool = noDbPool() } = {}) {
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => access, dossierService: null, uploadStorage: null,
    partnerProfile: { get: async () => null },
    connections: { create: async () => { throw new Error('não deveria chamar'); }, get: async () => null, update: async () => null },
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (role, profileType) => ({
  authorization: `Bearer ${jwt.sign({ userId: USER, role, profileType, name: 'Conta' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers = auth('partner', 'empresa')) => {
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('oportunidades: token, papel e filtros', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', '/demands/opportunities', undefined, {})).status, 401);
    for (const [role, profileType] of [['member', 'morador'], ['agent', 'ong'], ['media', 'imprensa']]) {
      const res = await send(base, 'GET', '/demands/opportunities', undefined, auth(role, profileType));
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'opportunities_not_allowed');
    }
    const bad = await send(base, 'GET', '/demands/opportunities?priority=maxima&uf=Rio&sort=preco&limit=99&offset=-1');
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['limit', 'offset', 'priority', 'sort', 'uf']);
  });
});

test('Poder Público sem validação não filtra oportunidades nem manifesta interesse', async () => {
  const access = { kind: 'poder_publico', status: 'em_analise', canActInstitutionally: false, organizationId: null };
  await withServer(async (base) => {
    const gov = auth('government', 'prefeitura');
    const opp = await send(base, 'GET', '/demands/opportunities', undefined, gov);
    assert.equal(opp.status, 403);
    assert.equal(opp.body.code, 'institution_not_validated');
    const interest = await send(base, 'POST', `/demands/${DEMAND}/interests`, { kind: 'apoio', offerTypes: ['recursos'] }, gov);
    assert.equal(interest.body.code, 'institution_not_validated');
  }, { access });
});

test('manifestar interesse: quem pode e validação antes do banco', async () => {
  await withServer(async (base) => {
    const media = await send(base, 'POST', `/demands/${DEMAND}/interests`, { kind: 'apoio', offerTypes: ['recursos'] }, auth('media', 'jornalista'));
    assert.equal(media.status, 403);
    assert.equal(media.body.code, 'interest_not_allowed');
    assert.equal((await send(base, 'POST', `/demands/${DEMAND}/interests`, {}, auth('agent', 'ong'))).body.code, 'interest_not_allowed');
    const empty = await send(base, 'POST', `/demands/${DEMAND}/interests`, { kind: 'apoio' });
    assert.equal(empty.status, 422);
    assert.ok(empty.body.fields.offerTypes);
    const member = await send(base, 'POST', `/demands/${DEMAND}/interests`, { kind: 'apoio', offerTypes: ['recursos'] }, auth('member', 'morador'));
    assert.ok(member.body.fields.kind);
    assert.equal((await send(base, 'POST', '/demands/nao-e-uuid/interests', { kind: 'apoio', offerTypes: ['recursos'] })).status, 404);
    assert.equal((await send(base, 'GET', '/demands/nao-e-uuid/interests/summary', undefined, {})).status, 404);
  });
});

test('rotas do Agente exigem Agente', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', `/demands/mine/${DEMAND}/interests`)).body.code, 'demand_author_not_agent');
    assert.equal((await send(base, 'POST', `/demands/mine/${DEMAND}/connections/${DEMAND}/accept`)).status, 403);
    assert.equal((await send(base, 'POST', `/demands/mine/${DEMAND}/connections/${DEMAND}/decline`, undefined, auth('member', 'morador'))).status, 403);
  });
});

test('resumo público só com contagens', async () => {
  const pool = {
    async query(text, params) {
      if (text.includes('FROM demands d WHERE d.id = $1')) {
        assert.equal(params[0], DEMAND);
        return { rows: [{ id: DEMAND, author_id: USER, title: 'x', status: 'publicada' }] };
      }
      if (text.includes('FROM demand_interests WHERE demand_id = $1')) {
        return { rows: [{ apoio: 2, participacao: 1, voluntariado: 0, conexoes_aceitas: 1 }] };
      }
      throw new Error(`Consulta inesperada: ${text}`);
    },
  };
  await withServer(async (base) => {
    const res = await send(base, 'GET', `/demands/${DEMAND}/interests/summary`, undefined, {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { apoio: 2, participacao: 1, voluntariado: 0, acceptedConnections: 1 });
  }, { pool });
});

test('opportunityQuery: parâmetros, recurso necessário e faixa de valor', () => {
  const q = opportunityQuery({
    category: 'projeto_social', resourceType: 'materiais,servicos', minTotalCents: '100', maxTotalCents: '5000', q: 'praça',
  });
  assert.deepEqual(q.params[0], ['publicada', 'em_busca_de_parceiro']);
  assert.deepEqual(q.params[2], ['materiais', 'servicos']);
  assert.match(q.sql, /r\.kind = 'necessario'/);
  assert.match(q.sql, /d\.total_amount_cents >= \$\d+/);
  assert.match(q.sql, /d\.title ILIKE \$(\d+) ESCAPE '\\' OR d\.description ILIKE \$\1/);
  assert.equal(q.sort, 'compatibilidade');
  assert.equal(q.params[q.params.length - 1], 500);
  assert.throws(() => opportunityQuery({ status: 'concluida' }), (err) => err.status === 422);
  assert.throws(() => opportunityQuery({ minTotalCents: '1.5' }), (err) => err.status === 422);
});
