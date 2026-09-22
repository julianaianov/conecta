const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Banco simulado com um único post oculto pela moderação: toda consulta que
// filtra por visibilidade não o encontra.
function hiddenPostPool() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (/visibility = 'visible'/.test(text)) {
        if (/COUNT\(\*\) FROM posts/.test(text)) return { rows: [{ count: '0' }] };
        return { rows: [] };
      }
      throw new Error(`Consulta sem filtro de visibilidade: ${text}`);
    },
  };
}

function auth(role = 'member', profileType = 'morador') {
  return {
    authorization: `Bearer ${jwt.sign({ userId: USER_ID, role, profileType, name: 'Ana' }, SECRET)}`,
    'content-type': 'application/json',
  };
}

test('post oculto some do feed, do mapa, do ranking e da página pública', async () => {
  const pool = hiddenPostPool();
  await withServer(pool, async (base) => {
    const feed = await fetch(`${base}/`);
    assert.equal(feed.status, 200);
    assert.deepEqual((await feed.json()).posts, []);

    const map = await fetch(`${base}/map`);
    assert.equal(map.status, 200);

    const detail = await fetch(`${base}/${POST_ID}`);
    assert.equal(detail.status, 404);

    const comments = await fetch(`${base}/${POST_ID}/comments`);
    assert.deepEqual(await comments.json(), []);
  });
  const ranking = pool.calls.filter(({ text }) => /FROM posts/.test(text));
  assert.ok(ranking.every(({ text }) => /visibility = 'visible'/.test(text)));
});

test('o ranking conta só posts visíveis', async () => {
  const calls = [];
  const pool = {
    async query(text) {
      calls.push(text);
      return { rows: [] };
    },
  };
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/ranking`)).status, 200);
  });
  const postsAggregate = calls.find((text) => /FROM posts/.test(text));
  assert.match(postsAggregate, /WHERE visibility = 'visible'/);
});

test('post oculto não recebe comentário, reação nem apoio', async () => {
  const pool = hiddenPostPool();
  await withServer(pool, async (base) => {
    const comment = await fetch(`${base}/${POST_ID}/comments`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ content: 'Oi' }),
    });
    assert.equal(comment.status, 404);

    const reaction = await fetch(`${base}/${POST_ID}/reactions`, { method: 'POST', headers: auth() });
    assert.equal(reaction.status, 404);

    const support = await fetch(`${base}/${POST_ID}/supports`, {
      method: 'POST', headers: auth(), body: JSON.stringify({ type: 'materials' }),
    });
    assert.equal(support.status, 404);
  });
  assert.ok(!pool.calls.some(({ text }) => /INSERT/.test(text)));
});

test('a operação vê a visibilidade no snapshot administrativo', async () => {
  const calls = [];
  const pool = { async query(text) { calls.push(text); return { rows: [] }; } };
  const server = createApp({ pool, secret: SECRET, operationUserIds: new Set([USER_ID]) }).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/admin-snapshot`, { headers: auth('agent', 'associacao') });
    assert.equal(response.status, 200);
    assert.ok(calls.some((text) => /SELECT .*visibility FROM posts/.test(text)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── D2: o Poder Público publica `message` ─────────────────────

test('Poder Público publica mensagem (D2)', async () => {
  const calls = [];
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('INSERT INTO posts')) return { rows: [{ id: POST_ID, type: params[3] }] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/`, {
      method: 'POST',
      headers: auth('government', 'prefeitura'),
      body: JSON.stringify({
        type: 'message', title: 'Aviso', description: 'Mutirão de limpeza no sábado',
        latitude: -22.9, longitude: -43.2,
      }),
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).type, 'message');
  });
  assert.equal(calls.find(({ text }) => text.includes('INSERT INTO posts')).params[3], 'message');
});

test('o schema aceita `message` em post_type, em banco novo e existente (D2)', () => {
  const services = path.join(__dirname, '..');
  const init = fs.readFileSync(path.join(services, 'init.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(services, 'migrations', '005-post-type-message.sql'), 'utf8');
  assert.match(init, /CREATE TYPE post_type AS ENUM \([^)]*'message'/);
  assert.match(migration, /ALTER TYPE post_type ADD VALUE IF NOT EXISTS 'message'/);
  const manifest = fs.readFileSync(path.join(services, '..', 'migrations.manifest'), 'utf8');
  assert.match(manifest, /^post_db post-service\/migrations\/005-post-type-message\.sql$/m);
});
