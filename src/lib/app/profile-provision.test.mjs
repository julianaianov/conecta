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
  const dialog = sourceAt("../../components/RegisterDialog.tsx");
  assert.doesNotMatch(dialog, /birthdate|Data de nascimento/i);
  assert.doesNotMatch(dialog, /gender|Gênero/);
  assert.doesNotMatch(dialog, /phone|Celular|type="tel"/i);
  const route = sourceAt("../../app/(auth)/register/page.tsx");
  assert.match(route, /LandingExperience dialog="register"/);
});

test("migração de backfill de perfis existe e está no manifesto que a infra aplica", () => {
  const migration = new URL("../../../services/user-service/migrations/007-profiles-backfill.sql", import.meta.url);
  assert.ok(existsSync(migration));
  const manifest = readFileSync(new URL("../../../services/migrations.manifest", import.meta.url), "utf8");
  assert.match(manifest, /^user_db user-service\/migrations\/007-profiles-backfill\.sql auth-users-csv$/m);
  const infraLoader = new URL("../../../../dmconecta-infra/db/init/10-load-application-schemas.sh", import.meta.url);
  if (existsSync(infraLoader)) {
    assert.match(readFileSync(infraLoader, "utf8"), /migrations\.manifest/);
  }
});
