const express = require('express');

const COMMUNITY_COLUMNS = 'id, name, description, category, member_count, image_url, created_at, updated_at';

module.exports = (pool) => {
  const router = express.Router();

  router.get('/', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${COMMUNITY_COLUMNS} FROM communities ORDER BY member_count DESC, name ASC`
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
