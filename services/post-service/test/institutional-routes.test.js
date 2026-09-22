const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { governmentListQuery } = require('../src/routes/institutional');

// Rotas da atuação institucional (T13) com banco simulado. O ciclo completo
// contra PostgreSQL está em institutional-e2e.test.js (npm run test:e2e).

const SECRET = 'post-service-test-secret-0123456789abcdef';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG = '88888888-8888-4888-8888-888888888888';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const TRACK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const VALIDATED = { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG };
const PROFILE = {
  name: 'Secretaria de Obras', governmentSphere: 'municipal', department: null, competenceAreas: [],
  territory: null, municipality: 'Niterói', uf: 'RJ',
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

async function withServer(pool, callback, { access = VALIDATED, profile = PROFILE } = {}) {
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => {
      if (access instanceof Error) throw access;
      return access;
    },
    governmentProfile: async () => profile, dossierService: null, uploadStorage: null,
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

const trackRow = (overrides = {}) => ({
  id: TRACK, demand_id: DEMAND, organization_id: ORG, organization_name: 'Secretaria de Obras',
  government_sphere: 'municipal', department: null, municipality: 'Niterói', uf: 'RJ', opened_by: GOV,
  opened_by_name: 'Rep', status: 'recebida', status_note: null, status_changed_by: GOV,
  responsible_name: null, responsible_role: null, received_at: new Date(), status_changed_at: new Date(),
  concluded_at: null, created_at: new Date(), updated_at: new Date(), ...overrides,
});

test('área institucional: 401 sem token, 403 fora do Poder Público ou sem validação, 503 sem confirmação', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', '/institutional/demands', undefined, { 'content-type': 'application/json' })).status, 401);
    for (const [role, profileType] of [['agent', 'ong'], ['member', 'morador'], ['partner', 'empresa'], ['media', 'jornalista']]) {
      const res = await send(base, 'GET', '/institutional/demands', undefined, headers(role, profileType));
      assert.equal(res.status, 403, profileType);
      assert.equal((await res.json()).code, 'not_government');
    }
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/institutional/demands/${DEMAND}/track`);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'institution_not_validated');
  }, { access: { kind: 'poder_publico', status: 'devolvida', canActInstitutionally: false, organizationId: ORG } });
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', '/institutional/me')).status, 503);
  }, { access: new Error('user-service fora') });
  assert.equal(pool.calls.length, 0);
});

test('entradas inválidas: 422 por campo antes de tocar no banco; id malformado é 404', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const response = await send(base, 'POST', `/institutional/demands/${DEMAND}/responses`, { type: 'x' });
    assert.equal(response.status, 422);
    assert.deepEqual(Object.keys((await response.json()).fields).sort(), ['body', 'type']);
    const status = await send(base, 'POST', `/institutional/demands/${DEMAND}/status`, { status: 'encaminhada_ao_orgao_responsavel' });
    assert.equal(status.status, 422);
    assert.ok((await status.json()).fields.note);
    const offer = await send(base, 'POST', `/institutional/demands/${DEMAND}/offers`, { supportTypes: [] });
    assert.equal(offer.status, 422);
    assert.equal((await send(base, 'GET', '/institutional/demands/nao-e-uuid')).status, 404);
    assert.equal((await send(base, 'GET', '/demands/nao-e-uuid/institutional', undefined, {})).status, 404);
    assert.equal((await send(base, 'GET', '/institutional/demands?scope=estado')).status, 422);
  });
  assert.equal(pool.calls.length, 0);
});

test('mudança de status fora da máquina: 409 e transação desfeita, sem UPDATE', async () => {
  const pool = fakePool((text) => {
    if (/FROM demands d\s+WHERE d.id = \$1 AND d.status = ANY/.test(text)) return { rows: [{ id: DEMAND, status: 'publicada' }] };
    if (/FROM demand_institutional_tracks t\s+WHERE t.demand_id = \$1 AND t.organization_id = \$2 FOR UPDATE/.test(text)) {
      return { rows: [trackRow()] };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/institutional/demands/${DEMAND}/status`, { status: 'concluida' });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'invalid_transition');
  });
  assert.ok(pool.calls.some(({ text }) => text === 'ROLLBACK'));
  assert.ok(!pool.calls.some(({ text }) => /^\s*UPDATE/.test(text)));
});

test('órgão sem identificação pública: 403 (cadastro não validado no user-service)', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await send(base, 'POST', `/institutional/demands/${DEMAND}/track`);
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'institution_not_validated');
  }, { profile: null });
});

test('rota pública: demanda fora do público é 404; projeção sem representante', async () => {
  let open = false;
  const pool = fakePool((text) => {
    if (/FROM demands d\s+WHERE d.id = \$1 AND d.status = ANY/.test(text)) return { rows: open ? [{ id: DEMAND }] : [] };
    if (/FROM demand_institutional_tracks t\s+WHERE t.demand_id = \$1 ORDER BY/.test(text)) return { rows: [trackRow({ responsible_name: 'Ana' })] };
    if (/FROM demand_institutional_responses r/.test(text)) {
      return { rows: [{ id: 'r1', track_id: TRACK, organization_name: 'Secretaria de Obras', response_type: 'recebimento', body: 'Recebida', track_status: 'recebida', author_id: GOV, author_name: 'Rep', created_at: new Date() }] };
    }
    if (/FROM demand_institutional_offers o/.test(text)) return { rows: [] };
    return null;
  });
  await withServer(pool, async (base) => {
    assert.equal((await send(base, 'GET', `/demands/${DEMAND}/institutional`, undefined, {})).status, 404);
    open = true;
    const res = await send(base, 'GET', `/demands/${DEMAND}/institutional`, undefined, {});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.organizations[0].organizationName, 'Secretaria de Obras');
    assert.ok(!('responsibleName' in body.organizations[0]) && !('openedBy' in body.organizations[0]));
    assert.ok(!('authorId' in body.responses[0]) && !('authorName' in body.responses[0]));
  });
});

test('lista: recorte pela esfera do órgão e filtro "sem acompanhamento"', () => {
  const municipal = governmentListQuery({ institutionalStatus: 'sem_acompanhamento,recebida' }, ORG, PROFILE);
  assert.match(municipal.sql, /t.id IS NULL OR t.status = ANY/);
  assert.match(municipal.sql, /lower\(btrim\(d.municipality\)\) = lower\(btrim\(\$\d+\)\)/);
  assert.ok(municipal.params.includes('Niterói') && municipal.params.includes('RJ'));
  const state = governmentListQuery({}, ORG, { ...PROFILE, governmentSphere: 'estadual' });
  assert.doesNotMatch(state.sql, /lower\(btrim\(d.municipality/);
  assert.ok(state.params.includes('RJ'));
  const federal = governmentListQuery({}, ORG, { ...PROFILE, governmentSphere: 'federal' });
  assert.doesNotMatch(federal.sql, /d.uf = \$/);
  const all = governmentListQuery({ scope: 'todas' }, ORG, PROFILE);
  assert.ok(!all.params.includes('Niterói'));
  assert.equal(all.scope, 'todas');
  // Neutralidade: ordem cronológica da publicação, nunca por órgão ou contagem.
  assert.match(all.sql, /ORDER BY d.published_at DESC, d.id DESC/);
});
