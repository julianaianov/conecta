import test from "node:test";
import assert from "node:assert/strict";
import { isIndexablePath, loginHref } from "./access.ts";

test("content routes are public and indexable", () => {
  assert.equal(isIndexablePath("/feed"), true);
  assert.equal(isIndexablePath("/post/post-1"), true);
  assert.equal(isIndexablePath("/perfil/user-1"), true);
  assert.equal(isIndexablePath("/post/post-1/apoiar"), false);
  assert.equal(isIndexablePath("/meus-apoios"), false);
});

test("login link preserves the protected destination", () => {
  assert.equal(loginHref("/post/post-1"), "/login?next=%2Fpost%2Fpost-1");
});
