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
    async query(text, params) {
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
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
