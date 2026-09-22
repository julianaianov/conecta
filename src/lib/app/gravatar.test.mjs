import assert from "node:assert/strict";
import test from "node:test";
import * as format from "./format.ts";

test("gera a URL do Gravatar com o e-mail normalizado", () => {
  assert.equal(
    format.gravatarUrl?.("  MyEmail@Example.com ", 80),
    "https://www.gravatar.com/avatar/60a6c20d49f49bc210ac98d7e47c74a0?s=80&d=404",
  );
});

test("não gera Gravatar quando o e-mail está vazio", () => {
  assert.equal(format.gravatarUrl?.("  "), null);
});
