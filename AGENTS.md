# Aplicação web

## Arquitetura do DM Conecta (resumo)

Mapa completo: `DmConnecta/dm-docs` → `docs/arquitetura.md`. No workspace
local (`~/Dev/Projetos/DmConnecta`), os repositórios ficam lado a lado.

| Ambiente | Onde roda | Endereço | Branch | Dados sintéticos |
| --- | --- | --- | --- | --- |
| Local | Docker Compose | `localhost` | qualquer | **proibidos** |
| Homologação | AWS | `https://homologacao.dmconecta.org` | `develop` | **proibidos** |
| Produção | AWS EC2 + Cloudflare | `https://dmconecta.org` | `stable` | **proibidos** |

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
- O feed, os perfis, comunidades, comentários e apoios só podem vir de dados
  persistidos criados pelo uso real da aplicação. Fixtures são permitidas
  exclusivamente dentro dos testes isolados.
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
- Schema: fonte única em `services/migrations.manifest` (ordem de `init.sql`,
  `migrate_*.sql` e `services/*/migrations/`). A infra não guarda SQL da
  aplicação: `dmconecta-infra/db/init/10-load-application-schemas.sh` aplica o
  manifesto inteiro em volume novo e a cada deploy
  (`scripts/apply-schema-migrations.sh`). Por isso todo arquivo é idempotente
  (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`, `CREATE TYPE` em bloco `DO` com
  `duplicate_object`) e `init.sql` só indexa colunas que existem desde a criação
  da tabela. Migração nova entra no fim do bloco do seu banco no manifesto
  (`scripts/migrations-manifest.test.mjs` confere). Próximos números livres:
  auth-service 004, user-service 009, post-service 007. Registre a migração em
  `dm-docs/docs/production-status.md` até ela ser aplicada em produção.
- Posts antigos (decisão 7 de `dm-docs/docs/fonte-da-verdade/decisoes-de-implementacao.md`):
  o status não é editável (PUT com `status` responde 400); a moderação só
  alterna `visibility` (`visible`/`hidden`, migração post 006), e post oculto
  não aparece em rota pública nem aceita comentário, reação ou apoio. Status
  desconhecido não ganha rótulo na interface (`normalizePostStatus`).

## Cadastro institucional (T04)

- `user_db.organizations` (migração user 008) guarda o cadastro institucional:
  `institution_kind` `agente_transformacao` (CNPJ + CNAE, endereço com CEP,
  contatos, responsável) ou `poder_publico` (órgão, CNPJ, esfera, município/UF,
  território, secretaria, competências, representante). Um cadastro por perfil;
  Líder Comunitário e Representante de Bairro vinculam o perfil a uma
  instituição com CNPJ (decisão 3). Representante em
  `organization_representatives` (contatos privados).
- Rotas do user-service (`routes/institutions.js`): `GET/PUT /me/institution`,
  `POST /me/institution/submit`, `GET /me/institution/status`,
  `GET /institutions/reference` e `GET /:userId/institution` (público, só
  validada, sem contatos). Validação de CNPJ (inclusive alfanumérico) e CNAE em
  `src/institution.js`.
- Estado `validation_status`: `pendente` → (titular envia) `em_analise` →
  (dm-gestao) `validada` | `devolvida` (parecer); `validada` → `revogada`
  (parecer). O titular edita e reenvia em `pendente`, `devolvida` e `revogada`.
  O trigger da migração 008 impõe as transições (a gestão é reconhecida pela
  sessão `gestao_app`), deriva `verified*` e grava a trilha em
  `organization_validation_events`. O dm-api nunca valida.
- Poder Público sem cadastro validado recebe 403 `institution_not_validated` ao
  publicar, editar, comentar ou apoiar (post-service, `src/institution-gate.js`,
  que consulta `DM_INTERNAL_USER_API_URL` com o token do usuário, cache curto e
  falha fechada) e ao solicitar conexão (user-service).

## Cadastro institucional na interface (T05)

- Telas: `/cadastro-institucional` (usa o tipo da conta),
  `/cadastro-institucional/agente` e `/cadastro-institucional/poder-publico`
  (`src/components/app/institution/`), privadas e fora do índice. Ficha com
  máscaras e validação espelhadas do user-service em `src/lib/app/institution.ts`
  (há teste que compara as chaves de erro com `services/user-service/src/institution.js`);
  o servidor é quem decide e os erros de `fields` aparecem no campo e no resumo.
- Fluxo: salvar rascunho (PUT, fica `pendente`), enviar para validação (PUT +
  submit), status com parecer e trilha; em `em_analise` e `validada` a ficha
  fica só leitura. Comprovação por link até existir upload (T08).
- O CEP pode ser consultado no ViaCEP (`api.lookupCep`, só o CEP sai do
  navegador); sem resposta, o titular preenche o endereço.
- Onboarding: depois do cadastro de conta, Agente e Poder Público vão para a
  ficha (`postRegisterDestination`). `InstitutionBanner` (no `AppShell`)
  explica o requisito; para Líder Comunitário e Representante de Bairro, o
  texto da decisão 3.
- O 403 `institution_not_validated` chega como `ApiError.code` (`request` em
  `api.ts`) e vira `InstitutionGateNotice` em publicar, editar ponto, comentar,
  apoiar e solicitar conexão. O `/criar` do Poder Público sem validação mostra
  o aviso no lugar do formulário.
- Perfil público: selo e dados da projeção pública (`getPublicInstitution` no
  SSR e `api.getPublicInstitution` logado); o próprio perfil mostra o estado do
  cadastro.

## Segurança dos serviços

- `JWT_SECRET` é obrigatório e forte (32+ caracteres, sem valores de exemplo)
  em todo ambiente fora de teste: sem ele, auth/user/post-service não sobem.
  Não existe segredo padrão; no Compose local defina-o no `.env`
  (`openssl rand -hex 32`). Refresh tokens (`typ: 'refresh'`) não valem como
  token de acesso.
- Rotas administrativas (`/admin-snapshot` do user-service e do post-service)
  são só leitura para a operação: exigem token de uma conta listada em
  `DM_OPERATION_USER_IDS` (UUIDs de `auth_db.users`, vírgula). Sem a variável,
  respondem 403 para todos. `NEXT_PUBLIC_ADMIN_EMAILS` só esconde a interface.
  O dm-api não aprova nada: validação e aprovação ficam no dm-gestao.
- Respostas públicas usam projeção explícita de colunas (nada de `SELECT *`);
  telefone, estado e metadados internos do perfil nunca saem em rota pública.
  Coluna nova fica privada até ser incluída de propósito na projeção.
- Recursos privados respondem 404 para quem não é parte (conexões) e escrita
  exige o dono (posts, conexões com transições por papel: só o destinatário
  aceita/recusa, só o remetente cancela).
- `services/*/src/security.js` é a mesma cópia nos três serviços (há teste que
  confere).

## Estrutura

- `src/lib/app/runtime.ts`: decisão de ambiente.
- `src/lib/app/api.ts`: cliente HTTP; não possui fallback local.
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
