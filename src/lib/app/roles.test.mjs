import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  ROLE_PROFILES,
  PROFILE_ROLE,
  ROLE_PERMISSION_LABELS,
  allowedPostTypes,
  allowedSupportTypes,
  can,
  normalizeRole,
} from "./types.ts";

test("organiza os perfis nas 5 categorias do ecossistema", () => {
  assert.deepEqual(ROLES, ["agent", "member", "partner", "government", "media"]);
  assert.equal(PROFILE_ROLE.instituto, "agent");
  assert.equal(PROFILE_ROLE.imprensa, "media");
  assert.equal(PROFILE_ROLE.jornalista, "media");
  assert.equal(PROFILE_ROLE.orgao_publico, "government");
  for (const role of ROLES) {
    assert.ok(ROLE_PROFILES[role].length > 0, role);
    assert.ok(ROLE_PERMISSION_LABELS[role].length > 0, role);
  }
});

test("subperfis não se repetem entre categorias", () => {
  const all = ROLES.flatMap((r) => ROLE_PROFILES[r].map((p) => p.type));
  assert.equal(new Set(all).size, all.length);
});

test("converte as categorias antigas; o subperfil decide a divisão do Institucional", () => {
  assert.equal(normalizeRole("community"), "agent");
  assert.equal(normalizeRole("citizen"), "member");
  assert.equal(normalizeRole("institutional"), "government");
  assert.equal(normalizeRole("institutional", "imprensa"), "media");
  assert.equal(normalizeRole("institutional", "prefeitura"), "government");
  assert.equal(normalizeRole("organization"), "agent");
  assert.equal(normalizeRole(undefined), "member");
});

test("só Agentes publicam demandas e projetos; Poder Público publica respostas", () => {
  assert.ok(allowedPostTypes("agent").includes("problem"));
  assert.ok(allowedPostTypes("agent").includes("project"));
  assert.deepEqual(allowedPostTypes("government"), ["message"]);
  assert.deepEqual(allowedPostTypes("member"), []);
  assert.deepEqual(allowedPostTypes("partner"), []);
  assert.deepEqual(allowedPostTypes("media"), []);
  assert.ok(can("agent", "update_results"));
  assert.ok(can("government", "institutional_response"));
  assert.ok(!can("partner", "publish"));
});

test("ranking exclui o Poder Público; Comunicação conta no engajamento (decisão 18)", () => {
  assert.ok(can("partner", "ranking"));
  assert.ok(can("member", "ranking"));
  assert.ok(!can("government", "ranking"));
  assert.ok(can("media", "ranking"));
  assert.ok(can("media", "ranking", "jornalista"));
});

test("Comunicação e Agentes apoiam só com divulgação", () => {
  assert.deepEqual(allowedSupportTypes("media"), ["sharing"]);
  assert.deepEqual(allowedSupportTypes("agent"), ["sharing"]);
  assert.ok(allowedSupportTypes("partner").includes("financial"));
  assert.ok(allowedSupportTypes("government").includes("space"));
  assert.ok(allowedSupportTypes("member").includes("volunteering"));
});
