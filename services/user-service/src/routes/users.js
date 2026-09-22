const express = require('express');
const { ensureProfile } = require('../profile-provision');
const { isUuid } = require('../security');

// Projeção pública do perfil: nada de telefone, estado ou metadados internos.
// Qualquer campo novo em `profiles` fica privado até ser incluído aqui de propósito.
const PUBLIC_PROFILE_COLUMNS = [
  'user_id', 'name', 'bio', 'avatar_url', 'cover_url', 'status', 'neighborhood',
  'city', 'website', 'role', 'profile_type', 'member_since', 'friend_count',
];

// Projeção do próprio dono (inclui os dados de contato que ele mesmo informou).
const OWNER_PROFILE_COLUMNS = [
  ...PUBLIC_PROFILE_COLUMNS, 'phone', 'state', 'created_at', 'updated_at',
];

const PUBLIC_PROFILE_SQL = PUBLIC_PROFILE_COLUMNS.join(', ');
const OWNER_PROFILE_SQL = OWNER_PROFILE_COLUMNS.join(', ');

module.exports = (pool, auth) => {
  const router = express.Router();

  // GET /me
  router.get('/me', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${OWNER_PROFILE_SQL} FROM profiles WHERE user_id=$1`, [req.user.userId]);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /me/provision — garante o perfil da conta autenticada (idempotente).
  // Chamado pelo frontend após cadastro, login e restauração de sessão.
  router.post('/me/provision', auth, async (req, res) => {
    try {
      const created = await ensureProfile(pool, req.user);
      const { rows } = await pool.query(`SELECT ${OWNER_PROFILE_SQL} FROM profiles WHERE user_id=$1`, [req.user.userId]);
      if (!rows.length) return res.status(422).json({ error: 'Não foi possível criar o perfil: token sem nome' });
      res.status(created ? 201 : 200).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /me — create or update profile (sempre do dono do token)
  router.post('/me', auth, async (req, res) => {
    const { name, bio, avatar_url, phone, website, city, state } = req.body ?? {};
    const userId = req.user.userId;
    try {
      const existing = await pool.query('SELECT id FROM profiles WHERE user_id=$1', [userId]);
      let result;
      if (existing.rows.length) {
        result = await pool.query(
          `UPDATE profiles
             SET name=COALESCE($1, name), bio=$2, avatar_url=$3, phone=$4, website=$5, city=$6, state=$7, updated_at=NOW()
           WHERE user_id=$8 RETURNING ${OWNER_PROFILE_SQL}`,
          [name || null, bio, avatar_url, phone, website, city, state, userId]
        );
      } else {
        result = await pool.query(
          `INSERT INTO profiles (user_id,name,bio,avatar_url,phone,website,city,state,role,profile_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${OWNER_PROFILE_SQL}`,
          [userId, name || req.user.name, bio, avatar_url, phone, website, city, state, req.user.role, req.user.profileType ?? null]
        );
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id — public profile
  router.get('/:id', async (req, res, next) => {
    if (req.params.id === 'health') return next();
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Perfil não encontrado' });
    try {
      const { rows } = await pool.query(`SELECT ${PUBLIC_PROFILE_SQL} FROM profiles WHERE user_id=$1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};

module.exports.PUBLIC_PROFILE_COLUMNS = PUBLIC_PROFILE_COLUMNS;
