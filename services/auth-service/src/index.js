const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { Pool } = require('pg');
const authRoutes = require('./routes/auth');

const app  = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/', authRoutes(pool));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'auth-service' }));

app.listen(PORT, () => console.log(`[auth-service] listening on ${PORT}`));
