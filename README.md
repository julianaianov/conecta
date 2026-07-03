# DM Conecta — Plataforma Web

Rede social de impacto local. Esta plataforma web (Next.js 16 + React 19 + Tailwind 4)
replica as funcionalidades do app Flutter (`../flutter_app`), seguindo o **Manual de Marca
DM Conecta** (DM Sans + Inter, azul petróleo `#1B4F72` / laranja cívico `#F4841A`,
monograma DM com ponto laranja).

## Como rodar

```bash
npm install
npm run dev      # http://localhost:3000
```

A landing page fica em `/`. O app autenticado fica nas rotas abaixo. Use a conta demo
`maria@recreio.conecta` / `demo123`, ou clique em **"Entrar sem conexão"** no login.

## Backend (modo híbrido)

Por padrão a plataforma roda em **modo demo** (dados em memória do Recreio dos Bandeirantes).
Para conectar ao backend real, copie `.env.example` para `.env.local` e defina:

```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Suba os serviços com `docker-compose up` na raiz do repositório. O cliente tenta a API real
e **cai automaticamente para o demo** se a rede falhar (espelha o `useDemoFallback` do Flutter).

## Rotas do app

| Rota | Tela |
|------|------|
| `/login`, `/register` | Autenticação (com modo demo) |
| `/feed` | Feed com filtros, busca e quick post |
| `/mapa` | Mapa de demandas (Leaflet/OSM) com pinos por tipo |
| `/comunidades` | Comunidades |
| `/perfil`, `/perfil/[id]` | Perfil estilo Orkut (recados, depoimentos, conexões) |
| `/post/[id]` | Detalhe do post (comentários, apoios) |
| `/post/[id]/apoiar` | Fluxo de apoio (10 tipos · financeiro multi-step) |
| `/criar` | Nova publicação |
| `/meus-apoios` | Painel do apoiador |

## Arquitetura

- `src/lib/app/types.ts` — modelos de domínio + mapas de cor (espelha os models do Flutter)
- `src/lib/app/demo.ts` — base de dados demo (10 posts, perfis, comunidades, recados, apoios)
- `src/lib/app/api.ts` — cliente híbrido (API real ↔ fallback demo)
- `src/lib/app/auth.tsx` — `AuthProvider` (login, register, loginDemo, checkAuth)
- `src/components/app/` — design system do app (DMLogo, AppShell, PostCard, OrkutProfile, …)
