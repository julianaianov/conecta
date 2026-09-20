const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const usersRoutes = require('./routes/users');
const communitiesRoutes = require('./routes/communities');
const connectionsRoutes = require('./routes/connections');
const socialRoutes = require('./routes/social');

const createApp = ({ pool = new Pool({ connectionString: process.env.DATABASE_URL }), secret = process.env.JWT_SECRET || 'dev_secret' } = {}) => {
  const app = express();

  const auth = (req, res, next) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sem token' });
    try {
      req.user = jwt.verify(h.slice(7), secret);
      next();
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  };

  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'user-service' }));
  app.use('/communities', communitiesRoutes(pool));
  app.use('/connections', connectionsRoutes(pool, auth));
  app.use('/', socialRoutes(pool, auth));
  app.use('/', usersRoutes(pool, auth));

  return app;
};

if (require.main === module) {
  const port = process.env.PORT || 3002;
  createApp().listen(port, () => console.log(`[user-service] listening on ${port}`));
}

module.exports = { createApp };
