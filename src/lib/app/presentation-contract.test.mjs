import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("as ações existentes continuam disponíveis com apresentação discreta", () => {
  const card = read("src/components/app/PostCard.tsx");
  const detail = read("src/components/app/public/PostDetailClient.tsx");
  const feed = read("src/components/app/public/FeedClient.tsx");

  assert.match(card, /api\.toggleReaction\(post\.id\)/);
  assert.match(card, /post\.reactionsCount/);
  assert.match(detail, /api\.toggleReaction\(post\.id\)/);
  // Decisão 7: o autor não troca o status do post.
  assert.doesNotMatch(detail, /updatePostStatus|Atualizar status/);
  assert.match(detail, /api\.updatePostLocation/);
  assert.match(feed, /useAuth/);
  assert.match(feed, /<PostCard/);
});

test("o vocabulário de produto não usa a palavra rede", () => {
  const productFiles = [
    "src/components/Hero.tsx",
    "src/components/Community.tsx",
    "src/components/ImpactGallery.tsx",
    "src/components/app/AppShell.tsx",
    "src/components/app/PostCard.tsx",
    "src/components/app/public/FeedClient.tsx",
    "src/components/app/public/PostDetailClient.tsx",
    "src/components/app/public/ProfileClient.tsx",
    "src/components/app/public/ConnectionsClient.tsx",
    "src/components/app/public/RankingClient.tsx",
  ];

  const findings = productFiles.flatMap((relativePath) => {
    const source = read(relativePath);
    return /\bredes?\b/i.test(source) ? [relativePath] : [];
  });

  assert.deepEqual(findings, []);
});

test("o pulso usa composição de painel em vez de três colunas sociais", () => {
  const source = read("src/components/app/public/FeedClient.tsx");

  assert.doesNotMatch(source, /lg:grid-cols-\[260px_minmax\(0,1fr\)_280px\]/);
  assert.match(source, /Sinais|Demandas e iniciativas/);
  assert.match(source, /Próximo passo|Acompanhar/);
});
