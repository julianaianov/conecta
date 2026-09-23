// Rotas de eventos e inscrições (T25) com banco simulado: autenticação,
// permissões por categoria da fonte, gate do Poder Público e validação antes
// do banco. O ciclo completo contra PostgreSQL está em event-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '22222222-2222-4222-8222-222222222222';
const EVENT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function noDbPool() {
  const fail = async (text) => { throw new Error(`Consulta inesperada: ${text}`); };
  return { query: fail, async connect() { return { query: fail, release() {} }; } };
}

async function withServer(callback, {
  access = { kind: null, status: null, canActInstitutionally: true, organizationId: null },
  pool = noDbPool(),
} = {}) {
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => access, dossierService: null, uploadStorage: null,
    rankings: null,
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
const send = async (base, method, path, body, headers = auth('agent', 'ong')) => {
  const res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('vocabulário público traz o aviso de "em desenvolvimento" do e-mail', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'GET', '/events/reference', undefined, {});
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.signupRoles, ['member']);
    assert.deepEqual(res.body.organizerRoles, ['agent', 'government']);
    assert.equal(res.body.emailNotifications.available, false);
    assert.equal(res.body.emailNotifications.state, 'em_desenvolvimento');
    assert.deepEqual(res.body.kinds.map((k) => k.value), [
      'evento', 'oficina_cultural', 'mutirao', 'acao_ambiental', 'aula_esportiva',
    ]);
    assert.match(res.body.pricing.find((p) => p.value === 'pago').label, /fora da plataforma/);
  });
});

test('publicar evento é de Agente e Poder Público; o resto recebe 403', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', '/events', {}, {})).status, 401);
    for (const [role, profileType] of [['member', 'morador'], ['partner', 'empresa'], ['media', 'jornalista']]) {
      const res = await send(base, 'POST', '/events', {}, auth(role, profileType));
      assert.equal(res.status, 403);
      assert.equal(res.body.code, 'event_organizer_not_allowed');
      assert.equal((await send(base, 'GET', '/events/mine', undefined, auth(role, profileType))).status, 403);
    }
  });
});

test('inscrever-se é permissão de Membros da Comunidade (slide 9)', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', `/events/${EVENT}/signups`, {}, {})).status, 401);
    for (const [role, profileType] of [['agent', 'ong'], ['partner', 'empresa'],
      ['government', 'prefeitura'], ['media', 'jornalista']]) {
      const res = await send(base, 'POST', `/events/${EVENT}/signups`, {}, auth(role, profileType));
      assert.equal(res.status, 403, role);
      assert.equal(res.body.code, 'signup_not_allowed');
    }
  });
});

test('Poder Público sem validação institucional não publica evento', async () => {
  const access = { kind: 'poder_publico', status: 'em_analise', canActInstitutionally: false, organizationId: null };
  await withServer(async (base) => {
    const gov = auth('government', 'secretaria');
    const res = await send(base, 'POST', '/events', { title: 'Mutirão' }, gov);
    assert.equal(res.body.code, 'institution_not_validated');
    assert.equal((await send(base, 'POST', `/events/${EVENT}/publish`, undefined, gov)).body.code, 'institution_not_validated');
  }, { access });
});

test('validação acontece antes de qualquer consulta ao banco', async () => {
  await withServer(async (base) => {
    const bad = await send(base, 'POST', '/events', {
      kind: 'festa', cep: '123', uf: 'Rio', startsAt: 'ontem', capacity: 0,
      pricing: 'gratuito', priceCents: 100, accessibility: ['rampa'],
    });
    assert.equal(bad.status, 422);
    assert.equal(bad.body.code, 'validation_failed');
    assert.deepEqual(Object.keys(bad.body.fields).sort(), [
      'accessibility', 'capacity', 'cep', 'kind', 'priceCents', 'startsAt', 'uf',
    ]);
    // Cancelar sem motivo nem chega ao banco.
    const cancel = await send(base, 'POST', `/events/${EVENT}/cancel`, {});
    assert.equal(cancel.status, 422);
    assert.ok(cancel.body.fields.reason);
    // Presença exige um booleano.
    const attendance = await send(base, 'PUT', `/events/mine/${EVENT}/signups/${EVENT}/attendance`, { attended: 'sim' });
    assert.equal(attendance.status, 422);
    assert.ok(attendance.body.fields.attended);
  });
});

test('id malformado é 404, nunca 500', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', '/events/nao-e-uuid', undefined, {})).status, 404);
    assert.equal((await send(base, 'GET', '/events/nao-e-uuid/signups/summary', undefined, {})).status, 404);
    assert.equal((await send(base, 'POST', '/events/nao-e-uuid/signups', {}, auth('member', 'morador'))).status, 404);
    assert.equal((await send(base, 'GET', `/events/mine/${EVENT}/signups/nao-e-uuid`, undefined)).status, 404);
  });
});

test('filtros inválidos da agenda pública viram 422 com os campos', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'GET', '/events?kind=festa&uf=Rio&when=amanha&limit=999', undefined, {});
    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys(res.body.fields).sort(), ['kind', 'limit', 'uf', 'when']);
    assert.equal((await send(base, 'GET', '/events/mine?status=publicadissimo')).status, 422);
  });
});
