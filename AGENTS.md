# Aplicação web

## Arquitetura do DM Conecta (resumo)

Mapa completo: `DmConnecta/dm-docs` → `docs/arquitetura.md`. No workspace
local (`~/Dev/Projetos/DmConnecta`), os repositórios ficam lado a lado.

| Ambiente | Onde roda | Endereço | Branch | Dados demo |
| --- | --- | --- | --- | --- |
| Local | Docker Compose | `localhost` | qualquer | permitidos |
| Homologação | AWS | `https://homologacao.dmconecta.org` | `develop` | permitidos |
| Produção | AWS EC2 + Cloudflare | `https://dmconecta.org` | `stable` | proibidos |

- **Não existe mais Vercel.** Produção e homologação são AWS; menções a Vercel
  são dívida a remover. A homologação na AWS roda sob `https://homologacao.dmconecta.org`.
- Repositórios (org `DmConnecta`): aplicação em `dm-api` (checkout local
  `dm-api/`, que também tem o remoto `web` → `dm-web`, de onde o deploy lê),
  infraestrutura em `dm-infra` (`dmconecta-infra/`), documentação em `dm-docs`,
  Android em `dm-app-android` (`dmconecta-app-client-android/`), iOS em
  `dm-app-ios` (vazio).
- AWS `us-east-2`: EC2s dedicadas para produção e homologação com Docker Compose
  (Caddy → Next.js `web:3000` e `/api/auth|users|posts` → serviços Node 3001–3003 →
  PostgreSQL com `auth_db`, `user_db`, `post_db`), imagens no ECR compartilhado,
  parâmetros no SSM `/dmconecta/<ambiente>/*`, releases no S3. Sem SSH: tudo por SSM.
- Catálogo do feed é a fonte canônica dos seeds SQL (`services/*/seed.sql`), com
  4 usuários, 4 perfis, 4 comunidades (`/communities`), 10 posts com suporte a
  vídeos, 9 comentários e 27 apoios tipados.
- Cloudflare: zona `dmconecta.org` manual, fora do Terraform.
- Trabalhe em `develop` (ou branch criada dela); produção é `stable`.

## Ambiente da aplicação

- `NEXT_PUBLIC_RUNTIME_ENV`: `local`, `homologation` ou `production`
  (`src/lib/app/runtime.ts`).
- Em produção, `NEXT_PUBLIC_API_URL` vazio usa `/api` no mesmo domínio. Não
  adicione fallback silencioso para dados locais nem coloque segredos em
  `NEXT_PUBLIC_*`.
- Deploy: mudanças que precisam chegar a um ambiente vão para os dois remotos,
  `git push origin develop && git push web develop`.
- Migrações novas em `services/*/migrations/` devem ser registradas também em
  `dmconecta-infra/db/init/10-load-application-schemas.sh`; bancos existentes
  são migrados por SSM.

## Estrutura

- `src/lib/app/runtime.ts`: decisão de ambiente.
- `src/lib/app/api.ts`: cliente HTTP e fallback permitido.
- `src/lib/app/demo.ts`: dados somente de demonstração.
- `src/lib/app/types.ts`: perfis, permissões e modelos (ver
  `docs/perfis-e-permissoes.md`).
- `services/`: APIs Node (auth 3001, user 3002, post 3003), schemas e migrações.
- `Dockerfile`: imagem standalone do frontend.

## Branch e identidade visual

- Código pode ser alterado normalmente, mas o trabalho deve ficar em
  `develop` ou em uma branch criada a partir de `develop`; não desenvolver
  diretamente em `main`/`master`.
- Artes, animações, ícones, screenshots e exports finais ficam nos diretórios
  centrais `design/`, `screenshots/` e `store_assets/` do workspace. Este
  cliente mantém apenas recursos derivados indispensáveis à execução.

## Verificação

```bash
npm ci
npm run test
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

Mudanças de infraestrutura, domínio ou publicação devem ser feitas em
`dmconecta-infra` e refletidas no README e no contrato de ambientes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
