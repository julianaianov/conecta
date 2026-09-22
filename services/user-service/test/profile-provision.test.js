const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const express = require('express');
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require('../src');
const { ensureProfile } = require('../src/profile-provision');
express.application.listen = listen;

const SECRET = 'test_jwt_secret';
const NEW_ID = '33333333-3333-3333-3333-333333333333';
const TARGET_ID = '44444444-4444-4444-4444-444444444444';
const MISSING_ID = '55555555-5555-5555-5555-555555555555';

function token(claims = {}) {
  return jwt.sign({
    userId: NEW_ID,
    email: 'conta.nova@dmconecta.test',
    name: 'Conta Nova',
    role: 'partner',
    profileType: 'empresa',
    avatarUrl: null,
    ...claims,
  }, SECRET);
}

function fkError() {
  const err = new Error('insert or update violates foreign key constraint');
  err.code = '23503';
  return err;
}

/**
 * Pool em memória que reproduz o que importa do user_db: `profiles.user_id`
 * único e as FKs de connections/scraps/testimonials para `profiles(user_id)`.
 */
function memoryPool(initialProfiles = []) {
  const profiles = new Map(initialProfiles.map((p) => [p.user_id, p]));
  const connections = new Map();
  const calls = [];
  return {
    profiles,
    calls,
    async query(text, params = []) {
      calls.push(text);
      if (text.includes('INSERT INTO profiles') && text.includes('ON CONFLICT (user_id) DO NOTHING')) {
        const [userId, name, avatarUrl, role, profileType] = params;
        if (profiles.has(userId)) return { rows: [], rowCount: 0 };
        profiles.set(userId, { id: `p-${userId}`, user_id: userId, name, avatar_url: avatarUrl, role, profile_type: profileType, phone: null });
        return { rows: [{ id: `p-${userId}` }], rowCount: 1 };
      }
      if (/^SELECT [a-z_, ]+ FROM profiles WHERE user_id=\$1/.test(text)) {
        const row = profiles.get(params[0]);
        return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (text.includes('INSERT INTO connections')) {
        const [type, fromId, toId, message] = params;
        if (!profiles.has(fromId) || !profiles.has(toId)) throw fkError();
        const id = `cx-${connections.size + 1}`;
        connections.set(id, { id, type, from_user_id: fromId, to_user_id: toId, message });
        return { rows: [{ id }], rowCount: 1 };
      }
      if (text.includes('FROM connections c') && text.includes('WHERE c.id = $1')) {
        const c = connections.get(params[0]);
        const from = profiles.get(c.from_user_id);
        const to = profiles.get(c.to_user_id);
        return {
          rows: [{
            ...c, status: 'pending', events: [], created_at: 'now', updated_at: 'now',
            from_name: from.name, from_role: from.role, from_profile_type: from.profile_type,
            to_name: to.name, to_role: to.role, to_profile_type: to.profile_type,
          }],
        };
      }
      if (text.includes('INSERT INTO scraps') || text.includes('INSERT INTO testimonials')) {
        const [authorId, targetId, content] = params;
        if (!profiles.has(authorId) || !profiles.has(targetId)) throw fkError();
        return { rows: [{ id: 'sc-1', author_id: authorId, target_user_id: targetId, content, created_at: 'now' }], rowCount: 1 };
      }
      if (text.includes('SELECT name, avatar_url FROM profiles')) {
        const row = profiles.get(params[0]);
        return { rows: row ? [row] : [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

async function withServer(pool, fn) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function post(url, body, auth = token()) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
}

const target = { user_id: TARGET_ID, name: 'Associação Bairro Verde', role: 'agent', profile_type: 'associacao' };

test('POST /me/provision cria o perfil a partir do token e é idempotente', async () => {
  const pool = memoryPool();
  await withServer(pool, async (base) => {
    const first = await post(`${base}/me/provision`);
    assert.equal(first.status, 201);
    const created = await first.json();
    assert.equal(created.user_id, NEW_ID);
    assert.equal(created.name, 'Conta Nova');
    assert.equal(created.role, 'partner');
    assert.equal(created.profile_type, 'empresa');

    const again = await post(`${base}/me/provision`);
    assert.equal(again.status, 200);
    assert.equal(pool.profiles.size, 1);
  });
});

test('POST /me/provision nunca sobrescreve um perfil existente', async () => {
  const pool = memoryPool([{ user_id: NEW_ID, name: 'Nome editado', role: 'partner', profile_type: 'empresa', phone: null }]);
  await withServer(pool, async (base) => {
    const res = await post(`${base}/me/provision`, {}, token({ name: 'Nome do token' }));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).name, 'Nome editado');
  });
});

test('POST /me/provision exige autenticação e nome no token', async () => {
  const pool = memoryPool();
  await withServer(pool, async (base) => {
    assert.equal((await post(`${base}/me/provision`, {}, null)).status, 401);
    assert.equal((await post(`${base}/me/provision`, {}, token({ name: '   ' }))).status, 422);
    assert.equal(pool.profiles.size, 0);
  });
});

test('conta nova consegue criar conexão mesmo sem ter chamado o provisionamento', async () => {
  const pool = memoryPool([target]);
  await withServer(pool, async (base) => {
    const res = await post(`${base}/connections`, { toUserId: TARGET_ID, type: 'support', message: 'Quero apoiar o mutirão' });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.from.userId, NEW_ID);
    assert.equal(data.from.name, 'Conta Nova');
    assert.equal(data.to.userId, TARGET_ID);
    assert.ok(pool.profiles.has(NEW_ID));
  });
});

test('conexão para conta sem perfil responde 404, não 500', async () => {
  const pool = memoryPool();
  await withServer(pool, async (base) => {
    const res = await post(`${base}/connections`, { toUserId: MISSING_ID, type: 'support', message: 'Olá' });
    assert.equal(res.status, 404);
  });
});

test('recados e depoimentos provisionam o perfil do autor', async () => {
  const pool = memoryPool([target]);
  await withServer(pool, async (base) => {
    const scrap = await post(`${base}/scraps`, { targetUserId: TARGET_ID, content: 'Parabéns pela ação' });
    assert.equal(scrap.status, 201);
    assert.equal((await scrap.json()).authorName, 'Conta Nova');
    const testimonial = await post(`${base}/testimonials`, { targetUserId: TARGET_ID, content: 'Trabalho sério' });
    assert.equal(testimonial.status, 201);
    const missing = await post(`${base}/scraps`, { targetUserId: MISSING_ID, content: 'Oi' });
    assert.equal(missing.status, 404);
  });
});

test('ensureProfile ignora tokens sem userId ou sem nome (refresh token)', async () => {
  const pool = memoryPool();
  assert.equal(await ensureProfile(pool, { userId: NEW_ID }), false);
  assert.equal(await ensureProfile(pool, null), false);
  assert.equal(pool.calls.length, 0);
});

test('migração 007 faz backfill idempotente sem copiar e-mail nem senha', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/007-profiles-backfill.sql'), 'utf8');
  const statements = sql.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.match(statements, /FROM pstdin/);
  assert.match(statements, /INSERT INTO profiles/);
  assert.match(statements, /ON CONFLICT \(user_id\) DO NOTHING/);
  assert.doesNotMatch(statements, /email|password/i);
  assert.doesNotMatch(statements, /phone/i);
});
