const test = require('node:test');
const assert = require('node:assert/strict');

const express = require('express');
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require('../src');
express.application.listen = listen;

test('GET /communities returns the ordered community rows without authentication', async () => {
  const calls = [];
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (/FROM communities ORDER BY member_count DESC, name ASC/.test(text) && !text.includes('*')) {
        return {
          rows: [{
            id: 'c1',
            name: 'Moradores do bairro',
            description: 'Grupo oficial de moradores do bairro.',
            category: 'Bairro',
            member_count: 1247,
            image_url: '/images/comunidade.jpeg',
          }],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  const server = createApp({ pool }).listen(0);

  try {
    const address = server.address();
    const response = await fetch(`http://127.0.0.1:${address.port}/communities`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{
      id: 'c1',
      name: 'Moradores do bairro',
      description: 'Grupo oficial de moradores do bairro.',
      category: 'Bairro',
      member_count: 1247,
      image_url: '/images/comunidade.jpeg',
    }]);
    assert.equal(calls.length, 1);
    assert.match(calls[0].text.replace(/\s+/g, " "), /SELECT id, name, description, category, member_count, image_url, created_at, updated_at FROM communities ORDER BY member_count DESC, name ASC/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
