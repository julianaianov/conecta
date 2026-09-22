// Rotas da prestação de contas (T18) com banco simulado: autenticação, papel
// de Agente, gate da instituição validada e validação antes do banco. O ciclo
// completo contra PostgreSQL está em accountability-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '11111111-1111-4111-8111-111111111111';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const GOAL = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const DOCUMENT = 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2';
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

test('gravar o registro final: token, papel de Agente e instituição validada', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'PUT', `/demands/mine/${DEMAND}/accountability`, {}, {})).status, 401);

    for (const [role, profileType] of [['member', 'morador'], ['partner', 'empresa'], ['government', 'secretaria']]) {
      const res = await send(base, 'PUT', `/demands/mine/${DEMAND}/accountability`, {}, auth(role, profileType));
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'demand_author_not_agent');
    }
  });

  await withServer(async (base) => {
    const res = await send(base, 'PUT', `/demands/mine/${DEMAND}/accountability`, {});
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'institution_not_validated');
  }, { access: { kind: 'agente_transformacao', status: 'em_analise', canActInstitutionally: false, organizationId: null } });
});

test('validação por campo antes de tocar o banco', async () => {
  await withServer(async (base) => {
    const draft = await send(base, 'PUT', `/demands/mine/${DEMAND}/accountability`, {
      beneficiariesReached: -1, financialSupport: 'talvez',
    });
    assert.equal(draft.status, 422);
    assert.equal(draft.body.code, 'validation_failed');
    assert.ok(draft.body.fields.beneficiariesReached);
    assert.ok(draft.body.fields.financialSupport);

    const result = await send(base, 'PUT', `/demands/mine/${DEMAND}/accountability/results/${GOAL}`, {});
    assert.equal(result.status, 422);
    assert.ok(result.body.fields.measuredValue);
    assert.ok(result.body.fields.measurementMethod);
    assert.ok(result.body.fields.achieved);

    const document = await send(base, 'POST', `/demands/mine/${DEMAND}/accountability/documents`, {
      kind: 'comprovante_financeiro',
    });
    assert.equal(document.status, 422);
    assert.ok(document.body.fields.title);
    assert.ok(document.body.fields.reference);
    assert.ok(document.body.fields.amountCents);
    assert.ok(document.body.fields.issuedOn);

    const kind = await send(base, 'POST', `/demands/mine/${DEMAND}/accountability/documents`, {
      kind: 'qualquer', title: 'x', reference: 'upload:1',
    });
    assert.equal(kind.status, 422);
    assert.match(kind.body.fields.kind, /Tipos aceitos/);
  });
});

test('identificadores inválidos respondem 404, sem consultar o banco', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', '/demands/nao-e-uuid/accountability', undefined, {})).status, 404);

    const goal = await send(base, 'PUT', `/demands/mine/${DEMAND}/accountability/results/nao-e-uuid`, {
      measuredValue: '1', measurementMethod: 'Contagem', achieved: true,
    });
    assert.equal(goal.status, 404);
    assert.equal(goal.body.error, 'Meta não encontrada');

    const document = await send(base, 'DELETE', `/demands/mine/${DEMAND}/accountability/documents/nao-e-uuid`);
    assert.equal(document.status, 404);
    assert.equal(document.body.error, 'Documento não encontrado');
  });
});

test('a leitura pública dos resultados não exige token e só vê demanda publicada', async () => {
  const pool = {
    async query(text, params) {
      assert.match(text, /FROM demands d WHERE d\.id = \$1 AND d\.status = ANY/);
      assert.equal(params[0], DEMAND);
      return { rows: [] };
    },
    async connect() { throw new Error('sem transação na leitura pública'); },
  };
  await withServer(async (base) => {
    const res = await send(base, 'GET', `/demands/${DEMAND}/accountability`, undefined, {});
    assert.equal(res.status, 404);
  }, { pool });
});

test('a rota da prestação não colide com o /:id da demanda nem com o do documento', async () => {
  // `mine/:id/accountability/documents/:documentId` com UUID chega à rota da
  // prestação (e não à da demanda): a transação abre e a demanda é carregada
  // do dono, respondendo 404 porque não existe.
  const statements = [];
  const client = {
    async query(text) {
      statements.push(String(text).trim().split('\n')[0]);
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = { async query() { return { rows: [] }; }, async connect() { return client; } };
  await withServer(async (base) => {
    const res = await send(base, 'DELETE', `/demands/mine/${DEMAND}/accountability/documents/${DOCUMENT}`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'Demanda não encontrada');
    assert.equal(statements[0], 'BEGIN');
    assert.ok(statements.some((s) => /SELECT/.test(s)));
  }, { pool });
});
