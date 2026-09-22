import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// services/migrations.manifest é a fonte única da ordem do schema: a infra
// (dmconecta-infra) aplica exatamente esta lista em volume novo e a cada deploy.
const services = path.resolve(import.meta.dirname, "../services");
const DATABASES = { "auth-service": "auth_db", "user-service": "user_db", "post-service": "post_db" };

function manifest() {
  return fs.readFileSync(path.join(services, "migrations.manifest"), "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [database, file, input, ...extra] = line.split(/\s+/);
      return { database, file, input, extra };
    });
}

test("toda migração versionada está no manifesto, e só uma vez", () => {
  const listed = manifest().map((entry) => entry.file);
  assert.equal(new Set(listed).size, listed.length);
  for (const service of Object.keys(DATABASES)) {
    const dir = path.join(services, service, "migrations");
    for (const name of fs.readdirSync(dir).filter((file) => file.endsWith(".sql"))) {
      assert.ok(listed.includes(`${service}/migrations/${name}`), `${service}/migrations/${name} fora do manifesto`);
    }
  }
});

test("cada entrada existe, vai para o banco do seu serviço e segue a numeração", () => {
  const last = {};
  for (const { database, file, input, extra } of manifest()) {
    assert.ok(fs.existsSync(path.join(services, file)), `${file} não existe`);
    const service = file.split("/")[0];
    assert.equal(database, DATABASES[service], `${file} no banco errado`);
    assert.ok(input === undefined || input === "auth-users-csv", `entrada desconhecida em ${file}`);
    assert.deepEqual(extra, []);
    const number = /\/migrations\/(\d{3})-/.exec(file)?.[1];
    if (number) {
      assert.ok(!last[service] || number > last[service], `${file} fora de ordem`);
      last[service] = number;
    }
  }
});

test("init.sql vem antes das migrações de cada banco", () => {
  const entries = manifest();
  for (const service of Object.keys(DATABASES)) {
    const files = entries.filter((entry) => entry.file.startsWith(`${service}/`)).map((entry) => entry.file);
    assert.equal(files[0], `${service}/init.sql`);
  }
});

test("migrações são idempotentes (sem CREATE/ADD sem IF NOT EXISTS)", () => {
  for (const { file } of manifest()) {
    const sql = fs.readFileSync(path.join(services, file), "utf8").replace(/--.*$/gm, "");
    assert.doesNotMatch(sql, /CREATE (TABLE|INDEX|UNIQUE INDEX) (?!IF NOT EXISTS)/i, file);
    assert.doesNotMatch(sql, /ADD COLUMN (?!IF NOT EXISTS)/i, file);
    assert.doesNotMatch(sql, /ADD VALUE (?!IF NOT EXISTS)/i, file);
    const types = sql.match(/CREATE TYPE/gi)?.length ?? 0;
    const guarded = sql.match(/EXCEPTION WHEN duplicate_object/gi)?.length ?? 0;
    assert.ok(types <= guarded, `${file}: CREATE TYPE sem bloco DO com duplicate_object`);
  }
});
