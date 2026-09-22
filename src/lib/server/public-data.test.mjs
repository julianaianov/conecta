import test from "node:test";
import assert from "node:assert/strict";
import { resolveServerApiBase } from "./public-api.ts";
import { getPublicPost, getPublicProfile, getPublicSupports } from "./public-data.ts";

test("internal service URL wins over the public API URL", () => {
  assert.equal(
    resolveServerApiBase("posts", {
      internalPosts: "http://post-service:3003/",
      publicApi: "http://localhost:8080",
      production: true,
    }),
    "http://post-service:3003",
  );
});

test("missing public sources keep typed empty results", async () => {
  assert.equal(await getPublicPost("missing"), null);
  assert.equal(await getPublicProfile("missing"), null);
  assert.deepEqual(await getPublicSupports("missing"), { summary: [], supports: [] });
});
