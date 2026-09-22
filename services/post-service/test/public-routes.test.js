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
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?author_id=11111111-1111-1111-1111-111111111111`);
    assert.equal(response.status, 200);
    assert.match(queries[0].sql, /author_id/);
    assert.deepEqual(queries[0].params, ['11111111-1111-1111-1111-111111111111', 20, 0]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('GET /:id/supports exposes only public support summary fields', async () => {
  const queries = [];
  const pool = {
    query(sql) {
      queries.push(sql);
      if (/GROUP BY type/.test(sql)) return Promise.resolve({ rows: [{ type: 'materials', count: 2 }] });
      return Promise.resolve({ rows: [{ id: 's-1', type: 'materials', created_at: '2026-09-20T12:00:00.000Z' }] });
    },
  };
  const server = createApp({ pool }).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/supports`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      summary: [{ type: 'materials', count: 2 }],
      supports: [{ id: 's-1', type: 'materials', created_at: '2026-09-20T12:00:00.000Z' }],
    });
    assert.ok(queries.some((sql) => /SELECT id, type, created_at FROM supports/.test(sql)));
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
