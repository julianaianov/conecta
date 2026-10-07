# DM Conecta — aplicação web

Portal web do DM Conecta, construído com Next.js, React, Tailwind e três
serviços Node.js.

## Ambientes

| Ambiente | URL | Regra |
| --- | --- | --- |
| Local | `http://localhost:3000` | somente dados persistidos reais |
| Homologação | `https://homologacao.dmconecta.org` (AWS) | somente dados persistidos reais |
| Produção | `https://dmconecta.org` | somente dados persistidos reais |

Homologação e produção rodam na AWS: `develop` alimenta a homologação e `master` a
produção. Não há outras branches. Mapa completo em `DmConnecta/dm-docs` →
`arquitetura.md`.
O build de produção recebe
`NEXT_PUBLIC_RUNTIME_ENV=production` e usa a API no mesmo domínio por meio do
gateway da infraestrutura.

## Desenvolvimento local

```bash
npm ci
npm run dev
```

O frontend abre em `http://localhost:3000`. Para usar os serviços locais,
defina `NEXT_PUBLIC_API_URL=http://localhost:8080` e suba o Compose local da
aplicação. Sem uma API local, a interface permanece sem dados reais e não cria
uma sessão ou catálogo substituto.

## Variáveis

Copie `.env.example` para `.env.local`:

```dotenv
NEXT_PUBLIC_RUNTIME_ENV=local
NEXT_PUBLIC_API_URL=http://localhost:8080
```

Valores públicos `NEXT_PUBLIC_*` não são segredos. Senhas, tokens e URLs de
banco não devem ser colocados neste repositório.

### Upload de arquivos (T08)

Os serviços `post-service` e `user-service` geram URLs pré-assinadas do S3 e o
navegador envia o arquivo direto ao bucket. Sem `DM_UPLOADS_BUCKET`, as rotas
`/api/posts/uploads/*` e `/api/users/uploads/*` respondem 503
(`uploads_unavailable`) e o componente `FileUpload` mostra que o envio não está
disponível; não existe armazenamento local substituto. Para testar localmente,
defina no `.env` do Compose `DM_UPLOADS_BUCKET`, `DM_UPLOADS_REGION` e
credenciais temporárias (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_SESSION_TOKEN`) de um bucket de desenvolvimento cujo CORS aceite
`http://localhost:3000`. Os buckets de homologação e produção só aceitam as
origens do próprio ambiente.

## Verificação

```bash
npm run test
npm run test:services
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build
```

O build de produção é uma imagem standalone criada pelo `Dockerfile`. A
workflow de produção fica no repositório `dmconecta-infra`; ela publica as
imagens no ECR e executa a atualização na AWS por SSM.

## Rotas do portal

Rotas públicas são renderizadas no servidor (SSR) e entram no `sitemap.xml`;
rotas protegidas pedem sessão e ficam fora do índice (`noindex` e `robots.txt`).
O contrato está em `src/lib/app/access.ts`.

| Rota | Acesso | Conteúdo |
| --- | --- | --- |
| `/` | Público | apresentação |
| `/feed` | Público (SSR) | pulso do território |
| `/mapa`, `/mapa/[territorio]` | Público (SSR) | mapa inteligente de demandas |
| `/ranking` | Público (SSR) | rankings de impacto |
| `/conexoes` | Público (SSR) / Privado | diretório público e conexões do usuário |
| `/post/[id]` | Público (SSR) | publicação, comentários e apoios |
| `/perfil/[id]` | Público (SSR) | perfil de atuação territorial |
| `/demandas/[id]` | Público (SSR) | página pública da demanda |
| `/eventos`, `/eventos/[id]` | Público (SSR) | agenda do território |
| `/politica-de-privacidade`, `/privacidade`, `/termos-de-uso` | Público | documentos legais e LGPD |
| `/seguranca-infantil` | Público | padrões de segurança infantil (CSAE/CSAM), exigidos pela Play Store |
| `/robots.txt`, `/sitemap.xml` | Público | indexação |
| `/login`, `/register`, `/recuperar-senha` | Público (sem índice) | autenticação |
| `/conexoes/nova`, `/conexoes/[id]` | Protegido | solicitar e acompanhar conexões |
| `/post/[id]/apoiar` | Protegido | fluxo de apoio |
| `/criar`, `/demandas/nova`, `/demandas/[id]/editar`, `/minhas-demandas` | Protegido | publicar e gerir demandas |
| `/perfil`, `/perfil/editar`, `/perfil/privacidade` | Protegido | perfil próprio, edição do perfil e direitos do titular |
| `/meus-apoios`, `/oportunidades`, `/meus-eventos`, `/minhas-inscricoes` | Protegido | área da conta |
| `/cadastro-institucional` | Protegido | cadastro institucional (T05) |
| `/governo` | Protegido | área do Poder Público |
| `/admin` | Protegido | painel da operação |

### Dados no servidor (SSR)

As páginas públicas leem os serviços pela rede interna, sem token:
`DM_INTERNAL_POST_API_URL` (`http://post-service:3003`) e
`DM_INTERNAL_USER_API_URL` (`http://user-service:3002`), só no servidor e nunca
em `NEXT_PUBLIC_*`. Sem resposta, a página mostra a lista vazia: não há
catálogo substituto. As chamadas do navegador continuam em `/api` no mesmo
domínio.

## Fluxo de conexões (`/conexoes`)

O pedido direto de uma conta a outra — comunidade ↔ empresa, projeto ↔
patrocinador, governo ↔ demanda, ONG ↔ voluntário. Seis tipos de pedido
(apoio, patrocínio, parceria, reunião, recursos, divulgação), ciclo
`pendente → aceita → concluída` e linha do tempo com o histórico de cada passo.
As conexões são lidas e persistidas pelo `user-service`; não há armazenamento
local substituto.

## Painel administrativo (`/admin`)

Visão da operação: contas por categoria e subperfil, publicações, apoios,
movimentação financeira, bairros atendidos, funil de publicação → impacto,
série temporal, destaques e saúde da operação. As métricas são derivadas da
base em `src/lib/app/admin.ts`.

O acesso é uma lista de contas, não uma quinta categoria de perfil. Configure
`NEXT_PUBLIC_ADMIN_EMAILS` no ambiente. Sem a variável, nenhuma conta recebe
acesso de interface ao painel.

## Organização do código

- `src/lib/app/runtime.ts`: contrato de ambiente.
- `src/lib/app/api.ts`: cliente HTTP sem fallback local.
- `src/lib/app/auth.tsx`: sessão e autenticação.
- `src/components/app/`: componentes do portal autenticado.
- `services/`: `auth-service`, `user-service` e `post-service`.
- `.github/workflows/ci.yml`: validação automatizada da aplicação.
