const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Pautas da Comunicação e divulgação (T28) com banco simulado: gate da
// categoria, descoberta sem dado pessoal, criação, atualização e cobertura
// pública.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const MEDIA_ID = '11111111-1111-4111-8111-111111111111';
const AGENT_ID = '22222222-2222-4222-8222-222222222222';
const DEMAND_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';

const token = (userId, role, profileType) => jwt.sign({ userId, name: 'Ana Repórter', role, profileType }, SECRET);
const media = { authorization: `Bearer ${token(MEDIA_ID, 'media', 'jornalista')}`, 'content-type': 'application/json' };
const agent = { authorization: `Bearer ${token(AGENT_ID, 'agent', 'ong')}`, 'content-type': 'application/json' };

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
  const server = createApp({ pool, secret: SECRET, institutionStatus: async () => null }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const item = (overrides = {}) => ({
  id: ITEM_ID, user_id: MEDIA_ID, user_name: 'Ana Repórter', profile_type: 'jornalista',
  target_kind: 'demanda', target_id: DEMAND_ID, target_title: 'Praça sem luz', angle: null,
  status: 'identificada', outlet_name: null, published_url: null, published_on: null,
  created_at: '2026-09-24T10:00:00.000Z', updated_at: '2026-09-24T10:00:00.000Z', ...overrides,
});

test('quem não é Comunicação recebe 403 not_media; sem token, 401', async () => {
  await withServer(fakePool(() => null), async (base) => {
    const res = await fetch(`${base}/media/agenda`, { headers: agent });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'not_media');
    assert.equal((await fetch(`${base}/media/agenda`)).status, 401);
  });
});

test('descoberta: seis consultas com teto, sinais unidos por alvo e nada de dado pessoal', async () => {
  const demand = {
    id: DEMAND_ID, title: 'Praça sem luz', category: 'problema_urgente', priority: 'urgente', status: 'em_execucao',
    district: 'Centro', municipality: 'Niterói', uf: 'RJ', territory: 'Centro', published_at: '2026-09-20T00:00:00.000Z',
  };
  const pool = fakePool((text) => {
    if (/priority = 'urgente'/.test(text)) return { rows: [{ ...demand, detail: null }] };
    if (/demand_evidences/.test(text)) return { rows: [{ ...demand, detail: '1 registro(s) pareado(s)' }] };
    if (/demand_accountability/.test(text)) return { rows: [] };
    if (/FROM supports|JOIN supports/.test(text)) return { rows: [] };
    if (/FROM events e/.test(text)) return { rows: [{ id: '55555555-5555-4555-8555-555555555555', title: 'Mutirão', kind: 'mutirao', starts_at: '2026-10-01T12:00:00.000Z', district: 'Centro', municipality: 'Niterói', uf: 'RJ', territory: 'Centro', demand_id: null }] };
    if (/FROM media_agenda_items m WHERE m.user_id = \$1$/.test(text.trim())) return { rows: [{ target_kind: 'demanda', target_id: DEMAND_ID, id: ITEM_ID, status: 'em_apuracao' }] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/media/agenda/discover`, { headers: media });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.candidates.length, 2);
    const praca = body.candidates.find((c) => c.targetId === DEMAND_ID);
    assert.deepEqual(praca.signals.map((s) => s.signal), ['urgente', 'antes_e_depois']);
    assert.equal(praca.agendaItem.status, 'em_apuracao');
    assert.equal(body.candidates[1].targetKind, 'evento');
    assert.equal(body.candidates[1].agendaItem, null);
    const text = JSON.stringify(body);
    assert.doesNotMatch(text, /author|user_id|userId|email|cep/i);
    assert.ok(body.vocabulary.signals.length >= 5);
  });
  assert.equal(pool.calls.length, 6);
  for (const call of pool.calls.slice(0, 5)) assert.match(call.text, /LIMIT \$\d/);
});

test('identificar pauta: alvo público obrigatório, 201 com a pauta e 409 se já existe', async () => {
  let inserted = false;
  const pool = fakePool((text, params) => {
    if (/FROM demands WHERE id = \$1 AND published_at IS NOT NULL/.test(text)) {
      return params[0] === DEMAND_ID ? { rows: [{ title: 'Praça sem luz' }] } : { rows: [] };
    }
    if (/INSERT INTO media_agenda_items/.test(text)) {
      assert.equal(params[2], 'jornalista');
      assert.equal(params[3], 'demanda');
      if (inserted) return { rows: [] };
      inserted = true;
      return { rows: [{ id: ITEM_ID }] };
    }
    if (/FROM media_agenda_items m WHERE m.id = \$1 AND m.user_id = \$2/.test(text)) return { rows: [item({ angle: 'Iluminação' })] };
    return null;
  });
  await withServer(pool, async (base) => {
    const notFound = await fetch(`${base}/media/agenda`, {
      method: 'POST', headers: media, body: JSON.stringify({ targetKind: 'demanda', targetId: AGENT_ID }),
    });
    assert.equal(notFound.status, 404);
    const invalid = await fetch(`${base}/media/agenda`, { method: 'POST', headers: media, body: JSON.stringify({ targetKind: 'x' }) });
    assert.equal(invalid.status, 422);
    const res = await fetch(`${base}/media/agenda`, {
      method: 'POST', headers: media, body: JSON.stringify({ targetKind: 'demanda', targetId: DEMAND_ID, angle: 'Iluminação' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.item.id, ITEM_ID);
    assert.equal(body.item.angle, 'Iluminação');
    assert.equal(body.item.status, 'identificada');
    const again = await fetch(`${base}/media/agenda`, {
      method: 'POST', headers: media, body: JSON.stringify({ targetKind: 'demanda', targetId: DEMAND_ID }),
    });
    assert.equal(again.status, 409);
    assert.equal((await again.json()).code, 'agenda_item_exists');
  });
});

test('registrar divulgação: exige veículo, URL e data; publicada não muda mais', async () => {
  let current = item();
  const pool = fakePool((text, params) => {
    if (/FROM media_agenda_items m WHERE m.id = \$1 AND m.user_id = \$2/.test(text)) return { rows: params[1] === MEDIA_ID ? [current] : [] };
    if (/UPDATE media_agenda_items SET/.test(text)) {
      current = { ...current, status: 'publicada', outlet_name: 'Jornal do Bairro', published_url: 'https://jornal.example/praca', published_on: '2026-09-23' };
      return { rows: [], rowCount: 1 };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const incomplete = await fetch(`${base}/media/agenda/${ITEM_ID}`, { method: 'PUT', headers: media, body: JSON.stringify({ status: 'publicada' }) });
    assert.equal(incomplete.status, 422);
    assert.deepEqual(Object.keys((await incomplete.json()).fields).sort(), ['outletName', 'publishedOn', 'publishedUrl']);
    const res = await fetch(`${base}/media/agenda/${ITEM_ID}`, {
      method: 'PUT', headers: media,
      body: JSON.stringify({ status: 'publicada', outletName: 'Jornal do Bairro', publishedUrl: 'https://jornal.example/praca', publishedOn: '2026-09-23' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).item.status, 'publicada');
    const closed = await fetch(`${base}/media/agenda/${ITEM_ID}`, { method: 'PUT', headers: media, body: JSON.stringify({ angle: 'outro' }) });
    assert.equal(closed.status, 409);
    assert.equal((await closed.json()).code, 'agenda_item_closed');
    const other = await fetch(`${base}/media/agenda/${ITEM_ID}`, { method: 'PUT', headers: agent, body: JSON.stringify({ angle: 'x' }) });
    assert.equal(other.status, 403);
  });
  const update = pool.calls.find((c) => /UPDATE media_agenda_items/.test(c.text));
  assert.ok(update.params.includes('Jornal do Bairro'));
});

test('cobertura pública: só divulgações publicadas, sem nome nem id da conta', async () => {
  const pool = fakePool((text, params) => {
    if (/FROM media_agenda_items m/.test(text) && /status = 'publicada'/.test(text)) {
      assert.deepEqual(params, ['demanda', DEMAND_ID]);
      return { rows: [{ id: ITEM_ID, outlet_name: 'Jornal do Bairro', published_url: 'https://jornal.example/praca', published_on: '2026-09-23', profile_type: 'jornalista' }] };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/demands/${DEMAND_ID}/coverage`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.coverages.length, 1);
    assert.deepEqual(Object.keys(body.coverages[0]).sort(), ['id', 'outletName', 'profileType', 'publishedOn', 'publishedUrl']);
    assert.equal((await fetch(`${base}/demands/nao-uuid/coverage`)).status, 404);
  });
});
