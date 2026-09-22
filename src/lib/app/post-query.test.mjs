import test from "node:test";
import assert from "node:assert/strict";
import { buildPostQuery } from "./post-query.ts";

test("serializes the public author filter without losing pagination", () => {
  const query = buildPostQuery({ authorId: "user/1", limit: 50, offset: 10 });

  assert.equal(query.get("author_id"), "user/1");
  assert.equal(query.get("limit"), "50");
  assert.equal(query.get("offset"), "10");
});
