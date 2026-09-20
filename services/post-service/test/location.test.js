const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeCoordinates } = require('../src/location');

test('normaliza coordenadas válidas recebidas pela API', () => {
  assert.deepEqual(normalizeCoordinates('-23.0245', '-43.458'), {
    latitude: -23.0245,
    longitude: -43.458,
  });
});

test('rejeita coordenadas incompletas ou inválidas', () => {
  assert.equal(normalizeCoordinates(-23.0245, null), null);
  assert.equal(normalizeCoordinates('NaN', '-43.458'), null);
  assert.equal(normalizeCoordinates(91, 0), null);
});
