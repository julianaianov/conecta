import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCoordinates } from "./location.ts";

test("normaliza coordenadas válidas vindas do formulário", () => {
  assert.deepEqual(normalizeCoordinates("-23.0245", "-43.458"), {
    latitude: -23.0245,
    longitude: -43.458,
  });
});

test("não aceita localização parcialmente preenchida", () => {
  assert.equal(normalizeCoordinates(-23.0245, null), null);
  assert.equal(normalizeCoordinates(undefined, -43.458), null);
});

test("rejeita coordenadas não finitas ou fora dos limites geográficos", () => {
  assert.equal(normalizeCoordinates("NaN", "-43.458"), null);
  assert.equal(normalizeCoordinates(91, 0), null);
  assert.equal(normalizeCoordinates(0, 181), null);
});
