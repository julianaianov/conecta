const test = require('node:test');
const assert = require('node:assert/strict');
const { canPublish, canSupport, normalizeRole } = require('../src/roles');

test('só Agentes publicam demandas; Poder Público publica mensagens', () => {
  assert.ok(canPublish({ role: 'agent' }, 'problem'));
  assert.ok(canPublish({ role: 'government' }, 'message'));
  assert.ok(!canPublish({ role: 'government' }, 'project'));
  assert.ok(!canPublish({ role: 'member' }, 'problem'));
  assert.ok(!canPublish({ role: 'partner' }, 'project'));
  assert.ok(!canPublish({ role: 'media' }, 'message'));
});

test('tokens antigos continuam válidos', () => {
  assert.equal(normalizeRole('community'), 'agent');
  assert.equal(normalizeRole('citizen'), 'member');
  assert.equal(normalizeRole('institutional', 'imprensa'), 'media');
  assert.equal(normalizeRole('institutional'), 'government');
  assert.ok(canPublish({ role: 'community' }, 'project'));
});

test('Comunicação e Agentes apoiam só com divulgação', () => {
  assert.ok(canSupport({ role: 'media' }, 'sharing'));
  assert.ok(!canSupport({ role: 'media' }, 'financial'));
  assert.ok(!canSupport({ role: 'agent' }, 'materials'));
  assert.ok(canSupport({ role: 'partner' }, 'financial'));
  assert.ok(canSupport({ role: 'government' }, 'space'));
});
