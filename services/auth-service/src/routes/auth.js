const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const sign = (payload, expiresIn) => jwt.sign(payload, JWT_SECRET, { expiresIn });

module.exports = (pool) => {
  const router = express.Router();

  // POST /register
  router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    body('role').isIn(['citizen', 'organization', 'association', 'government', 'business']),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, name, role } = req.body;
    try {
      const dup = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
      if (dup.rows.length) return res.status(409).json({ error: 'Email já cadastrado' });

      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        'INSERT INTO users (email,password_hash,name,role) VALUES ($1,$2,$3,$4) RETURNING id,email,name,role,created_at',
        [email, hash, name, role]
      );
      const user = rows[0];
      res.status(201).json({
        user,
        token:        sign({ userId: user.id, email: user.email, name: user.name, role: user.role }, '7d'),
        refreshToken: sign({ userId: user.id }, '30d'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /login
  router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const { rows } = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });

      const user = rows[0];
      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

      const { password_hash: _, ...safe } = user;
      res.json({
        user: safe,
        token:        sign({ userId: user.id, email: user.email, name: user.name, role: user.role }, '7d'),
        refreshToken: sign({ userId: user.id }, '30d'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /refresh
  router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: 'Token ausente' });
    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET);
      const { rows } = await pool.query('SELECT id,email,name,role FROM users WHERE id=$1', [decoded.userId]);
      if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });
      const u = rows[0];
      res.json({ token: sign({ userId: u.id, email: u.email, name: u.name, role: u.role }, '7d') });
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  });

  // GET /verify
  router.get('/verify', async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sem token' });
    try {
      const decoded = jwt.verify(header.slice(7), JWT_SECRET);
      const { rows } = await pool.query('SELECT id,email,name,role FROM users WHERE id=$1', [decoded.userId]);
      if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });
      res.json({ user: rows[0] });
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  });

  return router;
};
