const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

const SECRET = 'test-secret';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const POST_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function token() {
  return jwt.sign({ userId: USER_ID, name: 'Maria Silva', role: 'agent', profileType: 'associacao' }, SECRET);
}

function createPool() {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('SELECT author_id, demand_id FROM posts')) return { rows: [{ author_id: USER_ID }] };
      if (text.includes('INSERT INTO posts')) return { rows: [{ id: POST_ID, latitude: params[6], longitude: params[7] }] };
      if (text.includes('UPDATE posts')) return { rows: [{ id: POST_ID, latitude: params[5], longitude: params[6] }] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function headers() {
  return { authorization: `Bearer ${token()}`, 'content-type': 'application/json' };
}

test('POST exige uma localização completa para o sinal entrar no mapa', async () => {
  const pool = createPool();

  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ type: 'project', title: 'Horta', description: 'Mutirão local' }),
    });

    assert.equal(response.status, 400);
    assert.equal(pool.calls.length, 0);
  });
});

test('POST e PUT persistem o mesmo par de coordenadas válidas', async () => {
  const pool = createPool();

  await withServer(pool, async (base) => {
    const createResponse = await fetch(`${base}/`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        type: 'project',
        title: 'Horta',
        description: 'Mutirão local',
        latitude: '-23.0245',
        longitude: '-43.458',
      }),
    });
    assert.equal(createResponse.status, 201);
    const insert = pool.calls.find(({ text }) => text.includes('INSERT INTO posts'));
    assert.deepEqual(insert.params.slice(6, 8), [-23.0245, -43.458]);

    const updateResponse = await fetch(`${base}/${POST_ID}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ latitude: -23.025, longitude: -43.459 }),
    });
    assert.equal(updateResponse.status, 200);
    const update = pool.calls.find(({ text }) => text.includes('UPDATE posts'));
    assert.deepEqual(update.params.slice(5, 7), [-23.025, -43.459]);
  });
});

test('POST rejeita localização parcial ou fora dos limites geográficos', async () => {
  const pool = createPool();

  await withServer(pool, async (base) => {
    for (const coordinates of [
      { latitude: -23.0245 },
      { latitude: 91, longitude: 0 },
    ]) {
      const response = await fetch(`${base}/`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ type: 'project', title: 'Horta', description: 'Mutirão local', ...coordinates }),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(pool.calls.length, 0);
  });
});

test('GET /map só consulta registros com as duas coordenadas', async () => {
  const calls = [];
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      return { rows: [{ id: POST_ID, latitude: -23.0245, longitude: -43.458 }] };
    },
  };

  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/map`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: POST_ID, latitude: -23.0245, longitude: -43.458 }]);
    assert.match(calls[0].text, /latitude IS NOT NULL AND longitude IS NOT NULL/);
  });
});
