const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'test-secret';
const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function token() {
  return jwt.sign({ userId: 'admin-user', email: 'admin@example.com', role: 'member' }, SECRET);
}

function createPool() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('FROM posts')) {
        return {
          rows: [{
            id: POST_ID,
            author_id: '11111111-1111-1111-1111-111111111111',
            title: 'Horta comunitária',
            created_at: '2026-09-20T12:00:00.000Z',
          }],
        };
      }
      if (text.includes('FROM supports')) {
        return {
          rows: [{
            id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
            post_id: POST_ID,
            type: 'materials',
            created_at: '2026-09-20T13:00:00.000Z',
          }],
        };
      }
      if (text.includes('FROM comments')) {
        return {
          rows: [{
            id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
            post_id: POST_ID,
            content: 'Posso ajudar no sábado.',
            created_at: '2026-09-20T14:00:00.000Z',
          }],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('GET /admin-snapshot requires authentication', async () => {
  await withServer(createPool(), async (base) => {
    const response = await fetch(`${base}/admin-snapshot`);
    assert.equal(response.status, 401);
  });
});

test('GET /admin-snapshot returns persisted posts, supports, and comments', async () => {
  const pool = createPool();

  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/admin-snapshot`, {
      headers: { authorization: `Bearer ${token()}` },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      posts: [{
        id: POST_ID,
        author_id: '11111111-1111-1111-1111-111111111111',
        title: 'Horta comunitária',
        created_at: '2026-09-20T12:00:00.000Z',
      }],
      supports: [{
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        post_id: POST_ID,
        type: 'materials',
        created_at: '2026-09-20T13:00:00.000Z',
      }],
      comments: [{
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        post_id: POST_ID,
        content: 'Posso ajudar no sábado.',
        created_at: '2026-09-20T14:00:00.000Z',
      }],
    });

    assert.equal(pool.calls.length, 3);
    assert.ok(pool.calls.some(({ text }) => text.includes('FROM posts')));
    assert.ok(pool.calls.some(({ text }) => text.includes('FROM supports')));
    assert.ok(pool.calls.some(({ text }) => text.includes('FROM comments')));
  });
});
