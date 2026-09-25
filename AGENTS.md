# Aplicação web

## Arquitetura do DM Conecta (resumo)

Mapa completo: `DmConnecta/dm-docs` → `arquitetura.md`. No workspace
local (`~/Dev/Projetos/DmConnecta`), os repositórios ficam lado a lado.

| Ambiente | Onde roda | Endereço | Branch | Dados sintéticos |
| --- | --- | --- | --- | --- |
| Local | Docker Compose | `localhost` | qualquer | **proibidos** |
| Homologação | AWS, mesma EC2 da produção | `https://homologacao.dmconecta.org` | `develop` | **proibidos** |
| Produção | AWS EC2 + Cloudflare | `https://dmconecta.org` | `master` | **proibidos** |

- **Não existe mais Vercel.** Produção e homologação são AWS; menções a Vercel
  são dívida a remover.
- Produção e homologação rodam na mesma EC2 `dmconecta-production`
  (decisão do usuário; conta AWS no plano Free), em projetos Docker Compose
  separados, com parâmetros no SSM `/dmconecta/production/*` e
  `/dmconecta/homologation/*`. A EC2 separada `dmconecta-homologation` está
  sendo desativada (migração iniciada em 23/09/2026, branch
  `infra/maquina-unica` do `dm-infra`).
- Repositórios (org `DmConnecta`): aplicação em `dm-web` (checkout local
  `dm-web/`, de onde o deploy lê; o antigo `dm-api` foi apagado em 23/09/2026),
  gestão em `dm-gestao` (`dm-gestao/`), infraestrutura em `dm-infra`
  (`dmconecta-infra/`), documentação em `dm-docs`, Android em `dm-app-android`
  (`dmconecta-app-client-android/`), iOS em `dm-app-ios` (vazio).
- AWS `us-east-2`, Docker Compose no host
  (Caddy → Next.js `web:3000` e `/api/auth|users|posts` → serviços Node 3001–3003 →
  PostgreSQL com `auth_db`, `user_db`, `post_db`), imagens no ECR compartilhado,
  parâmetros no SSM `/dmconecta/<ambiente>/*`, releases no S3. Sem SSH: tudo por SSM.
- O feed, os perfis, comunidades, comentários e apoios só podem vir de dados
  persistidos criados pelo uso real da aplicação. Fixtures são permitidas
  exclusivamente dentro dos testes isolados.
- Cloudflare: zona `dmconecta.org` manual, fora do Terraform.
- Branches: `develop` (homologação, onde todo o trabalho é commitado) e
  `master` (produção, sempre igual a `develop` ou atrás dele). Não existem
  outras branches; `stable`, `main`, `release`, `codex/*` e `wip/*` foram
  consolidadas em `develop` em 23/09/2026.

## Ambiente da aplicação

- `NEXT_PUBLIC_RUNTIME_ENV`: `local`, `homologation` ou `production`
  (`src/lib/app/runtime.ts`).
- Em produção, `NEXT_PUBLIC_API_URL` vazio usa `/api` no mesmo domínio para
  as chamadas do navegador. O SSR das páginas públicas lê os serviços pela rede
  interna, sem token: `DM_INTERNAL_POST_API_URL` (`http://post-service:3003`) e
  `DM_INTERNAL_USER_API_URL` (`http://user-service:3002`), só no servidor
  (`src/lib/server/public-api.ts`). Não adicione fallback silencioso para dados
  locais nem coloque segredos em `NEXT_PUBLIC_*`.
- Deploy: o único remoto da aplicação é `origin` → `DmConnecta/dm-web`;
  `git push origin develop` basta.
- Publicação automática: push em `develop`/`master` publica sozinho: `develop` → homologação, `master` → produção, depois do CI
  verde (job `publicar` do `.github/workflows/ci.yml`, secret
  `DEPLOY_DISPATCH_TOKEN`; ver `dm-docs/arquitetura.md` §6).
- Schema: fonte única em `services/migrations.manifest` (ordem de `init.sql`,
  `migrate_*.sql` e `services/*/migrations/`). A infra não guarda SQL da
  aplicação: `dmconecta-infra/db/init/10-load-application-schemas.sh` aplica o
  manifesto inteiro em volume novo e a cada deploy
  (`scripts/apply-schema-migrations.sh`). Por isso todo arquivo é idempotente
  (`IF NOT EXISTS`, `ADD VALUE IF NOT EXISTS`, `CREATE TYPE` em bloco `DO` com
  `duplicate_object`) e `init.sql` só indexa colunas que existem desde a criação
  da tabela. Migração nova entra no fim do bloco do seu banco no manifesto
  (`scripts/migrations-manifest.test.mjs` confere). Próximos números livres:
  auth-service 005, user-service 013, post-service 025. Registre a migração em
  `dm-docs/production-status.md` até ela ser aplicada em produção.
- Posts antigos (decisão 7 de `dm-docs/fonte-da-verdade/decisoes-de-implementacao.md`):
  o status não é editável (PUT com `status` responde 400); a moderação só
  alterna `visibility` (`visible`/`hidden`, migração post 006), e post oculto
  não aparece em rota pública nem aceita comentário, reação ou apoio. Status
  desconhecido não ganha rótulo na interface (`normalizePostStatus`).
- **Foto e ponto obrigatórios para entrar no mapa** (migração post 024,
  `024-post-photos.sql`; decisão do usuário em 24/09/2026): o sinal do feed só
  é publicado com `latitude`/`longitude` válidas **e** `images` não vazio
  (`POST /posts` responde 400 `photo_required`), e o `PUT /:id` não apaga o
  ponto nem a foto. A foto vai por upload (`post_photo`, ver T08): o `/criar`
  tem o campo `FileUpload` e manda `images: ["upload:<id>"]`. A camada do feed
  (`GET /posts/map`) e a home só devolvem posts com ponto **e** foto; a
  demanda só entra em `GET /demands/map` com ponto e `photo_ref`, e o envio da
  demanda passou a exigir latitude/longitude (`REQUIRED_ON_SUBMIT`,
  `demand_assert_submittable`, espelho em `src/lib/app/demand.ts`). Posts
  antigos sem foto ou sem ponto continuam no feed e no detalhe, fora do mapa.
  Evento publicado sem `photoRef` também fica fora da camada do feed.

## Cadastro institucional (T04)

- `user_db.organizations` (migração user 008) guarda o cadastro institucional:
  `institution_kind` `agente_transformacao` (CNPJ + CNAE, endereço com CEP,
  contatos, responsável) ou `poder_publico` (órgão, CNPJ, esfera, município/UF,
  território, secretaria, competências, representante). Um cadastro por perfil
  (outras contas atuam em nome da instituição por vínculo, T29);
  Líder Comunitário e Representante de Bairro vinculam o perfil a uma
  instituição com CNPJ (decisão 3). Representante em
  `organization_representatives` (contatos privados).
- Rotas do user-service (`routes/institutions.js`): `GET/PUT /me/institution`,
  `POST /me/institution/submit`, `GET /me/institution/status`,
  `GET /institutions/reference`, `GET /:userId/institution` (público, só
  validada, sem contatos) e o diretório do Poder Público validado
  `GET /institutions/government[/:organizationId]` (T14). Validação de CNPJ
  (inclusive alfanumérico) e CNAE em `src/institution.js`.
- Estado `validation_status`: `pendente` → (titular envia) `em_analise` →
  (dm-gestao) `validada` | `devolvida` (parecer); `validada` → `revogada`
  (parecer). O titular edita e reenvia em `pendente`, `devolvida` e `revogada`.
  O trigger da migração 008 impõe as transições (a gestão é reconhecida pela
  sessão `gestao_app`), deriva `verified*` e grava a trilha em
  `organization_validation_events`. O dm-web nunca valida.
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
  > TODO(fonte-da-verdade): Modelo de Conexão §04 Obs. — 4% + 6% só se aplica a conexões com
  > Parceiros/Investidores/Empresas, não ao Poder Público; hoje a composição é por demanda.
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
  multipart), `demand_document`, `demand_accountability_document` (T18, só com
  a demanda em `prestacao_de_contas`), `institution_proof`
  (PDF/DOCX/XLSX/ODT/ODS/JPG/PNG, 25 MB) e `post_photo` (foto do sinal do
  feed, JPEG/PNG/WEBP/HEIC, 15 MB; migração post 024). Frontend espelha em
  `src/lib/app/uploads.ts` (teste compara).
- `post_photo` tem **vínculo adiado** (`deferredTarget`): quem publica no feed
  (`canPublishAny`) faz presign e confirma **sem** `demandId`; o arquivo vai
  para `posts/<owner_id>/photo/<id>.<ext>` com `uploads.post_id` nulo, e o
  `POST /posts` confere que cada `upload:<id>` de `images` é confirmado, do
  autor, dessa finalidade e ainda sem post (422 em `fields.images`) e grava
  `post_id` na mesma transação. Pública só com o post `visible`. A política do
  post-service expõe `targetColumns` (`demand_id`, `post_id`) e
  `targetColumnFor(purpose)`; o módulo compartilhado continua o mesmo nos dois
  serviços.
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
- Instituição responsável (T-02-02, slides 4 e 19): `/demandas/[id]` lê
  `getPublicInstitution(demand.authorId)` (projeção pública do user-service,
  só validada, sem contato do representante; resolve o vínculo da T29) e
  `PublicDemandView` mostra o selo ao lado do autor e o bloco "Publicada por"
  (`PublicInstitutionCard`: razão social, CNPJ, CNAE). Sem projeção, o bloco
  não aparece.
- Post-vitrine: `PostCard`, `PublicPostCard` e o detalhe do post linkam para
  `/demandas/<demandId>`; o detalhe não oferece "Editar ponto" no post-vitrine.
  O `/criar` do Agente aponta para o assistente e para "Minhas demandas"; o menu
  da conta do Agente tem "Minhas demandas".

## Dossiê da Demanda (T10)

- "Documento Oficial da Demanda — Dossiê da Demanda" (slides 18–19 do Fluxo 2)
  em PDF, gerado pelo post-service em `src/dossier/`: `content.js` (snapshot,
  redação da versão pública, JSON canônico e SHA-256), `pdf.js` (pdfkit, sem
  dependência nativa; DM Sans e Inter embutidas de `assets/fonts`, licença OFL;
  paleta e monograma do manual de marca), `service.js` (fila e versões),
  `institution.js` (projeção pública da instituição no user-service, sem token).
- Versões em `demand_dossiers` (migração post 009): envio (v1), cada reenvio
  (v2, v3…) e publicação (vN `integral` + vN `publica`), com número
  `DMC-<ano>-<seq>` por demanda, `trigger_kind`, `snapshot` congelado no pedido,
  `status` `pendente`/`gerado`/`falhou`/`indisponivel` + `status_reason`,
  `content` + `content_sha256` (impresso no PDF e no QR), `file_sha256`,
  `upload_id` (linha em `uploads`, finalidade `demand_dossier`) e
  `object_key` `demands/<id>/dossie/v<n>.pdf` (`v<n>-publica.pdf`). Trigger:
  dossiê gerado é imutável, nada é excluído, `gestao_app` só lê.
- Fora do caminho crítico: o `submit` responde e só então pede a geração
  (`dossiers.request`, nunca lança). O laço em processo (`DM_DOSSIER_INTERVAL_MS`,
  padrão 60 s; 0 desliga) reconcilia envios e publicações (a publicação vem do
  dm-gestao direto no banco) e repete falhas com espera exponencial (6
  tentativas); depois disso, `POST /:id/dossiers/regenerate`. Sem
  `DM_UPLOADS_BUCKET` a versão fica `indisponivel` com o motivo e é gerada
  quando houver bucket. `DM_PUBLIC_SITE_URL` (padrão `https://dmconecta.org`)
  forma a URL de verificação.
- Cada versão integral gerada grava `dossie_gerado` em `demand_events`
  (`sistema`, payload com versão, gatilho e hash; pública só na publicação).
- Rotas (`src/routes/dossiers.js`, antes das da demanda): públicas
  `GET /demands/dossiers/verify/:hash` (conteúdo ou arquivo; título da demanda
  só se publicada), `GET /demands/:id/dossie-publico` (302 para URL assinada
  de 5 min da versão pública; só demanda publicada) e
  `GET /demands/:id/dossie-publico/info`; autor ou `DM_OPERATION_USER_IDS`:
  `GET /demands/:id/dossiers`, `GET /demands/:id/dossiers/:dossierId/download`
  (`{ url, expiresAt, fileName }`, 60 s) e `POST /demands/:id/dossiers/regenerate`
  (503 `uploads_unavailable` sem bucket).
- Versão pública: sem CEP, rua, número, complemento, coordenadas, responsáveis
  do cronograma, descrição/origem de documentos e ids internos. A instituição
  vem da projeção pública (CNPJ, CNAE, razão social; nunca contatos).
- Frontend: `src/lib/app/dossier.ts` (rótulos, caminhos, SHA-256 no navegador),
  bloco "DOSSIÊ DA DEMANDA (T10)" em `api.ts` e `types.ts`, `DossierPanel`
  (Minhas demandas, revisão do assistente e leitura depois do envio), seção
  "Documento oficial" na página pública e `/dossie/verificar[/<hash>]`
  (`noindex`, bloqueada no `robots.ts`).
- Testes: `test/dossier.test.js` (conteúdo, redação, hash, PDF com fontes e
  foto) e `test/dossier-e2e.test.js` (S3 fora no envio, regeneração, reenvio,
  publicação, versão pública, verificação, imutabilidade, sem bucket),
  `src/lib/app/dossier.test.mjs`.

## Atuação institucional do Poder Público (T13)

- Fluxo 3 da fonte, etapas 03 a 08; decisão 4 (status institucional por órgão
  e por demanda). Migração post 010 (`010-institutional-tracks.sql`):
  `demand_institutional_tracks` (um acompanhamento por demanda × órgão
  `poder_publico` validado, com retrato do nome/esfera/secretaria/município do
  órgão, status institucional, nota da última mudança, responsável privado e
  datas; `UNIQUE (id, demand_id, organization_id)` para as FKs compostas da
  T14), `demand_institutional_responses` (8 tipos da fonte, texto, setor
  responsável, programa/serviço com URL https, data prevista, status no
  momento; só inserção) e `demand_institutional_offers` (11 formas de apoio da
  fonte, descrição, `connection_id` da conexão pedida ao Agente; só inserção).
  Também os índices da leitura da gestão (`idx_demands_submitted`,
  `idx_demands_place`, `idx_demands_territory`, `idx_demand_events_type_created`,
  `idx_supports_post_confirmed`).
- Status: `recebida` → `em_analise` → `encaminhada` → `em_articulacao` →
  `acao_programada` → `em_execucao` → `concluida` (final), mais
  `nao_e_de_competencia` e `encaminhada_ao_orgao_responsavel` (exigem
  justificativa; voltam a `em_analise`). Regra no banco
  (`institutional_status_transition_allowed`, trigger
  `institutional_tracks_guard`) e espelho em
  `services/post-service/src/institutional/state-machine.js` e
  `src/lib/app/institutional.ts` (testes comparam). Atuação só em demanda
  publicada em diante, fora `arquivada`; nada é excluído; `gestao_app` só lê
  (trigger + grant SELECT do dm-infra `009-gestao-app-post-institutional.sql`).
- Linha do tempo: os triggers gravam em `demand_events` (actor_type
  `poder_publico`, `clock_timestamp()`) `acompanhamento_institucional_aberto`,
  `status_institucional_alterado`, `resposta_institucional` e
  `apoio_institucional_oferecido` (públicos) e `responsavel_institucional_definido`
  (privado). A rota pública da timeline expõe só `payload->'public'` desses
  eventos, como `details` (órgão, tipo, status, trecho, programa, formas de
  apoio, justificativa).
- Rotas (`src/routes/institutional.js`, montada antes das da demanda; gate
  `src/institutional/gate.js`: 403 `not_government` / `institution_not_validated`,
  503 sem confirmação): `GET /institutional/me`, `GET /institutional/demands`
  (filtros da lista pública + `institutionalStatus` com `sem_acompanhamento` e
  `scope=jurisdicao|todas`: municipal → município/UF, estadual → UF, federal →
  tudo), `GET /institutional/tracks`, `GET /institutional/demands/:id`,
  `POST|PUT /institutional/demands/:id/track`, `POST .../status`,
  `POST .../responses` (pode mudar o status junto) e `POST .../offers`;
  público `GET /demands/:id/institutional`. A identificação do órgão vem da
  projeção pública do user-service (`createGovernmentProfileClient`, cache
  60 s). Respostas, status e ofertas abrem o acompanhamento se preciso.
- Neutralidade: ordem cronológica, sem pontuação, ranking ou comparação entre
  órgãos. O público vê o órgão, nunca o representante nem o responsável.
- Frontend: `/governo` (painel com fila "Recebidas", filtros, lista e mapa;
  `noindex`, bloqueado no `robots.ts`, menu da conta do Poder Público) e
  `/governo/demandas/[id]` (análise, registro de recebimento, mudança de
  status, responsável, resposta, oferta de apoio com pedido de conexão pelas
  rotas de conexões do user-service); seção "Respostas institucionais" e
  eventos institucionais na linha do tempo de `/demandas/[id]`
  (`src/components/app/institutional/`).
- Testes: `test/institutional-domain.test.js`, `test/institutional-routes.test.js`,
  `test/institutional-e2e.test.js` (no `test:e2e`) e
  `src/lib/app/institutional.test.mjs`.
- Encaminhamentos: T14, abaixo.

## Encaminhamentos da demanda (T14)

- Fluxo 3, etapa 06 (slide 11): o órgão que recebeu a demanda e não é o
  responsável a encaminha, registrando órgão responsável, setor de destino,
  data, responsável pelo encaminhamento, status, providências e atualizações
  posteriores (histórico de tramitação). Migração post 011
  (`011-forwardings.sql`): `demand_forwardings` (FK composta
  `(track_id, demand_id, organization_id)` para o acompanhamento de origem;
  destino `orgao_plataforma` com `destination_organization_id` e FK composta
  `destination_track_id`, `setor_interno` ou `orgao_externo` em texto;
  retrato do nome/esfera/município do destino; `reason` pública; responsável
  privado; status `enviado` → `recebido` → `aceito` | `devolvido` com motivo;
  datas de cada etapa; um encaminhamento em aberto por origem × órgão de
  destino) e `demand_forwarding_updates` (providência, atualização ou status,
  só inserção, lado `origem`/`destino` gravado pelo trigger).
- Regras no banco (triggers `forwardings_guard`, `forwarding_updates_guard`):
  nasce `enviado`; origem, destino, motivo e responsável não mudam; transições
  em `forwarding_status_transition_allowed` (espelho em
  `src/institutional/forwardings.js` e `src/lib/app/institutional.ts`); quem
  muda o status é o órgão de destino na plataforma e a própria origem fora
  dela (`status_changed_by_organization`); registro de status só pelo trigger;
  atualização só dos dois órgãos envolvidos; nada é excluído; demanda
  publicada e fora de `arquivada`; `gestao_app` só lê (dm-infra
  `010-gestao-app-post-forwardings.sql`).
- Ao encaminhar (uma transação, `POST /institutional/demands/:id/forwardings`):
  o acompanhamento de origem é aberto se preciso e vai para `encaminhada`
  (setor interno) ou `encaminhada_ao_orgao_responsavel` (outro órgão), ou o
  `trackStatus` escolhido, pela máquina de estados (409 `invalid_transition`
  se não couber); o órgão de destino da plataforma tem o acompanhamento aberto
  como `recebida`; a resposta `encaminhamento_realizado` é registrada.
- Destino na plataforma: diretório do user-service
  `GET /institutions/government` (busca por `q`, `sphere`, `municipality`,
  `uf`) e `GET /institutions/government/:organizationId`, só `poder_publico`
  `validada`, projeção pública, para o Poder Público validado; o post-service
  chama com o token do representante (`src/institutional/directory.js`) e
  confirma o destino no servidor (422 se não for órgão validado, 503
  `directory_unavailable` sem resposta).
- Rotas (`src/routes/forwardings.js`, no router institucional):
  `GET /institutional/organizations`, `POST /institutional/demands/:id/forwardings`,
  `GET /institutional/forwardings?direction=recebidos|enviados&status=`,
  `GET /institutional/forwardings/:fid`, `POST .../:fid/status`
  (403 `forwarding_forbidden`), `POST .../:fid/updates`. A visão do órgão
  (`GET /institutional/demands/:id`) traz `forwardings` em que ele é origem ou
  destino; `GET /institutional/me` traz `forwardings.pendingReceived` e
  `openSent`; o público `GET /demands/:id/institutional` traz `forwardings`
  sem responsável, representante nem ids.
- Linha do tempo pública: `demanda_encaminhada`,
  `encaminhamento_status_alterado`, `encaminhamento_atualizado` (e a abertura
  do acompanhamento do destino), com `payload->'public'` exposto como `details`.
- Frontend: seção "Encaminhamento e tramitação" em `/governo/demandas/[id]`
  (`ForwardingForm` com busca de órgão validado ou texto livre, ações de status
  e providências), abas "Encaminhadas a nós" e "Enviadas" no `/governo`,
  notificação no sino para encaminhamento recebido sem resposta e
  "Encaminhamentos e tramitação" na página pública da demanda
  (`src/components/app/institutional/Forwarding*.tsx`).
- Testes: `test/forwardings-domain.test.js`, `test/forwardings-routes.test.js`,
  `test/forwarding-e2e.test.js` (no `test:e2e`), diretório em
  `services/user-service/test/institutions-routes.test.js` e
  `src/lib/app/institutional.test.mjs`.

## Interesse, conexão e oportunidades de apoio (T15)

- Fonte: Apresentação, slides 9–11 (permissões) e 15 (Demanda → Conexão →
  Apoio); Fluxo 2, slide 22 (demanda publicada → interesse → conexão com o
  Agente → apoio, "critérios de compatibilidade").
- Migração post 012 (`012-demand-interests.sql`): `demand_interests`
  (demanda × conta × tipo em aberto; `apoio` com `offer_types` ⊂ recursos,
  produtos, serviços, conhecimento, estrutura, investimento, para Parceiro e
  Poder Público; `participacao` e `voluntariado` para Membro da Comunidade;
  retrato do nome/perfil; `organization_id` do órgão validado; mensagem;
  `connection_id` + `connection_status` `pendente` → `aceita` | `recusada` |
  `cancelada`, e de novo `pendente` com outra conexão depois de recusada ou
  cancelada; `withdrawn_at` final). Trigger `demand_interests_guard`: só em
  demanda `publicada`/`em_busca_de_parceiro`/`conectada`/`em_execucao`, nunca
  do autor, identidade e oferta imutáveis, nada excluído, `gestao_app` só lê
  (dm-infra `011-gestao-app-post-interests.sql`). `demand_events` ganha os
  atores `parceiro` e `comunidade`; eventos públicos `interesse_registrado`,
  `interesse_retirado`, `conexao_solicitada`, `conexao_aceita` com
  `payload->'public'` (tipo, categoria da conta, ofertas; sem nome nem id);
  `conexao_recusada`/`conexao_cancelada` privados.
- Migração user 010 (`010-partner-profiles.sql`): `partner_profiles` (perfil de
  apoio: `nationwide`, `ufs`, `municipalities` "Município/UF", `territories`,
  `interest_categories` = categorias da demanda, `offered_resources` = recursos
  necessários da demanda; CHECKs com as listas) e `connections.demand_id`.
  Rotas `GET/PUT /me/partner-profile` (`routes/partner-profile.js`; PUT só
  Parceiro e Poder Público, 403 `partner_profile_forbidden`); `POST
  /connections` aceita `demandId` e a conexão devolve `demandId`. Grant
  explícito dm-infra `012-gestao-app-user-partner-profiles.sql`.
- Compatibilidade sem IA (`services/post-service/src/interest/compatibility.js`):
  território até 40 (território/bairro 40, só se o município também conferir
  quando o perfil lista municípios; município+UF 30; UF 20; todo o país 10),
  categoria 30, recursos `round(30 × oferecidos ∩ necessários / necessários)`;
  nível alta ≥ 70, média ≥ 40, baixa > 0; cada critério com o motivo em texto.
- Rotas (`src/routes/interests.js`, montada em `/demands` antes das da demanda;
  clientes do user-service em `src/interest/user-service.js`, com o token do
  usuário por `DM_INTERNAL_USER_API_URL`): `GET /opportunities` (Parceiro e
  Poder Público validado; filtros `category`, `priority`, `status` ⊂ abertos,
  padrão publicada + em busca de parceiro, `resourceType`, `territory`,
  `municipality`, `uf`, `q`, `minTotalCents`/`maxTotalCents` sobre o total,
  `sort=compatibilidade|recentes`, `limit` ≤ 50 e `offset` sobre as 500 mais
  recentes; sem perfil de apoio disponível, `compatibilityAvailable: false` e
  ordem por data), `GET /interests/mine`, `GET /:id/interests/summary`
  (público, só contagens), `GET /:id/interests/mine` (tipos permitidos e
  compatibilidade), `POST /:id/interests`, `POST /:id/interests/:iid/connection`
  (cria a conexão no user-service para o autor, com `postId` do post-vitrine e
  `demandId`; tipo sugerido pela oferta), `POST /:id/interests/:iid/withdraw`
  (cancela o pedido pendente); Agente autor: `GET /mine/:id/interests`,
  `POST /mine/:id/connections/:cid/accept` (confere no user-service que o
  destinatário é o autor e `demandId` é a demanda, aceita se pendente,
  espelha `aceita` e, de `publicada`/`em_busca_de_parceiro`, faz `conectar`
  como `sistema` com `dm.actor = conexao:<cid>`; idempotente; 422
  `connection_not_linked`) e `.../decline`. `em_busca_de_parceiro` continua a
  ação `buscar_parceiro` do Agente. Poder Público sem validação: 403
  `institution_not_validated`; 503 `connections_unavailable` sem user-service.
- Frontend: `/oportunidades` (`noindex`, bloqueada no `robots.ts`, menu da
  conta de Parceiro e Poder Público; `OpportunitiesClient`, `PartnerProfileForm`,
  `CompatibilityCard` em `src/components/app/interest/`), seção "Apoio e
  participação" na página pública da demanda (`DemandInterestPanel`: "Tenho
  interesse", "Quero participar", "Quero ser voluntário", "Solicitar conexão",
  retirar, compatibilidade), "Interessados e conexões" em Minhas demandas
  (`DemandInterestsInbox`, aceitar/recusar), link da demanda no
  `ConnectionCard` e aceite pela rota da demanda em Conexões
  (`api.respondToConnection`). A oferta institucional da T13 também grava
  `demandId`. Espelho em `src/lib/app/interest.ts`.
- Testes: `test/interest-domain.test.js`, `test/interests-routes.test.js`,
  `test/interest-e2e.test.js` (no `test:e2e`),
  `services/user-service/test/partner-profile.test.js` e
  `src/lib/app/interest.test.mjs`.

## Apoio à demanda: modalidades, registro e transparência (T16)

- Fonte: Apresentação, slide 20 (as 6 modalidades do "Sistema de apoio"),
  slide 21 (transparência: histórico de apoio) e slides 10–11 (Parceiros
  "apoiam projetos", "registram apoio realizado", "acompanham resultados" e
  entram no ranking; o Poder Público apoia **sem** ranking). Decisão 5: a
  plataforma não processa pagamento — o apoio financeiro é **valor declarado**.
- Migração post 013 (`013-support-modalities.sql`), **na tabela `supports` que
  já existe** (o dm-gestao lê e escreve `status` ali): enums `support_modality`
  (`patrocinar_projeto`, `doar_recursos`, `financiar_evento`,
  `adotar_espaco_publico`, `apoiar_acao_ambiental`, `contratar_servicos_locais`)
  e `support_receipt_status` (`declarado` → `confirmado` | `contestado`;
  `contestado` → `confirmado`), mais `modality`, `demand_id` (o `post_id`
  continua sendo o post-vitrine, para a gestão enxergar pelo feed),
  `supporter_category`, `profile_type`, `organization_id`, `description`,
  `occurred_on`, `receipt_*`, `display_consent`/`public_name`/`amount_public`
  e `canceled_at`. `type` passa a ser **o que é oferecido**.
- Mapeamento dos tipos antigos (migração + trigger do apoio do feed):
  `financial` → `patrocinar_projeto` (em post `event`, `financiar_evento`);
  `materials`, `equipment`, `food`, `space`, `volunteering` → `doar_recursos`;
  `labor`, `transport`, `knowledge` → `contratar_servicos_locais`; `sharing`
  fica sem modalidade (divulgação é amplificação).
- Trigger `supports_guard`: apoio de demanda nasce `declarado`/`pending`, sem
  `payment_method`, só em demanda publicada em diante (fora `arquivada`),
  nunca do autor; identidade, modalidade, oferta, descrição, valor e data são
  imutáveis; nada é excluído (o apoiador usa `canceled_at`, só antes da
  confirmação); a confirmação do Agente leva `status` de `pending` a
  `confirmed`; a sessão `gestao_app` só muda `status`/`updated_at`.
  `supports_record_event` (`SECURITY DEFINER`) grava `apoio_declarado`,
  `apoio_confirmado` e `apoio_contestado` (públicos, `payload->'public'` com
  nome e valor só quando há consentimento) e `apoio_cancelado`,
  `apoio_revisado_gestao` (privados).
- Domínio em `services/post-service/src/support/` (constantes, validação) e
  `store.js` (projeções própria, do Agente e pública, totais); rotas em
  `src/routes/supports.js`, montada em `/demands` antes das da demanda:
  público `GET /:id/supports` (histórico + totais); Parceiro e Poder Público
  validado `GET /supports/mine`, `GET /:id/supports/mine`, `POST /:id/supports`,
  `PUT /:id/supports/:sid/consent` (revogável, LGPD),
  `POST /:id/supports/:sid/cancel`; Agente autor `GET /mine/:id/supports`,
  `POST /mine/:id/supports/:sid/confirm` (evidência opcional: `upload:<id>`
  confirmado, dele, desta demanda, finalidade de evidência/documento) e
  `.../contest` (justificativa obrigatória).
- Feed: `POST /:id/supports` responde 409 `demand_support_flow` no post-vitrine
  (o apoio à demanda vai pela demanda); `GET /my/supports` traz só o apoio do
  feed; `/ranking` ignora apoio cancelado, rejeitado e do Poder Público.
- Frontend: `src/lib/app/support.ts` (espelho de `support/constants.js`,
  comparado em `support.test.mjs`), bloco "APOIO À DEMANDA" em `api.ts` e
  tipos em `types.ts`; `src/components/app/support/` com `DemandSupportPanel`
  (registro, consentimento, cancelamento), `DemandSupportHistorySection` +
  `DemandSupportBlock` (histórico público na página da demanda),
  `DemandSupportsInbox` ("Apoios recebidos" em Minhas demandas) e
  `MyDemandSupports` ("Meus apoios", com o andamento da demanda apoiada).
  `/post/[id]/apoiar` não oferece mais PIX nem cartão e manda o post-vitrine
  para a demanda.
- Grant dm-infra `013-gestao-app-post-supports.sql` (`SELECT` + `UPDATE
  (status, updated_at)`). Contrato e o ajuste pendente do dm-gestao em
  `dm-docs/gestao/04-modelagem-de-dados.md` §3.11.
- Testes: `test/support-domain.test.js`, `test/supports-routes.test.js`,
  `test/support-e2e.test.js` (no `test:e2e`) e `src/lib/app/support.test.mjs`.

## Execução, evidências antes/depois e acompanhamento (T17)

- Fonte: Fluxo 2, slide 11 (o registro documenta a situação inicial e os
  resultados, como evidência de acompanhamento, transparência e comprovação),
  slide 12 (o que o registro deve contemplar: foto do antes, foto do depois,
  filmagem do processo, registro audiovisual do resultado final e outros
  registros; item obrigatório do orçamento **sempre que houver execução
  física**), slide 14 (o cronograma prevê os momentos de registro: situação
  inicial, acompanhamento e resultado final), slide 23 (execução e
  acompanhamento: etapas concluídas e em andamento, cumprimento do cronograma,
  alterações de prazo, execução orçamentária, resultados parciais e evidências)
  e slide 24 (os registros de antes e depois ficam vinculados à demanda e
  compõem o histórico visual).
- Migração post 014 (`014-execution.sql`): `demand_evidences` (demanda, etapa
  do cronograma opcional, `milestone` do enum `demand_record_milestone` da 007,
  `media_kind` `foto`/`video`, `upload_ref`/`upload_id` de upload confirmado da
  T08, legenda, `recorded_on`, autor, `pair_evidence_id` — gravado na evidência
  `depois`, apontando para a `antes` — e `position`);
  `demand_progress_updates` (etapa + `stage_progress`, `on_schedule`,
  `new_ends_on` + `deadline_reason`, `partial_results` público e `note`
  interna); `demand_progress_expenses` (valor executado por item do orçamento
  e/ou por etapa); e `demands.record_waiver_reason`/`record_waiver_at`.
- Imutabilidade: andamento e execução orçamentária são **só inserção** (nada é
  editado nem excluído: registre outra atualização); a evidência não é excluída
  e só aceita mudança de legenda, pareamento e ordem; o par antes↔depois é
  único (índice parcial) e exige o mesmo tipo de registro; `gestao_app` só lê
  (triggers `demand_progress_guard`, `demand_expenses_guard`,
  `demand_evidences_guard`, os `*_block_truncate` e o grant dm-infra
  `014-gestao-app-post-execution.sql`).
- Reflexo na demanda: `demand_execution_guard` exige evidência `antes` para
  `em_execucao` e `depois` para `concluida`, salvo `record_waiver_reason` (a
  justificativa é dada uma vez, pelo Agente, antes da conclusão, e não muda).
  `POST /demands/:id/transitions` devolve 409 `evidence_required` com `action`,
  `milestone` e `milestoneLabel` antes de tocar o trigger; a regra está
  espelhada em `src/execution/constants.js` (`TRANSITION_REQUIRED_MILESTONE`).
- Linha do tempo: os triggers gravam `evidencia_registrada`, `registro_pareado`,
  `andamento_registrado`, `prazo_alterado` e `registro_dispensado`, todos
  públicos, com `payload->'public'` exposto como `details` na rota pública
  (marco, tipo, legenda, data, etapa, situação, cumprimento do cronograma,
  valor executado, resultados parciais, nova data e justificativa; nunca o id
  do arquivo nem a nota interna).
- Domínio em `services/post-service/src/execution/` (constantes, validação) e
  `store.js` (projeções do autor e pública, pares antes↔depois, execução
  orçamentária planejado × executado, situação corrente do cronograma); rotas
  em `src/routes/execution.js`, montada em `/demands` antes das da demanda:
  público `GET /:id/execution`; Agente autor `GET /mine/:id/execution` (com
  `canRegisterEvidence`, `canRegisterProgress`, `canWaiveRecord` e `pending`),
  `POST /mine/:id/evidences`, `PUT /mine/:id/evidences/:evidenceId` (legenda e
  pareamento; o par registrado não é desfeito), `POST /mine/:id/progress` e
  `POST /mine/:id/record-waiver`. Evidência e andamento exigem instituição
  validada (`requireValidatedAgent`).
- Dossiê (T10): a conclusão gera uma versão nova, `trigger_kind` `conclusao`
  (integral + pública), pedida fora do caminho crítico pelo mesmo
  `dossiers.request`; `ensureRequests` e `reconcile` reconhecem a origem
  `conclusao`.
- Frontend: `src/lib/app/execution.ts` (espelho de `execution/constants.js`,
  comparado em `execution.test.mjs`), bloco "EXECUÇÃO, EVIDÊNCIAS E
  ACOMPANHAMENTO (T17)" em `api.ts` e tipos em `types.ts`;
  `src/components/app/execution/` com `DemandExecutionPanel` (aba "Execução"
  em Minhas demandas: upload de evidência por marco e etapa, pareamento,
  andamento, execução orçamentária e justificativa de ausência de registro) e
  `DemandExecutionSection` (galeria antes/depois lado a lado e acompanhamento
  público, SSR por `getPublicDemandExecution`). "Minhas demandas" passou a ter
  abas (`role="tablist"`): interessados, apoios, execução e dossiê.
- Testes: `test/execution-domain.test.js`, `test/execution-routes.test.js`,
  `test/execution-e2e.test.js` (no `test:e2e`) e `src/lib/app/execution.test.mjs`.
- Contrato e pendências do dm-gestao em
  `dm-docs/gestao/04-modelagem-de-dados.md` §3.12.

## Prestação de contas e prestação de resultados (T18)

- Fonte: Fluxo 2, slide 24 ("Etapa 10 · Prestação de resultados": ao longo e ao
  final da execução deverão ser registrados documentos e evidências,
  incluindo, **obrigatoriamente quando aplicável**, fotos e filmagem do antes e
  do depois, registros das ações realizadas, comprovantes financeiros quando
  aplicável, relatórios de execução, atualização do cronograma, número de
  beneficiários, resultados alcançados e indicadores de impacto; os registros
  de antes e depois ficam vinculados à demanda e a plataforma monta o histórico
  completo, da criação aos resultados), slide 15 (metas, resultados esperados,
  indicadores e **forma de mensuração**) e slide 25, passo 18.
- Migração post 015 (`015-accountability.sql`): `demand_accountability` (um
  registro final por demanda, `status` `rascunho` → `concluida`: relatório de
  execução, registros das ações, atualização final do cronograma,
  `beneficiaries_reached` × `beneficiaries_estimate` congelada da T06,
  indicadores de impacto, `financial_support` declarado, resumo financeiro e
  total executado); `demand_accountability_results` (um por meta da T06, com
  retrato da meta e do indicador, valor medido, forma de mensuração usada,
  `achieved`, nota interna e `evidence_id` da T17); e
  `demand_accountability_documents` (comprovante financeiro, relatório de
  execução, registro da ação ou outro, por upload confirmado da T08, finalidade
  `demand_accountability_document`). Também `UNIQUE (demand_id, id)` em
  `demand_goals` e o CHECK de `uploads.purpose` estendido.
- Obrigatoriedade explícita (o "quando aplicável" da fonte), em duas camadas:
  **sempre** — relatório de execução, registros das ações, atualização do
  cronograma, beneficiários alcançados, indicadores de impacto (CHECK
  `demand_accountability_concluded`) e um resultado por meta declarada
  (trigger); **condicional a execução física** (`has_physical_execution` sem
  `record_waiver_reason` da T17) — evidência `antes` e `depois`; **condicional
  a apoio financeiro declarado** — resumo financeiro e ao menos um comprovante.
  A lista vem pronta em `requirements` (`{ key, label, condition, applies,
  satisfied, reason }`) e o 422 `accountability_incomplete` traz `fields`.
- Imutabilidade: a prestação `concluida` não muda mais (nem ela, nem os
  resultados, nem os anexos); nada é excluído; `gestao_app` só lê (triggers
  `demand_accountability_guard`, `demand_accountability_items_guard`, os
  `*_block_truncate` e o grant dm-infra
  `015-gestao-app-post-accountability.sql`). Enquanto `rascunho`, o Agente
  edita, troca resultados e remove anexos.
- Linha do tempo: `demand_accountability_record_event` grava
  `prestacao_de_contas_concluida` (público) com `payload->'public'`
  (beneficiários alcançados e estimados, metas totais e cumpridas, total
  executado, indicadores de impacto); `DETAILED_EVENT_TYPES` de
  `routes/demands.js` inclui o evento, que sai como `details` na rota pública.
- Domínio em `services/post-service/src/accountability/` (constantes,
  exigências, validação) e `store.js` (projeções do autor e pública, metas com
  resultado, contagem de evidências, totais); rotas em
  `src/routes/accountability.js`, montada em `/demands` antes das da demanda:
  público `GET /:id/accountability` (só a prestação **concluída**); Agente autor
  `GET /mine/:id/accountability` (com `requirements`, `editable` e
  `canConclude`), `PUT /mine/:id/accountability` (cria na primeira gravação),
  `PUT|DELETE /mine/:id/accountability/results/:goalId`,
  `POST /mine/:id/accountability/documents`,
  `DELETE /mine/:id/accountability/documents/:documentId` e
  `POST /mine/:id/accountability/conclude`. Escrita exige instituição validada
  (`requireValidatedAgent`).
- Dossiê (T10): a conclusão gera uma versão nova, `trigger_kind`
  `prestacao_de_contas` (integral + pública), pedida fora do caminho crítico
  pelo mesmo `dossiers.request`; `ensureRequests` só a cria quando a prestação
  está `concluida`. O snapshot ganha `accountability` (já na projeção pública) e
  o PDF, a seção "Prestação de contas e resultados".
- Frontend: `src/lib/app/accountability.ts` (espelho de
  `accountability/constants.js`, comparado em `accountability.test.mjs`), bloco
  "PRESTAÇÃO DE CONTAS E RESULTADOS (T18)" em `api.ts` e tipos em `types.ts`;
  `src/components/app/accountability/` com `DemandAccountabilityPanel` (aba
  "Prestação de contas" em Minhas demandas, só no status
  `prestacao_de_contas`: registro final, resultado por meta, anexos e
  conclusão) e `DemandAccountabilitySection` (seção pública "Resultados e
  prestação de contas", SSR por `getPublicDemandAccountability`). As abas de
  "Minhas demandas" passam a ser cinco: interessados, apoios, execução,
  prestação de contas e dossiê.
- Transparência (T19 parcial): a página pública mostra pessoas impactadas
  (alcançadas × estimadas), metas cumpridas, relatório, ações, cronograma
  executado, indicadores de impacto, resultados por meta (sem nota interna) e
  os comprovantes **sem o arquivo** (tipo, título, data e valor declarado); as
  fotos e os registros continuam na galeria antes/depois da T17 e o histórico
  de apoio, na seção da T16.
- Testes: `test/accountability-domain.test.js`,
  `test/accountability-routes.test.js`, `test/accountability-e2e.test.js` (no
  `test:e2e`), os dois testes novos de `test/dossier.test.js` e
  `src/lib/app/accountability.test.mjs`.
- Contrato e pendências do dm-gestao em
  `dm-docs/gestao/04-modelagem-de-dados.md` §3.13.

## Mapa inteligente (T20)

- Fonte: Apresentação Institucional, slide 19 (legenda literal e "leitura
  rápida para governo, empresas, mídia e comunidade") e slide 18 (demandas e
  conteúdos do feed como camadas distintas).
- Legenda: as cinco classes são as cinco categorias da demanda, uma para uma —
  Problemas urgentes (`problema_urgente`), Problemas urbanos (`problema_urbano`),
  Projetos sociais (`projeto_social`), Ações ambientais (`projeto_ambiental`) e
  Necessidades (Oportunidades de patrocínio) (`necessidade_de_patrocinio`).
  > TODO(fonte-da-verdade): Modelo de Conexão §03 — faltam 7 tipos de demanda (obra/infraestrutura,
  > revitalização de espaço, recuperação ambiental, apoio técnico, apoio com serviços, apoio com
  > materiais, outras); a legenda de 1 classe por categoria precisa ser revista.
  Cada classe tem cor do manual de marca **e** forma própria (triângulo,
  quadrado, círculo, losango, estrela), para o mapa não depender só de cor;
  `Conteúdos do feed` é a sexta camada (`#5A9BC4`, ponto). Vocabulário em
  `services/post-service/src/map/constants.js`, espelhado em
  `src/lib/app/map.ts` (`src/lib/app/map.test.mjs` compara os dois).
- Rotas públicas (`src/routes/map.js`, montada em `/demands` antes das rotas da
  demanda; público em `/api/posts/demands/map*`), sem token e sem dado pessoal:
  `GET /map` (filtros `category`, `priority`, `status`, `territory`,
  `municipality`, `district`, `uf`, `q`, `from`/`to` por data de publicação,
  `bbox=oeste,sul,leste,norte`, `zoom` 1–18 e `limit` ≤ 500) devolve
  `{ mode, counts, points, clusters, truncated }`; `GET /map/territories`
  agrega por território/município/UF com `slug` estável; `GET /map/legend`
  devolve legenda, camadas e atalhos. Filtro inválido → 422
  `validation_failed` com `fields`.
- Custo por requisição: duas consultas agregadas com índice, nunca varredura.
  Acima de 300 demandas no recorte (`CLUSTER_THRESHOLD`), a resposta vem
  agrupada por célula da grade (`cellSize = 360 / 2^zoom`, teto de 400
  células); abaixo, vêm os pontos (teto de 500) e `truncated` avisa. As
  contagens por classe, prioridade e status saem de `count(*) FILTER`.
  Migração post 016 (`016-map-indexes.sql`): `idx_demands_map_points`
  (status + coordenadas), `idx_demands_map_place` (status + UF/município/
  território) e `idx_posts_map_points`.
- Ponto público: id, categoria, prioridade, status, título, bairro, município,
  UF, território, coordenada, data de publicação e o post-vitrine. Autor, CEP,
  rua, número e orçamento **não** saem no mapa.
- Camada de conteúdos do feed: `GET /map` de posts (`routes/posts.js`) passou a
  aceitar `bbox` e `limit` (teto de 500); a resposta continua sendo o array.
  Desde a migração 024 só entram posts com ponto **e** foto (`ON_MAP`), e as
  demandas só entram com ponto e `photo_ref`.
- Leitura rápida por público (atalhos que pré-aplicam filtros coerentes com as
  permissões da fonte): **Governo** (problemas urgentes e urbanos, prioridade
  alta/urgente, em aberto), **Empresas** (patrocínio, projetos sociais e
  ambientais, publicadas e em busca de parceiro), **Imprensa** (publicadas, em
  execução e com resultados, com a camada do feed) e **Comunidade** (tudo, com
  a camada do feed).
- Frontend: `/mapa` (SSR, indexável) e `/mapa/<territorio>` (SSR indexável por
  território, `slug` de `GET /map/territories`, entra no `sitemap.ts`).
  `src/components/app/map/`: `SmartMapClient` (filtros, atalhos, contagens por
  camada e lista), `SmartMapView` (Leaflet, `ssr: false`, marcadores com
  `title`/`alt` e foco pelo teclado), `MapLegend` (legenda como tabela, com
  símbolo, forma em texto e contagem) e `pins.ts` (SVG das formas). O SSR já
  traz legenda, contagens e a lista de demandas com link, então a página serve
  sem JavaScript e sem mouse. `MAP_PIN_COLORS` (cor por tipo de post) saiu:
  a paleta do mapa é a da legenda.
- Testes: `services/post-service/test/map-routes.test.js`,
  `test/map-e2e.test.js` (no `test:e2e`) e `src/lib/app/map.test.mjs`.

## Engajamento, rankings e selos de impacto social (T21)

- Fonte: Apresentação Institucional, slide 22 ("Engajamento e rankings":
  curtidas e comentários, compartilhamentos, gamificação, selos de impacto
  social; os sete rankings — usuários mais ativos, maiores apoiadores, empresas
  em destaque, voluntários mais participativos, maiores patrocinadores, bairros
  mais engajados e projetos mais apoiados) e slide 13 ("Restrições e
  governança": o ranking prioriza o reconhecimento de apoio e impacto; **não
  incluir políticos nem órgãos públicos** em ranking competitivo; para o Poder
  Público valem **indicadores de atuação**, respostas, encaminhamentos e
  resultados).
- Migração post 017 (`017-engagement-rankings.sql`): `content_shares`
  (compartilhamento de post ou demanda, append-only, um por conteúdo × conta ×
  dia — índice único por `target_id, user_id, shared_on` —, sempre de conta
  autenticada, com retrato do nome/avatar/papel/subperfil, porque o `post_db`
  não conhece `profiles`), `posts.shares_count`/`demands.shares_count`
  (contador mantido pelo trigger `content_shares_count`), `ranking_consents`
  (consentimento de exibir o nome, revogável, nunca excluído),
  `ranking_snapshots` + `ranking_runs` (agregação materializada) e
  `profile_badges` + `profile_engagement` (selos e números do perfil). Triggers
  `content_shares_guard` (só inserção, só conteúdo público, `gestao_app` não
  escreve) e `ranking_consents_guard`. Grant dm-infra
  `016-gestao-app-post-engagement.sql` (só SELECT).
- Domínio em `services/post-service/src/ranking/`: `constants.js` (os sete
  rankings na ordem da fonte, com o **critério em texto**, períodos, categorias,
  selos, indicadores de atuação e os avisos de governança e de consentimento),
  `scoring.js` (período corrente, fórmula por ranking, empate dividindo a mesma
  posição com `tied`), `store.js` (agregação, montagem, gravação e leitura) e
  `service.js` (laço `DM_RANKING_INTERVAL_MS`, padrão 5 min; 0 desliga).
- **Nenhuma requisição pública roda agregação**: o laço recalcula os 7 rankings
  × 3 períodos e os selos numa transação (teto de 100 linhas por ranking ×
  período) e as rotas leem `ranking_snapshots`/`profile_badges` por índice. Os
  índices da agregação estão na própria migração 017.
- Neutralidade: a conta só entra num ranking de pessoas se a categoria dela for
  **conhecida e diferente de `poder_publico`** (falha fechada; a categoria vem
  dos retratos já gravados em `supports`, `demand_interests`, `demands` e
  `content_shares`). Apoio do Poder Público não pontua em nenhum ranking, nem
  no da demanda nem no do bairro. `GET /profiles/:userId/impact` devolve
  `ranked: false`, sem selo, com os cinco indicadores de atuação e o aviso.
- Comunicação (decisão 18): o papel `media` vira a categoria `comunicacao`
  (`ROLE_TO_CATEGORY`), conta em "Usuários mais ativos" e no selo
  `divulgador`, e fica fora dos quadros de apoio
  (`SUPPORT_BOARD_EXCLUDED_CATEGORIES`).
- LGPD: só aparece com nome quem consentiu. Nos rankings de apoio vale o
  `display_consent` do próprio apoio (T16); nos demais, `ranking_consents`
  (opção no perfil). Sem consentimento a linha **continua contando** — os
  números ficam honestos — mas vai para a tabela sem nome e sem avatar (CHECK
  `ranking_snapshots_identity`). "Maiores patrocinadores" só conta apoio com
  nome **e** valor autorizados.
- Rotas (`src/routes/rankings.js`, montada em `/` antes das rotas de posts):
  públicas `GET /rankings` (`period` mes|ano|sempre, `board` com vírgula,
  `limit` ≤ 100), `GET /rankings/criteria` (rótulos, critérios, selos,
  indicadores e avisos) e `GET /profiles/:userId/impact`; com token
  `GET|PUT /rankings/consent` e `POST /shares`
  (`{ targetKind, targetId, channel }` → 201 quando contou, 200 quando o dia já
  tinha registro, 409 `share_unavailable` em conteúdo não público).
- Selos (regra objetiva sobre dado real, com a regra visível e a data do
  registro que a cumpriu): `apoiador_confirmado` (≥1 apoio confirmado),
  `apoiador_recorrente` (≥5), `patrocinador` (apoio confirmado nas modalidades
  de patrocínio/financiamento), `voluntario_participante` (interesse de
  voluntariado/participação com conexão aceita), `agente_com_demanda_concluida`,
  `prestacao_de_contas_publicada`, `registro_antes_e_depois` (par de evidências
  da T17) e `divulgador` (≥10 compartilhamentos).
- Frontend: bloco "ENGAJAMENTO, RANKINGS E SELOS DE IMPACTO SOCIAL (T21)" em
  `src/lib/app/ranking.ts` (espelho comparado em `ranking.test.mjs`), bloco em
  `api.ts`, `getPublicRankings`/`getPublicProfileImpact` em
  `src/lib/server/public-data.ts`; `/ranking` (SSR, `?periodo=`) com
  `RankingClient` (as sete listas, seletor de período, "Como é calculado" por
  ranking, empate marcado e o aviso do slide 13); `ImpactBadges` no perfil
  público e no próprio perfil (com a opção de consentimento); `ShareButton`
  (Web Share API → área de transferência → link visível) na página pública da
  demanda e no detalhe do post. `Post.sharesCount` e `PublicDemand.sharesCount`
  entram nas projeções.
- O `GET /ranking` antigo (post-service e user-service) continua servindo
  **apenas** à vitrine de perfis da página inicial (`Hero`); os rankings da
  fonte são os da T21.
- Testes: `test/ranking-domain.test.js`, `test/rankings-routes.test.js`,
  `test/engagement-e2e.test.js` (no `test:e2e`) e `src/lib/app/ranking.test.mjs`.

## Perfil de atuação territorial ("Meu sinal")

- Identidade visual "Sinal do bairro", "O que muda na experiência", item 4: o
  perfil mostra histórico de participação, conexões e resultados, não métricas
  sociais. `ProfileView` serve ao perfil público (SSR, `ProfileClient` passa os
  dados iniciais) e ao `/perfil` (logado): identificação (nome, categoria e
  subperfil, selo institucional, bairro/cidade, territórios de atuação,
  "participante desde"), resumo da atuação, demandas com status e bairro
  (resultado e prestação de contas marcados), sinais registrados (posts que não
  são vitrine de demanda), apoios recebidos e realizados, `ImpactBadges` e, só
  para o titular, vínculos de colaboração (conexões aceitas/concluídas, lista
  textual) e atalhos para Minhas demandas, Meus apoios, inscrições e
  privacidade. "Solicitar conexão" e a denúncia continuam no perfil de outra
  conta.
- Saíram da interface: recados, depoimentos, grade de avatares de contatos e
  de comunidades, capa, frase de status e o contador `friendCount`. As tabelas
  e rotas `scraps`/`testimonials` do user-service continuam (a LGPD as usa); o
  cliente não as chama mais (`language.test.mjs` impede a volta).
- Rota pública somente leitura `GET /profiles/:userId/activity` no
  post-service (`src/routes/profiles.js`, montada em `/` antes das rotas de
  posts): demandas do autor da publicação em diante (fora `arquivada`, sem
  endereço fino), totais de apoio recebido nessas demandas e apoios realizados
  **só** com `display_consent` (valor só com `amount_public`). Três leituras
  por índice, limite de 50 por lista (`demandsTruncated`,
  `supportsGivenTruncated`). Espelho e funções puras em `src/lib/app/profile.ts`
  (`profile.test.mjs`), `api.profileActivity` e `getPublicProfileActivity`.
  Teste: `services/post-service/test/profiles-routes.test.js`.

## Denúncia de conteúdo e de perfil (T6.3)

- Fonte: Apresentação Institucional, slide 26 (Governança: LGPD, neutralidade
  político-partidária e publicação apenas de dados verificáveis). Até aqui a
  fila de moderação do dm-gestao lia `gestao_db.reports`, tabela que nenhum
  serviço do portal escrevia: ficava sempre vazia. A denúncia passa a nascer
  aqui.
- Migração post 018 (`018-content-reports.sql`): `content_reports` — alvo
  (`publicacao`, `comentario`, `demanda`, `perfil` + `target_id`, sem FK: a
  denúncia é registro de moderação e sobrevive ao alvo), retrato do alvo
  (`target_owner_id`, `target_summary`) gravado no momento, quem denunciou
  (`reporter_id`, categoria e perfil), motivo (`conteudo_improprio`,
  `informacao_falsa`, `spam`, `discurso_de_odio`, `dado_pessoal_indevido`,
  `outro` — este exige descrição), `description` opcional (2000), e o desfecho
  que só o dm-gestao grava: `status` (`pendente` → `em_analise` →
  `procedente` | `improcedente`), `resolution` (`ocultar_publicacao`,
  `advertencia_ao_autor`, `outra_providencia`, `conteudo_mantido`),
  `resolution_note`, `resolved_by` (`gestao:<id>`) e `resolved_at`.
- Append-only: o trigger `content_reports_guard` recusa DELETE, TRUNCATE, o
  INSERT da sessão `gestao_app`, qualquer mudança em quem denunciou/alvo/
  motivo/descrição e a volta para `pendente`; o desfecho é final e completo
  (CHECKs `content_reports_resolution`, `_resolution_kind`, `_hide_target`,
  `_other_reason`, `_not_self`). Uma denúncia em aberto por (denunciante,
  alvo): índice único parcial `idx_content_reports_open`.
- Rotas (`src/routes/reports.js`, montada em `/` antes das rotas de posts;
  domínio em `src/report/`): `POST /reports` (201 com `state` e `notice`),
  `GET /reports/mine` e `GET /reports/context?targetKind=&targetId=`. Todas
  exigem token. Erros: 422 `validation_failed` com `fields`, 404 alvo
  inexistente ou já oculto, 409 `report_already_open`, 429
  `report_rate_limited` com `retryAfterSeconds` (5/hora e 20/dia por conta,
  conferidos numa consulta agregada antes de gravar).
- Sem exposição: nenhuma rota lista denúncias por alvo, o denunciado não é
  avisado, nada entra em `demand_events` e quem denunciou recebe só
  `em_apuracao`/`analisada` — nunca `procedente`/`improcedente`. Ninguém
  denuncia o próprio conteúdo nem o próprio perfil.
- Frontend: `src/lib/app/report.ts` (espelho de `report/constants.js`,
  comparado em `report.test.mjs`), bloco "DENÚNCIA DE CONTEÚDO E DE PERFIL
  (T6.3)" em `api.ts` e `ReportButton` (`src/components/app/ReportButton.tsx`):
  botão "Denunciar" com modal `role="dialog"`/`aria-modal`, motivo em
  `radio` com ajuda, descrição (obrigatória em "Outro"), confirmação e um
  aviso final que não revela resultado. Montado na publicação e em cada
  comentário (`PostDetailClient`), na demanda (`PublicDemandView`) e no perfil
  de outra conta (`ProfileView`); some sem sessão e no próprio conteúdo.
- Contrato com o dm-gestao: grant dm-infra
  `017-gestao-app-post-reports.sql` (SELECT + UPDATE só das colunas do
  desfecho); o `gestao_db.reports` fica como legado, sem migração de dados.
  LGPD: na gestão o denunciante aparece pseudonimizado e a revelação é
  auditada e de admin+. Detalhes em
  `dm-docs/gestao/04-modelagem-de-dados.md` §3.14.
- Testes: `test/report-domain.test.js`, `test/reports-routes.test.js`,
  `test/report-e2e.test.js` (no `test:e2e`) e `src/lib/app/report.test.mjs`.

## Área de governo e gestão pública (T22)

- Fonte: Apresentação Institucional, slide 24 ("Área de governo e gestão
  pública": monitoramento em tempo real, respostas oficiais, priorização de
  áreas, divulgação de ações, medição de impacto) e Fluxo do Poder Público,
  slide 14 (os 10 indicadores: demandas recebidas, por território, por
  categoria, urgentes, encaminhadas, em execução, concluídas, projetos
  apoiados, beneficiários alcançados e resultados registrados). Amplia a área
  `/governo` da T13/T14.
- **Sem tabela de agregação.** "Monitoramento em tempo real" aqui é consulta a
  cada abertura, com **cache curto no processo** (`src/government/cache.js`,
  60 s por órgão × visão × recorte; `DM_GOVERNMENT_CACHE_TTL_MS` ajusta, 0
  desliga) e os **índices** da migração post 019. Cada visão faz **uma**
  consulta agregada (CTE `base` + `count(*) FILTER`), nunca uma por indicador.
  O padrão materializado da T21 (`ranking_snapshots`) continua valendo só para
  os rankings públicos, que agregam a plataforma inteira. O recorte relativo é
  arredondado para o minuto seguinte, para o cache acertar sem perder o que
  acabou de ser publicado.
- Migração post 019 (`019-government-indicators.sql`): `government_actions`
  (divulgação de ações — órgão, retrato institucional, `post_id` da publicação
  no feed, `demand_id` e `response_id` opcionais, tipo `government_action_kind`
  ∈ ação/programa/serviço/obra/evento público/edital, título, resumo, programa
  com URL https, território/município/UF, início e término) com os gatilhos
  `government_actions_guard` (nunca o post-vitrine da demanda; só demanda
  publicada; órgão, publicação, demanda e data imutáveis; nada é excluído;
  `gestao_app` só lê) e `government_actions_record_event`
  (`acao_institucional_divulgada`, público, na linha do tempo da demanda). E os
  índices do painel: `idx_demands_indicators_place_published`,
  `idx_demands_indicators_published`, `idx_institutional_tracks_org_received`,
  `idx_institutional_responses_org_created` e `_demand_org`,
  `idx_institutional_offers_org_created`, `idx_forwardings_origin_org`,
  `_demand_org` e `_destination_org`, `idx_demand_accountability_concluded` e
  `idx_demand_accountability_results_demand`.
- Recortes (`scope`): `competencia` (demandas em que o órgão já atuou — a
  competência declarada no cadastro é texto livre e não classifica demanda),
  `jurisdicao` (padrão; município/UF pela esfera, como na T13) e `todas`.
  Período: `7d`, `30d` (padrão), `90d`, `12m`, `tudo` ou `from`/`to` próprios;
  também `category`, `priority` e `territory`.
- Como cada indicador sai (o painel e o PDF mostram a frase, slide 25 — só dado
  verificável): recebidas = demandas publicadas no recorte; urgentes =
  prioridade `urgente` ou categoria `problema_urgente`; encaminhadas =
  encaminhamento do órgão ou acompanhamento em `encaminhada`/
  `encaminhada_ao_orgao_responsavel`; em execução e concluídas = status da
  demanda ou do acompanhamento do órgão; projetos apoiados = demandas com apoio
  não cancelado (T16); beneficiários alcançados = soma de
  `demand_accountability.beneficiaries_reached` das prestações concluídas
  (T18); resultados registrados = `demand_accountability_results`. As duas
  distribuições (território e categoria) vêm com total, urgentes e concluídas;
  as 5 categorias aparecem sempre, inclusive zeradas.
- Priorização de áreas: por território e por categoria, com volume, urgência e
  **tempo sem resposta institucional do próprio órgão** (`withoutResponse`,
  `oldestWaitDays`, `averageWaitDays`). A ordem vem de `rankAreas`/
  `priorityScore` (urgência × 3 + sem resposta × 2 + volume + espera/30), com
  empate desfeito pelo nome. Não há comparação nem ranking entre órgãos.
- Medição de impacto: demandas com atuação do órgão, concluídas, prestações
  concluídas, beneficiários alcançados, resultados registrados, metas
  atingidas, total executado, apoios nas demandas, e o que o próprio órgão
  registrou no período (respostas, ofertas, encaminhamentos, ações).
- Divulgação de ações: `POST /government/actions` grava, numa transação, a
  publicação no feed (`posts.type = 'message'`, o tipo do Poder Público desde a
  migração 005), a resposta institucional da T13 quando há `demandId`
  (`programa_publico_relacionado` em programa/serviço/edital — que exige o nome
  do programa —, `acao_prevista` nos demais) e o vínculo em `government_actions`.
  A ação entra no feed e, ligada a uma demanda, na linha do tempo pública dela
  por dois caminhos: a resposta institucional e o evento
  `acao_institucional_divulgada` (em `DETAILED_EVENT_TYPES` de `routes/demands.js`).
- Rotas (`src/routes/government-indicators.js`, montada em `/` antes das rotas
  de demanda e de posts; mesmo gate da T13 — 403 `not_government` /
  `institution_not_validated`, 503 sem confirmação): `GET /government/indicators`,
  `GET /government/priority-areas`, `GET /government/impact`,
  `GET /government/indicators/export?format=csv|pdf`, `GET|POST /government/actions`
  e, pública, `GET /demands/:id/government-actions`. Filtro inválido → 422
  `validation_failed` com `fields`.
- Exportação: CSV com separador `;` e BOM (Excel em português) e PDF pelo
  pdfkit com as fontes e a marca do dossiê (`src/government/pdf.js`). Os dois
  trazem só números agregados, rótulos e o nome do próprio órgão — **nenhum
  dado pessoal**, nenhum id de conta (há teste no e2e e nas rotas).
- Domínio em `services/post-service/src/government/`: `constants.js` (os 10
  indicadores, a frase de origem de cada um, recortes, períodos, tipos de ação
  e o evento), `indicators.js` (período, validação do filtro, priorização e
  CSV), `actions.js` (validação da ação e o corpo da resposta institucional),
  `cache.js`, `store.js` (as consultas) e `pdf.js`.
- Frontend: `src/lib/app/government.ts` (espelho puro, comparado em
  `government.test.mjs`) e `government-client.ts` (cliente; fica fora de
  `api.ts` porque a exportação baixa um Blob). Páginas `/governo/indicadores`
  (`GovernmentIndicators`) e `/governo/acoes` (`GovernmentActions`), ligadas no
  cabeçalho do `/governo`; ambas privadas e cobertas pelo `Disallow: /governo`
  do `robots.ts`. Os gráficos (`IndicatorCharts.tsx`) são **tabelas** com
  barras decorativas (`aria-hidden`): o mesmo número serve leitor de tela,
  teclado e impressão, e nada depende de cor.
- Testes: `test/government-domain.test.js`, `test/government-routes.test.js`,
  `test/government-e2e.test.js` (no `test:e2e`, suíte `government`) e
  `src/lib/app/government.test.mjs`.

## Inteligência artificial (T23)

- Fonte: Apresentação Institucional, slide 23 ("Inteligência artificial":
  organização automática de demandas, detecção de urgência, sugestão de
  editais, conexão com patrocinadores ideais e geração de relatórios para
  governo). Decisão 6 de `dm-docs/fonte-da-verdade/decisoes-de-implementacao.md`:
  **API do Claude**, flag desligada por padrão, e a IA **nunca bloqueia o
  fluxo** se falhar. GPT/OpenAI não é usado para isso (regra global do
  workspace: só imagem e tradução).
- **A IA só sugere.** Nada que o modelo devolve altera demanda, post, apoio,
  dossiê (T10) ou prestação de contas (T18). A sugestão vira uma linha em
  `ai_suggestions`, marcada como sugestão de IA no banco e na interface, com a
  justificativa e os **números verificáveis** ao lado; uma pessoa aceita ou
  ignora. Aceitar registra só o desfecho (`applied: false`): aplicar o valor
  continua sendo ação do Agente, pela rota da demanda.
- Ambiente (`src/ai/config.js`): `DM_AI_ENABLED` (`true` liga; **padrão
  desligado**), `ANTHROPIC_API_KEY`, `DM_AI_MODEL` (padrão `claude-opus-5`),
  `DM_AI_TIMEOUT_MS` (15 s), `DM_AI_MAX_RETRIES` (1),
  `DM_AI_MAX_CALLS_PER_HOUR` (60) e `DM_AI_MAX_CALLS_PER_USER_PER_HOUR` (10).
  Sem flag → `desligado`; com flag e sem chave → `sem_chave`. Os dois casos
  respondem **200** com `{ available: false, reason, message }`: a interface
  diz que está indisponível e **não inventa resultado**. Na infra:
  `dmconecta-infra` SSM `ai_enabled` e `anthropic_api_key`, `sync-parameters.sh`,
  `validate-config.sh`, `docker-compose.prod.yml`, `.env.example` e
  `scripts/ai.test.sh`.
- Contenção de custo e falha (`src/ai/budget.js`, no processo): teto por
  serviço e por conta numa janela deslizante, mais a contagem em
  `ai_usage_log` (que atravessa réplicas), e disjuntor de 3 falhas seguidas
  com 5 min de espera. Timeout curto e **uma** retentativa, só para erro
  transitório (timeout, 429, 5xx); 401/403 e 4xx não são repetidos.
- Migração post 022 (`022-ai-suggestions.sql`): `ai_suggestions` (tipo ∈ os 5
  do slide 23, demanda **ou** órgão, quem pediu, modelo, `prompt_fields` com
  os campos enviados ao modelo, `payload`, `rationale`, `evidence`, e o
  desfecho `sugerida` → `aceita` | `ignorada`) e `ai_usage_log`
  (**append-only**: uma linha por chamada tentada, inclusive as recusadas por
  flag, chave, limite ou disjuntor, com latência e tokens). Guardas
  `ai_suggestions_guard` (conteúdo imutável, nada excluído, revisão uma vez só,
  `gestao_app` só lê) e `ai_usage_log_guard` (sem UPDATE, sem DELETE). Grant da
  gestão: dm-infra `db/migrations/gestao/022-gestao-app-post-ai.sql`, **só
  SELECT**.
- **O que vai para o modelo** (`src/ai/redaction.js`, documentado lá e gravado
  em `prompt_fields`): título, descrição, objetivo, justificativa, perfil do
  público, beneficiários estimados, bairro/município/UF/território, execução
  física, orçamento total, recursos necessários, categoria e prioridade atuais;
  editais divulgados (dado já público) e interessados **por número de
  referência**, com categoria da conta, ofertas e a compatibilidade da T15;
  indicadores agregados do órgão. Nunca: nome, e-mail, telefone, documento,
  id de conta, endereço fino, CEP, coordenada nem URL de arquivo. Todo texto
  livre passa por `scrubText`, que apaga contato, documento e link escritos no
  meio da descrição.
- Rotas (`src/routes/ai.js`, montada na raiz antes das rotas de demanda e de
  posts): `GET /ai/status`; Agente autor — `POST /demands/:id/ai/organization`,
  `.../ai/urgency`, `.../ai/editais`, `.../ai/partners`,
  `GET /demands/:id/ai/suggestions` e
  `POST /demands/:id/ai/suggestions/:sid/review` (`aceita`|`ignorada`);
  Poder Público validado (mesmo gate da T13/T22) — `POST /government/ai/report`
  e `GET /government/ai/suggestions`. 404 para quem não é o autor da demanda.
- Editais e patrocinadores só trabalham sobre **dado real já cadastrado**:
  editais são `government_actions.kind = 'edital'` (T22) do município/UF da
  demanda, e patrocinadores são os interesses em aberto da T15. Sem base, a
  rota responde `reason: 'sem_base'` **sem chamar o modelo**. A sugestão de
  editais é identificada como **em desenvolvimento** (slide 25: funcionalidade
  em desenvolvimento aparece identificada como tal), porque a base depende de
  os órgãos cadastrarem editais.
- Frontend: espelho puro em `src/lib/app/ai.ts` (comparado em `ai.test.mjs`),
  bloco próprio em `api.ts`, aba "Sugestões de IA" no detalhe da demanda em
  Minhas demandas (`src/components/app/ai/AiSuggestionPanel.tsx`, com aceitar/
  ignorar) e "Relatório sugerido por IA" em `/governo/indicadores`
  (`GovernmentAiReport.tsx`). Todo cartão abre com o selo **"Sugestão de IA"**.
- Contrato com a gestão: `dm-docs/gestao/04-modelagem-de-dados.md` §3.18.
- Testes: `test/ai-domain.test.js`, `test/ai-routes.test.js` e
  `test/ai-e2e.test.js` (no `test:e2e`, suíte `ai`), mais
  `src/lib/app/ai.test.mjs`. O cliente do modelo é sempre um duplo:
  **nenhum teste chama a API do Claude**.

## Privacidade, consentimento e direitos do titular (T24)

- Fonte: Apresentação Institucional, slide 25 ("Conformidade com a LGPD em toda
  a coleta, uso e compartilhamento de dados territoriais"; "apenas dados
  verificáveis são publicados; funcionalidades ainda em desenvolvimento são
  identificadas como tal"). Contrato com a gestão e a regra de retenção por
  tipo de dado: `dm-docs/gestao/05-lgpd.md` §2.1 e §7.
- **Consentimento versionado** (auth migração 004, `004-consentimentos.sql`):
  `user_consents` é append-only (trigger `user_consents_guard` recusa UPDATE,
  DELETE e TRUNCATE) com documento, versão, data da versão, origem
  (`cadastro` | `nova_versao` | `reaceite`) e data do aceite; único por
  (titular, documento, versão). **Não guarda IP nem user agent** (minimização).
  As versões vigentes moram no código (`services/auth-service/src/consents.js`,
  espelhado em `src/lib/app/privacy.ts`), porque o texto mora no repositório:
  subir a versão cria aceite pendente para todo titular. A migração também cria
  `users.anonymized_at`; a conta **nunca é excluída** (é a chave estrangeira de
  toda a trilha, e a FK `RESTRICT` de `user_consents` reforça isso).
- `POST /register` exige `consents` com as duas chaves vigentes (422
  `consent_required`) e grava conta + aceites **numa única instrução** (CTE).
  `verify` e `refresh` respondem 401 `account_anonymized` em conta anonimizada.
  Rotas em `services/auth-service/src/routes/consents.js`: `GET /consents`
  (público), `GET|POST /me/consents`, `POST /me/password-check`,
  `GET /me/account-data` e `POST /me/anonymize`.
- **Solicitações do art. 18** (user migração 011, `011-lgpd-titular.sql`):
  `data_subject_requests` no `user_db` — protocolo `LGPD-AAAA-NNNNNN` com a
  **faixa 900000+ reservada ao portal** (sequência `data_subject_request_number`
  começa em 900001, para não colidir com a numeração do `gestao_db`), prazo de
  **15 dias corridos** (art. 19, II, o mesmo da gestão), canal `portal`, titular
  só pelo id (sem nome, e-mail ou telefone) e os seis tipos do art. 18. O
  trigger `data_subject_requests_guard` recusa DELETE/TRUNCATE, INSERT da
  sessão `gestao_app`, mudança de protocolo/titular/tipo/pedido/recebimento/
  prazo e escrita em solicitação encerrada; separa o que o portal escreve
  (atendimento automático, `recebida`/`em_andamento`) do que a gestão escreve
  (desfecho). `account_anonymizations` é a trilha append-only da execução (em
  contagens, sem dado pessoal) e `profiles.anonymized_at` tira o perfil das
  projeções públicas.
- **Anonimização no post_db** (post migração 020, `020-lgpd-anonimizacao.sql`):
  `anonymized_users`, append-only e só leitura para a gestão. A anonimização
  troca `posts.author_name`/`author_avatar` e `comments.author_name` pelo
  rótulo `Conta removida` e revoga os consentimentos de exibição
  (`ranking_consents.consent`, `supports.display_consent`) — escritas já
  previstas. **Nada da trilha imutável é apagado nem reescrito**: demandas,
  dossiês, evidências, prestação de contas, interesses, compartilhamentos,
  denúncias e `demand_events` ficam como estão (há teste que confere quais
  tabelas a anonimização pode tocar).
- Orquestração no **user-service** (`src/routes/privacy.js`, montada em `/`
  antes do `/:id` do perfil; domínio em `src/privacy/`): `GET /me/privacy`
  (vocabulário, regra de retenção e solicitações), `GET|POST
  /me/privacy/requests`, `GET /me/privacy/requests/:id`, `POST
  /me/privacy/requests/:id/export` e `POST /me/privacy/erasure`. Ele chama o
  auth-service (`DM_INTERNAL_AUTH_API_URL`) e o post-service
  (`DM_INTERNAL_POST_API_URL`) **com o token do próprio titular**; sem resposta
  confiável, 503 `privacy_service_unavailable` (falha fechada, nunca entrega
  pela metade em silêncio). Variáveis novas no Compose local e de produção.
- **Acesso e portabilidade** são atendidos na hora: o JSON com o que os três
  bancos guardam daquela conta vai para `privacy/exports/<userId>/<requestId>.json`
  no bucket de uploads (`storage.put`, fora da tabela `uploads`) e volta como
  **URL assinada de 5 min**; a regra de ciclo de vida `privacy-exports` do
  dm-infra apaga o objeto em 7 dias. Sem `DM_UPLOADS_BUCKET`, 503 — não há
  armazenamento falso. O arquivo não leva dado de terceiro: de uma conexão sai
  só o que o titular escreveu; comentário de outra conta não entra.
- **Eliminação**: `POST /me/privacy/erasure` exige senha (conferida no
  auth-service) e a palavra `ELIMINAR`; abre a solicitação `eliminacao` e
  executa post_db → user_db → auth_db, cada etapa idempotente, gravando a
  trilha por escopo (`conteudo`, `perfil`, `conta`). No `user_db`: perfil
  anonimizado, `partner_profiles`, recados e depoimentos escritos removidos,
  mensagem própria das conexões apagada e representante institucional
  anonimizado **só** com o cadastro `pendente` e nunca enviado.
- Rotas do post-service em `src/routes/privacy.js` (antes das de posts):
  `GET /me/privacy/data` e `POST /me/privacy/anonymize`, sempre do `req.user` —
  nenhuma aceita id de outra conta.
- Frontend: `src/lib/app/privacy.ts` (espelho puro comparado em
  `privacy.test.mjs`, que também confere o rótulo anônimo nos três serviços) e
  bloco "PRIVACIDADE E DIREITOS DO TITULAR (T24)" em `api.ts` e `types.ts`.
  Telas: `/perfil/privacidade` (`PrivacyClient`, privada, `noindex`, bloqueada
  no `robots.ts`, no menu da conta) com consentimentos, consentimentos
  opcionais, direitos, solicitações e a tabela de retenção; `ConsentBanner` no
  `AppShell` para versão nova; caixa de aceite no `/register` (o cadastro não
  segue sem ela). Páginas públicas: `/privacidade` (lista real do que é
  coletado, **derivada do schema**, com a tabela de origem de cada bloco),
  `/termos-de-uso` (v1.0) e `/politica-de-privacidade` (v1.1), as três no
  `sitemap.ts`.
- `src/components/app/InDevelopment.tsx` é o aviso padrão de funcionalidade em
  desenvolvimento (slide 25). Hoje identifica: pagamento na plataforma
  (o apoio financeiro é valor declarado), recuperação de senha por e-mail e os
  recursos de IA previstos.
- Grants dm-infra: `019-gestao-app-user-lgpd.sql` (SELECT em
  `data_subject_requests` e `account_anonymizations`; UPDATE só das colunas do
  desfecho) e `020-gestao-app-post-lgpd.sql` (SELECT em `anonymized_users`),
  condicionais e cobertos por `scripts/gestao-pipeline.test.sh`.
- Testes: `services/auth-service/test/consents.test.js`,
  `services/user-service/test/privacy.test.js`,
  `services/post-service/test/privacy-routes.test.js`,
  `services/post-service/test/privacy-e2e.test.js` (suíte `privacy` do
  `test:e2e`) e `src/lib/app/privacy.test.mjs`.

## Eventos do território e inscrições (T25)

- Fonte: Apresentação, slide 9 (Membros da Comunidade "Inscrever-se em
  eventos", "Oferecer voluntariado"), slide 18 (conteúdos do território:
  eventos, oficinas culturais, mutirões, ações ambientais, aulas esportivas),
  slide 19 (o mapa mostra demandas **e** conteúdos) e slide 20 ("Financiar
  eventos"). Decisão 5: **nada de pagamento na plataforma** — evento pago
  declara o valor e cobra fora.
- Migração post 021 (`021-events.sql`): `events` (organizador Agente ou Poder
  Público, `demand_id` opcional e sempre do próprio organizador, tipo, título,
  descrição, início e fim, local com **CEP** e coordenada, território, público,
  vagas opcionais com fila de espera, gratuito/pago com valor declarado,
  acessibilidade em 8 recursos, foto por link `https`, estado `rascunho` →
  `publicado` → `cancelado` e contadores), `event_signups` (uma inscrição em
  aberto por conta × evento, `inscrito`/`lista_de_espera`/`cancelado`, posição
  na fila, observação e presença), `posts.event_id`/`posts.event_starts_at`
  (post-vitrine `type = 'event'`, que leva **a data** para a camada de
  conteúdos do mapa) e `demand_interests.event_id` (voluntariado e participação
  da T15 ligados a um evento da mesma demanda).
- Triggers: `events_guard` (gestão só lê; nada é excluído; organizador, demanda
  e categoria imutáveis; `events_assert_publishable` exige o mínimo na
  publicação e em toda edição de evento publicado; vagas nunca abaixo dos
  inscritos), `events_sync_showcase` (`SECURITY DEFINER`: cria e mantém o
  post-vitrine, oculta no cancelamento e grava `evento_publicado`,
  `evento_atualizado` e `evento_cancelado` em `demand_events`, públicos, com
  `payload.public`), `posts_event_showcase_guard`, `event_signups_guard` (só
  evento publicado e não encerrado, nunca do organizador; vaga → `inscrito`,
  sem vaga → fila quando habilitada, senão recusa; presença só do início em
  diante) e `event_signups_after` (contadores e **promoção do primeiro da
  fila** quando um inscrito cancela, com renumeração).
- Domínio em `services/post-service/src/event/` (`constants.js` — vocabulário,
  `ORGANIZER_ROLES = ['agent','government']`, `SIGNUP_ROLES = ['member']` e o
  aviso `EMAIL_NOTIFICATIONS`; `validation.js` — rascunho x publicação;
  `store.js` — projeções e tradução dos erros do banco).
- Rotas (`src/routes/events.js`, montada em `/events`; público em
  `/api/posts/events`): públicas `GET /` (agenda com `kind`, `territory`,
  `municipality`, `district`, `uf`, `demandId`, `pricing`, `accessibility`,
  `from`/`to`, `q`, `when=proximos|passados|todos`, `status`, `limit` ≤ 50 e
  keyset por `starts_at, id`), `GET /territories`, `GET /reference`,
  `GET /:id` e `GET /:id/signups/summary` (só contagens); com token
  `GET /signups/mine`, `GET /:id/signups/mine`, `POST /:id/signups` e
  `POST /:id/signups/cancel`; organizador `GET /mine`, `GET /mine/:id`,
  `POST /`, `PUT /:id`, `POST /:id/publish`, `POST /:id/cancel`,
  `GET /mine/:id/signups` e `PUT /mine/:id/signups/:sid/attendance`.
  Poder Público passa pelo gate de instituição validada para criar, editar e
  publicar.
- LGPD: o público vê contagens, nunca a lista. A lista de presença do
  organizador traz **só** nome público, categoria da conta, subperfil, estado,
  posição na fila, observação e presença — sem avatar, sem contato e sem id de
  conta (o id usado para marcar presença é o da inscrição).
- **Confirmação por e-mail não existe**: não há serviço de envio. A API devolve
  `emailNotifications` com `state: "em_desenvolvimento"` e a interface mostra
  `InDevelopment` (governança, slide 26). Não invente provedor de e-mail.
- Frontend: `src/lib/app/event.ts` (espelho comparado em `event.test.mjs`),
  bloco "EVENTOS E INSCRIÇÕES (T25)" em `api.ts`, `getPublicEvent(s)` e
  `getPublicEventTerritories` em `src/lib/server/public-data.ts`,
  `eventJsonLd` (schema.org/Event) em `src/lib/seo/structured-data.ts`.
  Páginas: `/eventos` (agenda SSR indexável, filtros por formulário GET e lista
  por território) e `/eventos/[id]` (SSR indexável, no sitemap);
  `/meus-eventos` e `/minhas-inscricoes` (`noindex`, no `robots.ts`).
  Componentes em `src/components/app/event/` (`EventParts`, `PublicEventView`,
  `EventSignupPanel`, `MyEventsClient`, `MyEventSignupsClient`).
- Grant dm-infra `021-gestao-app-post-events.sql` (**só `SELECT`**); contrato e
  pendências em `dm-docs/gestao/04-modelagem-de-dados.md` §3.17 e
  `dm-docs/production-status.md`.
- Testes: `test/event-domain.test.js`, `test/events-routes.test.js`,
  `test/event-e2e.test.js` (suíte `event` do `test:e2e`) e
  `src/lib/app/event.test.mjs`.

## Eixos temáticos e inteligência territorial (T26)

- Fonte: Apresentação, slide 26 ("Dados e inteligência territorial como
  ativo"), com os nove eixos Iluminação, Segurança, Saneamento, Limpeza,
  Esporte, Educação, Mobilidade, Cultura e Meio Ambiente.
- Migração post 023 (`023-demand-themes.sql`): enum `demand_theme` e tabela de
  vínculo `demand_themes` (uma demanda tem zero ou mais eixos). O eixo é
  **opcional**: não está entre os obrigatórios do Fluxo 2; no envio, a ausência
  vira aviso (`warnings.themes`), nunca erro. O trigger `demand_themes_guard`
  só aceita mudança com a demanda em rascunho ou devolvida e a gestão só lê.
- Domínio: `THEMES`/`THEME_LABELS` em `src/demand/constants.js`; `themes` no
  corpo do POST/PUT da demanda substitui a lista (`store.replaceThemes`); as
  projeções do dono e públicas trazem `themes`.
- Filtro `theme` na lista pública de demandas, no mapa (`counts.theme`,
  `counts.themed`, contagem por território) e nos indicadores do Poder Público
  (priorização por eixo no JSON, CSV e PDF). A IA de organização (T23) sugere
  até três eixos (`eixos`), sempre como sugestão revisável.
- Rotas públicas (`src/routes/themes.js`, montada em `/demands`):
  `GET /themes` (vocabulário) e `GET /themes/intelligence` (eixo × território,
  uma consulta agregada, sem dado pessoal, teto de 500 linhas).
- Pendências: grant `SELECT` em `demand_themes` para `gestao_app` no dm-infra
  e a interface do portal (marcar eixos na ficha da demanda e filtro no mapa).
- Testes: `test/themes-routes.test.js`, `test/demand-validation.test.js`,
  `test/ai-domain.test.js` e `test/ai-routes.test.js`.

## Mensagens na conexão (T27)

- Fonte: Arquitetura de Perfis §3.1 ("Receber solicitações de conexão",
  "Conversar com parceiros") e Modelo de Conexão §12 (comunicação dentro do
  processo). Até a T27 a conexão só tinha a mensagem inicial do pedido e o
  desfecho; a conversa entre as partes não existia.
- Migração user 012 (`012-connection-messages.sql`): `connection_messages`
  (conexão, autor, corpo ≤ 2000, data; append-only — o trigger
  `connection_messages_guard` recusa DELETE, escrita da sessão `gestao_app` e
  qualquer UPDATE que não seja a anonimização do corpo para
  `[removido a pedido do titular]`; TRUNCATE bloqueado), `connection_message_reads`
  (última leitura por parte, para o sino) e `connections.messages_count` /
  `last_message_at` mantidos por trigger, que também sobe a conexão na lista
  (`updated_at`). A gestão só lê (grant herdado do dm-infra 003).
- Rotas (`routes/connections.js`, só as duas partes — terceiros recebem o
  mesmo 404): `GET /connections/:id/messages` (cronológica, `limit` ≤ 100,
  `before=<ISO>` pagina para trás, grava a leitura; `{ messages, hasMore, open }`)
  e `POST /connections/:id/messages` (`{ body }`; só com a conexão `pending` ou
  `accepted`, senão 409 `connection_closed`). `GET /notifications` avisa
  mensagem não lida (`kind: 'message'`, `href: /conexoes/<id>`), numa consulta.
- LGPD: a exportação leva só as mensagens escritas pelo titular; a eliminação
  troca o corpo delas pelo rótulo (a conversa fica, porque é registro da outra
  parte). Regra `conexoes` de `RETENTION_RULES` e `/privacidade` atualizadas.
- Frontend: `ConnectionMessage`/`ConnectionMessagePage` em `types.ts`,
  `api.connectionMessages`/`api.sendConnectionMessage`, `ConnectionThread`
  (`role="log"`, `aria-live`, Ctrl+Enter envia, desabilitado em estado final)
  na página `/conexoes/[id]` e contagem de mensagens no `ConnectionCard`.
- Testes: `services/user-service/test/connections.test.js` (leitura, escrita,
  404 de terceiro, 409 encerrada, 400 corpo, notificação) e
  `test/privacy.test.js` (anonimização das mensagens).

## Pautas da Comunicação e divulgação (T28)

- Fonte: Arquitetura de Perfis §3.5 (Comunicação: "Identificar pautas",
  "Compartilhar iniciativas", "Divulgar projetos e resultados", "Acompanhar
  informações públicas do território") e §6, etapa 6 (AMPLIFICAÇÃO).
- Migração post 025 (`025-media-agenda.sql`): `media_agenda_items` — a pauta
  de uma conta da Comunicação sobre uma demanda ou um evento público (retrato
  do título; ângulo ≤ 1000; estado `identificada` → `em_apuracao` →
  `publicada` | `descartada`; em `publicada`, veículo, URL https e data
  obrigatórios). Uma pauta por (conta, alvo); sem FK para o alvo. Trigger
  `media_agenda_items_guard`: `gestao_app` só lê, nada é excluído, conta e
  alvo imutáveis, `publicada` é final. `media_agenda_record_event`
  (`SECURITY DEFINER`) grava `divulgacao_registrada` (público, ator
  `comunicacao`, novo no CHECK de `demand_events`) com veículo, URL e data —
  nunca nome nem id da conta.
- Domínio em `services/post-service/src/media/` (`constants.js`,
  `validation.js`, `store.js`). Descoberta de pautas: seis consultas com
  LIMIT (urgentes dos últimos 30 dias, execução com par antes/depois,
  prestação de contas concluída, mais apoiadas, eventos dos próximos 30 dias e
  as pautas da própria conta), alvos repetidos unidos com todos os sinais.
- Rotas (`src/routes/media.js`, montada em `/` antes das de demanda; gate
  `requireMedia` → 403 `not_media`): `GET /media/agenda/discover`,
  `GET /media/agenda[?status=]`, `POST /media/agenda` (404 `target_not_found`
  se o alvo não é público; 409 `agenda_item_exists`), `PUT /media/agenda/:id`
  (422 por campo; 409 `agenda_item_closed` depois de publicada) e, pública,
  `GET /demands/:id/coverage`. `divulgacao_registrada` está em
  `DETAILED_EVENT_TYPES` de `routes/demands.js`.
- LGPD: a exportação leva `pautas`; a anonimização troca `user_name` das
  pautas pelo rótulo (a pauta fica: é registro de divulgação).
- Frontend: `src/lib/app/media.ts` (espelho comparado em `media.test.mjs`),
  permissão `agenda` em `ROLE_PERMISSIONS.media`, bloco em `api.ts` e tipos
  em `types.ts`; página `/pautas` (`noindex`, no `robots.ts` e em
  `PRIVATE_PATH_PREFIXES`; item "Pautas" no trilho e no menu da conta da
  Comunicação) com `MediaAgendaClient` (pautas sugeridas com os sinais e
  "Identificar pauta"; minhas pautas com apuração, registro da divulgação e
  descarte); seção "Divulgação" na página pública da demanda
  (`DemandCoverageSection`, SSR por `getPublicDemandCoverage`) e o evento na
  linha do tempo (`mediaTimelineLabel`/`mediaTimelineDetail`).
- Grant dm-infra `024-gestao-app-post-media.sql` (só SELECT).
- Testes: `test/media-domain.test.js`, `test/media-routes.test.js`,
  `test/privacy-routes.test.js` e `src/lib/app/media.test.mjs`.

## Potenciais parceiros e instituições para o Agente (T30)

- Fonte: Arquitetura de Perfis §6, etapa 3 ("CONEXÃO — O DM Conecta identifica
  potenciais parceiros, instituições e outros atores que podem contribuir") e
  §3.1 ("Receber solicitações de conexão", "Informar necessidades de apoio");
  Modelo de Conexão §07. A T15 mostrava a compatibilidade só do lado do
  apoiador (`/opportunities`); a T30 mostra ao Agente quem é compatível com a
  demanda dele. Sem migração.
- user-service: `GET /partner-profiles/match` (`routes/partner-profile.js`,
  token de qualquer conta; `uf`, `municipality`, `territory`, `district`,
  `category`, `resources` com vírgula, `limit` ≤ 50; 422 por campo) devolve os
  `partner_profiles` que cruzam **qualquer** critério (país inteiro, UF,
  Município/UF, território/bairro, categoria, recursos), juntando a
  identificação pública do perfil (nome, avatar, categoria, subperfil,
  cidade/UF), sem anonimizados e sem o solicitante — nunca contato.
  `matchQuery` é exportada e testada.
- post-service: `partnerProfile.match(req, criteria)` em
  `src/interest/user-service.js` (503 `partner_profile_unavailable` em falha);
  rota do Agente autor `GET /demands/mine/:id/potential-partners`
  (`routes/interests.js`): com a demanda em `POTENTIAL_PARTNERS_STATUSES`
  (os mesmos de interesse aberto), monta os critérios da demanda (UF,
  município, território, bairro, categoria e recursos necessários), chama o
  user-service, calcula `computeCompatibility` para cada candidato, descarta
  pontuação 0, marca `alreadyInterested` (interesse em aberto na demanda),
  ordena pela pontuação e devolve até 50; antes da publicação,
  `{ available: false, reason: 'demanda_nao_publicada' }`.
- Frontend: `PotentialPartner`/`PotentialPartnersResponse` em `types.ts`,
  `api.potentialPartners`, `POTENTIAL_PARTNERS_*` em `interest.ts`;
  `PotentialPartnersPanel` (compatibilidade com os motivos, "Solicitar
  conexão" com tipo e mensagem → `api.createConnection` com `demandId` e
  `postId`) na aba "Interessados e conexões" de Minhas demandas.
- Testes: `services/user-service/test/partner-profile.test.js`,
  `services/post-service/test/interests-routes.test.js` e
  `src/lib/app/interest.test.mjs`.

## Vínculo de usuários a organizações e permissões delegadas (T29)

- Fonte: Arquitetura de Perfis §4 ("Membros da Comunidade não publicam
  demandas ou projetos em nome de uma organização sem vínculo/autorização.
  No futuro, o sistema pode permitir vínculo de usuários a organizações com
  diferentes níveis de permissão") e §5 ("usuários individuais poderão estar
  vinculados a organizações e receber permissões delegadas"); Modelo de
  Conexão §32 (vários usuários por instituição). O vínculo existe desde já.
- Migração user 013 (`013-organization-members.sql`): `organization_members`
  (instituição com cadastro institucional × conta; `level` `gestor` |
  `publicador` | `colaborador`; `status` `convidado` → `ativo` | `recusado`,
  `ativo` → `removido` | `saiu`; quem convidou e datas). Um vínculo `ativo`
  por conta e um convite em aberto por par (índices parciais). Trigger
  `organization_members_guard`: nasce como convite, só instituição com
  `institution_kind`, transições fixas, identidade imutável, nível só em
  convite/ativo, `gestao_app` só lê, nada é excluído.
- Domínio `services/user-service/src/organization-members.js` (espelho em
  `src/lib/app/organization.ts`, comparado em `organization.test.mjs`):
  `gestor` = gerir vínculos + tudo do publicador; `publicador` = publicar
  demandas e eventos, atuar institucionalmente, atualizar resultados, ver
  documentos; `colaborador` = ver documentos.
- Rotas (`routes/organization-members.js`): titular do cadastro ou gestor —
  `GET /me/organization/members`, `GET .../candidates?q=` (contas sem
  cadastro próprio nem vínculo ativo, sem anonimizadas), `POST` (`{ userId,
  level }`; 409 `member_has_own_institution` / `member_already_linked` /
  `member_invite_exists` / `member_is_self`), `PUT /:id` (`{ level }`),
  `POST /:id/remove`; a própria conta — `GET /me/memberships`,
  `POST /me/memberships/:id/accept | decline | leave`. 403
  `not_organization_manager` para quem não administra instituição.
- **Delegação**: `GET /me/institution/status` devolve, para conta sem
  cadastro próprio com vínculo ativo, `kind`/`status`/`organizationId`/
  `canActInstitutionally` da instituição vinculada e `delegation: { memberId,
  level, permissions, organizationName }` (senão `delegation: null`).
  `GET /:userId/institution` (projeção pública) resolve também pelo vínculo
  ativo de gestor/publicador, então o selo do perfil e o órgão do
  post-service (T13) valem para quem atua por delegação. Sino:
  `kind: 'membership'` para convite em aberto (`href: /vinculos`).
- post-service (`src/delegation.js`): `effectiveRole(user, access)` — conta
  com `publicar_demandas` numa instituição `agente_transformacao` age como
  Agente; com `atuar_institucionalmente` num `poder_publico`, como Poder
  Público. `requireEffectiveRole(lookup, roles, denied)` aceita o papel
  próprio sem consulta e o delegado depois do lookup (503 se falhar).
  `demand/gate.js` (`evaluateDemandAuthor`, `requireValidatedAgent`,
  `requireDemandAuthorRole`), `institutional/gate.js`
  (`evaluateGovernmentActor`, `requireGovernmentActor`), `institution-gate.js`
  (`requireValidatedGovernment` lê `req.effectiveRole`), as rotas de demanda,
  execução, prestação de contas, interesses, IA e eventos (organizador
  delegado com `publicar_eventos`) passam pela delegação; a instituição
  emprestada precisa estar validada, como sempre. Os posts do feed
  (`routes/posts.js`) continuam pela categoria da conta.
- LGPD: exportação leva `vinculosInstitucionais`; a eliminação encerra o
  vínculo ativo (`saiu`) e recusa convites; regra `vinculos` em
  `RETENTION_RULES` e `/privacidade`.
- Frontend: `InstitutionAccess.delegation`, tipos `OrganizationMember`,
  `Membership` etc. em `types.ts`; bloco "VÍNCULO A ORGANIZAÇÕES (T29)" em
  `api.ts`; `useInstitutionAccess` vale para toda conta logada e
  `useEffectiveRole()` dá o papel efetivo (`resolving` enquanto a delegação
  não foi lida) — usado no `AppShell` (atalhos de Agente/Poder Público),
  Minhas demandas, assistente da demanda, área institucional, análise da
  demanda, indicadores e ações do governo. `InstitutionBanner` mostra "Você
  atua em nome de …" em vez de pedir cadastro. Páginas `/vinculos`
  (`MembershipsClient`: convites, vínculo ativo com as permissões em texto,
  sair) e `/cadastro-institucional/equipe` (`TeamClient`: níveis, busca e
  convite, mudar nível, remover, histórico); menu da conta com "Meus
  vínculos" (todos) e "Equipe da instituição" (titular ou gestor);
  `robots.ts` e `PRIVATE_PATH_PREFIXES` com `/vinculos`.
- Testes: `services/user-service/test/organization-members.test.js`,
  `institutions-routes.test.js`, `privacy.test.js`;
  `services/post-service/test/demand-gate.test.js`,
  `institutional-domain.test.js`; `src/lib/app/organization.test.mjs`.

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
  O dm-web não aprova nada: validação e aprovação ficam no dm-gestao.
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

- Todo trabalho é commitado direto em `develop` (homologação). Produção é
  `master`, atualizado a partir de `develop` (`git push origin develop:master`).
  Não criar outras branches nem worktrees.
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
