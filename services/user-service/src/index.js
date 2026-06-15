const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const usersRoutes = require('./routes/users');

const app    = express();
const PORT   = process.env.PORT || 3002;
const SECRET = process.env.JWT_SECRET || 'dev_secret';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const auth = (req, res, next) => {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sem token' });
  try {
    req.user = jwt.verify(h.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido' });
  }
};

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/', usersRoutes(pool, auth));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'user-service' }));

app.listen(PORT, () => console.log(`[user-service] listening on ${PORT}`));
