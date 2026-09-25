// Rotas da execução (T17) com banco simulado: autenticação, papel de Agente,
// gate da instituição validada e validação antes do banco. O ciclo completo
// contra PostgreSQL está em execution-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '11111111-1111-4111-8111-111111111111';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EVIDENCE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ORG = '77777777-7777-4777-8777-777777777777';

function noDbPool() {
  const fail = async (text) => { throw new Error(`Consulta inesperada: ${text}`); };
  return { query: fail, async connect() { return { query: fail, release() {} }; } };
}

async function withServer(callback, {
  access = { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG },
  pool = noDbPool(),
} = {}) {
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => access, dossierService: null, uploadStorage: null,
    partnerProfile: { get: async () => null },
    connections: { create: async () => null, get: async () => null, update: async () => null },
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (role = 'agent', profileType = 'ong') => ({
  authorization: `Bearer ${jwt.sign({ userId: USER, role, profileType, name: 'Instituto' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers = auth()) => {
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const VALID_EVIDENCE = {
  reference: 'upload:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  milestone: 'antes',
  mediaKind: 'foto',
  recordedOn: '2026-09-01',
};

test('registrar evidência: token, papel de Agente e validação antes do banco', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', `/demands/mine/${DEMAND}/evidences`, VALID_EVIDENCE, {})).status, 401);

    for (const [role, profileType] of [['member', 'morador'], ['partner', 'empresa'], ['government', 'secretaria']]) {
      const res = await send(base, 'POST', `/demands/mine/${DEMAND}/evidences`, VALID_EVIDENCE, auth(role, profileType));
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'demand_author_not_agent');
    }

    const invalid = await send(base, 'POST', `/demands/mine/${DEMAND}/evidences`, { milestone: 'ontem' });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.body.code, 'validation_failed');
    assert.ok(invalid.body.fields.reference);
    assert.ok(invalid.body.fields.milestone);
    assert.ok(invalid.body.fields.mediaKind);
    assert.ok(invalid.body.fields.recordedOn);
  });
});

test('registrar evidência exige instituição validada (T06a)', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/demands/mine/${DEMAND}/evidences`, VALID_EVIDENCE);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'institution_not_validated');
  }, { access: { kind: 'agente_transformacao', status: 'em_analise', canActInstitutionally: false, organizationId: null } });
});

test('andamento e justificativa: validação por campo antes de tocar o banco', async () => {
  await withServer(async (base) => {
    const empty = await send(base, 'POST', `/demands/mine/${DEMAND}/progress`, {});
    assert.equal(empty.status, 422);
    assert.match(empty.body.fields.partialResults, /ao menos uma informação/);

    const deadline = await send(base, 'POST', `/demands/mine/${DEMAND}/progress`, {
      scheduleItemId: '33333333-3333-4333-8333-333333333333',
      stageProgress: 'em_andamento',
      newEndsOn: '2026-12-01',
    });
    assert.equal(deadline.status, 422);
    assert.match(deadline.body.fields.deadlineReason, /Justifique/);

    const waiver = await send(base, 'POST', `/demands/mine/${DEMAND}/record-waiver`, {});
    assert.equal(waiver.status, 422);
    assert.match(waiver.body.fields.reason, /Explique/);
  });
});

test('identificadores inválidos respondem 404, sem consultar o banco', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', '/demands/nao-e-uuid/execution', undefined, {})).status, 404);
    const res = await send(base, 'PUT', `/demands/mine/${DEMAND}/evidences/nao-e-uuid`, { caption: 'x' });
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Evidência não encontrada');
  });
});

test('a leitura pública da execução não exige token e só vê demanda publicada', async () => {
  const pool = {
    async query(text, params) {
      assert.match(text, /FROM demands d WHERE d\.id = \$1 AND d\.status = ANY/);
      assert.equal(params[0], DEMAND);
      return { rows: [] };
    },
    async connect() { throw new Error('sem transação na leitura pública'); },
  };
  await withServer(async (base) => {
    const res = await send(base, 'GET', `/demands/${DEMAND}/execution`, undefined, {});
    assert.equal(res.status, 404);
  }, { pool });
});

test('o pareamento antes/depois não é desfeito pela rota de legenda', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'PUT', `/demands/mine/${DEMAND}/evidences/${EVIDENCE}`, {
      pairEvidenceId: 'nao-e-uuid',
    });
    assert.equal(res.status, 422);
    assert.ok(res.body.fields.pairEvidenceId);
  });
});

test('etapa bloqueada sem motivo responde 422 antes do banco (Modelo §18)', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/demands/mine/${DEMAND}/progress`, {
      scheduleItemId: '33333333-3333-4333-8333-333333333333',
      stageProgress: 'bloqueada',
    });
    assert.equal(res.status, 422);
    assert.match(res.body.fields.blockReason, /bloqueia a etapa/);
  });
});

test('ocorrências: token, papel, validação e id inválido antes do banco (Modelo §19)', async () => {
  await withServer(async (base) => {
    const body = { kind: 'clima', description: 'Chuva forte', occurredOn: '2026-09-01' };
    assert.equal((await send(base, 'POST', `/demands/mine/${DEMAND}/incidents`, body, {})).status, 401);
    const member = await send(base, 'POST', `/demands/mine/${DEMAND}/incidents`, body, auth('member', 'morador'));
    assert.equal(member.status, 403);
    const invalid = await send(base, 'POST', `/demands/mine/${DEMAND}/incidents`, { kind: 'terremoto' });
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.fields.kind && invalid.body.fields.description && invalid.body.fields.occurredOn);
    const resolve = await send(base, 'POST', `/demands/mine/${DEMAND}/incidents/${EVIDENCE}/resolve`, {});
    assert.equal(resolve.status, 422);
    assert.match(resolve.body.fields.resolution, /resolvida/);
    const bad = await send(base, 'POST', `/demands/mine/${DEMAND}/incidents/nao-e-uuid/resolve`, { resolution: 'x' });
    assert.equal(bad.status, 404);
    assert.equal(bad.body.error, 'Ocorrência não encontrada');
  });
});
