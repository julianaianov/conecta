import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function sourceAt(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("cliente provisiona o perfil no user-service", () => {
  const api = sourceAt("./api.ts");
  assert.match(api, /provisionProfile\(\)/);
  assert.match(api, /"\/api\/users\/me\/provision", \{ method: "POST"/);
});

test("cadastro, login e restauração de sessão garantem o perfil", () => {
  const auth = sourceAt("./auth.tsx");
  const calls = auth.match(/provisionProfile\(\)/g) ?? [];
  // definição do helper + chamada interna + verify + login + register
  assert.ok(calls.length >= 4, `esperava ao menos 4 chamadas, encontrei ${calls.length}`);
  assert.match(auth, /api\.register\(input\);\n\s+await provisionProfile\(\);/);
  assert.match(auth, /api\.login\(email, password\);\n\s+await provisionProfile\(\);/);
});

test("cadastro coleta só o necessário (LGPD): sem nascimento, gênero ou telefone", () => {
  const page = sourceAt("../../app/(auth)/register/page.tsx");
  assert.doesNotMatch(page, /birthdate|Data de nascimento/i);
  assert.doesNotMatch(page, /gender|Gênero/);
  assert.doesNotMatch(page, /phone|Celular|type="tel"/i);
});

test("migração de backfill de perfis existe e está registrada na carga da infra", () => {
  const migration = new URL("../../../services/user-service/migrations/007-profiles-backfill.sql", import.meta.url);
  assert.ok(existsSync(migration));
  const infraLoader = new URL("../../../../dmconecta-infra/db/init/10-load-application-schemas.sh", import.meta.url);
  if (existsSync(infraLoader)) {
    assert.match(readFileSync(infraLoader, "utf8"), /user-service\/migrations\/007-profiles-backfill\.sql/);
  }
});
