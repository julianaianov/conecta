// Perfil de atuação territorial: funções puras de src/lib/app/profile.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collaborationLinks, emptyProfileActivity, normalizeProfileActivity, placeLabel, profileSignals,
} from "./profile.ts";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const party = (userId, name) => ({ userId, name, role: "partner", profileType: "empresa" });
const connection = (over = {}) => ({
  id: "c1", type: "partnership", status: "accepted",
  from: party(ME, "Eu"), to: party(OTHER, "Outra"),
  message: "", createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-02T00:00:00Z", events: [],
  ...over,
});

test("placeLabel junta bairro, cidade e UF só com o que existe", () => {
  assert.equal(placeLabel({ district: "Centro", municipality: "Duque de Caxias", uf: "RJ" }), "Centro, Duque de Caxias/RJ");
  assert.equal(placeLabel({ municipality: "Duque de Caxias" }), "Duque de Caxias");
  assert.equal(placeLabel({}), null);
});

test("sinais do perfil não repetem o post-vitrine da demanda", () => {
  const posts = [{ id: "a", demandId: null }, { id: "b", demandId: "d1" }, { id: "c" }];
  assert.deepEqual(profileSignals(posts).map((p) => p.id), ["a", "c"]);
});

test("vínculos de colaboração: só conexões aceitas ou concluídas, com a outra parte", () => {
  const links = collaborationLinks([
    connection(),
    connection({ id: "c2", status: "pending" }),
    connection({ id: "c3", status: "done", from: party(OTHER, "Outra"), to: party(ME, "Eu"), demandId: "d1", postTitle: "Horta", updatedAt: "2026-09-05T00:00:00Z" }),
    connection({ id: "c4", status: "declined" }),
  ], ME);
  assert.deepEqual(links.map((l) => l.connectionId), ["c3", "c1"]);
  assert.equal(links[0].party.userId, OTHER);
  assert.deepEqual(links[0].subject, { href: "/demandas/d1", title: "Horta" });
  assert.equal(links[1].subject, null);
});

test("atividade fora do formato não vira dado inventado", () => {
  assert.equal(normalizeProfileActivity(null), null);
  assert.equal(normalizeProfileActivity({ demands: "x" }), null);
  const empty = emptyProfileActivity(ME);
  assert.deepEqual(empty.demands, []);
  assert.deepEqual(empty.supportsGiven, []);
  assert.equal(empty.supportsReceived.total, 0);
  const normalized = normalizeProfileActivity({ ...empty, supportsReceived: { total: "3", confirmed: 1 } });
  assert.equal(normalized.supportsReceived.total, 3);
  assert.deepEqual(normalized.supportsReceived.byModality, []);
});
