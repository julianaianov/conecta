// Perfis declarados (T-04-03; decisão 18). Os dados abaixo existem só neste teste.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  DECLARATION_NOTICE,
  DECLARED_PROFILE_FIELDS,
  declaredKindFor,
  formFromDeclaredProfile,
  inputFromDeclaredForm,
  validateDeclaredForm,
} from "./declared-profile.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/user-service/src/declared-profiles.js");
const root = new URL("../../../", import.meta.url);

test("aviso e categorias iguais aos do user-service", () => {
  assert.equal(DECLARATION_NOTICE, server.DECLARATION_NOTICE);
  assert.equal(declaredKindFor("partner", "empresa"), "empresarial");
  assert.equal(declaredKindFor("media", "jornalista"), "comunicacao");
  assert.equal(declaredKindFor("agent", "ong"), null);
  assert.equal(declaredKindFor("government", "prefeitura"), null);
});

test("erros de campo usam as mesmas chaves do servidor", () => {
  const cases = [
    ["empresarial", server.validateBusinessProfile, {}],
    ["empresarial", server.validateBusinessProfile, { companyName: "Padaria", cnpj: "11.222.333/0001-82", website: "padaria.com" }],
    ["empresarial", server.validateBusinessProfile, { companyName: "Padaria", cnpj: "11.222.333/0001-81", website: "https://padaria.com.br" }],
    ["comunicacao", server.validateMediaProfile, {}],
    ["comunicacao", server.validateMediaProfile, { outletName: "Jornal", description: "x".repeat(2001) }],
  ];
  for (const [kind, validate, values] of cases) {
    const form = { ...formFromDeclaredProfile(kind, null), ...values };
    const client = Object.keys(validateDeclaredForm(kind, form)).sort();
    const serverKeys = Object.keys(validate(inputFromDeclaredForm(kind, form)).errors).sort();
    assert.deepEqual(client, serverKeys, `${kind}: ${JSON.stringify(values)}`);
  }
});

test("payload: textos aparados, vazios nulos e CNPJ sem máscara", () => {
  const input = inputFromDeclaredForm("empresarial", { companyName: " Padaria ", cnpj: "11.222.333/0001-81", segment: "", description: "", website: "" });
  assert.deepEqual(input, { companyName: "Padaria", cnpj: "11222333000181", segment: null, description: null, website: null });
  assert.deepEqual(DECLARED_PROFILE_FIELDS.comunicacao.map((f) => f.key), ["outletName", "professionalRegistry", "coverageArea", "description", "website"]);
});

test("o perfil mostra a seção com o aviso e sem selo", () => {
  const source = readFileSync(new URL("src/components/app/DeclaredProfileSection.tsx", root), "utf8");
  assert.match(source, /DECLARATION_NOTICE/);
  assert.doesNotMatch(source, /InstitutionSeal|validad[ao] pela equipe/);
  assert.match(readFileSync(new URL("src/components/app/ProfileView.tsx", root), "utf8"), /<DeclaredProfileSection/);
  const api = readFileSync(new URL("src/lib/app/api.ts", root), "utf8");
  for (const endpoint of ["/api/users/me/business-profile", "/api/users/me/media-profile", "/declared"]) assert.ok(api.includes(endpoint), endpoint);
});
