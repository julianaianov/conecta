const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const authRoutes = require('./routes/auth');
const { resolveJwtSecret } = require('./security');

const createApp = ({
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  secret = resolveJwtSecret(process.env),
} = {}) => {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));
  app.use('/', authRoutes(pool, { secret }));

  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3001;
  createApp().listen(port, () => console.log(`[auth-service] listening on ${port}`));
}

module.exports = { createApp };
