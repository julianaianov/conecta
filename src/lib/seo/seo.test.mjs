import test from "node:test";
import assert from "node:assert/strict";
import { absoluteUrl, metadataForPage } from "./site.ts";
import { postJsonLd, profileJsonLd } from "./structured-data.ts";

test("canonical URL is absolute and strips a trailing slash", () => {
  assert.equal(absoluteUrl("/post/post-1"), "https://dmconecta.org/post/post-1");
  assert.equal(absoluteUrl("/"), "https://dmconecta.org/");
});

test("metadata and JSON-LD describe the same public resource", () => {
  const metadata = metadataForPage({ title: "Buraco na avenida", description: "Demanda local", path: "/post/post-1" });
  const post = postJsonLd({ id: "post-1", title: "Buraco na avenida", description: "Demanda local", authorName: "Maria", authorId: "u-1", createdAt: "2026-09-20T10:00:00.000Z", images: [], videos: [], tags: [], type: "problem", status: "active", reactionsCount: 0, commentsCount: 0, viewsCount: 0, latitude: null, longitude: null, neighborhood: null, city: null }, absoluteUrl("/post/post-1"));
  assert.equal(metadata.alternates?.canonical, "https://dmconecta.org/post/post-1");
  assert.equal(post.url, "https://dmconecta.org/post/post-1");
  assert.equal(profileJsonLd({ userId: "u-1", name: "Maria", role: "member", profileType: null }, "https://dmconecta.org/perfil/u-1").url, "https://dmconecta.org/perfil/u-1");
});
