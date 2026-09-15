# Aplicação web

## Ambiente

- Local: `NEXT_PUBLIC_RUNTIME_ENV=local`; dados demo permitidos.
- Homologação: `NEXT_PUBLIC_RUNTIME_ENV=homologation`; Vercel; dados demo
  permitidos.
- Produção: `NEXT_PUBLIC_RUNTIME_ENV=production`; `https://dmconecta.org`;
  fallback demo proibido.

Em produção, `NEXT_PUBLIC_API_URL` vazio usa `/api` no mesmo domínio. Não
adicione fallback silencioso para dados locais, não coloque segredos em
`NEXT_PUBLIC_*` e não chame a Vercel de produção.

## Estrutura

- `src/lib/app/runtime.ts`: decisão de ambiente.
- `src/lib/app/api.ts`: cliente HTTP e fallback permitido.
- `src/lib/app/demo.ts`: dados somente de demonstração.
- `services/`: APIs Node e schemas.
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
