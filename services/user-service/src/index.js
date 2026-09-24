const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const usersRoutes = require('./routes/users');
const communitiesRoutes = require('./routes/communities');
const connectionsRoutes = require('./routes/connections');
const socialRoutes = require('./routes/social');
const institutionsRoutes = require('./routes/institutions');
const partnerProfileRoutes = require('./routes/partner-profile');
const privacyRoutes = require('./routes/privacy');
const organizationMembersRoutes = require('./routes/organization-members');
const { requireInstitutionalAccess } = institutionsRoutes;
const {
  resolveJwtSecret, createAuth, parseOperationUserIds, requireOperation,
} = require('./security');
const { uploadsConfig, createUploadStorage, createUploadRoutes } = require('./uploads');
const { createUserUploadPolicy } = require('./upload-policy');

const createApp = ({
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  secret = resolveJwtSecret(process.env),
  operationUserIds = parseOperationUserIds(process.env),
  // Bucket de uploads (T08); `null` sem DM_UPLOADS_BUCKET → rotas de upload em 503.
  uploadStorage = createUploadStorage(uploadsConfig(process.env) ?? {}),
} = {}) => {
  const app = express();
  const auth = createAuth(secret);
  const operation = requireOperation(operationUserIds);

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'user-service' }));
  // Antes das rotas com `/:id` do perfil. Público: /api/users/uploads.
  app.use('/uploads', createUploadRoutes({
    pool, auth, storage: uploadStorage, policy: createUserUploadPolicy(), operationUserIds,
  }));
  app.use('/communities', communitiesRoutes(pool));
  app.use('/connections', connectionsRoutes(pool, auth, requireInstitutionalAccess(pool)));
  app.use('/', institutionsRoutes(pool, auth, uploadStorage));
  // Vínculo de usuários a organizações e permissões delegadas (T29):
  // /me/organization/members* e /me/memberships*. Antes das rotas com `/:id`.
  app.use('/', organizationMembersRoutes(pool, auth));
  // Perfil de apoio (T15), antes das rotas com `/:id` do perfil.
  app.use('/', partnerProfileRoutes(pool, auth));
  // Direitos do titular (T24): /me/privacy e as solicitações do art. 18.
  // Antes das rotas com `/:id` do perfil.
  app.use('/', privacyRoutes({ pool, auth, storage: uploadStorage }));
  app.use('/', socialRoutes(pool, auth, operation));
  app.use('/', usersRoutes(pool, auth));

  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3002;
  createApp().listen(port, () => console.log(`[user-service] listening on ${port}`));
}

module.exports = { createApp };
