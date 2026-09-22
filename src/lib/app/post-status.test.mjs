import test from "node:test";
import assert from "node:assert/strict";
import { normalizePostStatus, POST_STATUS_COLORS, POST_STATUS_LABELS } from "./types.ts";

test("status gravados pela gestão em posts antigos têm rótulo (D6)", () => {
  for (const status of ["em_analise", "encaminhada", "em_execucao", "resolvida", "cancelada"]) {
    assert.equal(normalizePostStatus(status), status);
    assert.ok(POST_STATUS_LABELS[status]);
    assert.ok(POST_STATUS_COLORS[status]);
  }
  assert.equal(POST_STATUS_LABELS.em_analise, "Em análise");
});

test("status desconhecido ou ausente não vira rótulo cru", () => {
  for (const value of ["arquivada", "", null, undefined, 3, "toString", "__proto__"]) {
    assert.equal(normalizePostStatus(value), null);
  }
  assert.equal(normalizePostStatus("active"), "active");
});

test("rótulos e cores cobrem exatamente o mesmo conjunto de status", () => {
  assert.deepEqual(Object.keys(POST_STATUS_COLORS).sort(), Object.keys(POST_STATUS_LABELS).sort());
});
