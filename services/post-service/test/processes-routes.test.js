const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Rotas do Processo de Conexão (T-05-01) com banco simulado: autenticação,
// quem é parte, validação antes do banco e projeção pública. O ciclo completo
// contra PostgreSQL está em process-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const GOV = '44444444-4444-4444-8444-444444444444';
const ORG = '55555555-5555-4555-8555-555555555555';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROCESS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const baseRow = {
  id: PROCESS, protocol: 'DM-2026-000184', demand_id: DEMAND, sequence_in_demand: 2, party_kind: 'empresa',
  party_user_id: PARTNER, party_organization_id: null, party_name: 'Construtora Horizonte', party_profile_type: 'empresa',
  fee_applies: true, origin_kind: 'interesse', contribution_kinds: ['materiais'], contribution_description: 'Cimento',
  contribution_amount_cents: null, status: 'em_analise', previous_status: null, status_note: null,
  status_changed_at: new Date('2026-09-25T12:00:00Z'), formalized_by_kind: 'agente', formalized_at: new Date('2026-09-25T12:00:00Z'),
  closed_at: null, demand_title: 'Calçada', demand_status: 'conectada', demand_author_id: AGENT,
};

function fakePool(row = baseRow) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || /set_config/.test(text)) return { rows: [] };
    if (/FROM connection_processes p JOIN demands d/.test(text) && /WHERE p\.(id|protocol) = \$1/.test(text)) {
      return { rows: row && (params[0] === row.id || params[0] === row.protocol) ? [row] : [] };
    }
    if (/SELECT 1 FROM demands WHERE id = \$1 AND status/.test(text)) return { rows: [{ '?column?': 1 }] };
    if (/WHERE p\.demand_id = \$1 ORDER BY p\.sequence_in_demand/.test(text)) return { rows: [row] };
    if (/FROM demand_events/.test(text)) return { rows: [] };
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

test('processo: token, parte, Agente autor e terceiros (404)', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', `/processes/${PROCESS}`)).status, 401);
    assert.equal((await send(base, 'GET', '/processes/nao-e-protocolo', undefined, auth(PARTNER, 'partner', 'empresa'))).status, 404);
    const stranger = await send(base, 'GET', `/processes/${PROCESS}`, undefined, auth(STRANGER, 'partner', 'marca'));
    assert.equal(stranger.status, 404);
    const gov = await send(base, 'GET', '/processes/DM-2026-000184', undefined, auth(GOV, 'government', 'secretaria'));
    assert.equal(gov.status, 404, 'órgão não é parte de processo de Parceiro');
    const partner = await send(base, 'GET', '/processes/DM-2026-000184', undefined, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(partner.status, 200);
    assert.equal(partner.body.process.viewerRole, 'parte');
    assert.ok(partner.body.process.availableStatuses.includes('aprovada_para_execucao'));
    assert.ok(!partner.body.process.availableStatuses.includes('em_execucao'), 'execução é do Agente');
    const agent = await send(base, 'GET', `/processes/${PROCESS}`, undefined, auth(AGENT, 'agent', 'associacao'));
    assert.equal(agent.body.process.viewerRole, 'agente');
    assert.deepEqual(agent.body.timeline, []);
  });
});

test('processo de órgão: a parte é o órgão validado', async () => {
  const row = { ...baseRow, party_kind: 'poder_publico', party_user_id: GOV, party_organization_id: ORG, party_name: 'Secretaria' };
  await withServer(async (base) => {
    const gov = await send(base, 'GET', `/processes/${PROCESS}`, undefined, auth(GOV, 'government', 'secretaria'));
    assert.equal(gov.status, 200);
    assert.ok(gov.body.process.availableStatuses.includes('nao_e_de_competencia'));
  }, { pool: fakePool(row) });
});

test('mudança de status, responsável e contribuição: validação antes do banco', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const h = auth(PARTNER, 'partner', 'empresa');
    const noStatus = await send(base, 'POST', `/processes/${PROCESS}/status`, {}, h);
    assert.equal(noStatus.status, 422);
    assert.ok(noStatus.body.fields.status);
    const noNote = await send(base, 'POST', `/processes/${PROCESS}/status`, { status: 'nao_aprovada' }, h);
    assert.equal(noNote.status, 422);
    assert.ok(noNote.body.fields.note, 'recusa informa o motivo');
    assert.equal((await send(base, 'PUT', `/processes/${PROCESS}/responsible`, {}, h)).status, 422);
    assert.equal((await send(base, 'PUT', `/processes/${PROCESS}/responsible`, { dueOn: '31/12/2026' }, h)).status, 422);
    const amount = await send(base, 'PUT', `/processes/${PROCESS}/contribution`, { contributionKinds: ['materiais'], contributionAmountCents: 5 }, h);
    assert.equal(amount.status, 422);
    assert.ok(!pool.calls.some((c) => /UPDATE connection_processes/.test(c.text)), 'nada gravado');
  }, { pool });
});

test('parte pede status do Agente: 403 forbidden_status', async () => {
  const row = { ...baseRow, status: 'aprovada_para_execucao' };
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/processes/${PROCESS}/status`, { status: 'em_execucao' }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'forbidden_status');
  }, { pool: fakePool(row) });
});

test('formalizar pelo Agente: só Agente, uma origem', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', `/demands/mine/${DEMAND}/processes`, { interestId: PROCESS }, auth(PARTNER, 'partner', 'empresa'))).status, 403);
    const bad = await send(base, 'POST', `/demands/mine/${DEMAND}/processes`, {}, auth(AGENT, 'agent', 'associacao'));
    assert.equal(bad.status, 422);
    assert.ok(bad.body.fields.origin);
  });
});

test('lista pública: protocolo, tipo de parte, contribuição e status, sem nome nem id de conta', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'GET', `/demands/${DEMAND}/processes`);
    assert.equal(res.status, 200);
    const [p] = res.body.processes;
    assert.equal(p.protocol, 'DM-2026-000184');
    assert.equal(p.sequenceInDemand, 2);
    assert.equal(p.partyKind, 'empresa');
    assert.equal(p.organizationName, null);
    const text = JSON.stringify(res.body);
    assert.ok(!text.includes(PARTNER) && !text.includes('Construtora') && !text.includes('Cimento'));
  });
});
