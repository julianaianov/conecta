const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { validateAccess, canSeeDocument } = require('../src/access/documents');

// Nível Institucional (T-05-18) com banco simulado; o ciclo contra PostgreSQL
// está em institutional-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const GOV = '55555555-5555-4555-8555-555555555555';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const ORG = '88888888-8888-4888-8888-888888888888';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DOC = 'abababab-abab-4bab-8bab-abababababab';
const DOC_RESTRICTED = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
const UPLOAD = '99999999-9999-4999-8999-999999999999';

const docRow = (id, level, restrictedTo = []) => ({
  id, demand_id: DEMAND, position: 0, document_type: 'orcamento', title: `Doc ${level}`, description: null,
  reference: `upload:${UPLOAD}`, access_level: level, restricted_to: restrictedTo,
});

function fakePool({ tracking = true } = {}) {
  const calls = [];
  const events = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/SELECT id, author_id, organization_id, status FROM demands WHERE id = \$1/.test(text)) {
      return { rows: params[0] === DEMAND ? [{ id: DEMAND, author_id: AGENT, organization_id: null, status: 'publicada' }] : [] };
    }
    if (/AS party,\s+EXISTS \(SELECT 1 FROM demand_interests/.test(text)) return { rows: [{ party: false, interested: false }] };
    if (/AS tracking/.test(text)) return { rows: [{ party: false, tracking }] };
    if (/WHERE d.demand_id = \$1 ORDER BY/.test(text)) return { rows: [docRow(DOC, 'institucional'), docRow(DOC_RESTRICTED, 'restrito')] };
    if (/WHERE d.id = \$1 AND d.demand_id = \$2/.test(text)) {
      return { rows: [docRow(DOC, 'institucional'), docRow(DOC_RESTRICTED, 'restrito')].filter((d) => d.id === params[0]) };
    }
    if (/FROM uploads WHERE id = ANY/.test(text)) {
      return {
        rows: [{
          id: UPLOAD, owner_id: AGENT, purpose: 'demand_document', status: 'confirmado', object_key: `demands/${DEMAND}/documents/${UPLOAD}.pdf`,
          content_type: 'application/pdf', size_bytes: '10', original_name: 'orcamento.pdf', demand_id: DEMAND,
        }],
      };
    }
    if (/INSERT INTO demand_events/.test(text)) {
      events.push(params);
      return { rows: [] };
    }
    if (/INSERT INTO demand_document_access/.test(text)) return { rows: [] };
    throw new Error(`Consulta inesperada: ${text}`);
  };
  return { calls, events, query, async connect() { return { query, release() {} }; } };
}

async function withServer(pool, callback) {
  const storage = { async presignGet({ key, expiresIn }) { return `https://s3.test/${key}?exp=${expiresIn}`; } };
  const server = createApp({
    pool, secret: SECRET, uploadStorage: storage, dossierService: null, operationUserIds: new Set(),
    institutionStatus: async (req) => (req.user.userId === GOV
      ? { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG }
      : { kind: null, status: null, canActInstitutionally: false, organizationId: null }),
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const headers = (userId, role, profileType) => ({
  authorization: `Bearer ${jwt.sign({ userId, role, profileType, name: 'Conta' }, SECRET)}`,
  'content-type': 'application/json',
});
const gov = headers(GOV, 'government', 'secretaria');
const call = (base, method, path, h, body) => fetch(`${base}${path}`, {
  method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
});

test('domínio: validação do nível e quem vê o restrito', () => {
  assert.deepEqual(validateAccess({ accessLevel: 'publico', restrictedTo: [GOV] }).value, { accessLevel: 'publico', restrictedTo: [] });
  assert.deepEqual(validateAccess({ accessLevel: 'restrito', restrictedTo: [GOV, GOV.toUpperCase()] }).value.restrictedTo, [GOV]);
  assert.ok(validateAccess({ accessLevel: 'secreto' }).errors.accessLevel);
  assert.ok(validateAccess({ accessLevel: 'restrito', restrictedTo: ['x'] }).errors.restrictedTo);
  const restricted = { access_level: 'restrito', restricted_to: [GOV] };
  assert.equal(canSeeDocument('orgao', restricted, GOV), true);
  assert.equal(canSeeDocument('orgao', restricted, STRANGER), false);
  assert.equal(canSeeDocument('autor', restricted, AGENT), true);
  assert.equal(canSeeDocument(null, { access_level: 'publico' }, STRANGER), false);
});

test('órgão com acompanhamento aberto lista e abre o institucional; restrito fica fora; abertura registrada', async () => {
  const pool = fakePool();
  await withServer(pool, async (base) => {
    const list = await call(base, 'GET', `/demands/${DEMAND}/documents`, gov);
    assert.equal(list.status, 200);
    const body = await list.json();
    assert.equal(body.role, 'orgao');
    assert.equal(body.canManage, false);
    assert.deepEqual(body.documents.map((d) => d.id), [DOC]);
    assert.ok(!('restrictedTo' in body.documents[0]));
    assert.equal(body.dossier, null);

    const open = await call(base, 'GET', `/demands/${DEMAND}/documents/${DOC}/open`, gov);
    assert.equal(open.status, 200);
    const link = await open.json();
    assert.equal(link.url, `https://s3.test/demands/${DEMAND}/documents/${UPLOAD}.pdf?exp=300`);
    assert.equal(link.fileName, 'orcamento.pdf');
    assert.equal((await call(base, 'GET', `/demands/${DEMAND}/documents/${DOC_RESTRICTED}/open`, gov)).status, 404);
    // Sem armazenamento do dossiê: 503.
    assert.equal((await call(base, 'GET', `/demands/${DEMAND}/dossie-integral`, gov)).status, 503);
    // O órgão não define o acesso.
    assert.equal((await call(base, 'PUT', `/demands/${DEMAND}/documents/${DOC}/access`, gov, { accessLevel: 'publico' })).status, 403);
  });
  assert.equal(pool.events.length, 1);
  assert.equal(pool.events[0][1], 'documento_consultado');
  assert.equal(pool.events[0][2], 'poder_publico');
  assert.equal(JSON.parse(pool.events[0][4]).organization_id, ORG);
});

test('sem relação com a demanda: 404 em tudo; autor define o acesso', async () => {
  await withServer(fakePool({ tracking: false }), async (base) => {
    for (const path of [`/demands/${DEMAND}/documents`, `/demands/${DEMAND}/documents/${DOC}/open`, `/demands/${DEMAND}/dossie-integral`]) {
      assert.equal((await call(base, 'GET', path, gov)).status, 404, path);
      assert.equal((await call(base, 'GET', path, headers(STRANGER, 'partner', 'empresa'))).status, 404, path);
    }
    assert.equal((await call(base, 'GET', `/demands/${DEMAND}/documents`)).status, 401);
  });
  const pool = fakePool();
  await withServer(pool, async (base) => {
    const author = headers(AGENT, 'agent', 'associacao');
    assert.equal((await call(base, 'PUT', `/demands/${DEMAND}/documents/${DOC}/access`, author, { accessLevel: 'x' })).status, 422);
    const saved = await call(base, 'PUT', `/demands/${DEMAND}/documents/${DOC}/access`, author, { accessLevel: 'restrito', restrictedTo: [GOV] });
    assert.equal(saved.status, 200);
    const insert = pool.calls.find((c) => /INSERT INTO demand_document_access/.test(c.text));
    assert.deepEqual(insert.params.slice(0, 4), [DOC, DEMAND, 'restrito', [GOV]]);
    const list = await (await call(base, 'GET', `/demands/${DEMAND}/documents`, author)).json();
    assert.equal(list.canManage, true);
    assert.equal(list.documents.length, 2, 'o autor vê também o restrito');
    // O autor abre sem registrar consulta.
    assert.equal((await call(base, 'GET', `/demands/${DEMAND}/documents/${DOC_RESTRICTED}/open`, author)).status, 200);
  });
  assert.equal(pool.events.length, 0);
});
