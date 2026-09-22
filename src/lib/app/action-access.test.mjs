import test from "node:test";
import assert from "node:assert/strict";
import { actionRequiresAuth } from "./access.ts";

test("read surfaces are public while mutations require a session", () => {
  assert.equal(actionRequiresAuth("read-post"), false);
  assert.equal(actionRequiresAuth("create-post"), true);
  assert.equal(actionRequiresAuth("comment"), true);
  assert.equal(actionRequiresAuth("support"), true);
  assert.equal(actionRequiresAuth("connection"), true);
});
