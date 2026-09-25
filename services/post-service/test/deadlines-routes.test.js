const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Prazos do Processo de Conexão (T-05-03) com banco simulado: quem define a
// etapa, validação antes do banco, pendências e prazo do encaminhamento. O
// ciclo contra PostgreSQL (vencimento pelo laço e alertas) está em
// deadline-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROCESS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const DEADLINE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const baseRow = {
  id: PROCESS, protocol: 'DM-2026-000184', demand_id: DEMAND, sequence_in_demand: 1, party_kind: 'empresa',
  party_user_id: PARTNER, party_organization_id: null, party_name: 'Construtora Horizonte', party_profile_type: 'empresa',
  fee_applies: true, origin_kind: 'interesse', contribution_kinds: [], contribution_description: null,
  contribution_amount_cents: null, status: 'em_analise', previous_status: null, status_note: null,
  status_changed_at: new Date('2026-09-25T12:00:00Z'), formalized_by_kind: 'agente', formalized_at: new Date('2026-09-25T12:00:00Z'),
  closed_at: null, demand_title: 'Calçada', demand_status: 'conectada', demand_author_id: AGENT,
};

function fakePool({ row = baseRow, fulfilled = true, pending = [] } = {}) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || /set_config/.test(text)) return { rows: [] };
    if (/FROM connection_processes p JOIN demands d/.test(text) && /WHERE p\.(id|protocol) = \$1/.test(text)) {
      return { rows: row && (params[0] === row.id || params[0] === row.protocol) ? [row] : [] };
    }
    if (/FROM demand_events/.test(text)) return { rows: [] };
    if (/FROM connection_process_deadlines dl\s+WHERE dl\.process_id/.test(text)) return { rows: [] };
    if (/SELECT gen_random_uuid\(\) AS id/.test(text)) return { rows: [{ id: DEADLINE }] };
    if (/UPDATE connection_process_deadlines SET superseded_by/.test(text)) return { rows: [], rowCount: 0 };
    if (/INSERT INTO connection_process_deadlines/.test(text)) return { rows: [] };
    if (/SET status = 'cumprido'/.test(text)) return { rows: fulfilled ? [{ id: DEADLINE }] : [] };
    if (/notification_create/.test(text)) return { rows: [{ id: 'n1' }] };
    if (/FROM connection_process_deadlines dl\s+JOIN connection_processes p/.test(text)) return { rows: pending };
    throw new Error(`Consulta inesperada: ${text}`);
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

async function withServer(callback, { pool = fakePool() } = {}) {
  const server = createApp({
    pool, secret: SECRET, dossierService: null, uploadStorage: null,
    institutionStatus: async (req) => (req.user.userId === AGENT
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
const partner = auth(PARTNER, 'partner', 'empresa');
const agent = auth(AGENT, 'agent', 'associacao');

test('prazo de etapa: só o lado responsável define; validação antes do banco', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_inicial' })).status, 401);
    assert.equal((await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_inicial' },
      auth(STRANGER, 'partner', 'marca'))).status, 404);
    const noStage = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, {}, partner);
    assert.equal(noStage.status, 422);
    assert.ok(noStage.body.fields.stage);
    const other = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'outra' }, partner);
    assert.equal(other.status, 422);
    assert.ok(other.body.fields.stageLabel && other.body.fields.dueDays);
    const both = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_tecnica', dueDays: 3, dueOn: '2026-12-01' }, partner);
    assert.equal(both.status, 422);
    const tooLong = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_tecnica', dueDays: 400 }, partner);
    assert.equal(tooLong.status, 422);
    // Envio de documentação é do Agente; análise é da parte.
    const forbidden = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'envio_de_documentacao' }, partner);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.code, 'deadline_forbidden');
    const agentAnalysis = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_inicial' }, agent);
    assert.equal(agentAnalysis.status, 403);
    assert.ok(!pool.calls.some((c) => /INSERT INTO connection_process_deadlines/.test(c.text)), 'nada gravado');
  }, { pool });
});

test('prazo de etapa: sugestão da fonte, histórico e aviso ao outro lado', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_tecnica' }, partner);
    assert.equal(res.status, 201);
    assert.ok(Array.isArray(res.body.deadlines));
    const superseded = pool.calls.findIndex((c) => /SET superseded_by/.test(c.text));
    const insert = pool.calls.findIndex((c) => /INSERT INTO connection_process_deadlines/.test(c.text));
    assert.ok(superseded >= 0 && insert > superseded, 'o anterior vira histórico antes do novo');
    const params = pool.calls[insert].params;
    assert.equal(params[2], 'analise_tecnica');
    assert.equal(params[4], 'parte');
    assert.equal(params[5], 10, 'Análise técnica: 10 dias (§15)');
    assert.equal(params[6], null);
    const notice = pool.calls.find((c) => /notification_create/.test(c.text));
    assert.ok(notice, 'o Agente é avisado');
    assert.equal(notice.params[0], AGENT);

    const agentDoc = await send(base, 'POST', `/processes/${PROCESS}/deadlines`,
      { stage: 'envio_de_documentacao', dueOn: '2030-01-10', note: 'Projeto técnico' }, agent);
    assert.equal(agentDoc.status, 201);
    const last = pool.calls.filter((c) => /INSERT INTO connection_process_deadlines/.test(c.text)).pop();
    assert.equal(last.params[5], null);
    assert.equal(last.params[6], '2030-01-10');
    assert.equal(last.params[9], 'agente');
  }, { pool });
});

test('prazo cumprido: as duas partes; 409 quando não está em aberto', async () => {
  await withServer(async (base) => {
    const ok = await send(base, 'POST', `/processes/${PROCESS}/deadlines/${DEADLINE}/fulfill`, { note: 'Documentos enviados' }, agent);
    assert.equal(ok.status, 200);
  });
  await withServer(async (base) => {
    const closed = await send(base, 'POST', `/processes/${PROCESS}/deadlines/${DEADLINE}/fulfill`, {}, partner);
    assert.equal(closed.status, 409);
    assert.equal(closed.body.code, 'deadline_closed');
    assert.equal((await send(base, 'POST', `/processes/${PROCESS}/deadlines/nao-e-id/fulfill`, {}, partner)).status, 404);
  }, { pool: fakePool({ fulfilled: false }) });
});

test('processo encerrado não recebe prazo', async () => {
  const pool = fakePool({ row: { ...baseRow, status: 'cancelada', closed_at: new Date() } });
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/processes/${PROCESS}/deadlines`, { stage: 'analise_inicial' }, partner);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'process_closed');
  }, { pool });
});

test('pendências: prazos vencidos e próximos de quem pede', async () => {
  const pending = [{
    kind: 'prazo_do_processo', id: DEADLINE, due_on: '2000-01-05', stage: 'analise_inicial', stage_label: null,
    responsible_side: 'parte', status: 'vencido', process_id: PROCESS, protocol: 'DM-2026-000184',
    process_status: 'em_analise', demand_id: DEMAND, demand_title: 'Calçada', viewer_side: 'agente',
  }];
  const pool = fakePool({ pending });
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', '/processes/pending')).status, 401);
    const res = await send(base, 'GET', '/processes/pending', undefined, agent);
    assert.equal(res.status, 200);
    const [item] = res.body.pending;
    assert.equal(item.kind, 'prazo_do_processo');
    assert.equal(item.overdue, true);
    assert.equal(item.mustAct, false, 'a análise inicial é da parte');
    assert.equal(item.label, 'Análise inicial');
    assert.equal(item.href, '/processos/DM-2026-000184');
    const call = pool.calls.find((c) => /FROM connection_process_deadlines dl\s+JOIN connection_processes p/.test(c.text));
    assert.equal(call.params[0], AGENT);
    assert.equal(call.params[1], null, 'conta sem órgão');
  }, { pool });
});
