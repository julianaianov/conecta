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

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'post-service' }));
  // Antes das rotas de posts, cujo `/:id` só aceita UUID. Público: /api/posts/demands.
  app.use('/uploads', createUploadRoutes({
    pool, auth, storage: uploadStorage, policy: createPostUploadPolicy(), operationUserIds,
  }));
  if (dossiers) app.use('/demands', dossierRoutes({ pool, auth, dossiers, operationUserIds }));
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
