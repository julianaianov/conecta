# DM Conecta público e indexável Implementation Plan

> **Superseded on 2026-09-21:** the platform now has a strict real-data
> contract in every environment. Any reference below to demo data, demo
> fallback or demo-enabled local/homologation behavior is historical and must
> not be implemented or restored.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended for this session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** entregar HTML público, navegável e server-rendered para conteúdo do DM Conecta, mantendo autenticação apenas em mutações e fluxos privados, com sinais técnicos completos para Google e crawlers de IA.

**Architecture:** O grupo de rotas `(app)` manterá o `AuthProvider`, mas deixará de bloquear o layout. Páginas públicas serão Server Components que buscam dados por um adaptador interno e passam `initialData` a componentes client-side interativos. Utilitários compartilhados gerarão política de acesso, metadados, canonicals, JSON-LD, robots e sitemap; os serviços continuarão autorizando toda mutação.

**Tech Stack:** Next.js 16.3.5 App Router, React 19.2.4, TypeScript strict, Node test runner, Express/PostgreSQL, Docker Compose/Caddy.

**Spec:** `docs/superpowers/specs/2026-09-20-public-indexable-app-design.md`

## Global Constraints

- GET público não exige `Authorization` nos serviços de post/user.
- Toda mutação continua exigindo JWT e validação de perfil no backend.
- Produção nunca usa `demo.ts`, mesmo se o serviço interno estiver indisponível.
- Toda página indexável entrega um `<title>`, uma descrição, um canonical, um `<h1>` e conteúdo textual relevante no HTML da resposta.
- Toda URL indexável aparece em algum link `<a href>` navegável ou no sitemap.
- Rotas privadas não vazam dados de sessão no HTML e têm `noindex`.
- Um visitante pode abrir diretamente qualquer URL pública, atualizar a página e continuar navegando sem ser enviado a `/login`.
- Não alterar `.design-sync/` nem `pnpm-lock.yaml`, que já estão modificados no checkout.
- Não usar catálogo demo em `production`; `local` e `homologation` continuam podendo usar demo quando explicitamente permitido pelo contrato de runtime.
- Usar os tipos de `params` como `Promise<{ ... }>` nas páginas dinâmicas, conforme o Next 16 instalado neste repositório.

## Review Focus

- Base interna indisponível em produção: o HTML deve exibir estado honesto sem retornar dados demo — coberto por testes do adaptador server-side e pela auditoria anônima de HTML.
- Visitante clicando em publicar/comentar/reagir/apoiar/conectar: a ação deve levar a login com retorno, sem request mutante anônimo — coberto pela política de ação e pelos testes do cliente de post.
- ID inexistente ou removido: post/perfil deve responder 404 e não entrar no sitemap — coberto por testes de rota dinâmica e montagem do sitemap.
- Query strings e `/comunidades`: canonical e sitemap devem apontar só para `/conexoes` e URLs sem filtros mutáveis — coberto pelos testes de URL SEO.
- Hidratação com sessão carregando: dados iniciais públicos não podem sumir nem causar redirect/hydration mismatch — coberto pelo teste de contrato `initialData` e pelo build/render audit.

## File Map

- Create `src/lib/app/access.ts`: política pura de rotas públicas, privadas e login de retorno.
- Create `src/lib/seo/site.ts`: URL do site, canonicals e construtor de `Metadata`.
- Create `src/lib/seo/structured-data.ts`: construtores puros de JSON-LD.
- Create `src/lib/server/public-api.ts`: resolução de bases internas e fetch público sem sessão.
- Create `src/lib/server/public-data.ts`: leitura/mapeamento de posts, comentários, apoios e perfis para Server Components.
- Create `src/components/app/AuthPrompt.tsx`: CTA de autenticação para ações protegidas.
- Create `src/components/app/AuthProviderClient.tsx`: wrapper client-side do `AuthProvider` para permitir metadata nos layouts.
- Create `src/components/app/public/FeedClient.tsx`, `MapClient.tsx`, `RankingClient.tsx`, `ConnectionsClient.tsx`, `PostDetailClient.tsx`, `ProfileClient.tsx`: componentes interativos que aceitam dados iniciais.
- Create `src/lib/app/public-data-contract.ts` and `src/lib/app/public-data-contract.test.mjs`: helper puro para o estado inicial das listas server-rendered.
- Create `src/lib/seo/content-route-contract.ts` and `src/lib/seo/content-route-contract.test.mjs`: metadata helper para conteúdo dinâmico válido/ausente.
- Create `src/app/robots.ts` e `src/app/sitemap.ts`: convenções do App Router para rastreamento.
- Create `src/app/robots.test.mjs`: testes das rotas de metadata do App Router.
- Create `scripts/audit-public-seo.mjs`: auditoria HTTP sem dependência externa.
- Modify `src/app/(app)/layout.tsx`, `src/app/(auth)/layout.tsx`, `src/components/app/AppShell.tsx`, páginas públicas, `src/lib/app/api.ts`, `services/post-service/src/routes/posts.js`, `package.json`, `README.md`.
- Modify `dmconecta-infra/docker-compose.prod.yml`, `dmconecta-infra/AGENTS.md`, `dmconecta-infra/.env.example`, `dm-docs/docs/arquitetura.md` e os `AGENTS.md`/README necessários para documentar as bases internas.

### Task 1: Fixar contratos de acesso, URLs e JSON-LD

**Files:**
- Create: `src/lib/app/access.ts`
- Create: `src/lib/app/access.test.mjs`
- Create: `src/lib/seo/site.ts`
- Create: `src/lib/seo/structured-data.ts`
- Create: `src/lib/seo/seo.test.mjs`
- Modify: `package.json` (incluir `src/lib/seo/*.test.mjs` no script `test`)

**Interfaces:**
- Produces `PUBLIC_INDEXABLE_PATHS`, `PRIVATE_PATH_PREFIXES`, `NOINDEX_EXACT_PATHS`, `loginHref(pathname)` and `isIndexablePath(pathname)`.
- Produces `SITE_URL`, `absoluteUrl(pathname)`, `metadataForPage(input)` and `postJsonLd(post, url)`/`profileJsonLd(profile, url)`.

- [ ] **Step 1: Write the failing access-policy tests**

```js
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
```

- [ ] **Step 2: Run the focused test and verify it fails for missing exports**

Run: `node --experimental-strip-types --test src/lib/app/access.test.mjs`

Expected: FAIL because `src/lib/app/access.ts` does not exist yet.

- [ ] **Step 3: Implement the route contract**

```ts
export const PUBLIC_INDEXABLE_PATHS = ["/", "/feed", "/mapa", "/ranking", "/conexoes", "/post", "/perfil", "/politica-de-privacidade", "/seguranca-infantil"] as const;
export const PRIVATE_PATH_PREFIXES = ["/admin", "/meus-apoios", "/perfil", "/conexoes/nova", "/conexoes/", "/post/"] as const;
export const NOINDEX_EXACT_PATHS = ["/perfil", "/login", "/register", "/recuperar-senha", "/criar"] as const;

export function loginHref(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

export function isIndexablePath(pathname: string): boolean {
  if (NOINDEX_EXACT_PATHS.includes(pathname as (typeof NOINDEX_EXACT_PATHS)[number])) return false;
  if (pathname.startsWith("/admin") || pathname.startsWith("/meus-apoios") || pathname.startsWith("/conexoes/nova") || pathname.startsWith("/conexoes/")) return false;
  if (pathname.startsWith("/post/") && pathname.endsWith("/apoiar")) return false;
  if (pathname === "/perfil" || pathname.startsWith("/perfil/")) return pathname !== "/perfil";
  return PUBLIC_INDEXABLE_PATHS.some((path) => path === pathname || (path !== "/" && pathname.startsWith(`${path}/`)));
}
```

The implementation must distinguish `/post/[id]` and `/perfil/[id]` from their action/self routes; do not use a single broad prefix for all post/profile URLs.

- [ ] **Step 4: Add failing SEO utility tests**

```js
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
```

- [ ] **Step 5: Run tests to verify the SEO tests fail**

Run: `node --experimental-strip-types --test src/lib/seo/seo.test.mjs`

Expected: FAIL because the SEO modules and builders are absent.

- [ ] **Step 6: Implement metadata and JSON-LD builders**

`metadataForPage` must return `title`, `description`, `metadataBase`, `alternates.canonical`, `openGraph`, `twitter` and `robots` (`index: false` when `indexable` is false). JSON-LD builders must return plain serializable objects and omit null/empty image values rather than emitting fake URLs.

- [ ] **Step 7: Run both focused tests and the existing suite**

Run: `node --experimental-strip-types --test src/lib/app/access.test.mjs src/lib/seo/seo.test.mjs`  
Expected: PASS.

Run: `npm run test`  
Expected: PASS, with the new tests included by the package script.

- [ ] **Step 8: Commit**

```bash
git add src/lib/app/access.ts src/lib/app/access.test.mjs src/lib/seo/site.ts src/lib/seo/structured-data.ts src/lib/seo/seo.test.mjs package.json
git commit -m "feat: add public access and SEO contracts"
```

### Task 2: Add server-side public API/data access and the author filter

**Files:**
- Create: `src/lib/server/public-api.ts`
- Create: `src/lib/server/public-data.ts`
- Create: `src/lib/server/public-data.test.mjs`
- Modify: `services/post-service/src/routes/posts.js`
- Create: `services/post-service/test/public-routes.test.js`
- Modify: `src/lib/app/api.ts`

**Interfaces:**
- `resolveServerApiBase(service, env)` returns a normalized string or `null` for `posts`/`users`.
- `public-data.ts` exports `getPublicPosts`, `getPublicMapPosts`, `getPublicPost`, `getPublicComments`, `getPublicSupports`, `getPublicProfile`, `getPublicPostsByAuthor`, `getPublicRanking` and `getPublicCommunities`.
- `listPosts` accepts `authorId?: string` and serializes it as `author_id`.

- [ ] **Step 1: Write the failing resolver and production-safety tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveServerApiBase } from "./public-api.ts";
import { publicFallback } from "./public-data.ts";

test("internal service URL wins over the public API URL", () => {
  assert.equal(resolveServerApiBase("posts", { internalPosts: "http://post-service:3003/", publicApi: "http://localhost:8080", production: true }), "http://post-service:3003");
});

test("production never selects demo data", () => {
  assert.deepEqual(publicFallback({ production: true, demoAllowed: false, demoValue: [{ id: "fake" }] }), []);
});
```

- [ ] **Step 2: Run the focused test and verify the expected missing-module failure**

Run: `node --experimental-strip-types --test src/lib/server/public-data.test.mjs`  
Expected: FAIL because server modules are absent.

- [ ] **Step 3: Implement base resolution and guarded public requests**

```ts
type ServerApiEnv = { internalPosts?: string | null; internalUsers?: string | null; publicApi?: string | null; production: boolean; demoAllowed: boolean };

export function resolveServerApiBase(service: "posts" | "users", env: ServerApiEnv): string | null {
  const internal = service === "posts" ? env.internalPosts : env.internalUsers;
  return (internal ?? env.publicApi ?? "").trim().replace(/\/$/, "") || null;
}

export function publicFallback<T>({ production, demoAllowed, demoValue }: { production: boolean; demoAllowed: boolean; demoValue: T }): T | [] {
  return !production && demoAllowed ? demoValue : [];
}
```

`public-api.ts` must send no `Authorization` header, use `fetch(url, { next: { revalidate: 60 } })`, cap list limits, parse JSON only on successful responses, and return typed empty results for optional public aggregates. It must read `DM_INTERNAL_POST_API_URL` and `DM_INTERNAL_USER_API_URL` only on the server.

- [ ] **Step 4: Add the failing Express test for `author_id`**

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const listen = express.application.listen;
express.application.listen = () => ({ close() {} });
const { createApp } = require("../src");
express.application.listen = listen;

test("GET / accepts a public author_id filter without a token", async () => {
  const queries = [];
  const pool = { query(sql, params = []) { queries.push({ sql, params }); return Promise.resolve({ rows: sql.includes("COUNT") ? [{ count: "1" }] : [{ id: "p-1", author_id: "u-1" }] }); } };
  const server = createApp({ pool }).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/?author_id=u-1`);
    assert.equal(response.status, 200);
    assert.match(queries[0].sql, /author_id/);
    assert.deepEqual(queries[0].params, ["u-1", 20, 0]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
```

- [ ] **Step 5: Run the service test to verify it fails**

Run: `node --test services/post-service/test/public-routes.test.js`  
Expected: FAIL because the route ignores `author_id` and sends only limit/offset parameters.

- [ ] **Step 6: Implement the public author filter and client serialization**

In `posts.js`, append `AND author_id=$n` when `req.query.author_id` is present and include the same predicate in the count query. In `api.ts`, add `authorId` to the filter type, serialize it, and replace the `limit=50` plus client filter in `postsByAuthor` with `author_id=${encodeURIComponent(userId)}`. Keep the demo path filtering unchanged.

- [ ] **Step 7: Run unit/service tests and verify production fallback**

Run: `node --test services/post-service/test/*.test.js`  
Expected: PASS.

Run: `node --experimental-strip-types --test src/lib/server/public-data.test.mjs`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/public-api.ts src/lib/server/public-data.ts src/lib/server/public-data.test.mjs services/post-service/src/routes/posts.js services/post-service/test/public-routes.test.js src/lib/app/api.ts
git commit -m "feat: add server-side public data access"
```

### Task 3: Make the portal guest-aware and protect only actions

**Files:**
- Create: `src/components/app/AuthPrompt.tsx`
- Create: `src/lib/app/action-access.test.mjs`
- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/components/app/AppShell.tsx`
- Modify: `src/components/app/NotificationBell.tsx`
- Modify: `src/app/(app)/criar/page.tsx`
- Modify: `src/app/(app)/meus-apoios/page.tsx`
- Modify: `src/app/(app)/perfil/page.tsx`
- Modify: `src/app/(app)/conexoes/nova/page.tsx`
- Modify: `src/app/(app)/conexoes/[id]/page.tsx`
- Modify: `src/app/(app)/admin/page.tsx`

**Interfaces:**
- `AuthPrompt` accepts `{ action: string; returnTo?: string }` and renders an accessible link from `loginHref(returnTo)`.
- `(app)/layout.tsx` renders `<AuthProvider><AppShell>{children}</AppShell></AuthProvider>` with no redirect guard.
- `(auth)/layout.tsx` is a Server Component with `noindex,follow` metadata and renders a small client provider wrapper.

- [ ] **Step 1: Write the failing action-policy tests**

```js
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
```

- [ ] **Step 2: Run it and verify the missing export failure**

Run: `node --experimental-strip-types --test src/lib/app/action-access.test.mjs`  
Expected: FAIL because `actionRequiresAuth` is not defined.

- [ ] **Step 3: Implement the action contract and AuthPrompt**

```ts
export type ProtectedAction = "create-post" | "comment" | "reaction" | "support" | "connection" | "profile-write";
export function actionRequiresAuth(action: ProtectedAction | "read-post"): boolean {
  return action !== "read-post";
}
```

`AuthPrompt` must use a real `<Link>` with visible text such as `Entre para comentar`, not an `onClick`-only navigation. `AuthProviderClient.tsx` must be a client component that renders the existing `AuthProvider` around its children, allowing route-group layouts to export metadata while keeping session state in the client graph.

- [ ] **Step 4: Remove the global Guard and make AppShell safe for `user === null`**

The anonymous header must show a login link and registration CTA; it must not render empty email/name fields or call notifications for a guest. Public nav must contain links to `/feed`, `/mapa`, `/conexoes`, `/ranking`, and `/login`. The profile nav must point to `/perfil` only as a protected self-profile action and keep `/perfil/[id]` links public.

- [ ] **Step 5: Add auth prompts to protected route entry points**

`/criar`, `/conexoes/nova`, `/conexoes/[id]`, `/meus-apoios`, `/perfil`, and `/admin` must render a visible login/permission state instead of a blank page or redirect loop when the session is absent. Mutating controls in post/profile clients must reuse `AuthPrompt` and preserve the current URL.

- [ ] **Step 6: Add noindex metadata to the private/auth layouts**

Use a Server Component layout with:

```ts
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};
```

Keep `AuthProvider` in a client wrapper so the metadata export remains valid.

- [ ] **Step 7: Run tests and type-check the boundary change**

Run: `node --experimental-strip-types --test src/lib/app/access.test.mjs src/lib/app/action-access.test.mjs`  
Expected: PASS.

Run: `npx tsc --noEmit`  
Expected: PASS after all guest-safe branches are typed.

- [ ] **Step 8: Commit**

```bash
git add src/components/app/AuthPrompt.tsx src/lib/app/access.ts src/lib/app/action-access.test.mjs src/app/'(app)'/layout.tsx src/app/'(auth)'/layout.tsx src/components/app/AppShell.tsx src/components/app/NotificationBell.tsx src/app/'(app)'/criar/page.tsx src/app/'(app)'/meus-apoios/page.tsx src/app/'(app)'/perfil/page.tsx src/app/'(app)'/conexoes/nova/page.tsx src/app/'(app)'/conexoes/'[id]'/page.tsx src/app/'(app)'/admin/page.tsx
git commit -m "feat: allow public navigation without login"
```

### Task 4: Server-render public feed, map, ranking and connections

**Files:**
- Create: `src/components/app/public/FeedClient.tsx`
- Create: `src/components/app/public/MapClient.tsx`
- Create: `src/components/app/public/RankingClient.tsx`
- Create: `src/components/app/public/ConnectionsClient.tsx`
- Modify: `src/app/(app)/feed/page.tsx`
- Modify: `src/app/(app)/mapa/page.tsx`
- Modify: `src/app/(app)/ranking/page.tsx`
- Modify: `src/app/(app)/conexoes/page.tsx`

**Interfaces:**
- Each `*Client` accepts serializable `initial*` props and initializes state from them before any effect runs.
- Each page is an async Server Component with `export const revalidate = 60` and calls `public-data.ts`.

- [ ] **Step 1: Write the failing initial-data contract test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { initialListState } from "./public-data-contract.ts";

test("public list state starts with server data and does not require a loading spinner", () => {
  assert.deepEqual(initialListState([{ id: "p-1" }]), { items: [{ id: "p-1" }], loading: false });
});
```

- [ ] **Step 2: Run the contract test and verify the missing-module failure**

Run: `node --experimental-strip-types --test src/lib/app/public-data-contract.test.mjs`  
Expected: FAIL because the initial-data helper is absent.

- [ ] **Step 3: Implement the state helper and extract the existing client UIs**

```ts
export function initialListState<T>(items: T[]): { items: T[]; loading: boolean } {
  return { items, loading: false };
}
```

Move the existing interactive markup into the four client components without changing visual behavior. `FeedClient` receives `initialPosts`, `MapClient` receives `initialPosts`, `RankingClient` receives `initialBoards`, and `ConnectionsClient` receives `initialCommunities` plus an optional authenticated connection list.

- [ ] **Step 4: Replace the route pages with async server wrappers**

```tsx
import { getPublicPosts } from "@/lib/server/public-data";
import { FeedClient } from "@/components/app/public/FeedClient";

export const revalidate = 60;

export default async function FeedPage() {
  const posts = await getPublicPosts({ limit: 20 });
  return <FeedClient initialPosts={posts} />;
}
```

Use the equivalent server fetch for map markers, ranking, communities and the public portion of connections. The route pages must contain a meaningful heading/intro even when the API returns an empty list.

- [ ] **Step 5: Make public links crawlable**

Every post card, profile card, map result fallback, community card and ranking entry that has a destination must use `<Link href>`/`<a href>`. Keep buttons only for filters, tabs and non-navigational actions.

- [ ] **Step 6: Run the focused build/type checks**

Run: `npx tsc --noEmit`  
Expected: PASS.

Run: `npm run lint -- --max-warnings=0`  
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/app/public src/app/'(app)'/feed/page.tsx src/app/'(app)'/mapa/page.tsx src/app/'(app)'/ranking/page.tsx src/app/'(app)'/conexoes/page.tsx
git commit -m "feat: server-render public discovery screens"
```

### Task 5: Server-render posts and public profiles with authenticated actions

**Files:**
- Create: `src/components/app/public/PostDetailClient.tsx`
- Create: `src/components/app/public/ProfileClient.tsx`
- Modify: `src/app/(app)/post/[id]/page.tsx`
- Modify: `src/app/(app)/perfil/[id]/page.tsx`
- Modify: `src/components/app/ProfileView.tsx` or replace it with the client component while preserving its public markup.

**Interfaces:**
- `PostDetailClient` accepts `{ initialPost, initialComments, initialSupports }`.
- `ProfileClient` accepts `{ initialProfile, initialPosts }`.
- Dynamic pages receive `params: Promise<{ id: string }>` and call `notFound()` when their public record is absent.

- [ ] **Step 1: Write the failing dynamic route data tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { publicContentMetadata } from "./content-route-contract.ts";

test("a missing public record is not indexable", () => {
  assert.deepEqual(publicContentMetadata(null, "/post/missing").robots, { index: false, follow: true });
});

test("public post data contains crawler-visible text", () => {
  const result = publicContentMetadata({ title: "Horta comunitária", description: "Projeto do bairro" }, "/post/p-1");
  assert.equal(result.title, "Horta comunitária | DM Conecta");
  assert.equal(result.alternates.canonical, "https://dmconecta.org/post/p-1");
});
```

- [ ] **Step 2: Run it and verify the missing contract failure**

Run: `node --experimental-strip-types --test src/lib/seo/content-route-contract.test.mjs`  
Expected: FAIL because the dynamic metadata contract is absent.

- [ ] **Step 3: Implement the dynamic metadata helper**

The helper must create `noindex,follow` metadata for `null` and unique title/description/canonical/OG metadata for a valid post/profile. Add the helper to the SEO test script from Task 1.

```ts
export function publicContentMetadata(record: { title?: string; description?: string; name?: string } | null, path: string): Metadata {
  if (!record) return metadataForPage({ title: "Conteúdo não encontrado", description: "Esta página não está disponível.", path, indexable: false });
  const title = record.title ?? record.name ?? "DM Conecta";
  return metadataForPage({ title, description: record.description ?? `Conheça ${title} no DM Conecta.`, path });
}
```

- [ ] **Step 4: Extract the post client component and pass initial data**

Initialize `post`, `comments`, `summary` and `supports` from server props. For guests, render the public comments list and an `AuthPrompt` instead of an editable textarea or unauthenticated reaction/support request. For authenticated users, preserve existing mutation behavior and refetch/optimistic updates.

- [ ] **Step 5: Implement the post Server Component and metadata**

```tsx
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getPublicPost(id);
  return post ? postMetadata(post) : missingContentMetadata(`/post/${id}`);
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [post, comments, supports] = await Promise.all([getPublicPost(id), getPublicComments(id), getPublicSupports(id)]);
  if (!post) notFound();
  return <PostDetailClient initialPost={post} initialComments={comments} initialSupports={supports} />;
}
```

Render the JSON-LD object in a `<script type="application/ld+json">` from the server page or the server wrapper so it is present in the initial HTML.

- [ ] **Step 6: Implement the profile Server Component and metadata**

Load profile and author posts in parallel, call `notFound()` for a missing profile, render the profile name/bio/posts in server-delivered content, and pass the data to `ProfileClient`. Public visitors can follow post/author links; profile updates, references and connection requests show `AuthPrompt`.

- [ ] **Step 7: Run focused checks**

Run: `node --experimental-strip-types --test src/lib/seo/*.test.mjs src/lib/app/*.test.mjs`  
Expected: PASS.

Run: `npx tsc --noEmit && npm run lint -- --max-warnings=0`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/app/public/PostDetailClient.tsx src/components/app/public/ProfileClient.tsx src/app/'(app)'/post/'[id]'/page.tsx src/app/'(app)'/perfil/'[id]'/page.tsx src/components/app/ProfileView.tsx src/lib/seo
git commit -m "feat: render public posts and profiles on the server"
```

### Task 6: Publish robots, sitemap, metadata and structured data

**Files:**
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/robots.test.mjs`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/politica-de-privacidade/page.tsx`
- Modify: `src/app/seguranca-infantil/page.tsx`

**Interfaces:**
- `robots()` returns `MetadataRoute.Robots` with `Allow: /`, sitemap `https://dmconecta.org/sitemap.xml`, and private disallows.
- `sitemap()` returns `MetadataRoute.Sitemap` with stable public paths plus successful post/profile records only.

- [ ] **Step 1: Write the failing metadata-route tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import robots from "./robots.ts";
import sitemap from "./sitemap.ts";

test("robots allows public crawlers and points to the canonical sitemap", () => {
  const result = robots();
  assert.equal(result.sitemap, "https://dmconecta.org/sitemap.xml");
  assert.ok(JSON.stringify(result.rules).includes("OAI-SearchBot"));
  assert.ok(JSON.stringify(result.rules).includes("/admin"));
});

test("sitemap never includes private action paths", async () => {
  const urls = await sitemap();
  const values = urls.map((entry) => entry.url);
  assert.ok(values.includes("https://dmconecta.org/feed"));
  assert.ok(values.every((url) => !/\/admin|\/meus-apoios|\/conexoes\/nova|\/apoiar/.test(url)));
});
```

- [ ] **Step 2: Run the tests and verify missing route-module failures**

Run: `node --experimental-strip-types --test src/app/robots.test.mjs`  
Expected: FAIL because the route modules/tests do not exist yet.

- [ ] **Step 3: Implement `robots.ts`**

Use explicit groups for `Googlebot`, `OAI-SearchBot`, `GPTBot` and `*`, allowing public paths and disallowing only private/action paths. Do not disallow `/feed`, `/post/`, `/perfil/`, `/mapa`, `/ranking` or `/conexoes`.

- [ ] **Step 4: Implement dynamic `sitemap.ts`**

Use `MetadataRoute.Sitemap`, absolute URLs, stable public pages, post URLs from `getPublicPosts({ limit: 5000 })`, and profile URLs derived from public post authors plus any available public profile list. Deduplicate URLs, exclude invalid/null records, and catch optional API failure so stable pages still remain available. Mark the route dynamic/revalidated so production does not freeze a build-time empty API response.

- [ ] **Step 5: Expand root and legal metadata**

Use `metadataForPage` in the root and legal routes. Add `lang="pt-BR"`, `alternates.canonical`, `openGraph`, `twitter`, `robots` and a root `Organization`/`WebSite` JSON-LD block. Keep auth/private metadata `noindex,follow`.

- [ ] **Step 6: Run route tests and build**

Run: `node --experimental-strip-types --test src/app/robots.test.mjs src/lib/seo/*.test.mjs`  
Expected: PASS.

Run: `npm run build`  
Expected: PASS and Next recognizes `/robots.txt` and `/sitemap.xml`.

- [ ] **Step 7: Commit**

```bash
git add src/app/robots.ts src/app/sitemap.ts src/app/layout.tsx src/app/'(auth)'/layout.tsx src/app/politica-de-privacidade/page.tsx src/app/seguranca-infantil/page.tsx src/app/robots.test.mjs
git commit -m "feat: publish crawlable metadata and sitemap"
```

### Task 7: Wire production internal service URLs and update contracts

**Files:**
- Modify: `/Users/sierra/Dev/Projetos/DmConnecta/dmconecta-infra/docker-compose.prod.yml`
- Modify: `/Users/sierra/Dev/Projetos/DmConnecta/dmconecta-infra/.env.example`
- Modify: `/Users/sierra/Dev/Projetos/DmConnecta/dmconecta-infra/AGENTS.md`
- Modify: `/Users/sierra/Dev/Projetos/DmConnecta/dm-docs/docs/arquitetura.md`
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- The production `web` service receives `DM_INTERNAL_POST_API_URL=http://post-service:3003` and `DM_INTERNAL_USER_API_URL=http://user-service:3002` at runtime.
- No internal URL is exposed through `NEXT_PUBLIC_*` and no secret is added to Git.

This task changes only configuration and documentation; the TDD exception for configuration files applies. The resolver itself is tested in Task 2.

- [ ] **Step 1: Add the two runtime environment variables to the production web service**

Add the literal Docker DNS URLs to the `environment` block of `web`, next to `NODE_ENV`, `PORT` and `HOSTNAME`. Do not put them in the builder `ARG` list because they are runtime-only server values.

- [ ] **Step 2: Document the contract in all affected operations documents**

Update the app README route table and environment section, the app/infra `AGENTS.md`, root `AGENTS.md`, and `dm-docs/docs/arquitetura.md` to state that public SSR reads use the two internal URLs, while browser mutations still use Caddy `/api` same-origin routing.

- [ ] **Step 3: Validate infrastructure syntax and code contracts**

Run: `docker compose -f /Users/sierra/Dev/Projetos/DmConnecta/dmconecta-infra/docker-compose.prod.yml config` with non-secret placeholder environment values.  
Expected: PASS and the `web.environment` section contains both internal URLs.

Run: `node --experimental-strip-types --test src/lib/server/public-data.test.mjs`  
Expected: PASS.

- [ ] **Step 4: Commit the app and infra documentation changes separately**

```bash
git add docker-compose.prod.yml .env.example AGENTS.md
git commit -m "ops: configure internal public data endpoints"
```

From the workspace root, commit the corresponding `dm-docs` changes in its own repository without staging unrelated files.

### Task 8: Add the anonymous HTML audit and finish verification

**Files:**
- Create: `scripts/audit-public-seo.mjs`
- Modify: `package.json` (add `seo:audit` and `test:services` scripts)
- Modify: `.github/workflows/ci.yml`
- Create: `scripts/audit-public-seo.test.mjs`

**Interfaces:**
- `auditPublicPage(baseUrl, path)` fetches with `redirect: "manual"` and returns `{ path, status, location, title, h1, canonical, noindex, bodyText }`.
- The CLI reads `SEO_AUDIT_BASE_URL`, `SEO_AUDIT_POST_ID` and `SEO_AUDIT_PROFILE_ID`; it exits nonzero on a public-route redirect/noindex/missing HTML contract.

- [ ] **Step 1: Write the failing parser tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { inspectHtml } from "./audit-public-seo.mjs";

test("audit extracts the HTML indexability contract", () => {
  const result = inspectHtml("<html><head><title>Feed</title><link rel=\"canonical\" href=\"https://dmconecta.org/feed\"></head><body><h1>Publicações</h1><p>Conteúdo</p></body></html>");
  assert.deepEqual(result, { title: "Feed", h1: "Publicações", canonical: "https://dmconecta.org/feed", noindex: false, bodyText: "Publicações Conteúdo" });
});
```

- [ ] **Step 2: Run it and verify the parser is absent**

Run: `node --test scripts/audit-public-seo.test.mjs`  
Expected: FAIL because `scripts/audit-public-seo.mjs` is absent.

- [ ] **Step 3: Implement the parser and route audit**

Use standard `fetch` and regular expressions only; reject public routes with `3xx`, `/login` location, `noindex`, missing title/canonical/h1 or empty body text. Check stable routes `/`, `/feed`, `/mapa`, `/ranking`, `/conexoes`, `/politica-de-privacidade`, `/seguranca-infantil`; append dynamic post/profile routes when their environment IDs are provided. Separately fetch `/robots.txt` and `/sitemap.xml`, assert XML/content type, canonical host and absence of private paths.

- [ ] **Step 4: Add scripts and CI commands**

```json
{
  "scripts": {
    "test": "node --experimental-strip-types --test src/lib/app/*.test.mjs src/lib/seo/*.test.mjs src/lib/server/*.test.mjs",
    "test:services": "npm --prefix services/post-service test",
    "seo:audit": "node --experimental-strip-types scripts/audit-public-seo.mjs"
  }
}
```

Add `npm run test:services` to CI after the application test and run the HTML audit in a separate step after `npm run build`/`next start` is available. If CI does not have a live API, run the stable-route audit against a local server with the permitted homologation/demo environment and pass dynamic IDs explicitly.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```bash
npm run test
npm run test:services
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

Expected: all commands exit 0 with no lint warnings. Start the built server in a separate terminal, then run:

```bash
SEO_AUDIT_BASE_URL=http://127.0.0.1:3000 SEO_AUDIT_POST_ID=dmc-post-buraco-americas SEO_AUDIT_PROFILE_ID=dmc-user-maria npm run seo:audit
```

Expected: every public route returns `200` with title/h1/canonical/body, private routes are not in the sitemap, and no public route redirects to `/login`.

- [ ] **Step 6: Inspect the final diff and worktree**

Run: `git diff --check` in `dm-api`, `git status --short` in every affected repository, and confirm `.design-sync/`, `pnpm-lock.yaml` and graphify artifacts are not staged. Review generated HTML for one post and one profile before claiming completion.

- [ ] **Step 7: Commit the audit/CI changes**

```bash
git add scripts/audit-public-seo.mjs scripts/audit-public-seo.test.mjs package.json .github/workflows/ci.yml
git commit -m "test: audit public SEO surface"
```

## Plan Self-Review

- **Spec coverage:** access boundary is Task 3; server data and author filtering are Task 2; SSR discovery is Task 4; post/profile public content is Task 5; metadata/JSON-LD/robots/sitemap is Task 6; production wiring and documentation is Task 7; evidence and regression checks are Task 8.
- **Placeholder scan:** the plan contains no `TBD`, `TODO`, “implement later”, “handle edge cases” or unnamed test-only steps.
- **Type consistency:** names used across tasks are fixed: `resolveServerApiBase`, `publicFallback`, `getPublic*`, `metadataForPage`, `postJsonLd`, `profileJsonLd`, `loginHref`, `actionRequiresAuth`, `AuthPrompt`, and the six `*Client` components.
- **Review focus coverage:** each of the five failure modes is assigned to a concrete test or audit in Tasks 2, 3, 5, 6 and 8.
