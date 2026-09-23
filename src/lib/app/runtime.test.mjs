import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntime, shouldUseDemoFallback } from "./runtime.ts";

test("mantém a produção real mesmo sem uma URL externa de API", () => {
  const runtime = resolveRuntime({ environment: "production", apiUrl: "" });

  assert.equal(runtime.environment, "production");
  assert.equal(runtime.apiBase, "");
  assert.equal(runtime.hasApi, true);
  assert.equal(runtime.demoAllowed, false);
  assert.equal(runtime.isProduction, true);
});

test("não permite dados sintéticos na homologação sem API configurada", () => {
  const runtime = resolveRuntime({ environment: "homologation", apiUrl: "" });

  assert.equal(runtime.environment, "homologation");
  assert.equal(runtime.hasApi, false);
  assert.equal(runtime.demoAllowed, false);
  assert.equal(runtime.isProduction, false);
});

test("normaliza a barra final de uma API local", () => {
  const runtime = resolveRuntime({ environment: "local", apiUrl: "http://localhost:8080/" });

  assert.equal(runtime.apiBase, "http://localhost:8080");
  assert.equal(runtime.hasApi, true);
  assert.equal(runtime.demoAllowed, false);
});

test("não usa fallback demo quando a API de produção falha", () => {
  const runtime = resolveRuntime({ environment: "production", apiUrl: "" });

  assert.equal(shouldUseDemoFallback(runtime, true), false);
  assert.equal(shouldUseDemoFallback(runtime, false), false);
});

test("nunca usa fallback demo quando um ambiente não tem API", () => {
  const runtime = resolveRuntime({ environment: "homologation", apiUrl: "" });

  assert.equal(shouldUseDemoFallback(runtime, false), false);
  assert.equal(shouldUseDemoFallback(runtime, true), false);
});
