const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const express = require('express');
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require('../src');
express.application.listen = listen;

const SECRET = 'test_jwt_secret';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_ID = '22222222-2222-2222-2222-222222222222';

function token(userId = USER_ID) {
  return jwt.sign({
    userId,
    name: 'Maria Silva',
    role: 'member',
    profileType: 'morador',
  }, SECRET);
}

test('GET /connections/targets returns profile list without current user', async () => {
  const pool = {
    async query(text, params) {
      if (text.includes('FROM profiles') && text.includes('user_id !=')) {
        assert.equal(params[0], USER_ID);
        return {
          rows: [
            { user_id: OTHER_ID, name: 'Associação Bairro Verde', avatar_url: null, role: 'agent', profile_type: 'associacao' },
          ],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/connections/targets`, {
      headers: { authorization: `Bearer ${token()}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.length, 1);
    assert.equal(data[0].userId, OTHER_ID);
    assert.equal(data[0].name, 'Associação Bairro Verde');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('POST /connections creates connection and returns mapped party object', async () => {
  const pool = {
    async query(text) {
      if (text.includes('INSERT INTO profiles')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('INSERT INTO connections')) {
        return { rows: [{ id: 'cx-123' }] };
      }
      if (text.includes('FROM connections c') && text.includes('WHERE c.id = $1')) {
        return {
          rows: [{
            id: 'cx-123',
            type: 'support',
            status: 'pending',
            message: 'Ajuda no mutirão',
            post_id: null,
            post_title: null,
            outcome: null,
            events: [{ id: 'e1', label: 'Conexão solicitada', at: new Date().toISOString() }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            from_user_id: USER_ID,
            from_name: 'Maria Silva',
            from_avatar_url: null,
            from_role: 'member',
            from_profile_type: 'morador',
            to_user_id: OTHER_ID,
            to_name: 'Associação Bairro Verde',
            to_avatar_url: null,
            to_role: 'agent',
            to_profile_type: 'associacao',
          }],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/connections`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token()}`,
      },
      body: JSON.stringify({
        toUserId: OTHER_ID,
        type: 'support',
        message: 'Ajuda no mutirão',
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.id, 'cx-123');
    assert.equal(data.from.userId, USER_ID);
    assert.equal(data.to.userId, OTHER_ID);
    assert.equal(data.status, 'pending');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('GET /ranking returns partner, agent and volunteer tiers', async () => {
  const pool = {
    async query(text) {
      if (text.includes('FROM profiles')) {
        return {
          rows: [
            { user_id: 'p1', name: 'Empresa', role: 'partner', friend_count: 5, city: 'Rio' },
            { user_id: 'a1', name: 'Associação', role: 'agent', friend_count: 10, city: 'Rio' },
            { user_id: 'm1', name: 'Maria', role: 'member', friend_count: 3, city: 'Rio' },
          ],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };

  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    const port = server.address().port;
    const res = await fetch(`http://127.0.0.1:${port}/ranking`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.partner));
    assert.ok(Array.isArray(data.agent));
    assert.ok(Array.isArray(data.volunteer));
    assert.equal(data.partner[0].userId, 'p1');
    assert.equal(data.agent[0].userId, 'a1');
    assert.equal(data.volunteer[0].userId, 'm1');
    assert.equal('points' in data.partner[0], false);
    assert.equal('highlights' in data.agent[0], false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── Conversa dentro da conexão (T27) ───────────────────────

const CX_ID = '33333333-3333-4333-8333-333333333333';
const THIRD_ID = '44444444-4444-4444-8444-444444444444';

function messagesPool({ status = 'accepted' } = {}) {
  const calls = [];
  const rows = [
    { id: 'm1', connection_id: CX_ID, author_id: OTHER_ID, body: 'Podemos começar na sexta?', created_at: '2026-09-24T10:00:00.000Z', author_name: 'Associação Bairro Verde', author_avatar_url: null },
    { id: 'm2', connection_id: CX_ID, author_id: USER_ID, body: 'Sexta está ótimo.', created_at: '2026-09-24T11:00:00.000Z', author_name: 'Maria Silva', author_avatar_url: null },
  ];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('FROM connections WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2)')) {
        return params[1] === THIRD_ID
          ? { rows: [] }
          : { rows: [{ id: CX_ID, status, from_user_id: USER_ID, to_user_id: OTHER_ID }] };
      }
      if (text.includes('FROM connection_messages m') && text.includes('ORDER BY m.created_at DESC')) {
        return { rows: [...rows].reverse().slice(0, params.at(-1)) };
      }
      if (text.includes('INSERT INTO connection_message_reads')) return { rows: [], rowCount: 1 };
      if (text.includes('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO connection_messages')) return { rows: [{ id: 'm3' }] };
      if (text.includes('FROM connection_messages m') && text.includes('WHERE m.id = $1')) {
        return { rows: [{ id: 'm3', connection_id: CX_ID, author_id: USER_ID, body: params.body ?? 'Combinado, levo os materiais.', created_at: '2026-09-24T12:00:00.000Z', author_name: 'Maria Silva', author_avatar_url: null }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

async function withServer(pool, run) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('GET /connections/:id/messages: as partes leem em ordem cronológica e a leitura fica registrada', async () => {
  const pool = messagesPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/connections/${CX_ID}/messages`, { headers: { authorization: `Bearer ${token()}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.messages.map((m) => m.id), ['m1', 'm2']);
    assert.equal(body.messages[0].mine, false);
    assert.equal(body.messages[1].mine, true);
    assert.equal(body.messages[0].authorName, 'Associação Bairro Verde');
    assert.equal(body.hasMore, false);
    assert.equal(body.open, true);
  });
  const read = pool.calls.find((c) => c.text.includes('INSERT INTO connection_message_reads'));
  assert.ok(read, 'a leitura grava connection_message_reads');
  assert.deepEqual(read.params, [CX_ID, USER_ID]);
});

test('GET /connections/:id/messages: quem não é parte recebe 404, e limit inválido 400', async () => {
  await withServer(messagesPool(), async (base) => {
    const res = await fetch(`${base}/connections/${CX_ID}/messages`, { headers: { authorization: `Bearer ${token(THIRD_ID)}` } });
    assert.equal(res.status, 404);
    const bad = await fetch(`${base}/connections/${CX_ID}/messages?limit=500`, { headers: { authorization: `Bearer ${token()}` } });
    assert.equal(bad.status, 400);
  });
});

test('POST /connections/:id/messages: grava a mensagem de uma parte com a conexão em andamento', async () => {
  const pool = messagesPool({ status: 'pending' });
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/connections/${CX_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token()}` },
      body: JSON.stringify({ body: '  Combinado, levo os materiais.  ' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.id, 'm3');
    assert.equal(body.mine, true);
    assert.equal(body.connectionId, CX_ID);
  });
  const insert = pool.calls.find((c) => c.text.includes('INSERT INTO connection_messages'));
  assert.deepEqual(insert.params, [CX_ID, USER_ID, 'Combinado, levo os materiais.']);
});

test('POST /connections/:id/messages: corpo vazio ou longo é 400; conexão encerrada é 409; terceiro é 404', async () => {
  await withServer(messagesPool({ status: 'done' }), async (base) => {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token()}` };
    const empty = await fetch(`${base}/connections/${CX_ID}/messages`, { method: 'POST', headers, body: JSON.stringify({ body: '   ' }) });
    assert.equal(empty.status, 400);
    const long = await fetch(`${base}/connections/${CX_ID}/messages`, { method: 'POST', headers, body: JSON.stringify({ body: 'a'.repeat(2001) }) });
    assert.equal(long.status, 400);
    const closed = await fetch(`${base}/connections/${CX_ID}/messages`, { method: 'POST', headers, body: JSON.stringify({ body: 'Ainda dá?' }) });
    assert.equal(closed.status, 409);
    assert.equal((await closed.json()).code, 'connection_closed');
    const third = await fetch(`${base}/connections/${CX_ID}/messages`, {
      method: 'POST', headers: { ...headers, authorization: `Bearer ${token(THIRD_ID)}` }, body: JSON.stringify({ body: 'Oi' }),
    });
    assert.equal(third.status, 404);
  });
});

test('GET /notifications avisa mensagem não lida na conversa da conexão', async () => {
  const pool = {
    async query(text) {
      if (text.includes('FROM connections c') && text.includes("c.status = 'pending'")) return { rows: [] };
      if (text.includes('FROM connections c') && text.includes("c.status = 'accepted'")) return { rows: [] };
      if (text.includes('FROM connection_messages m')) {
        return { rows: [{ id: CX_ID, last_message_at: '2026-09-24T10:00:00.000Z', other_name: 'Associação Bairro Verde', unread: 2 }] };
      }
      if (text.includes('FROM organization_members m')) return { rows: [] };
      if (text.includes('FROM scraps s')) return { rows: [] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/notifications`, { headers: { authorization: `Bearer ${token()}` } });
    assert.equal(res.status, 200);
    const list = await res.json();
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, 'message');
    assert.equal(list[0].href, `/conexoes/${CX_ID}`);
    assert.match(list[0].summary, /2 mensagens/);
  });
});
