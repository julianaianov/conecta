import test from "node:test";
import assert from "node:assert/strict";
import { publicContentMetadata } from "./content-route-contract.ts";

test("a missing public record is not indexable", () => {
  assert.deepEqual(
    publicContentMetadata(null, "/post/missing").robots,
    { index: false, follow: true },
  );
});

test("public post data contains crawler-visible text", () => {
  const result = publicContentMetadata(
    { title: "Horta comunitária", description: "Projeto do bairro" },
    "/post/p-1",
  );
  assert.equal(result.title, "Horta comunitária | DM Conecta");
  assert.equal(result.alternates.canonical, "https://dmconecta.org/post/p-1");
});
