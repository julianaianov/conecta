const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('auth schema migration is idempotent and exposes avatar_url', () => {
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003-avatar-url.sql'), 'utf8');
  assert.match(migration, /ADD COLUMN IF NOT EXISTS\s+avatar_url/i);
});

test('auth seed contains the four canonical users with avatars and conflict update', () => {
  const seed = fs.readFileSync(path.join(__dirname, '..', 'seed.sql'), 'utf8');
  for (const email of [
    'maria@bairro.conecta',
    'ong@bairro.conecta',
    'prefeitura@bairro.conecta',
    'empresa@bairro.conecta',
  ]) {
    assert.match(seed, new RegExp(email));
  }
  for (const avatar of [
    '/images/stock/avatar-moradora.jpg',
    '/images/stock/avatar-lider.jpg',
    '/images/stock/avatar-governo.jpg',
    '/images/stock/avatar-empresa.jpg',
  ]) {
    assert.match(seed, new RegExp(avatar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(seed, /ON CONFLICT \(id\) DO UPDATE/);
});
