const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Rotas do apoio à demanda (T16) com banco simulado: autenticação, categorias
// que registram apoio, gate do Poder Público e validação antes do banco.
// O ciclo completo contra PostgreSQL está em support-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '22222222-2222-4222-8222-222222222222';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUPPORT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function noDbPool() {
  const fail = async (text) => { throw new Error(`Consulta inesperada: ${text}`); };
  return { query: fail, async connect() { return { query: fail, release() {} }; } };
}

async function withServer(callback, {
  access = { kind: null, status: null, canActInstitutionally: true, organizationId: null }, pool = noDbPool(),
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

const auth = (role, profileType) => ({
  authorization: `Bearer ${jwt.sign({ userId: USER, role, profileType, name: 'Conta' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers = auth('partner', 'empresa')) => {
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const VALID = { modality: 'doar_recursos', supportType: 'materials', description: '20 sacos de cimento' };

test('registrar apoio: token, categoria e validação antes do banco', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', `/demands/${DEMAND}/supports`, VALID, {})).status, 401);
    for (const [role, profileType] of [['agent', 'ong'], ['media', 'imprensa']]) {
      const res = await send(base, 'POST', `/demands/${DEMAND}/supports`, VALID, auth(role, profileType));
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'support_not_allowed');
    }
    const bad = await send(base, 'POST', `/demands/${DEMAND}/supports`, { modality: 'doar_dinheiro', supportType: 'sharing' });
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['description', 'modality', 'supportType']);
    // Apoio financeiro é valor declarado: sem valor, não passa.
    const semValor = await send(base, 'POST', `/demands/${DEMAND}/supports`, {
      modality: 'patrocinar_projeto', supportType: 'financial', description: 'Patrocínio',
    });
    assert.ok(semValor.body.fields.amountCents);
    assert.equal((await send(base, 'POST', '/demands/nao-e-uuid/supports', VALID)).status, 404);
    assert.equal((await send(base, 'GET', '/demands/nao-e-uuid/supports', undefined, {})).status, 404);
  });
});

test('Membro da Comunidade registra apoio só nas modalidades da decisão 18 (T-04-01)', async () => {
  await withServer(async (base) => {
    const member = auth('member', 'morador');
    for (const modality of ['patrocinar_projeto', 'financiar_evento', 'contratar_servicos_locais']) {
      const res = await send(base, 'POST', `/demands/${DEMAND}/supports`, { ...VALID, modality }, member);
      assert.equal(res.status, 422, modality);
      assert.ok(res.body.fields.modality);
    }
    const financeiro = await send(base, 'POST', `/demands/${DEMAND}/supports`,
      { ...VALID, supportType: 'financial', amountCents: 1000 }, member);
    assert.equal(financeiro.status, 422);
    assert.ok(financeiro.body.fields.supportType);
    const voluntariado = await send(base, 'POST', `/demands/${DEMAND}/supports`,
      { ...VALID, modality: 'apoiar_acao_ambiental', supportType: 'volunteering' }, member);
    assert.equal(voluntariado.status, 422, 'voluntariado continua pelo interesse da T15');
  });
});

test('Poder Público sem validação não registra apoio', async () => {
  const access = { kind: 'poder_publico', status: 'em_analise', canActInstitutionally: false, organizationId: null };
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/demands/${DEMAND}/supports`, VALID, auth('government', 'prefeitura'));
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'institution_not_validated');
  }, { access });
});

test('confirmação do recebimento é do Agente autor', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/demands/mine/${DEMAND}/supports/${SUPPORT}/confirm`, {});
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'demand_author_not_agent');
    assert.equal((await send(base, 'GET', `/demands/mine/${DEMAND}/supports`)).status, 403);
    // Contestação exige justificativa e não recebe evidência de recebimento.
    const agent = auth('agent', 'ong');
    const semNota = await send(base, 'POST', `/demands/mine/${DEMAND}/supports/${SUPPORT}/contest`, {}, agent);
    assert.equal(semNota.status, 422);
    assert.ok(semNota.body.fields.note);
    const comEvidencia = await send(base, 'POST', `/demands/mine/${DEMAND}/supports/${SUPPORT}/contest`,
      { note: 'Nada foi entregue', evidence: ['upload:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'] }, agent);
    assert.equal(comEvidencia.status, 422);
    assert.ok(comEvidencia.body.fields.evidence);
  });
});

test('o apoio ao post-vitrine da demanda é recusado com o caminho da demanda', async () => {
  const pool = {
    async query(text, params = []) {
      if (/FROM posts WHERE id=\$1/.test(text)) return { rows: [{ demand_id: DEMAND }] };
      throw new Error(`Consulta inesperada: ${text} ${JSON.stringify(params)}`);
    },
    async connect() { throw new Error('sem transação'); },
  };
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/${SUPPORT}/supports`, { type: 'materials' });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'demand_support_flow');
    assert.equal(res.body.demandId, DEMAND);
  }, { pool });
});

test('apoio financeiro no feed continua sem provedor de pagamento', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/${SUPPORT}/supports`, { type: 'financial', amount: 10 });
    assert.equal(res.status, 503);
  });
});
