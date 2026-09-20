const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require('../src');
express.application.listen = listen;

test('GET / accepts a public author_id filter without a token', async () => {
  const queries = [];
  const pool = {
    query(sql, params = []) {
      queries.push({ sql, params });
      return Promise.resolve({
        rows: sql.includes('COUNT') ? [{ count: '1' }] : [{ id: 'p-1', author_id: 'u-1' }],
      });
    },
  };
  const server = createApp({ pool }).listen(0);

  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?author_id=u-1`);
    assert.equal(response.status, 200);
    assert.match(queries[0].sql, /author_id/);
    assert.deepEqual(queries[0].params, ['u-1', 20, 0]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
