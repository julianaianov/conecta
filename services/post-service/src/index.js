const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const postsRoutes = require('./routes/posts');
const {
  resolveJwtSecret, createAuth, parseOperationUserIds, requireOperation,
} = require('./security');

const createApp = ({
  pool = new Pool({ connectionString: process.env.DATABASE_URL }),
  secret = resolveJwtSecret(process.env),
  operationUserIds = parseOperationUserIds(process.env),
} = {}) => {
  const app = express();
  const auth = createAuth(secret);
  const operation = requireOperation(operationUserIds);

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'post-service' }));
  app.use('/', postsRoutes(pool, auth, operation));

  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3003;
  createApp().listen(port, () => console.log(`[post-service] listening on ${port}`));
}

module.exports = { createApp };
