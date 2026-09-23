import assert from "node:assert/strict";
import { test } from "node:test";
import { nextStepFor, relevanceLabel, territoryLabel, themeLabels, updatesLabel } from "./signal.ts";

const base = { id: "p 1", status: "active", demandId: null };
const member = { canSupport: true, onlyShares: false };
const amplifier = { canSupport: true, onlyShares: true };
const observer = { canSupport: false, onlyShares: false };

test("próximo passo segue o perfil e o status do sinal", () => {
  assert.deepEqual(
    [nextStepFor(base, member).label, nextStepFor(base, member).href],
    ["Apoiar", "/post/p%201/apoiar"],
  );
  assert.deepEqual(
    [nextStepFor(base, amplifier).label, nextStepFor(base, amplifier).href],
    ["Divulgar", "/post/p%201/apoiar?type=sharing"],
  );
  assert.equal(nextStepFor(base, observer).label, "Acompanhar sinal");
  assert.equal(nextStepFor(base, observer).href, "/post/p%201");

  const showcase = { ...base, demandId: "d1" };
  assert.equal(nextStepFor(showcase, observer).label, "Ver a demanda estruturada");
  assert.equal(nextStepFor(showcase, observer).href, "/demandas/d1");
  assert.equal(nextStepFor(showcase, member).label, "Apoiar");
});

test("sinal resolvido leva ao resultado; cancelado, ao histórico", () => {
  for (const status of ["resolved", "resolvida"]) {
    const step = nextStepFor({ ...base, status, demandId: "d1" }, member);
    assert.equal(step.kind, "result");
    assert.equal(step.label, "Acompanhar resultado");
    assert.equal(step.href, "/demandas/d1");
  }
  assert.equal(nextStepFor({ ...base, status: "resolved" }, member).href, "/post/p%201");
  for (const status of ["cancelled", "cancelada"]) {
    assert.equal(nextStepFor({ ...base, status }, member).label, "Ver histórico");
  }
});

test("a reação nunca é o próximo passo", () => {
  for (const viewer of [member, amplifier, observer]) {
    for (const status of [null, "active", "in_progress", "resolved", "cancelled", "em_execucao"]) {
      const step = nextStepFor({ ...base, status }, viewer);
      assert.doesNotMatch(step.label, /curt|relevan|reag|reaç/i);
    }
  }
});

test("rótulos de contexto: território, temas, atualizações e relevância", () => {
  assert.equal(territoryLabel({ neighborhood: " Centro ", city: "Macaé" }), "Centro · Macaé");
  assert.equal(territoryLabel({ neighborhood: null, city: "" }), null);
  assert.deepEqual(themeLabels(["#saude", "  educação ", "", "##lixo", "extra"]), ["saude", "educação", "lixo"]);
  assert.deepEqual(themeLabels(undefined), []);
  assert.equal(updatesLabel(0), "Sem atualizações ainda");
  assert.equal(updatesLabel(1), "1 atualização");
  assert.equal(updatesLabel(4), "4 atualizações");
  assert.equal(relevanceLabel(0), "Nenhuma marcação de relevância");
  assert.equal(relevanceLabel(1), "1 pessoa marcou como relevante");
  assert.equal(relevanceLabel(3), "3 pessoas marcaram como relevante");
});
