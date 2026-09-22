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
  auth-service 004, user-service 010, post-service 009. Registre a migração em
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
  fica só leitura. A comprovação da representação é um upload (`FileUpload`,
  finalidade `institution_proof`), liberado depois do primeiro rascunho salvo;
  referência de texto antiga continua exibida até ser substituída.
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

## Demanda (T06)

- Entidade própria no `post_db` (decisão 1), migração post 007
  (`007-demands.sql`): `demands` (agente, `organization_id` da instituição
  validada, categoria, conteúdo, público, prioridade, foto, CEP/endereço/lat/lng,
  território, `has_physical_execution`, composição financeira gravada e estado),
  `demand_budget_items` (quantidade, unidade, valor unitário e total em centavos,
  `is_audiovisual_record`, vínculo à etapa → físico-financeiro),
  `demand_schedule_items` (etapa, atividades, início, término, responsável,
  `record_milestones` antes/acompanhamento/depois), `demand_goals`,
  `demand_resources` (necessário/contrapartida, tipos da fonte),
  `demand_documents`, `demand_events` (linha do tempo só inserção) e
  `posts.demand_id` (post-vitrine criado pelo trigger na publicação, protegido
  contra edição e exclusão; oculto quando a demanda é arquivada).
- Estado: `status` (7 canônicos + `arquivada`) e, dentro de `em_analise`,
  `review_state` (`rascunho` → `aguardando_analise` → `devolvida` | publicação
  `aprovada`). Transições por ator (agente, gestão = sessão `gestao_app`,
  sistema = `SET LOCAL dm.actor_type = 'sistema'`) no trigger `demands_guard`,
  espelhado em `services/post-service/src/demand/state-machine.js`. Conteúdo e
  itens só mudam em `rascunho`/`devolvida`; demanda não é excluída.
- Composição: 4% e 6% sobre o orçamento original, cada parcela arredondada meio
  para cima ao centavo, total = base + 4% + 6% (`src/demand/finance.js`, CHECK
  `demands_financial_composition`).
- Domínio puro em `services/post-service/src/demand/` (constantes, cálculo,
  validação de rascunho e de envio, máquina de estados, gate T06a). Enviar exige
  Agente com instituição `validada` (`requireValidatedAgent`, que usa o cliente
  de `institution-gate.js`; `GET /me/institution/status` devolve
  `organizationId`). A API REST é a T07.

## API da demanda (T07)

- `services/post-service/src/routes/demands.js`, montada em `/demands` no
  post-service antes das rotas de posts; público em `/api/posts/demands` (o
  Caddy tira `/api/posts`). JSON em camelCase, no formato de
  `src/demand/validation.js`. Acesso ao banco em `src/demand/store.js`
  (transação, projeções, recálculo da composição, `transitionDemand`).
- Público (sem login, só `publicada` em diante, fora `arquivada`): `GET /`
  (filtros `category`, `priority`, `status` com vírgula, `territory`,
  `municipality`, `uf`, `q`, `bbox=oeste,sul,leste,norte`; keyset por
  `published_at, id` com `limit` ≤ 50 e `cursor`/`nextCursor`), `GET /:id`
  (sem CEP, rua, número, complemento, instituição, parecer; cronograma sem
  responsável; documentos sem link) e `GET /:id/timeline` (só eventos
  `is_public`, sem ator, nota ou payload).
- Agente autor (token; 404 para quem não é o autor): `GET /mine`,
  `GET /mine/:id` (com `editable` e `availableActions`), `GET /mine/:id/events`,
  `GET /mine/:id/review` (parecer atual e devoluções), `POST /composition/preview`,
  `POST /` (rascunho), `PUT /:id` (só os campos enviados), `POST|PUT|DELETE
  /:id/{budget-items|schedule-items|goals|resources|documents}[/:itemId]`
  (itens de orçamento recalculam a composição gravada), `POST /:id/validate`
  (erros por campo, não grava), `POST /:id/submit` e `POST /:id/transitions`
  (`buscar_parceiro`, `conectar`, `iniciar_execucao`, `concluir`,
  `prestar_contas`).
- Rascunho, edição e itens exigem só perfil de Agente; `submit` e `transitions`
  passam por `requireValidatedAgent` (403 `institution_not_validated`). O envio
  grava `organization_id` da instituição validada. Escritas rodam em transação
  com a demanda travada (`FOR UPDATE`); o trigger `demands_guard` confere de
  novo. O portal age como `sistema` só por `store.transitionDemand(..., { actor:
  'sistema', actorRef })`, que faz `set_config('dm.actor_type', 'sistema', true)`
  (ex.: conexão aceita → `conectar`, T15).
- Erros: 422 `{ error, code: 'validation_failed' | 'demand_incomplete', fields }`,
  403 `demand_author_not_agent`/`institution_not_validated`/`forbidden_actor`,
  409 `demand_not_editable`/`invalid_transition`/`invalid_state`, 404.
- Posts-vitrine: `demand_id` entra na projeção pública dos posts (feed, mapa,
  detalhe; `Post.demandId` no frontend). `PUT /:id` e `DELETE /:id` de post com
  `demand_id` respondem 409 `demand_showcase` com `demandId`; posts comuns não
  são excluídos pela API (`DELETE` responde 405).
- Frontend: tipos `Demand*`/`PublicDemand*` em `src/lib/app/types.ts` e bloco
  "DEMANDA (T07)" em `src/lib/app/api.ts` (`DemandRequestError` com `fields`),
  para o assistente da T09.
- Testes: `test/demand-routes.test.js` (banco simulado) e
  `test/demand-e2e.test.js`, o ciclo completo contra PostgreSQL. Rode
  `npm --prefix services/post-service run test:e2e`: sobe um PostgreSQL 15+
  temporário (Homebrew; `PG_BIN` para escolher), aplica o manifesto do
  `post_db` duas vezes, cria o papel `gestao_app` com os grants do dm-infra e
  apaga o cluster no fim. Sem `DM_E2E_DATABASE_URL`, o `npm test` pula esse arquivo.

## Upload de arquivos (T08)

- Módulo `src/uploads.js`, **a mesma cópia** no post-service e no user-service
  (teste confere), com AWS SDK v3. Cada serviço tem a política em
  `src/upload-policy.js` e a tabela `uploads` (post migração 008, user
  migração 009): dono, finalidade, `tmp_key`, `object_key`, tipo, tamanho
  declarado e confirmado, sha256 opcional, nome original, status
  `pendente`/`confirmado` e vínculo (`demand_id` / `organization_id`).
- Finalidades: `demand_photo` e `demand_evidence_photo` (JPEG/PNG/WEBP/HEIC,
  15 MB), `demand_evidence_video` (MP4/MOV, 500 MB em PUT único, sem
  multipart), `demand_document` e `institution_proof` (PDF/DOCX/XLSX/ODT/ODS/
  JPG/PNG, 25 MB). Frontend espelha em `src/lib/app/uploads.ts` (teste compara).
- Rotas (`/api/posts/uploads` para a demanda, `/api/users/uploads` para a
  instituição): `POST /presign` (token; grava pendente, devolve PUT
  pré-assinado para `tmp/<uuid>` com `Content-Type` assinado e, se houver,
  `x-amz-checksum-sha256`; limite de 30 pendentes/hora), `POST /:id/confirm`
  (HeadObject, tamanho = declarado e ≤ limite, tipo, assinatura dos primeiros
  bytes e sha256; copia para `demands/<id>/<photo|documents|evidence>/<id>.<ext>`
  ou `institutions/<id>/proof/<id>.<ext>` e apaga o tmp; recusa apaga tmp e
  registro), `GET /:id` (token; dono, `DM_OPERATION_USER_IDS` ou público →
  metadados + GET assinado de 5 min) e `GET /:id/content` (sem token; 302 para
  GET assinado, só foto/evidência de demanda publicada; `Cache-Control` 10 min).
- Alvo: arquivos da demanda só do Agente autor; foto e documentos com a
  demanda em rascunho/devolvida, evidências da publicação em diante. A
  comprovação exige o cadastro salvo e editável (`institution_required`,
  `institution_not_editable`).
- Referências gravam `upload:<id>` (a API aceita também o id puro e, por
  compatibilidade, link https): `demands.photo_ref`,
  `demand_documents.reference` e `organization_representatives.proof_document_ref`.
  A rota confere que o upload está confirmado, é do autor, da finalidade e do
  mesmo alvo (422 no campo). `photoUrl` sai como `/api/posts/uploads/<id>/content`
  na visão pública; na visão do autor, como GET assinado (`photoFile`,
  `documents[].file`, `representative.proof_document`). `posts.images` do
  post-vitrine é traduzido na projeção (`POST_IMAGES_SQL`); o frontend prefixa
  `/api/...` com `NEXT_PUBLIC_API_URL` (`resolveMediaUrl`).
- Sem `DM_UPLOADS_BUCKET` as rotas respondem 503 `uploads_unavailable`; não há
  armazenamento falso. Credencial: cadeia padrão do SDK (instance profile por
  IMDSv2 na AWS). O IAM só tem Put/Get/DeleteObject: HeadObject de chave
  inexistente dá 403 e é tratado como ausente. Clientes S3 com
  `requestChecksumCalculation: WHEN_REQUIRED` (sem CRC32 automático na URL).
- A gestão lê `uploads` pelo `gestao_app` (SELECT padrão) e assina o GET de
  `object_key` com a credencial da instância; contas da operação também leem
  por `GET /uploads/:id`. Arquivo substituído ou removido do formulário
  continua no bucket (sem limpeza automática).
- Testes: `services/post-service/test/uploads.test.js` (S3 simulado, URL
  assinada real com credencial estática de teste), `services/user-service/test/uploads.test.js`,
  `src/lib/app/uploads.test.mjs` e o trecho de upload no e2e da demanda.

## Assistente da demanda (T09)

- Páginas: `/demandas/nova` (etapa 1, cria o rascunho com a categoria),
  `/demandas/[id]/editar?etapa=<id>` (assistente; `noindex`),
  `/minhas-demandas` (`noindex`) e `/demandas/[id]` (pública, SSR, indexável,
  `revalidate` 60 s, JSON-LD `demandJsonLd`, entra no sitemap). `robots.ts`
  bloqueia `/demandas/nova`, `/demandas/*/editar` e `/minhas-demandas`.
- Componentes em `src/components/app/demand/`: `DemandWizard` (etapas),
  `DemandProgress` (barra numerada, `aria-current="step"`), `BudgetEditor`,
  `ScheduleEditor`, `ItemEditors` (metas, recursos/contrapartida, documentos),
  `DemandSummary` (revisão), `MyDemandsClient`, `PublicDemandView`,
  `DemandParts` (leitura sem estado, serve ao SSR) e `DemandMap`.
- Etapas (`DEMAND_STEPS` em `src/lib/app/demand.ts`, passos 03 a 11 do slide
  25): 1 classificação, 2 descrição + foto + localização (CEP no ViaCEP,
  `LocationPicker`, território), 3 público/objetivo/justificativa/prioridade,
  4 orçamento (execução física, item audiovisual obrigatório, composição 4%/6%
  ao vivo por `POST /composition/preview`), 5 cronograma físico-financeiro
  (vínculo item → etapa, marcos antes/acompanhamento/depois), 6 metas, 7
  recursos e contrapartida, 8 documentos (upload `demand_document`, opcional),
  9 revisão (`POST /:id/validate`, erros agrupados por etapa) e envio.
- Rascunho: cada etapa grava só os seus campos (`STEP_FIELDS`, `PUT /:id`) ao
  avançar, voltar ou trocar de etapa; itens gravam na hora pelas rotas próprias
  e a foto grava quando o upload termina. O post-service já aceita rascunho
  parcial (validação completa só no `validate`/`submit`); a API não mudou.
- `demand.ts` espelha `validation.js` (chaves do envio), `finance.js`
  (composição) e `state-machine.js` (rótulos e destinos das ações);
  `src/lib/app/demand.test.mjs` compara com os módulos do post-service.
- Instituição não validada: o rascunho segue livre; o envio e as ações depois
  da publicação mostram `InstitutionGateNotice` com `kind="agente_transformacao"`
  (ações `enviar_demanda` e `mover_demanda`), inclusive no 403 do servidor.
- "Minhas demandas": status canônico (em análise com a etapa da análise),
  parecer da devolução, retomada da edição e as ações de `availableActions`
  (`buscar_parceiro`, `conectar`, `iniciar_execucao`, `concluir`,
  `prestar_contas`) com confirmação.
- Post-vitrine: `PostCard`, `PublicPostCard` e o detalhe do post linkam para
  `/demandas/<demandId>`; o detalhe não oferece "Editar ponto" no post-vitrine.
  O `/criar` do Agente aponta para o assistente e para "Minhas demandas"; o menu
  da conta do Agente tem "Minhas demandas".

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
