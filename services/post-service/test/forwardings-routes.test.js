const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Rotas dos encaminhamentos (T14) com banco simulado. O ciclo completo contra
// PostgreSQL está em forwarding-e2e.test.js (npm run test:e2e).

const SECRET = 'post-service-test-secret-0123456789abcdef';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG = '88888888-8888-4888-8888-888888888888';
const OTHER_ORG = '99999999-9999-4999-8999-999999999999';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const FORWARDING = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const VALIDATED = { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG };
const PROFILE = {
  name: 'Secretaria de Obras', governmentSphere: 'municipal', department: null, competenceAreas: [],
  territory: null, municipality: 'Niterói', uf: 'RJ',
};

function fakePool(handler = () => null) {
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

async function withServer(pool, callback, { directory = null, access = VALIDATED } = {}) {
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => access, governmentProfile: async () => PROFILE,
    governmentDirectory: directory, dossierService: null, uploadStorage: null,
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const headers = (role = 'government', profileType = 'secretaria') => ({
  authorization: `Bearer ${jwt.sign({ userId: GOV, role, profileType, name: 'Rep' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = (base, method, path, body, h = headers()) => fetch(`${base}${path}`, {
  method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
});

test('encaminhamentos: gate do Poder Público validado e 422 por campo antes de tocar no banco', async () => {
  const pool = fakePool();
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'POST', `/institutional/demands/${DEMAND}/forwardings`, {}, { 'content-type': 'application/json' })).status, 401);
    const agent = await send(base, 'POST', `/institutional/demands/${DEMAND}/forwardings`, {}, headers('agent', 'ong'));
    assert.equal((await agent.json()).code, 'not_government');
    const invalid = await send(base, 'POST', `/institutional/demands/${DEMAND}/forwardings`, { destinationKind: 'orgao_plataforma' });
    assert.equal(invalid.status, 422);
    assert.deepEqual(Object.keys((await invalid.json()).fields).sort(), ['destinationOrganizationId', 'reason']);
    const self = await send(base, 'POST', `/institutional/demands/${DEMAND}/forwardings`, {
      destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG, reason: 'x',
    });
    assert.equal(self.status, 422);
    assert.ok((await self.json()).fields.destinationOrganizationId);
    const status = await send(base, 'POST', `/institutional/forwardings/${FORWARDING}/status`, { status: 'devolvido' });
    assert.equal(status.status, 422);
    assert.ok((await status.json()).fields.note);
    assert.equal((await send(base, 'POST', `/institutional/forwardings/${FORWARDING}/updates`, { kind: 'status' })).status, 422);
    assert.equal((await send(base, 'GET', '/institutional/forwardings/nao-e-uuid')).status, 404);
    assert.equal((await send(base, 'GET', '/institutional/forwardings?direction=todos')).status, 422);
    assert.equal((await send(base, 'GET', '/institutional/organizations?sphere=distrital')).status, 422);
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/institutional/forwardings/${FORWARDING}/updates`, { kind: 'providencia', body: 'x' });
    assert.equal((await res.json()).code, 'institution_not_validated');
  }, { access: { kind: 'poder_publico', status: 'em_analise', canActInstitutionally: false, organizationId: null } });
  assert.equal(pool.calls.length, 0);
});

test('diretório indisponível: 503 sem gravar nada; o próprio órgão fica fora da busca', async () => {
  const pool = fakePool();
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/institutional/demands/${DEMAND}/forwardings`, {
      destinationKind: 'orgao_plataforma', destinationOrganizationId: OTHER_ORG, reason: 'Competência de outro órgão',
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'directory_unavailable');
    assert.equal((await send(base, 'GET', '/institutional/organizations?q=obras')).status, 503);
  });
  const directory = {
    search: async () => [{ organizationId: ORG, name: 'Eu' }, { organizationId: OTHER_ORG, name: 'Outro' }],
    byId: async () => { throw new Error('timeout'); },
  };
  await withServer(pool, async (base) => {
    const found = await (await send(base, 'GET', '/institutional/organizations?q=o')).json();
    assert.deepEqual(found.organizations.map((o) => o.organizationId), [OTHER_ORG]);
    const res = await send(base, 'POST', `/institutional/demands/${DEMAND}/forwardings`, {
      destinationKind: 'orgao_plataforma', destinationOrganizationId: OTHER_ORG, reason: 'x',
    });
    assert.equal(res.status, 503);
  }, { directory });
  assert.equal(pool.calls.length, 0);
});

test('status: só o órgão que responde pelo encaminhamento muda; transição recusada desfaz a transação', async () => {
  const row = (overrides) => ({
    id: FORWARDING, track_id: 't', demand_id: DEMAND, organization_id: ORG, origin_organization_name: 'Secretaria de Obras',
    destination_kind: 'orgao_plataforma', destination_organization_id: OTHER_ORG, destination_track_id: 't2',
    destination_organization_name: 'Outro', reason: 'x', forwarded_by: GOV, status: 'enviado',
    status_changed_at: new Date(), forwarded_at: new Date(), ...overrides,
  });
  let current = row();
  const pool = fakePool((text) => (/FROM demand_forwardings f\s+JOIN demands d/.test(text) ? { rows: [current] } : null));
  await withServer(pool, async (base) => {
    const forbidden = await send(base, 'POST', `/institutional/forwardings/${FORWARDING}/status`, { status: 'aceito' });
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).code, 'forwarding_forbidden');
    current = row({ destination_kind: 'orgao_externo', destination_organization_id: null, status: 'aceito' });
    const late = await send(base, 'POST', `/institutional/forwardings/${FORWARDING}/status`, { status: 'devolvido', note: 'x' });
    assert.equal(late.status, 409);
    assert.equal((await late.json()).code, 'invalid_transition');
  });
  assert.ok(pool.calls.some(({ text }) => text === 'ROLLBACK'));
  assert.ok(!pool.calls.some(({ text }) => /^\s*UPDATE/.test(text)));
});
