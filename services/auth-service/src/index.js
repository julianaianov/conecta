const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const authRoutes = require('./routes/auth');
const consentsRoutes = require('./routes/consents');
const { resolveJwtSecret, createAuth } = require('./security');

const createApp = ({
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  secret = resolveJwtSecret(process.env),
} = {}) => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));
  // Consentimento versionado e direitos do titular sobre a conta (T24):
  // /consents, /me/consents, /me/account-data, /me/anonymize. Antes das rotas
  // de sessão, que não têm `/:id`.
  app.use('/', consentsRoutes(pool, { auth: createAuth(secret) }));
  app.use('/', authRoutes(pool, { secret }));

  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3001;
  createApp().listen(port, () => console.log(`[auth-service] listening on ${port}`));
}

module.exports = { createApp };
