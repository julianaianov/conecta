const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Respostas à análise (T-05-05) com banco simulado: quem pode pedir,
// validação antes do banco (recusa sem motivo é 422), autor não pede e o
// Agente responde. O ciclo contra PostgreSQL está em analysis-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const GOV = '44444444-4444-4444-8444-444444444444';
const ORG = '55555555-5555-4555-8555-555555555555';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const REQUEST = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function fakePool({ demandStatus = 'publicada', author = AGENT } = {}) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || /set_config/.test(text)) return { rows: [] };
    if (/SELECT id, author_id, title, status::text AS status FROM demands/.test(text)) {
      return { rows: [{ id: DEMAND, author_id: author, title: 'Praça', status: demandStatus }] };
    }
    if (/FROM connection_processes\s+WHERE demand_id = \$1 AND closed_at IS NULL/.test(text)) return { rows: [] };
    if (/FROM demand_institutional_tracks WHERE demand_id/.test(text)) return { rows: [{ organization_name: 'Secretaria' }] };
    if (/INSERT INTO demand_analysis_requests/.test(text)) return { rows: [{ id: REQUEST }] };
    if (/notification_create/.test(text)) return { rows: [{ id: 'n1' }] };
    if (/FROM demand_analysis_requests r/.test(text)) {
      return {
        rows: [{
          id: REQUEST, demand_id: DEMAND, kind: 'documentos', body: 'Projeto', requested_document_types: ['projetos_tecnicos'],
          requester_category: 'parceiro', requester_user_id: PARTNER, requester_name: 'Construtora', status: 'aberta',
          answer_document_ids: [], created_at: new Date(),
        }],
      };
    }
    if (/FROM demands d WHERE d\.id = \$1/.test(text)) return { rows: [{ id: DEMAND, author_id: AGENT, title: 'Praça', status: demandStatus }] };
    throw new Error(`Consulta inesperada: ${text}`);
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

async function withServer(callback, { pool = fakePool() } = {}) {
  const server = createApp({
    pool, secret: SECRET, dossierService: null, uploadStorage: null,
    institutionStatus: async (req) => (req.user.userId === GOV
      ? { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG }
      : req.user.userId === AGENT
        ? { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
        : { kind: null, status: null, canActInstitutionally: true, organizationId: null }),
    partnerProfile: { get: async () => null },
    connections: { create: async () => null, get: async () => null, update: async () => null },
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (userId, role, profileType) => ({
  authorization: `Bearer ${jwt.sign({ userId, role, profileType, name: 'Conta' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers) => {
  const res = await fetch(`${base}${path}`, { method, headers: headers ?? { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const url = `/demands/${DEMAND}/analysis-requests`;

test('solicitação: token, papel e validação antes do banco', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', url, { kind: 'reuniao', body: 'x' })).status, 401);
    const member = await send(base, 'POST', url, { kind: 'reuniao', body: 'x' }, auth(MEMBER, 'member', 'morador'));
    assert.equal(member.status, 403);
    assert.equal(member.body.code, 'analysis_request_forbidden');
    const refusal = await send(base, 'POST', url, { kind: 'recusa' }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(refusal.status, 422, 'recusa sem motivo');
    assert.ok(refusal.body.fields.body);
    const docs = await send(base, 'POST', url, { kind: 'documentos', body: 'Precisamos' }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(docs.status, 422);
    assert.ok(docs.body.fields.requestedDocumentTypes);
    assert.ok(!pool.calls.some((c) => /INSERT INTO demand_analysis_requests/.test(c.text)), 'nada gravado');
  }, { pool });
});

test('Parceiro solicita documentos: grava, avisa o Agente com "Solicitação de análise"', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const res = await send(base, 'POST', url, {
      kind: 'documentos', body: 'Envie o projeto técnico', requestedDocumentTypes: ['projetos_tecnicos'],
    }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.request.kind, 'documentos');
    assert.ok(!('requesterName' in res.body.request), 'quem pediu não vê o próprio nome replicado');
    const insert = pool.calls.find((c) => /INSERT INTO demand_analysis_requests/.test(c.text));
    assert.equal(insert.params[3], PARTNER);
    assert.equal(insert.params[5], 'parceiro');
    const notice = pool.calls.find((c) => /notification_create/.test(c.text));
    assert.equal(notice.params[0], AGENT);
    assert.equal(notice.params[1], 'solicitacao_de_analise');
  }, { pool });
});

test('Poder Público validado pede pelo órgão; autor não pede; demanda fechada é 409', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const gov = await send(base, 'POST', url, { kind: 'analise_tecnica', body: 'Parecer da engenharia' }, auth(GOV, 'government', 'secretaria'));
    assert.equal(gov.status, 201, JSON.stringify(gov.body));
    const insert = pool.calls.find((c) => /INSERT INTO demand_analysis_requests/.test(c.text));
    assert.equal(insert.params[5], 'poder_publico');
    assert.equal(insert.params[7], ORG);
  }, { pool });
  await withServer(async (base) => {
    const own = await send(base, 'POST', url, { kind: 'reuniao', body: 'x' }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(own.status, 403);
    assert.equal(own.body.code, 'own_demand');
  }, { pool: fakePool({ author: PARTNER }) });
  await withServer(async (base) => {
    const closed = await send(base, 'POST', url, { kind: 'reuniao', body: 'x' }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(closed.status, 409);
    assert.equal(closed.body.code, 'demand_not_open');
  }, { pool: fakePool({ demandStatus: 'concluida' }) });
});

test('resposta do Agente: só o Agente autor; texto obrigatório', async () => {
  await withServer(async (base) => {
    const answer = `/demands/mine/${DEMAND}/analysis-requests/${REQUEST}/answer`;
    assert.equal((await send(base, 'POST', answer, { body: 'x' }, auth(PARTNER, 'partner', 'empresa'))).status, 403);
    const empty = await send(base, 'POST', answer, {}, auth(AGENT, 'agent', 'associacao'));
    assert.equal(empty.status, 422);
    assert.ok(empty.body.fields.body);
    const bad = await send(base, 'POST', answer, { body: 'x', documentIds: ['nao-e-id'] }, auth(AGENT, 'agent', 'associacao'));
    assert.equal(bad.status, 422);
    assert.equal((await send(base, 'POST', `/demands/mine/${DEMAND}/analysis-requests/nao-e-id/answer`, { body: 'x' },
      auth(AGENT, 'agent', 'associacao'))).status, 404);
  });
});
