const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const usersSeed = fs.readFileSync(path.join(root, 'seed.sql'), 'utf8');

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
  assert.match(usersSeed, /INSERT INTO communities/);
});
