import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntime } from "./runtime.ts";

test("mantém a produção real mesmo sem uma URL externa de API", () => {
  const runtime = resolveRuntime({ environment: "production", apiUrl: "" });

  assert.equal(runtime.environment, "production");
  assert.equal(runtime.apiBase, "");
  assert.equal(runtime.hasApi, true);
  assert.equal(runtime.isProduction, true);
});

test("não considera homologação sem API como disponível", () => {
  const runtime = resolveRuntime({ environment: "homologation", apiUrl: "" });

  assert.equal(runtime.environment, "homologation");
  assert.equal(runtime.hasApi, false);
  assert.equal(runtime.isProduction, false);
});

test("normaliza a barra final de uma API local", () => {
  const runtime = resolveRuntime({ environment: "local", apiUrl: "http://localhost:8080/" });

  assert.equal(runtime.apiBase, "http://localhost:8080");
  assert.equal(runtime.hasApi, true);
});
