const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const seed = fs.readFileSync(path.join(__dirname, '..', 'seed.sql'), 'utf8');
const mediaMigration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '003-post-media.sql'), 'utf8');

const postIds = [
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  '10101010-1010-1010-1010-101010101010',
  '20202020-2020-2020-2020-202020202020',
  '30303030-3030-3030-3030-303030303030',
  '40404040-4040-4040-4040-404040404040',
];

const titles = [
  'Buraco na Av. das Américas',
  'Doação de cestas básicas — famílias afetadas',
  'Mutirão de limpeza da praia',
  'Iluminação precária na Av. Gen. Barreto',
  'Campeonato de futebol comunitário',
  'Voluntários para reforço escolar',
  'Feira de Sustentabilidade do bairro',
  'Horta comunitária do bairro',
  'Plantio de mudas nativas na orla',
  'Alagamento na Rua Guignard',
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('post seed contains the ten deterministic feed publications', () => {
  for (const id of postIds) assert.match(seed, new RegExp(id));
  for (const title of titles) assert.match(seed, new RegExp(escapeRegExp(title)));
  for (const count of [12, 41, 28, 19, 26, 23, 22, 35, 17, 31]) {
    assert.match(seed, new RegExp(`\\b${count}\\b`));
  }
  assert.match(seed, /ARRAY\['infraestrutura', 'urgente', 'vias'\]/);
  assert.match(seed, /\/images\/buraco\.jpeg/);
  assert.match(seed, /\/images\/uploads\/cestas-basicas\.jpg/);
  assert.match(seed, /\/videos\/mutirao-praia\.webm/);
  assert.match(seed, /\/videos\/horta-comunitaria\.webm/);
});

test('post seed manifest has comments, supports and all feed media', () => {
  assert.equal((seed.match(/INSERT INTO posts/g) || []).length, 1);
  assert.equal((seed.match(/INSERT INTO comments/g) || []).length, 1);
  assert.equal((seed.match(/INSERT INTO supports/g) || []).length, 1);
  for (const count of [12, 41, 28, 19, 26, 23, 22, 35, 17, 31]) {
    assert.match(seed, new RegExp(`,\\s*${count},`));
  }
  const images = [
    '/images/buraco.jpeg',
    '/images/uploads/cestas-basicas.jpg',
    '/images/uploads/mutirao-praia.jpg',
    '/images/iluminacao.jpeg',
    '/images/uploads/futebol-comunitario.jpg',
    '/images/voluntario-refoco-escolar.jpeg',
    '/images/uploads/feira-sustentabilidade.jpg',
    '/images/horta.jpeg',
    '/images/stock/feira-verde.jpg',
    '/images/alagamento.jpeg',
  ];
  for (const img of images) {
    assert.match(seed, new RegExp(escapeRegExp(img)));
  }
});

test('post media migration is idempotent', () => {
  assert.match(mediaMigration, /ADD COLUMN IF NOT EXISTS\s+videos\s+TEXT\[\]/i);
});
