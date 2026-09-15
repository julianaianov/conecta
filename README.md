# DM Conecta — aplicação web

Portal web do DM Conecta, construído com Next.js, React, Tailwind e três
serviços Node.js.

## Ambientes

| Ambiente | URL | Regra |
| --- | --- | --- |
| Local | `http://localhost:3000` | dados de demonstração permitidos |
| Homologação | projeto da Vercel | dados de demonstração permitidos |
| Produção | `https://dmconecta.org` | API real; fallback demo proibido |

A Vercel não é produção. O build de produção recebe
`NEXT_PUBLIC_RUNTIME_ENV=production` e usa a API no mesmo domínio por meio do
gateway da infraestrutura.

## Desenvolvimento local

```bash
npm ci
npm run dev
```

O frontend abre em `http://localhost:3000`. Para usar os serviços locais,
defina `NEXT_PUBLIC_API_URL=http://localhost:8080` e suba o Compose local da
aplicação. Sem uma API local, `local` e `homologation` podem usar o catálogo de
demonstração. A conta de demonstração é somente para esses ambientes.

## Variáveis

Copie `.env.example` para `.env.local`:

```dotenv
NEXT_PUBLIC_RUNTIME_ENV=local
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Valores públicos `NEXT_PUBLIC_*` não são segredos. Senhas, tokens e URLs de
banco não devem ser colocados neste repositório.

## Verificação

```bash
npm run test
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

O build de produção é uma imagem standalone criada pelo `Dockerfile`. A
workflow de produção fica no repositório `dmconecta-infra`; ela publica as
imagens no ECR e executa a atualização na AWS por SSM.

## Rotas do portal

| Rota | Conteúdo |
| --- | --- |
| `/` | apresentação |
| `/login`, `/register` | autenticação |
| `/feed` | publicações |
| `/mapa` | mapa de demandas |
| `/conexoes` | conexões |
| `/perfil`, `/perfil/[id]` | perfis |
| `/post/[id]` | publicação, comentários e apoios |
| `/criar` | nova publicação |
| `/ranking` | ranking |
| `/meus-apoios` | apoios do usuário |

## Organização do código

- `src/lib/app/runtime.ts`: contrato de ambiente.
- `src/lib/app/api.ts`: cliente da API e regras de fallback.
- `src/lib/app/auth.tsx`: sessão e autenticação.
- `src/lib/app/demo.ts`: dados exclusivos de demonstração.
- `src/components/app/`: componentes do portal autenticado.
- `services/`: `auth-service`, `user-service` e `post-service`.
- `.github/workflows/ci.yml`: validação automatizada da aplicação.
