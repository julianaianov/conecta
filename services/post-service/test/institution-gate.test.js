const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { createInstitutionStatusClient } = require('../src/institution-gate');

const SECRET = 'test-secret';
const GOV = '22222222-2222-2222-2222-222222222222';
const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const headers = (role, profileType, userId = GOV) => ({
  authorization: `Bearer ${jwt.sign({ userId, name: 'Conta', role, profileType }, SECRET)}`,
  'content-type': 'application/json',
});

function createPool() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push(text);
      if (text.includes('INSERT INTO posts')) return { rows: [{ id: POST_ID, type: params[3] }] };
      if (text.includes('SELECT author_id, demand_id FROM posts')) return { rows: [{ author_id: GOV }] };
      if (text.includes('FROM posts')) return { rows: [{ id: POST_ID, visibility: 'visible', author_id: GOV }] };
      return { rows: [], rowCount: 0 };
    },
  };
}

async function withServer(options, callback) {
  const server = createApp({ secret: SECRET, ...options }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const MESSAGE = JSON.stringify({ type: 'message', title: 'Aviso', description: 'Programa municipal', latitude: -22.9, longitude: -43.2 });

test('Poder Público sem validação não publica, não comenta, não edita e não apoia', async () => {
  for (const status of [null, 'pendente', 'em_analise', 'devolvida', 'revogada']) {
    const pool = createPool();
    const institutionStatus = async () => ({ kind: status ? 'poder_publico' : null, status, canActInstitutionally: false });
    await withServer({ pool, institutionStatus }, async (base) => {
      const h = headers('government', 'secretaria');
      const attempts = [
        fetch(`${base}/`, { method: 'POST', headers: h, body: MESSAGE }),
        fetch(`${base}/${POST_ID}`, { method: 'PUT', headers: h, body: JSON.stringify({ title: 'x' }) }),
        fetch(`${base}/${POST_ID}/comments`, { method: 'POST', headers: h, body: JSON.stringify({ content: 'Resposta' }) }),
        fetch(`${base}/${POST_ID}/supports`, { method: 'POST', headers: h, body: JSON.stringify({ type: 'space' }) }),
      ];
      for (const res of await Promise.all(attempts)) {
        assert.equal(res.status, 403, String(status));
        const body = await res.json();
        assert.equal(body.code, 'institution_not_validated');
        assert.equal(body.validationStatus, status);
      }
    });
    assert.deepEqual(pool.calls, [], 'nada chega ao banco');
  }
});

test('Poder Público validado publica; falha na consulta recusa (fail-closed)', async () => {
  const pool = createPool();
  await withServer({ pool, institutionStatus: async () => ({ kind: 'poder_publico', status: 'validada', canActInstitutionally: true }) }, async (base) => {
    const res = await fetch(`${base}/`, { method: 'POST', headers: headers('government', 'prefeitura'), body: MESSAGE });
    assert.equal(res.status, 201);
  });
  await withServer({ pool: createPool(), institutionStatus: async () => { throw new Error('timeout'); } }, async (base) => {
    const res = await fetch(`${base}/`, { method: 'POST', headers: headers('institutional'), body: MESSAGE });
    assert.equal(res.status, 503);
  });
});

test('outras categorias não passam pelo gate institucional', async () => {
  let lookups = 0;
  const institutionStatus = async () => { lookups += 1; return { canActInstitutionally: false }; };
  await withServer({ pool: createPool(), institutionStatus }, async (base) => {
    const res = await fetch(`${base}/`, {
      method: 'POST', headers: headers('agent', 'ong'),
      body: JSON.stringify({ type: 'project', title: 'Horta', description: 'Horta comunitária', latitude: -22.9, longitude: -43.2 }),
    });
    assert.equal(res.status, 201);
  });
  assert.equal(lookups, 0);
});

test('cliente consulta o user-service com o token do usuário e guarda em cache curto', async () => {
  const requests = [];
  let clock = 0;
  let validated = false;
  const fetchImpl = async (url, init) => {
    requests.push({ url, authorization: init.headers.authorization });
    return { ok: true, json: async () => ({ kind: 'poder_publico', status: validated ? 'validada' : 'em_analise', canActInstitutionally: validated }) };
  };
  const lookup = createInstitutionStatusClient({ baseUrl: 'http://user-service:3002/', fetchImpl, now: () => clock });
  const req = { user: { userId: GOV }, headers: { authorization: 'Bearer abc' } };

  assert.equal((await lookup(req)).canActInstitutionally, false);
  assert.deepEqual(requests[0], { url: 'http://user-service:3002/me/institution/status', authorization: 'Bearer abc' });
  await lookup(req);
  assert.equal(requests.length, 1, 'dentro do TTL usa o cache');
  validated = true;
  clock = 10_001; // estado não validado expira rápido
  assert.equal((await lookup(req)).canActInstitutionally, true);
  assert.equal(requests.length, 2);
  clock = 50_000;
  await lookup(req);
  assert.equal(requests.length, 2, 'estado validado fica em cache por mais tempo');
});

test('cliente falha fechado: sem URL, resposta de erro ou corpo inválido', async () => {
  const req = { user: { userId: GOV }, headers: {} };
  await assert.rejects(createInstitutionStatusClient({ baseUrl: '' })(req), /DM_INTERNAL_USER_API_URL/);
  await assert.rejects(createInstitutionStatusClient({ baseUrl: 'http://x', fetchImpl: async () => ({ ok: false, status: 500 }) })(req), /500/);
  await assert.rejects(createInstitutionStatusClient({ baseUrl: 'http://x', fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })(req), /inválida/);
  const hanging = (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('abortado')));
  });
  await assert.rejects(createInstitutionStatusClient({ baseUrl: 'http://x', fetchImpl: hanging, timeoutMs: 20 })(req), /abortado/);
});

test('Compose local passa a URL interna do user-service ao post-service', () => {
  const compose = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docker-compose.yml'), 'utf8');
  const block = compose.split(/\n  post-service:\n/)[1].split(/\n  [a-z-]+:\n/)[0];
  assert.match(block, /DM_INTERNAL_USER_API_URL: http:\/\/user-service:3002/);
});
