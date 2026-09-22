const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

test('apoio financeiro falha fechado sem provedor de pagamento real', async () => {
  const calls = [];
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      throw new Error(`nenhuma consulta deveria ocorrer: ${text}`);
    },
  };
  const token = jwt.sign({
    userId: '11111111-1111-1111-1111-111111111111',
    name: 'Pessoa real',
    role: 'partner',
  }, 'test-secret');
  const server = createApp({ pool, secret: 'test-secret' }).listen(0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/supports`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ type: 'financial', amount: 10, payment_method: 'pix' }),
    });

    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /indisponível/i);
    assert.deepEqual(calls, []);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
