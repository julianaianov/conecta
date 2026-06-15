const express = require('express');

module.exports = (pool, auth) => {
  const router = express.Router();

  // GET / — list with filters
  router.get('/', async (req, res) => {
    const { type, status, neighborhood, limit = 20, offset = 0 } = req.query;
    const params = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (type)         { where += ` AND type=$${i++}`;                    params.push(type); }
    if (status)       { where += ` AND status=$${i++}`;                  params.push(status); }
    if (neighborhood) { where += ` AND neighborhood ILIKE $${i++}`;      params.push(`%${neighborhood}%`); }

    const query = `SELECT * FROM posts ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
    params.push(parseInt(limit), parseInt(offset));

    try {
      const [data, count] = await Promise.all([
        pool.query(query, params),
        pool.query(`SELECT COUNT(*) FROM posts ${where}`, params.slice(0, params.length - 2)),
      ]);
      res.json({ posts: data.rows, total: parseInt(count.rows[0].count), limit: +limit, offset: +offset });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /map — lightweight data for map markers
  router.get('/map', async (req, res) => {
    const { type, status } = req.query;
    const params = [];
    let where = 'WHERE latitude IS NOT NULL AND longitude IS NOT NULL';
    let i = 1;
    if (type)   { where += ` AND type=$${i++}`;   params.push(type); }
    if (status) { where += ` AND status=$${i++}`; params.push(status); }

    try {
      const { rows } = await pool.query(
        `SELECT * FROM posts ${where} ORDER BY created_at DESC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  const SUPPORT_TYPES = [
    'financial', 'materials', 'labor', 'volunteering',
    'equipment', 'space', 'food', 'transport', 'knowledge', 'sharing',
  ];
  const PAYMENT_METHODS = ['pix', 'debit', 'credit'];

  // GET /my/supports — painel do apoiador (deve vir antes de /:id)
  router.get('/my/supports', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT s.*, p.title AS post_title, p.type AS post_type,
                p.neighborhood, p.city, p.status AS post_status
           FROM supports s
           JOIN posts p ON p.id = s.post_id
          WHERE s.user_id = $1
          ORDER BY s.created_at DESC`,
        [req.user.userId]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id
  router.get('/:id', async (req, res) => {
    try {
      await pool.query('UPDATE posts SET views_count=views_count+1 WHERE id=$1', [req.params.id]);
      const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Post não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /
  router.post('/', auth, async (req, res) => {
    const { type, title, description, latitude, longitude, neighborhood, city, images, tags } = req.body;
    if (!type || !title || !description)
      return res.status(400).json({ error: 'type, title e description são obrigatórios' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO posts
          (author_id,author_name,type,title,description,latitude,longitude,neighborhood,city,images,tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [req.user.userId, req.user.name || req.user.email, type, title, description,
         latitude || null, longitude || null, neighborhood, city, images || [], tags || []]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // PUT /:id
  router.put('/:id', auth, async (req, res) => {
    const { title, description, status, images, tags } = req.body;
    try {
      const { rows: existing } = await pool.query('SELECT author_id FROM posts WHERE id=$1', [req.params.id]);
      if (!existing.length) return res.status(404).json({ error: 'Post não encontrado' });
      if (existing[0].author_id !== req.user.userId)
        return res.status(403).json({ error: 'Sem permissão' });
      const { rows } = await pool.query(
        `UPDATE posts
           SET title=COALESCE($1,title), description=COALESCE($2,description),
               status=COALESCE($3,status), images=COALESCE($4,images),
               tags=COALESCE($5,tags), updated_at=NOW()
         WHERE id=$6 RETURNING *`,
        [title, description, status, images, tags, req.params.id]
      );
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /:id/reactions — toggle like
  router.post('/:id/reactions', auth, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.userId;
    try {
      const { rows } = await pool.query(
        'SELECT id FROM reactions WHERE post_id=$1 AND user_id=$2', [id, userId]
      );
      if (rows.length) {
        await pool.query('DELETE FROM reactions WHERE post_id=$1 AND user_id=$2', [id, userId]);
        await pool.query('UPDATE posts SET reactions_count=reactions_count-1 WHERE id=$1', [id]);
        return res.json({ action: 'removed' });
      }
      await pool.query('INSERT INTO reactions (post_id,user_id) VALUES ($1,$2)', [id, userId]);
      await pool.query('UPDATE posts SET reactions_count=reactions_count+1 WHERE id=$1', [id]);
      res.json({ action: 'added' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id/comments
  router.get('/:id/comments', async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM comments WHERE post_id=$1 ORDER BY created_at ASC', [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /:id/comments
  router.post('/:id/comments', auth, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Conteúdo obrigatório' });
    try {
      const { rows } = await pool.query(
        'INSERT INTO comments (post_id,author_id,author_name,content) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.params.id, req.user.userId, req.user.name || req.user.email, content]
      );
      await pool.query('UPDATE posts SET comments_count=comments_count+1 WHERE id=$1', [req.params.id]);
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id/supports — list supports + summary by type
  router.get('/:id/supports', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT type, COUNT(*)::int AS count
           FROM supports WHERE post_id=$1
          GROUP BY type ORDER BY count DESC`,
        [req.params.id]
      );
      const { rows: list } = await pool.query(
        'SELECT * FROM supports WHERE post_id=$1 ORDER BY created_at DESC',
        [req.params.id]
      );
      res.json({ summary: rows, supports: list });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id/supports/mine — apoios do usuário neste post
  router.get('/:id/supports/mine', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM supports WHERE post_id=$1 AND user_id=$2 ORDER BY created_at DESC',
        [req.params.id, req.user.userId]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /:id/supports — criar ou atualizar apoio com detalhes
  router.post('/:id/supports', auth, async (req, res) => {
    const { type, message, amount, payment_method, details, status } = req.body;
    if (!type || !SUPPORT_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo de apoio inválido' });
    if (type === 'financial') {
      if (!amount || amount <= 0)
        return res.status(400).json({ error: 'Valor financeiro obrigatório' });
      if (!payment_method || !PAYMENT_METHODS.includes(payment_method))
        return res.status(400).json({ error: 'Forma de pagamento inválida' });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const userName = req.user.name || req.user.email;
    const supportStatus = status || 'confirmed';
    const detailsJson = JSON.stringify(details || {});

    try {
      const { rows: postRows } = await pool.query('SELECT id FROM posts WHERE id=$1', [id]);
      if (!postRows.length) return res.status(404).json({ error: 'Post não encontrado' });

      const { rows: existing } = await pool.query(
        'SELECT id FROM supports WHERE post_id=$1 AND user_id=$2 AND type=$3',
        [id, userId, type]
      );

      let supportRow;
      let action;

      if (existing.length) {
        const { rows } = await pool.query(
          `UPDATE supports
              SET message=$1, amount=$2, payment_method=$3, details=$4,
                  status=$5, updated_at=NOW()
            WHERE post_id=$6 AND user_id=$7 AND type=$8
            RETURNING *`,
          [message || null, amount || null, payment_method || null,
           detailsJson, supportStatus, id, userId, type]
        );
        supportRow = rows[0];
        action = 'updated';
      } else {
        const { rows } = await pool.query(
          `INSERT INTO supports
            (post_id,user_id,user_name,type,message,amount,payment_method,details,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
          [id, userId, userName, type, message || null, amount || null,
           payment_method || null, detailsJson, supportStatus]
        );
        supportRow = rows[0];
        action = 'added';
        await pool.query('UPDATE posts SET reactions_count=reactions_count+1 WHERE id=$1', [id]);
      }

      const { rows: countRow } = await pool.query('SELECT reactions_count FROM posts WHERE id=$1', [id]);
      res.json({
        action,
        support: supportRow,
        type,
        reactions_count: countRow[0].reactions_count,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // DELETE /:id/supports/:type — remover apoio
  router.delete('/:id/supports/:type', auth, async (req, res) => {
    const { id, type } = req.params;
    if (!SUPPORT_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo de apoio inválido' });

    try {
      const { rowCount } = await pool.query(
        'DELETE FROM supports WHERE post_id=$1 AND user_id=$2 AND type=$3',
        [id, req.user.userId, type]
      );
      if (!rowCount) return res.status(404).json({ error: 'Apoio não encontrado' });

      await pool.query('UPDATE posts SET reactions_count=GREATEST(reactions_count-1,0) WHERE id=$1', [id]);
      const { rows: countRow } = await pool.query('SELECT reactions_count FROM posts WHERE id=$1', [id]);
      res.json({ action: 'removed', type, reactions_count: countRow[0].reactions_count });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
