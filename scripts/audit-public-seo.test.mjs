import test from "node:test";
import assert from "node:assert/strict";
import { inspectHtml } from "./audit-public-seo.mjs";

test("audit extracts the HTML indexability contract", () => {
  const result = inspectHtml("<html><head><title>Feed</title><link rel=\"canonical\" href=\"https://dmconecta.org/feed\"></head><body><h1>Publicações</h1><p>Conteúdo</p></body></html>");
  assert.deepEqual(result, { title: "Feed", h1: "Publicações", canonical: "https://dmconecta.org/feed", noindex: false, bodyText: "Publicações Conteúdo" });
});
