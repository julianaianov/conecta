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

const createApp = ({
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  secret = resolveJwtSecret(process.env),
  operationUserIds = parseOperationUserIds(process.env),
  institutionStatus = createInstitutionStatusClient(),
  // Bucket de uploads (T08); `null` sem DM_UPLOADS_BUCKET → rotas de upload em 503.
  uploadStorage = createUploadStorage(uploadsConfig(process.env) ?? {}),
} = {}) => {
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
  app.use('/demands', demandsRoutes({ pool, auth, validatedAgent, uploadStorage }));
  app.use('/', postsRoutes(pool, auth, operation, institutional));

  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3003;
  createApp().listen(port, () => console.log(`[post-service] listening on ${port}`));
}

module.exports = { createApp };
