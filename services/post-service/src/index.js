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
const { requireGovernmentActor } = require('./institutional/gate');
const { createGovernmentProfileClient } = require('./institutional/store');
const { createGovernmentDirectoryClient } = require('./institutional/directory');
const interestsRoutes = require('./routes/interests');
const supportsRoutes = require('./routes/supports');
const executionRoutes = require('./routes/execution');
const accountabilityRoutes = require('./routes/accountability');
const { createPartnerProfileClient, createConnectionsClient } = require('./interest/user-service');

/** Endereço público do portal (URL de verificação impressa no dossiê). */
const siteUrl = (env) => (typeof env.DM_PUBLIC_SITE_URL === 'string' && env.DM_PUBLIC_SITE_URL.trim()
  ? env.DM_PUBLIC_SITE_URL.trim()
  : 'https://dmconecta.org');

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
  app.use('/demands', demandsRoutes({ pool, auth, validatedAgent, uploadStorage, dossiers }));
  app.use('/', postsRoutes(pool, auth, operation, institutional));

  app.locals.dossiers = dossiers;
  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3003;
  const app = createApp();
  // Laço de geração e retentativa do dossiê (DM_DOSSIER_INTERVAL_MS; 0 desliga).
  const interval = Number(process.env.DM_DOSSIER_INTERVAL_MS ?? 60_000);
  app.locals.dossiers?.start(Number.isFinite(interval) ? interval : 60_000);
  app.listen(port, () => console.log(`[post-service] listening on ${port}`));
}

module.exports = { createApp };
