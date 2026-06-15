const express = require('express');

module.exports = (pool, auth) => {
  const router = express.Router();

  // GET /me
  router.get('/me', auth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id=$1', [req.user.userId]);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /me — create or update profile
  router.post('/me', auth, async (req, res) => {
    const { name, bio, avatar_url, phone, website, city, state } = req.body;
    const userId = req.user.userId;
    try {
      const existing = await pool.query('SELECT id FROM profiles WHERE user_id=$1', [userId]);
      let result;
      if (existing.rows.length) {
        result = await pool.query(
          `UPDATE profiles
             SET name=$1, bio=$2, avatar_url=$3, phone=$4, website=$5, city=$6, state=$7, updated_at=NOW()
           WHERE user_id=$8 RETURNING *`,
          [name, bio, avatar_url, phone, website, city, state, userId]
        );
      } else {
        result = await pool.query(
          `INSERT INTO profiles (user_id,name,bio,avatar_url,phone,website,city,state,role)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [userId, name || req.user.name, bio, avatar_url, phone, website, city, state, req.user.role]
        );
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id — public profile
  router.get('/:id', async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT * FROM profiles WHERE user_id=$1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
