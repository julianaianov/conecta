const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const usersSeed = fs.readFileSync(path.join(root, 'seed.sql'), 'utf8');
const profileMigration = fs.readFileSync(path.join(root, 'migrations', '003-profile-display.sql'), 'utf8');
const communityMigration = fs.readFileSync(path.join(root, 'migrations', '004-communities.sql'), 'utf8');

test('user seed contains the four feed authors and four communities', () => {
  for (const name of [
    'Maria Silva',
    'Associação Bairro Verde',
    'Subprefeitura Regional',
    'Construtora Nova Ltda',
  ]) {
    assert.match(usersSeed, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const name of [
    'Moradores do bairro',
    'Mutirão Bairro Verde',
    'Ciclistas da Orla',
    'Feira de Sustentabilidade',
  ]) {
    assert.match(usersSeed, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const id of ['c1', 'c2', 'c3', 'c4']) {
    assert.match(usersSeed, new RegExp(`\\b${id}\\b`));
  }
  for (const img of [
    '/images/comunidade.jpeg',
    '/images/uploads/mutirao-praia.jpg',
    '/images/ciclistas.jpeg',
    '/images/uploads/feira-sustentabilidade.jpg',
  ]) {
    assert.match(usersSeed, new RegExp(img.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(usersSeed, /INSERT INTO communities/);
  assert.match(usersSeed, /ON CONFLICT \(user_id\) DO UPDATE/);
  assert.match(usersSeed, /ON CONFLICT \(id\) DO UPDATE/);
});

test('profile and community migrations are idempotent', () => {
  for (const column of ['cover_url', 'status', 'neighborhood', 'member_since', 'friend_count']) {
    assert.match(profileMigration, new RegExp(`ADD COLUMN IF NOT EXISTS\\s+${column}`, 'i'));
  }
  assert.match(communityMigration, /CREATE TABLE IF NOT EXISTS communities/i);
  assert.match(communityMigration, /CREATE INDEX IF NOT EXISTS/i);
});
