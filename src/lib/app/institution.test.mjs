import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  INSTITUTION_STATUS_LABELS,
  INSTITUTION_EDITABLE_STATUSES,
  LINKED_AGENT_PROFILES,
  PROFILE_ROLE,
  formatCnae,
  formatCnpj,
  institutionKindFor,
  requiresInstitutionalValidation,
} from "./types.ts";

test("estados de validação do cadastro institucional", () => {
  assert.deepEqual(Object.keys(INSTITUTION_STATUS_LABELS), ["pendente", "em_analise", "validada", "devolvida", "revogada"]);
  assert.deepEqual(INSTITUTION_EDITABLE_STATUSES, ["pendente", "devolvida", "revogada"]);
});

test("cadastro exigido por categoria (decisão 3 inclusa)", () => {
  assert.equal(institutionKindFor("agent", "ong"), "agente_transformacao");
  assert.equal(institutionKindFor("member", "lider_comunitario"), "agente_transformacao");
  assert.equal(institutionKindFor("institutional"), "poder_publico");
  assert.equal(institutionKindFor("partner", "empresa"), null);
  for (const profile of LINKED_AGENT_PROFILES) assert.equal(PROFILE_ROLE[profile], "agent");
});

test("só o Poder Público depende da validação para atuar", () => {
  assert.ok(requiresInstitutionalValidation("government", "prefeitura"));
  assert.ok(!requiresInstitutionalValidation("agent", "ong"));
  assert.ok(!requiresInstitutionalValidation("member"));
});

test("máscaras de CNPJ (inclusive alfanumérico) e CNAE", () => {
  assert.equal(formatCnpj("11222333000181"), "11.222.333/0001-81");
  assert.equal(formatCnpj("12abc34501de35"), "12.ABC.345/01DE-35");
  assert.equal(formatCnae("9430800"), "9430-8/00");
});

test("cliente usa as rotas persistentes do cadastro institucional", () => {
  const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
  for (const endpoint of ["/api/users/me/institution", "/api/users/me/institution/submit", "/api/users/me/institution/status", "/api/users/institutions/reference"]) {
    assert.ok(source.includes(endpoint), endpoint);
  }
});
