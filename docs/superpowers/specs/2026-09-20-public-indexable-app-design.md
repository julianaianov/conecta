# DM Conecta público e indexável — Especificação de design

> **Superseded on 2026-09-21:** the platform now has a strict real-data
> contract in every environment. References to demo catalogs or demo fallback
> below are historical and must not be restored.

**Data:** 20 de setembro de 2026  
**Objetivo:** permitir que visitantes e crawlers naveguem pelo conteúdo público do DM Conecta sem login, mantendo autenticação apenas nas mutações e nos fluxos privados.

## Entendimento validado

O DM Conecta é uma plataforma de impacto local. O conteúdo que uma pessoa registra para a comunidade — sinais, atualizações, responsáveis e páginas institucionais — precisa ser descoberto por links HTML e entregue no HTML inicial, para que Google e crawlers de IA consigam entendê-lo sem depender da sessão do navegador.

O pedido de produto é:

- as telas de descoberta e conteúdo são abertas e navegáveis;
- login é exigido para criar publicações, comentar, reagir, apoiar, solicitar/gerenciar conexões e ver dados do próprio perfil;
- os dados públicos nunca usam o catálogo demo em produção;
- telas privadas e operacionais continuam protegidas, mesmo que suas URLs exibam uma orientação para entrar;
- a entrega deve ser verificada por testes do repositório, HTML renderizado, sitemap, robots e build.

Por “100%” entende-se 100% da cobertura técnica auditável. Indexação, rich results e posição final dependem de Google, qualidade editorial, autoridade, disponibilidade e tempo de rastreamento; não são garantíveis pelo código.

## Estado atual e causas

1. `src/app/(app)/layout.tsx` coloca todas as rotas do portal atrás de um `Guard` que redireciona visitantes para `/login`.
2. Feed, mapa, ranking, post e perfil são componentes client-side que buscam dados em `useEffect`. O primeiro HTML contém apenas carregamento, portanto crawlers que não executam JavaScript não veem o conteúdo.
3. A aplicação tem somente metadados globais em `src/app/layout.tsx`; não existem `robots.ts`, `sitemap.ts`, canonical por conteúdo ou JSON-LD por página.
4. `AppShell` presume usuário autenticado em menu, avatar e notificações.
5. As leituras públicas de posts, comentários, apoios e perfis já existem nos serviços, mas o acesso server-side ainda não possui um adaptador. A busca de posts por autor também depende de carregar e filtrar uma lista limitada no cliente.
6. Produção usa `NEXT_PUBLIC_API_URL` vazio e Caddy encaminha `/api/*` diretamente aos serviços. Um Server Component não pode depender de `fetch('/api/...')`; ele precisa de endereços internos dos serviços na rede Docker.

## Abordagens consideradas

### A — Apenas liberar o guard e acrescentar metadados

É a menor mudança, mas mantém o conteúdo principal dependente de JavaScript e deixa postagens/perfis ausentes do HTML inicial. Não atende o objetivo de indexabilidade para crawlers com capacidades diferentes.

### B — Páginas públicas server-rendered com hidratação client-side (recomendada)

Manter os componentes interativos, mas dar a cada página pública um Server Component que carrega dados públicos e os entrega como `initialData` ao componente client-side. O mesmo contrato server-side alimenta `generateMetadata`, JSON-LD e sitemap. Em produção, o web container acessa `post-service` e `user-service` por URLs internas; em local/homologação, o adaptador usa `NEXT_PUBLIC_API_URL` ou o catálogo demo permitido.

Essa abordagem preserva o comportamento atual, reduz a superfície de mudança e entrega HTML útil para crawlers, links semânticos e navegação normal. É a escolha deste design.

### C — Criar uma camada pública/BFF separada

Seria a solução mais flexível para cache, busca e feeds grandes, mas introduz outro serviço e uma superfície de deploy sem necessidade para o volume atual. Pode ser uma evolução posterior, não requisito desta entrega.

## Arquitetura proposta

### 1. Política de acesso

O grupo `(app)` continuará fornecendo `AuthProvider`, mas deixará de bloquear o layout inteiro. `AppShell` será guest-aware:

| Rota/superfície | Visitante | Indexação |
| --- | --- | --- |
| `/`, `/feed`, `/mapa`, `/ranking`, `/conexoes` | navega e lê conteúdo | sim |
| `/post/[id]` | lê post, comentários publicados e apoios agregados | sim |
| `/perfil/[id]` | lê perfil público e publicações públicas | sim |
| `/politica-de-privacidade`, `/seguranca-infantil` | lê | sim |
| `/criar` | vê o formulário/CTA e é orientado a entrar | não; fluxo de ação |
| `/post/[id]/apoiar` | vê o contexto do post e CTA para entrar | não; fluxo de ação |
| `/conexoes/nova`, `/conexoes/[id]` | vê CTA/estado de autenticação | não; fluxo privado |
| `/perfil` e `/meus-apoios` | login obrigatório para dados do próprio usuário | não |
| `/admin` | login + permissão administrativa | não |
| `/login`, `/register`, `/recuperar-senha` | navega | `noindex,follow` |

As páginas de conteúdo não redirecionarão visitantes. Botões mutáveis (`registrar`, `atualizar`, `apoiar`, `solicitar conexão`, `registrar atualização/referência`) usarão uma CTA de login preservando a URL de retorno. O backend continuará sendo a autoridade de autorização para toda mutação.

### 2. Dados públicos no servidor

Criar `src/lib/server/public-data.ts` com funções server-only, pequenas e testáveis:

- `getPublicPosts(filters)`;
- `getPublicMapPosts()`;
- `getPublicPost(id)`;
- `getPublicComments(postId)`;
- `getPublicSupports(postId)`;
- `getPublicProfile(userId)`;
- `getPublicPostsByAuthor(userId)`;
- `getPublicRanking()` e `getPublicCommunities()` com resultado vazio/estado editorial quando o backend ainda não tiver armazenamento persistente.

O adaptador usará, nesta ordem:

1. `DM_INTERNAL_POST_API_URL` / `DM_INTERNAL_USER_API_URL`, definidos apenas no runtime do web container;
2. `NEXT_PUBLIC_API_URL` em desenvolvimento ou homologação;
3. catálogo demo somente quando `runtime.demoAllowed` for verdadeiro;
4. em produção sem endpoint interno disponível, retornará erro controlado/estado vazio e nunca dados demo.

As respostas serão cacheadas por curto período (`revalidate` de aproximadamente 60 segundos) nas páginas públicas. Falha de conexão não deve transformar uma página pública em redirect para login; registro inexistente usa `notFound()` e falha transitória mostra estado de indisponibilidade sem expor dados falsos.

O post-service aceitará `author_id` como filtro público. O cliente existente passará esse filtro em `postsByAuthor`, eliminando a dependência de `limit=50` e permitindo que perfis tenham links completos para suas publicações.

### 3. Renderização e componentes

As páginas públicas passam a ter um Server Component fino e um componente client-side para interação:

- `feed/page.tsx` carrega posts iniciais e renderiza um `FeedClient`;
- `mapa/page.tsx` carrega marcadores e hidrata o mapa;
- `ranking/page.tsx` carrega o ranking público quando houver dados;
- `conexoes/page.tsx` renderiza diretório/grupos públicos e deixa abas de pedidos dependentes da sessão;
- `post/[id]/page.tsx` carrega o post, comentários e resumo de apoios, entregando-os ao detalhe interativo;
- `perfil/[id]/page.tsx` carrega perfil e publicações e entrega-os ao perfil interativo.

Os componentes client-side manterão refetch após ações do usuário para refletir alterações. O primeiro render não dependerá de `loading` para mostrar título, descrição, autor, links e conteúdo principal.

`AppShell` terá estados distintos de visitante e autenticado: links de login/cadastro para visitantes, conta/notificações para usuários e links públicos sempre disponíveis. Todos os destinos de conteúdo usarão `<Link href="...">` ou `<a href="...">`, nunca somente `router.push()` para descoberta.

### 4. SEO técnico e sinais para IA

Criar utilitários em `src/lib/seo/` para:

- URL canônica única baseada em `https://dmconecta.org`;
- títulos e descrições únicos para landing, feed, post e perfil;
- Open Graph/Twitter Card com imagem, título, descrição e URL;
- JSON-LD `Organization`/`WebSite` no layout, `Article`/`DiscussionForumPosting` para publicações e `ProfilePage` para perfis, sempre com dados presentes no HTML;
- breadcrumbs quando houver hierarquia de conteúdo.

Adicionar:

- `src/app/robots.ts`: permitir `/` e crawlers públicos, indicar sitemap e excluir telas privadas/operacionais; manter `OAI-SearchBot` explicitamente permitido nas superfícies públicas;
- `src/app/sitemap.ts`: incluir rotas estáveis, posts válidos e perfis públicos com URLs absolutas e `lastModified` quando disponível;
- metadados `noindex,follow` para login, fluxos de ação, dados próprios e administração.

Filtros e estados puramente client-side não gerarão URLs duplicadas no sitemap. A rota `/comunidades` continuará com redirect permanente para `/conexoes`, e links internos apontarão para a URL canônica.

### 5. Produção e documentação

O Compose de produção passará `DM_INTERNAL_POST_API_URL=http://post-service:3003` e `DM_INTERNAL_USER_API_URL=http://user-service:3002` ao container `web`. Não são segredos e não serão expostos em `NEXT_PUBLIC_*`. O README do app, `AGENTS.md` do app/infra e `dm-docs/docs/arquitetura.md` registrarão o contrato.

## Contratos e invariantes

- GET público não exige `Authorization` nos serviços de post/user.
- Toda mutação continua exigindo JWT e validação de perfil no backend.
- Produção nunca usa `demo.ts`, mesmo se o serviço interno estiver indisponível.
- Toda página indexável entrega um `<title>`, uma descrição, um canonical, um `<h1>` e conteúdo textual relevante no HTML da resposta.
- Toda URL indexável aparece em algum link `<a href>` navegável ou no sitemap.
- Rotas privadas não vazam dados de sessão no HTML e têm `noindex`.
- Um visitante pode abrir diretamente qualquer URL pública, atualizar a página e continuar navegando sem ser enviado a `/login`.

## Verificação e evidências

1. Testes unitários para política de acesso, canonicals, JSON-LD, serialização de metadados e resolução de URLs server-side.
2. Teste de integração do post-service comprovando filtro público por autor e preservação de autenticação nas mutações.
3. `npm run test`, `npm run lint -- --max-warnings=0`, `npx tsc --noEmit` e `npm run build`.
4. Auditoria anônima contra o servidor produzido: cada rota pública retorna `200`, não redireciona para `/login`, contém `<h1>`, link canonical e conteúdo; cada rota privada retorna uma orientação de login e `noindex`.
5. Validação de `robots.txt` e `sitemap.xml`, incluindo URLs absolutas e ausência de rotas privadas.
6. Verificação manual/renderizada de desktop e mobile para navegação, foco/semântica, links de conteúdo, CTA de login e funcionamento autenticado das mutações.

## Fora do escopo desta entrega

- Garantir posição, frequência de rastreamento ou presença efetiva em resultados externos.
- Criar um endpoint persistente de indicadores, comunidades, atualizações de perfil, referências ou conexões; a superfície pública deverá degradar de forma honesta até esses dados terem backend.
- Alterar regras de privacidade de conteúdo publicado ou adicionar mecanismo editorial de moderação além do comportamento existente.
