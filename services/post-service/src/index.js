const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const postsRoutes = require('./routes/posts');
const demandsRoutes = require('./routes/demands');
const { requireValidatedAgent } = require('./demand/gate');
const { createInstitutionStatusClient, requireValidatedGovernment } = require('./institution-gate');
const {
  resolveJwtSecret, createAuth, parseOperationUserIds, requireOperation,
} = require('./security');
const { uploadsConfig, createUploadStorage, createUploadRoutes } = require('./uploads');
const { createPostUploadPolicy } = require('./upload-policy');
const dossierRoutes = require('./routes/dossiers');
const { createDossierService } = require('./dossier/service');
const { createPublicInstitutionClient } = require('./dossier/institution');
const institutionalRoutes = require('./routes/institutional');
const governmentRoutes = require('./routes/government-indicators');
const { createIndicatorCache } = require('./government/cache');
const { requireGovernmentActor } = require('./institutional/gate');
const { createGovernmentProfileClient } = require('./institutional/store');
const { createGovernmentDirectoryClient } = require('./institutional/directory');
const interestsRoutes = require('./routes/interests');
const supportsRoutes = require('./routes/supports');
const executionRoutes = require('./routes/execution');
const accountabilityRoutes = require('./routes/accountability');
const mapRoutes = require('./routes/map');
const themeRoutes = require('./routes/themes');
const rankingsRoutes = require('./routes/rankings');
const reportsRoutes = require('./routes/reports');
const privacyRoutes = require('./routes/privacy');
const profilesRoutes = require('./routes/profiles');
const eventsRoutes = require('./routes/events');
const aiRoutes = require('./routes/ai');
const mediaRoutes = require('./routes/media');
const { createAiService } = require('./ai/service');
const { createRankingService } = require('./ranking/service');
const { createPartnerProfileClient, createConnectionsClient } = require('./interest/user-service');

/** Endereço público do portal (URL de verificação impressa no dossiê). */
const siteUrl = (env) => (typeof env.DM_PUBLIC_SITE_URL === 'string' && env.DM_PUBLIC_SITE_URL.trim()
  ? env.DM_PUBLIC_SITE_URL.trim()
  : 'https://dmconecta.org');

/** TTL do cache do painel do governo pelo ambiente; sem a variável, o padrão. */
const governmentCacheOptions = (env) => {
  const raw = typeof env.DM_GOVERNMENT_CACHE_TTL_MS === 'string' ? env.DM_GOVERNMENT_CACHE_TTL_MS.trim() : '';
  const ttlMs = Number(raw);
  return raw !== '' && Number.isFinite(ttlMs) ? { ttlMs } : {};
};

const createApp = ({
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  secret = resolveJwtSecret(process.env),
  operationUserIds = parseOperationUserIds(process.env),
  institutionStatus = createInstitutionStatusClient(),
  // Bucket de uploads (T08); `null` sem DM_UPLOADS_BUCKET → rotas de upload em 503.
  uploadStorage = createUploadStorage(uploadsConfig(process.env) ?? {}),
  // Dossiê da Demanda (T10). `null` desliga (rotas ausentes, envio sem dossiê).
  dossierService,
  // Identificação pública do órgão do Poder Público (T13), pelo user-service.
  governmentProfile = createGovernmentProfileClient({ fetchInstitution: createPublicInstitutionClient() }),
  // Diretório dos órgãos validados (T14, destino dos encaminhamentos), pelo user-service.
  governmentDirectory = createGovernmentDirectoryClient(),
  // Perfil de apoio e conexões do user-service (T15), com o token do usuário.
  partnerProfile = createPartnerProfileClient(),
  connections = createConnectionsClient(),
  // Recálculo dos rankings e selos (T21). `null` desliga (as tabelas
  // materializadas ficam como estão).
  rankings,
  // Cache curto do painel do Poder Público (T22). `DM_GOVERNMENT_CACHE_TTL_MS`
  // ajusta o TTL (padrão 60 s); 0 desliga o cache (usado no e2e).
  governmentCache = createIndicatorCache(governmentCacheOptions(process.env)),
  // Inteligência artificial (T23). Flag `DM_AI_ENABLED` desligada por padrão e
  // `ANTHROPIC_API_KEY` ausente deixam o recurso indisponível (a rota diz o
  // motivo); nenhuma falha de IA interrompe o fluxo. Nos testes entra um
  // cliente de modelo duplo: nada chama a API de verdade.
  ai = createAiService({ pool }),
} = {}) => {
  const dossiers = dossierService === undefined
    ? createDossierService({
      pool,
      storage: uploadStorage,
      fetchInstitution: createPublicInstitutionClient(),
      siteUrl: siteUrl(process.env),
    })
    : dossierService;
  const app = express();
  const auth = createAuth(secret);
  const operation = requireOperation(operationUserIds);
  const institutional = requireValidatedGovernment(institutionStatus);
  const validatedAgent = requireValidatedAgent(institutionStatus);
  const governmentActor = requireGovernmentActor(institutionStatus);

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'post-service' }));
  // Antes das rotas de posts, cujo `/:id` só aceita UUID. Público: /api/posts/demands.
  app.use('/uploads', createUploadRoutes({
    pool, auth, storage: uploadStorage, policy: createPostUploadPolicy(), operationUserIds,
  }));
  // Atuação institucional do Poder Público (T13) e encaminhamentos (T14):
  // /institutional/* e /demands/:id/institutional.
  app.use('/', institutionalRoutes({ pool, auth, governmentActor, governmentProfile, governmentDirectory }));
  // Área de governo e gestão pública (T22): /government/indicators,
  // /government/priority-areas, /government/impact, a exportação CSV/PDF e a
  // divulgação de ações. Antes das rotas de demanda e de posts.
  app.use('/', governmentRoutes({ pool, auth, governmentActor, governmentProfile, cache: governmentCache }));
  if (dossiers) app.use('/demands', dossierRoutes({ pool, auth, dossiers, operationUserIds }));
  // Interesse, conexão e oportunidades de apoio (T15): antes do `/:id` da demanda.
  app.use('/demands', interestsRoutes({
    pool, auth, validatedAgent, governmentGate: institutional, institutionStatus, partnerProfile, connections,
  }));
  // Registro de apoio realizado, dupla confirmação e histórico de apoio (T16).
  app.use('/demands', supportsRoutes({ pool, auth, governmentGate: institutional, institutionStatus }));
  // Execução, evidências do antes/depois e acompanhamento (T17).
  app.use('/demands', executionRoutes({ pool, auth, validatedAgent }));
  // Prestação de contas e prestação de resultados (T18).
  app.use('/demands', accountabilityRoutes({ pool, auth, validatedAgent, dossiers }));
  // Mapa inteligente (T20): /demands/map, /demands/map/territories e /demands/map/legend.
  app.use('/demands', mapRoutes({ pool }));
  // Eixos temáticos e inteligência territorial (T26): antes das rotas da
  // demanda, porque `/demands/themes*` não é um id.
  app.use('/demands', themeRoutes({ pool }));
  // Engajamento, rankings e selos de impacto social (T21): /rankings, /shares
  // e /profiles/:userId/impact. Antes das rotas de posts, cujo `/:id` é UUID.
  app.use('/', rankingsRoutes({ pool, auth }));
  // Denúncia de publicação, comentário, demanda e perfil (T6.3): /reports.
  // Antes das rotas de posts, cujo `/:id` é UUID.
  app.use('/', reportsRoutes({ pool, auth }));
  // Direitos do titular sobre o post_db (T24): /me/privacy/data e
  // /me/privacy/anonymize. Antes das rotas de posts, cujo `/:id` é UUID.
  app.use('/', privacyRoutes({ pool, auth }));
  // Atuação territorial pública do perfil: /profiles/:userId/activity
  // (somente leitura). Antes das rotas de posts, cujo `/:id` é UUID.
  app.use('/', profilesRoutes({ pool }));
  // Eventos do território e inscrição da comunidade (T25): /events.
  app.use('/events', eventsRoutes({ pool, auth, institutionStatus, governmentGate: institutional }));
  // Sugestões de inteligência artificial (T23): /ai/status, /demands/:id/ai/*
  // e /government/ai/*. Sempre sugestão revisável; nunca altera dado sozinha.
  app.use('/', aiRoutes({ pool, auth, ai, governmentActor, governmentProfile }));
  // Pautas da Comunicação e divulgação registrada (T28): /media/agenda* e a
  // cobertura pública /demands/:id/coverage. Antes das rotas de demanda.
  app.use('/', mediaRoutes({ pool, auth }));
  app.use('/demands', demandsRoutes({ pool, auth, validatedAgent, uploadStorage, dossiers }));
  app.use('/', postsRoutes(pool, auth, operation, institutional));

  app.locals.ai = ai;
  app.locals.dossiers = dossiers;
  app.locals.rankings = rankings === undefined ? createRankingService({ pool }) : rankings;
  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3003;
  const app = createApp();
  // Laço de geração e retentativa do dossiê (DM_DOSSIER_INTERVAL_MS; 0 desliga).
  const interval = Number(process.env.DM_DOSSIER_INTERVAL_MS ?? 60_000);
  app.locals.dossiers?.start(Number.isFinite(interval) ? interval : 60_000);
  // Laço de recálculo dos rankings e selos (DM_RANKING_INTERVAL_MS; 0 desliga).
  const rankingInterval = Number(process.env.DM_RANKING_INTERVAL_MS ?? 300_000);
  app.locals.rankings?.start(Number.isFinite(rankingInterval) ? rankingInterval : 300_000);
  app.listen(port, () => console.log(`[post-service] listening on ${port}`));
}

module.exports = { createApp };
