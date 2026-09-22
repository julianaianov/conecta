const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'test-secret';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function createPool() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('SELECT author_id FROM posts')) {
        return { rows: [{ author_id: USER_ID }] };
      }
      if (text.includes('INSERT INTO posts')) {
        return { rows: [{ id: POST_ID, videos: params[11] }] };
      }
      if (text.includes('UPDATE posts')) {
        return { rows: [{ id: POST_ID, videos: params[4] }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

function token() {
  return jwt.sign({
    userId: USER_ID,
    name: 'Maria Silva',
    role: 'agent',
    profileType: 'associacao',
  }, SECRET);
}

async function withServer(pool, callback) {
  const app = createApp({ pool, secret: SECRET });
  const server = app.listen(0);
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('POST / persists post videos with the image and tag payload', async () => {
  const pool = createPool();

  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'project',
        title: 'Mutirão de limpeza da praia',
        description: 'Todo sábado de manhã.',
        latitude: -23.0245,
        longitude: -43.458,
        images: ['/images/uploads/mutirao-praia.jpg'],
        videos: ['/videos/mutirao-praia.webm'],
        tags: ['meio-ambiente'],
      }),
    });

    assert.equal(response.status, 201);
    const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO posts'));
    assert.ok(insert);
    assert.match(insert.text, /videos/);
    assert.deepEqual(insert.params[11], ['/videos/mutirao-praia.webm']);
  });
});

test('PUT /:id persists replacement videos', async () => {
  const pool = createPool();

  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/${POST_ID}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token()}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        status: 'in_progress',
        images: ['/images/horta.jpeg'],
        videos: ['/videos/horta-comunitaria.webm'],
        tags: ['sustentabilidade'],
      }),
    });

    assert.equal(response.status, 200);
    const update = pool.calls.find(({ text }) => text.includes('UPDATE posts'));
    assert.ok(update);
    assert.match(update.text, /videos/);
    assert.deepEqual(update.params[4], ['/videos/horta-comunitaria.webm']);
  });
});
