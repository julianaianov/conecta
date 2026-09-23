// Atuação territorial pública do perfil (GET /profiles/:userId/activity) com
// banco simulado.
//
// O que estes testes garantem: a rota é pública e só lê; demandas só da
// publicação em diante; apoios realizados só com consentimento de exibição e
// valor só quando o apoiador o tornou público; nada de endereço fino, conta de
// terceiros, mensagem ou nota do Agente sai na resposta.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src');
const { PUBLIC_STATUSES } = require('../src/demand/constants');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '11111111-1111-4111-8111-111111111111';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTHER_DEMAND = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const SUPPORT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    const result = await handler(text, params);
    if (!result) throw new Error(`Consulta inesperada: ${text}`);
    return result;
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

async function withServer(pool, callback) {
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => null, rankings: null,
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const demandRow = {
  id: DEMAND,
  title: 'Iluminação da praça',
  category: 'problema_urbano',
  status: 'em_execucao',
  district: 'Centro',
  municipality: 'Duque de Caxias',
  uf: 'RJ',
  territory: 'Centro',
  published_at: new Date('2026-09-01T12:00:00.000Z'),
};

const givenRow = (over = {}) => ({
  id: SUPPORT,
  demand_id: OTHER_DEMAND,
  modality: 'doar_recursos',
  receipt_status: 'confirmado',
  amount: '150.50',
  amount_public: true,
  created_at: new Date('2026-09-10T12:00:00.000Z'),
  demand_title: 'Horta comunitária',
  demand_status: 'conectada',
  district: 'Jardim Primavera',
  municipality: 'Duque de Caxias',
  uf: 'RJ',
  ...over,
});

function activityPool({ given = [givenRow()] } = {}) {
  return fakePool((text) => {
    if (/FROM demands d\s+WHERE d\.author_id/.test(text)) return { rows: [demandRow] };
    if (/GROUP BY s\.modality/.test(text)) return { rows: [{ modality: 'doar_recursos', count: 2 }] };
    if (/count\(\*\)::int AS total/.test(text)) return { rows: [{ total: 3, confirmed: 2 }] };
    if (/WHERE s\.user_id = \$1/.test(text)) return { rows: given };
    return null;
  });
}

test('GET /profiles/:id/activity devolve demandas, apoios recebidos e apoios realizados', async () => {
  const pool = activityPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/profiles/${USER}/activity`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.userId, USER);
    assert.deepEqual(body.demands, [{
      id: DEMAND,
      title: 'Iluminação da praça',
      category: 'problema_urbano',
      status: 'em_execucao',
      district: 'Centro',
      municipality: 'Duque de Caxias',
      uf: 'RJ',
      territory: 'Centro',
      publishedAt: '2026-09-01T12:00:00.000Z',
    }]);
    assert.equal(body.demandsTruncated, false);
    assert.deepEqual(body.supportsReceived, {
      total: 3, confirmed: 2, byModality: [{ modality: 'doar_recursos', count: 2 }],
    });
    assert.equal(body.supportsGiven.length, 1);
    assert.equal(body.supportsGiven[0].demandTitle, 'Horta comunitária');
    assert.equal(body.supportsGiven[0].amountCents, 15050);
    assert.equal(body.supportsGiven[0].receiptStatus, 'confirmado');
  });
});

test('só lê: nenhuma escrita e todas as consultas filtram pelos status públicos', async () => {
  const pool = activityPool();
  await withServer(pool, async (base) => {
    await fetch(`${base}/profiles/${USER}/activity`);
  });
  assert.equal(pool.calls.length, 4);
  for (const call of pool.calls) {
    assert.doesNotMatch(call.text, /\b(INSERT|UPDATE|DELETE)\b/i);
    assert.equal(call.params[0], USER);
    assert.deepEqual(call.params[1], PUBLIC_STATUSES);
    assert.match(call.text, /d\.status = ANY\(\$2::demand_status\[\]\)/);
  }
});

test('apoio realizado só aparece com consentimento de exibição e sem dados privados', async () => {
  const pool = activityPool({ given: [givenRow({ amount_public: false })] });
  await withServer(pool, async (base) => {
    const body = await (await fetch(`${base}/profiles/${USER}/activity`)).json();
    assert.equal(body.supportsGiven[0].amountCents, null);
    const serialized = JSON.stringify(body);
    for (const key of ['cep', 'street', 'message', 'receiptNote', 'userName', 'organizationId', 'email']) {
      assert.doesNotMatch(serialized, new RegExp(`"${key}"`), key);
    }
  });
  const given = pool.calls.find((call) => /WHERE s\.user_id = \$1/.test(call.text));
  assert.match(given.text, /s\.display_consent = true/);
  assert.match(given.text, /s\.canceled_at IS NULL/);
});

test('perfil sem id válido responde 404 sem consultar o banco', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/profiles/nao-e-uuid/activity`);
    assert.equal(res.status, 404);
  });
  assert.equal(pool.calls.length, 0);
});

test('lista limitada: marca quando há mais registros do que o limite', async () => {
  const many = Array.from({ length: 51 }, (_, index) => givenRow({ id: `${SUPPORT.slice(0, -2)}${String(index).padStart(2, '0')}` }));
  const pool = activityPool({ given: many });
  await withServer(pool, async (base) => {
    const body = await (await fetch(`${base}/profiles/${USER}/activity`)).json();
    assert.equal(body.supportsGiven.length, 50);
    assert.equal(body.supportsGivenTruncated, true);
  });
});
