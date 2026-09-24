const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  STATUSES, STATUS_TRANSITIONS, TARGET_KINDS, SIGNALS, SIGNAL_LABELS, MEDIA_ROLES,
} = require('../src/media/constants');
const { validateCreate, validateUpdate } = require('../src/media/validation');

// Pautas da Comunicação (T28): vocabulário igual ao da migração 025 e
// validação das transições e da divulgação publicada.

const migration = fs.readFileSync(path.join(__dirname, '../migrations/025-media-agenda.sql'), 'utf8');

test('estados, alvos e ator da migração 025 batem com as constantes', () => {
  for (const status of STATUSES) assert.match(migration, new RegExp(`'${status}'`));
  for (const kind of TARGET_KINDS) assert.match(migration, new RegExp(`'${kind}'`));
  assert.match(migration, /'comunicacao'/);
  assert.match(migration, /divulgacao_registrada/);
  assert.deepEqual(MEDIA_ROLES, ['media']);
  for (const signal of SIGNALS) assert.ok(SIGNAL_LABELS[signal]);
});

test('publicada é final; descartada volta à apuração', () => {
  assert.deepEqual(STATUS_TRANSITIONS.publicada, []);
  assert.ok(STATUS_TRANSITIONS.descartada.includes('identificada'));
  assert.ok(STATUS_TRANSITIONS.identificada.includes('publicada'));
});

test('criar pauta exige alvo válido e aceita ângulo opcional', () => {
  const bad = validateCreate({ targetKind: 'perfil', targetId: 'x', angle: 'a'.repeat(1001) });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['angle', 'targetId', 'targetKind']);
  const ok = validateCreate({ targetKind: 'demanda', targetId: '11111111-1111-4111-8111-111111111111', angle: '  Praça sem luz  ' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.angle, 'Praça sem luz');
});

test('publicar exige veículo, URL https e data; transição inválida é recusada', () => {
  const current = { status: 'identificada', outlet_name: null, published_url: null, published_on: null };
  const missing = validateUpdate({ status: 'publicada' }, current);
  assert.deepEqual(Object.keys(missing.errors).sort(), ['outletName', 'publishedOn', 'publishedUrl']);
  const http = validateUpdate({ status: 'publicada', outletName: 'Jornal do Bairro', publishedUrl: 'http://x', publishedOn: '2026-09-20' }, current);
  assert.ok(http.errors.publishedUrl);
  const ok = validateUpdate({ status: 'publicada', outletName: 'Jornal do Bairro', publishedUrl: 'https://jornal.example/materia', publishedOn: '2026-09-20' }, current);
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.status, 'publicada');
  const back = validateUpdate({ status: 'identificada' }, { ...current, status: 'em_apuracao' });
  assert.ok(back.errors.status);
  const future = validateUpdate({ status: 'publicada', outletName: 'J', publishedUrl: 'https://j.example/a', publishedOn: '2099-01-01' }, current);
  assert.ok(future.errors.publishedOn);
});
