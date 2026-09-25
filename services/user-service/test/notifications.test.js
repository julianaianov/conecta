// Central de notificações do user_db (T-05-16): rotas com banco simulado. Os
// triggers da migração 016 (conexão, mensagem, convite) são exercitados contra
// PostgreSQL de verdade em services/post-service/test/notifications-e2e.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

const express = require('express');
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require('../src');
express.application.listen = listen;
const { createMailer } = require('../src/notifications/mailer');

const SECRET = 'test_jwt_secret';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const N1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CX = '33333333-3333-3333-3333-333333333333';

const token = (userId = USER_ID) => jwt.sign({ userId, name: 'Maria Silva', role: 'member', profileType: 'morador' }, SECRET);

async function withServer(pool, run) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function call(base, method, url, body, userId = USER_ID) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { authorization: `Bearer ${token(userId)}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

test('GET /notifications: avisos persistidos da conta, com o nome de quem agiu lido do perfil', async () => {
  const seen = [];
  const pool = {
    async query(text, params) {
      seen.push({ text, params });
      if (text.includes('FROM notifications n') && text.includes('LEFT JOIN profiles p')) {
        assert.equal(params[0], USER_ID);
        assert.match(text, /n\.read_at IS NULL/);
        assert.deepEqual(params[1], ['conexao', 'nova_mensagem']);
        assert.equal(params[2], 3, 'pede um a mais para saber se há mais');
        return {
          rows: [
            { id: N1, kind: 'nova_mensagem', title: 'Nova mensagem na conexão', summary: 'enviou uma mensagem na conexão',
              href: `/conexoes/${CX}`, connection_id: CX, created_at: '2026-09-24T10:00:00.000Z', read_at: null,
              actor_name: 'Associação Bairro Verde' },
            { id: 'b', kind: 'conexao', title: 't', created_at: '2026-09-23T10:00:00.000Z' },
            { id: 'c', kind: 'conexao', title: 't', created_at: '2026-09-22T10:00:00.000Z' },
          ],
        };
      }
      if (text.includes('count(*)::int AS n FROM notifications')) return { rows: [{ n: 4 }] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const res = await call(base, 'GET', '/notifications?unread=1&kind=conexao,nova_mensagem&limit=2');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.unreadCount, 4);
    assert.equal(res.body.hasMore, true);
    assert.equal(res.body.notifications.length, 2);
    const [first] = res.body.notifications;
    assert.deepEqual(
      [first.kind, first.actorName, first.href, first.connectionId, first.scope, first.readAt],
      ['nova_mensagem', 'Associação Bairro Verde', `/conexoes/${CX}`, CX, 'user', null],
    );
  });
  assert.ok(!seen.some((q) => /scraps|recado/i.test(q.text)), 'recado (legado) não entra no sino');
});

test('GET /notifications: filtro inválido responde 422 e sem token 401', async () => {
  const pool = { async query(text) { throw new Error(`Unexpected query: ${text}`); } };
  await withServer(pool, async (base) => {
    const bad = await call(base, 'GET', '/notifications?kind=curtida&limit=500&before=ontem');
    assert.equal(bad.status, 422);
    assert.deepEqual(Object.keys(bad.body.fields).sort(), ['before', 'kind', 'limit']);
    const anon = await fetch(`${base}/notifications`);
    assert.equal(anon.status, 401);
  });
});

test('POST /notifications/read: marca só as da própria conta; all marca todas', async () => {
  const updates = [];
  const pool = {
    async query(text, params) {
      if (text.startsWith('UPDATE notifications SET read_at = NOW()')) {
        updates.push({ text, params });
        assert.equal(params[0], USER_ID);
        return { rowCount: params[1] ? params[1].length : 5 };
      }
      if (text.includes('count(*)::int AS n FROM notifications')) return { rows: [{ n: 0 }] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const one = await call(base, 'POST', '/notifications/read', { ids: [N1, N1.toUpperCase()] });
    assert.equal(one.status, 200);
    assert.deepEqual(one.body, { updated: 1, unreadCount: 0 });
    assert.match(updates[0].text, /user_id = \$1 AND read_at IS NULL AND id = ANY\(\$2::uuid\[\]\)/);
    assert.deepEqual(updates[0].params[1], [N1]);
    const all = await call(base, 'POST', '/notifications/read', { all: true });
    assert.equal(all.body.updated, 5);
    assert.doesNotMatch(updates[1].text, /ANY/);
    assert.equal((await call(base, 'POST', '/notifications/read', { ids: ['x'] })).status, 422);
    assert.equal((await call(base, 'POST', '/notifications/read', {})).status, 422);
  });
});

test('preferências: sem linha, aplicativo e e-mail ligados; PUT grava e valida', async () => {
  let saved = [];
  const pool = {
    async query(text, params) {
      if (text.includes('FROM notification_preferences')) return { rows: saved };
      if (text.includes('INSERT INTO notification_preferences')) {
        assert.equal(params[0], USER_ID);
        saved = params[1].map((kind, i) => ({ kind, in_app: params[2][i], email: params[3][i] }));
        return { rowCount: saved.length };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const initial = await call(base, 'GET', '/notifications/preferences');
    assert.equal(initial.status, 200);
    assert.ok(initial.body.preferences.every((p) => p.inApp && p.email));
    const put = await call(base, 'PUT', '/notifications/preferences', {
      preferences: [{ kind: 'nova_mensagem', inApp: true, email: false }],
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.body.preferences.find((p) => p.kind === 'nova_mensagem'), { kind: 'nova_mensagem', inApp: true, email: false });
    const bad = await call(base, 'PUT', '/notifications/preferences', { preferences: [{ kind: 'curtida', inApp: true, email: 'sim' }] });
    assert.equal(bad.status, 422);
  });
});

test('o módulo de notificações e o laço de e-mail são a mesma cópia nos dois serviços', () => {
  for (const file of ['index.js', 'mailer.js']) {
    const here = fs.readFileSync(path.join(__dirname, '../src/notifications', file), 'utf8');
    const there = fs.readFileSync(path.join(__dirname, '../../post-service/src/notifications', file), 'utf8');
    assert.equal(here, there, `src/notifications/${file} divergiu`);
  }
});

test('os tipos da migração 016 são os do módulo e os da migração 039 do post_db', () => {
  const { NOTIFICATION_KINDS } = require('../src/notifications');
  const kindsOf = (file) => {
    const sql = fs.readFileSync(file, 'utf8');
    const block = sql.slice(sql.indexOf('INSERT INTO notification_kinds (kind) VALUES\n'), sql.indexOf('ON CONFLICT (kind)'));
    return [...block.matchAll(/\('([a-z_]+)'\)/g)].map((m) => m[1]);
  };
  assert.deepEqual(kindsOf(path.join(__dirname, '../migrations/016-notifications.sql')), NOTIFICATION_KINDS);
  assert.deepEqual(kindsOf(path.join(__dirname, '../../post-service/migrations/039-notifications.sql')), NOTIFICATION_KINDS);
});

test('sem DM_MAIL_PROVIDER o laço marca a caixa de saída como desligada', async () => {
  const queries = [];
  const pool = { async query(text, params) { queries.push({ text, params }); return { rowCount: 3, rows: [] }; } };
  const mailer = createMailer({ pool, env: {} });
  assert.deepEqual(await mailer.tick(), { disabled: 3 });
  assert.match(queries[0].text, /SET status = 'desligado'/);
});
