const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const {
  resolveJwtSecret, jwtSecretProblem, parseOperationUserIds,
} = require('../src/security');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STRONG = 'Zk3pQ9vX2mL7tR4wN8cB1yH6jF5dG0sA';

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function recordingPool(rows = []) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('COUNT(*)')) return { rows: [{ count: String(rows.length) }] };
      return { rows };
    },
  };
}

// ── JWT_SECRET (D5) ─────────────────────────────────────────

test('JWT_SECRET ausente, curto ou de exemplo impede a subida fora de teste', () => {
  for (const env of [
    {},
    { JWT_SECRET: '' },
    { JWT_SECRET: 'dev_secret' },
    { JWT_SECRET: 'conecta_jwt_secret_local_dev' },
    { JWT_SECRET: 'replace-with-a-long-random-jwt-secret' },
    { JWT_SECRET: 'curto-demais' },
    { JWT_SECRET: 'a'.repeat(64) },
    { JWT_SECRET: 'dev_secret', NODE_ENV: 'production' },
  ]) {
    assert.throws(() => resolveJwtSecret(env), /JWT_SECRET/, JSON.stringify(env));
  }
  assert.equal(resolveJwtSecret({ JWT_SECRET: STRONG, NODE_ENV: 'production' }), STRONG);
  assert.equal(jwtSecretProblem(STRONG), null);
});

test('em teste, sem JWT_SECRET, o segredo é aleatório por processo (nunca um valor fixo)', () => {
  const a = resolveJwtSecret({ NODE_ENV: 'test' });
  const b = resolveJwtSecret({ NODE_ENV: 'test' });
  assert.notEqual(a, b);
  assert.notEqual(a, 'dev_secret');
  assert.ok(a.length >= 32);
});

test('o processo do serviço termina com erro quando JWT_SECRET falta', () => {
  const entry = path.join(__dirname, '..', 'src', 'index.js');
  const env = { ...process.env, NODE_ENV: 'production', PORT: '0' };
  delete env.JWT_SECRET;
  const result = spawnSync(process.execPath, [entry], { env, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET ausente/);
});

test('token assinado com o antigo fallback dev_secret é recusado', async () => {
  const forged = jwt.sign({ userId: USER_ID, role: 'agent', profileType: 'associacao', name: 'X' }, 'dev_secret');
  await withServer(recordingPool(), async (base) => {
    const response = await fetch(`${base}/my/supports`, { headers: { authorization: `Bearer ${forged}` } });
    assert.equal(response.status, 401);
  });
});

test('refresh token e token sem papel não valem como token de acesso', async () => {
  const refresh = jwt.sign({ userId: USER_ID, typ: 'refresh' }, SECRET);
  const legacyRefresh = jwt.sign({ userId: USER_ID }, SECRET);
  await withServer(recordingPool(), async (base) => {
    for (const t of [refresh, legacyRefresh]) {
      const response = await fetch(`${base}/my/supports`, { headers: { authorization: `Bearer ${t}` } });
      assert.equal(response.status, 401);
    }
  });
});

test('DM_OPERATION_USER_IDS aceita só UUIDs', () => {
  const ids = parseOperationUserIds({ DM_OPERATION_USER_IDS: ` ${USER_ID.toUpperCase()} , admin@example.com,, x ` });
  assert.deepEqual([...ids], [USER_ID]);
  assert.equal(parseOperationUserIds({}).size, 0);
});

// ── Projeções públicas (D4) ─────────────────────────────────

test('rotas públicas de posts e comentários usam projeção explícita', async () => {
  const pool = recordingPool([{ id: POST_ID }]);
  await withServer(pool, async (base) => {
    for (const url of ['/', '/map', `/${POST_ID}`, `/${POST_ID}/comments`]) {
      const response = await fetch(`${base}${url}`);
      assert.equal(response.status, 200, url);
    }
  });
  const selects = pool.calls.filter(({ text }) => /^\s*SELECT/i.test(text));
  assert.ok(selects.length >= 4);
  for (const { text } of selects) assert.doesNotMatch(text, /SELECT \*|\.\*/);
});

test('id malformado responde 404 sem consultar o banco', async () => {
  const pool = recordingPool();
  await withServer(pool, async (base) => {
    for (const url of ['/nao-e-uuid', '/nao-e-uuid/comments', '/nao-e-uuid/supports']) {
      const response = await fetch(`${base}${url}`);
      assert.equal(response.status, 404, url);
    }
  });
  assert.equal(pool.calls.length, 0);
});

// ── Autorização por dono ────────────────────────────────────

test('PUT /:id só pelo autor, e o status não é editável (decisão 7)', async () => {
  const pool = {
    calls: [],
    async query(text, params = []) {
      this.calls.push({ text, params });
      if (text.includes('SELECT author_id FROM posts')) return { rows: [{ author_id: USER_ID }] };
      if (text.includes('UPDATE posts')) return { rows: [{ id: POST_ID }] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  const as = (userId) => jwt.sign({ userId, role: 'agent', profileType: 'associacao', name: 'X' }, SECRET);
  await withServer(pool, async (base) => {
    const put = (userId, body) => fetch(`${base}/${POST_ID}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${as(userId)}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal((await put('22222222-2222-2222-2222-222222222222', { title: 'Invasão' })).status, 403);
    assert.equal((await put(USER_ID, { status: 'em_execucao' })).status, 400);
    assert.equal((await put(USER_ID, { status: 'resolved' })).status, 400);
    assert.equal((await put(USER_ID, { status: null })).status, 400);
    assert.equal((await put(USER_ID, { title: 'Novo título' })).status, 200);
  });
  assert.ok(!pool.calls.some(({ text, params }) => text.includes('UPDATE posts') && params.includes('Invasão')));
  assert.ok(!pool.calls.some(({ text }) => /UPDATE posts SET[^]*status=/.test(text)));
});

test('os três serviços usam a mesma cópia de src/security.js', () => {
  const fs = require('node:fs');
  const read = (service) => fs.readFileSync(path.join(__dirname, '..', '..', service, 'src', 'security.js'), 'utf8');
  const reference = read('post-service');
  assert.equal(read('user-service'), reference);
  assert.equal(read('auth-service'), reference);
});
