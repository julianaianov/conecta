import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./api.ts", import.meta.url), "utf8");

function sourceAt(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("cliente de produção não importa nem executa dados demo", () => {
  assert.doesNotMatch(source, /from ["']\.\/demo["']/);
  assert.doesNotMatch(source, /\bDEMO_[A-Z_]+\b/);
  assert.doesNotMatch(source, /\bdemo\./);
  assert.doesNotMatch(source, /\bhybrid\(/);
});

test("operações de conexão usam o serviço persistente", () => {
  assert.doesNotMatch(source, /demo\.(connectionsFor|getConnection|connectionTargets|createConnection|updateConnection)\(/);
  assert.match(source, /\/api\/users\/connections/);
});

test("operações sociais e administrativas usam endpoints persistentes", () => {
  assert.doesNotMatch(source, /demo\.(notifications|scrapsFor|addScrap|testimonialsFor|addTestimonial|friendsOf|ranking|snapshot)\(/);
  // Recados e depoimentos saíram do perfil (perfil de atuação territorial): as
  // rotas continuam no user-service para a LGPD, mas o cliente não as chama.
  for (const endpoint of ["/api/users/notifications", "/api/users/ranking", "/api/posts/ranking", "/api/users/admin-snapshot", "/api/posts/admin-snapshot", "/api/posts/profiles/"]) {
    assert.match(source, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

test("pontuação e localização não inventam registros quando a base não informa dados", () => {
  const ranking = sourceAt("./ranking.ts");
  const userRanking = sourceAt("../../../services/user-service/src/routes/social.js");
  const postRoutes = sourceAt("../../../services/post-service/src/routes/posts.js");
  const createPage = sourceAt("../../app/(app)/criar/page.tsx");

  assert.doesNotMatch(ranking, /1000|500|200|friend_count/);
  assert.doesNotMatch(userRanking, /Alguém|Usuário|Rio de Janeiro|Centro|Bairro/);
  assert.match(postRoutes, /Apoio financeiro indisponível/);
  assert.doesNotMatch(createPage, /DEFAULT_(CITY|NEIGHBORHOOD)/);
});

test("superfícies de produto não contêm catálogos ou integrações sintéticas", () => {
  for (const file of [
    "../server/public-data.ts",
    "../../app/(auth)/login/page.tsx",
    "../../app/(auth)/recuperar-senha/page.tsx",
    "../../app/(app)/post/[id]/apoiar/page.tsx",
    "../../components/AppImage.tsx",
    "../../components/Footer.tsx",
    "../../components/app/AuthShowcase.tsx",
  ]) {
    assert.doesNotMatch(sourceAt(file), /\b(?:demo|mock|fake)\b/i, file);
  }

  const compose = sourceAt("../../../docker-compose.yml");
  assert.doesNotMatch(compose, /seed\.sql/);
  for (const seed of [
    "../../../services/auth-service/seed.sql",
    "../../../services/user-service/seed.sql",
    "../../../services/post-service/seed.sql",
    "../../../scripts/seed-demo.ps1",
  ]) {
    assert.equal(existsSync(new URL(seed, import.meta.url)), false, seed);
  }
});
