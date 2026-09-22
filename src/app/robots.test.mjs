import test from "node:test";
import assert from "node:assert/strict";
import robots from "./robots.ts";
import sitemap from "./sitemap.ts";

test("robots allows public crawlers and points to the canonical sitemap", () => {
  const result = robots();
  assert.equal(result.sitemap, "https://dmconecta.org/sitemap.xml");
  assert.ok(JSON.stringify(result.rules).includes("OAI-SearchBot"));
  assert.ok(JSON.stringify(result.rules).includes("/admin"));
  const disallowed = result.rules.flatMap((rule) => Array.isArray(rule.disallow) ? rule.disallow : [rule.disallow]).filter(Boolean);
  assert.ok(!disallowed.includes("/perfil"), "public profile URLs must not be blocked by a prefix rule");
});

test("sitemap never includes private action paths", async () => {
  const urls = await sitemap();
  const values = urls.map((entry) => entry.url);
  assert.ok(values.includes("https://dmconecta.org/feed"));
  assert.ok(values.every((url) => !/\/admin|\/meus-apoios|\/conexoes\/nova|\/apoiar/.test(url)));
});
