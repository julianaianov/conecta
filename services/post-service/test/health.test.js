const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require('../src');
express.application.listen = listen;

test('GET /health responds without querying the posts database', async () => {
  const pool = {
    query() {
      throw new Error('health must not query posts');
    },
  };
  const server = createApp({ pool }).listen(0);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok', service: 'post-service' });
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
