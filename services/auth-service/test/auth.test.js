const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'auth-service-test-secret-0123456789abcdef';
const USER = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'member',
  profile_type: 'morador',
  avatar_url: null,
  created_at: '2026-09-01T00:00:00.000Z',
};

function createPool() {
  const hash = bcrypt.hashSync('senha-correta', 4);
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push(text);
      if (text.includes('FROM users WHERE email=$1')) {
        if (params[0] !== USER.email) return { rows: [] };
        return { rows: [{ ...USER, password_hash: hash }] };
      }
      if (text.includes('FROM users WHERE id=$1')) return { rows: params[0] === USER.id ? [{ ...USER }] : [] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const postJson = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('o processo do auth-service não sobe sem JWT_SECRET forte', () => {
  const entry = path.join(__dirname, '..', 'src', 'index.js');
  for (const secret of [undefined, 'dev_secret', 'curto']) {
    const env = { ...process.env, NODE_ENV: 'production', PORT: '0' };
    if (secret === undefined) delete env.JWT_SECRET; else env.JWT_SECRET = secret;
    const result = spawnSync(process.execPath, [entry], { env, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(result.status, 0, String(secret));
    assert.match(result.stderr, /JWT_SECRET/);
  }
});

test('login nunca devolve password_hash e emite refresh token tipado', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const response = await postJson(`${base}/login`, { email: USER.email, password: 'senha-correta' });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal('password_hash' in body.user, false);
    assert.equal(body.user.email, USER.email);
    assert.equal(jwt.verify(body.token, SECRET).role, 'member');
    assert.equal(jwt.verify(body.refreshToken, SECRET).typ, 'refresh');

    assert.equal((await postJson(`${base}/login`, { email: USER.email, password: 'errada' })).status, 401);
  });
  assert.ok(pool.calls.every((sql) => !/SELECT \*/.test(sql)));
});

test('refresh aceita só refresh token; verify aceita só token de acesso', async () => {
  const access = jwt.sign({ userId: USER.id, email: USER.email, name: USER.name, role: USER.role }, SECRET);
  const refresh = jwt.sign({ userId: USER.id, typ: 'refresh' }, SECRET);
  const legacyRefresh = jwt.sign({ userId: USER.id }, SECRET);
  const forged = jwt.sign({ userId: USER.id, typ: 'refresh' }, 'dev_secret');
  await withServer(createPool(), async (base) => {
    assert.equal((await postJson(`${base}/refresh`, { refreshToken: refresh })).status, 200);
    assert.equal((await postJson(`${base}/refresh`, { refreshToken: legacyRefresh })).status, 200);
    assert.equal((await postJson(`${base}/refresh`, { refreshToken: access })).status, 401);
    assert.equal((await postJson(`${base}/refresh`, { refreshToken: forged })).status, 401);

    const verify = (t) => fetch(`${base}/verify`, { headers: { authorization: `Bearer ${t}` } });
    assert.equal((await verify(access)).status, 200);
    assert.equal((await verify(refresh)).status, 401);
    assert.equal((await verify(legacyRefresh)).status, 401);
  });
});
