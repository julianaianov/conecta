const express = require('express');
const { canPublish, canSupport } = require('../roles');
const { normalizeCoordinates } = require('../location');
const { isUuid } = require('../security');

// Projeção pública de um post. Colunas novas ficam fora da API até serem
// incluídas aqui de propósito.
const POST_PUBLIC_COLUMNS = [
  'id', 'author_id', 'author_name', 'author_avatar', 'type', 'title', 'description',
  'status', 'latitude', 'longitude', 'neighborhood', 'city', 'images', 'videos', 'tags',
  'reactions_count', 'comments_count', 'views_count', 'created_at', 'updated_at',
];
const POST_SQL = POST_PUBLIC_COLUMNS.join(', ');
const COMMENT_SQL = 'id, post_id, author_id, author_name, content, created_at';
// Apoio visto pelo próprio apoiador (e pela operação, sem mensagem nem detalhes).
const SUPPORT_OWNER_SQL = 'id, post_id, user_id, user_name, type, message, amount, payment_method, details, status, created_at, updated_at';
const SUPPORT_OPERATION_SQL = 'id, post_id, user_id, user_name, type, amount, payment_method, status, created_at';

// Decisão 7 (dm-docs, decisoes-de-implementacao): o status dos posts antigos
// não é mais editado; a moderação só alterna a visibilidade (visible/hidden).
// Post oculto não aparece em rota pública nem aceita interação.
const VISIBLE = "visibility = 'visible'";
const VISIBLE_POST = `SELECT 1 FROM posts WHERE id=$1 AND ${VISIBLE}`;

module.exports = (pool, auth, operation, institutional = (_req, _res, next) => next()) => {
  if (typeof operation !== 'function') throw new Error('posts routes exigem o middleware de operação');
  const router = express.Router();

  // Todo `/:id` é o UUID de um post; id malformado é "não encontrado" (e não 500).
  router.param('id', (req, res, next, id) => {
    if (!isUuid(id)) return res.status(404).json({ error: 'Post não encontrado' });
    next();
  });

  // GET / — list with filters
  router.get('/', async (req, res) => {
    const { type, status, neighborhood, author_id, limit = 20, offset = 0 } = req.query;
    const params = [];
    let where = `WHERE ${VISIBLE}`;
    let i = 1;
    if (type)         { where += ` AND type=$${i++}`;                    params.push(type); }
    if (status)       { where += ` AND status=$${i++}`;                  params.push(status); }
    if (neighborhood) { where += ` AND neighborhood ILIKE $${i++}`;      params.push(`%${neighborhood}%`); }
    if (author_id) {
      if (!isUuid(author_id)) return res.json({ posts: [], total: 0, limit: +limit, offset: +offset });
      where += ` AND author_id=$${i++}`;
      params.push(author_id);
    }

    const query = `SELECT ${POST_SQL} FROM posts ${where} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`;
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
    let where = `WHERE ${VISIBLE} AND latitude IS NOT NULL AND longitude IS NOT NULL`;
    let i = 1;
    if (type)   { where += ` AND type=$${i++}`;   params.push(type); }
    if (status) { where += ` AND status=$${i++}`; params.push(status); }

    try {
      const { rows } = await pool.query(
        `SELECT ${POST_SQL} FROM posts ${where} ORDER BY created_at DESC`,
        params
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /ranking — métricas agregadas exclusivamente a partir de registros persistidos
  router.get('/ranking', async (_req, res) => {
    try {
      const [posts, supports, reactions, comments] = await Promise.all([
        pool.query(`
          SELECT author_id AS user_id,
                 COUNT(*)::int AS posts,
                 COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved_posts,
                 COALESCE(SUM(reactions_count), 0)::int AS reactions_received,
                 COALESCE(SUM(comments_count), 0)::int AS comments_received
            FROM posts
           WHERE ${VISIBLE}
           GROUP BY author_id
        `),
        pool.query(`
          SELECT user_id,
                 COUNT(*)::int AS supports,
                 COUNT(DISTINCT post_id)::int AS supported_posts,
                 COALESCE(SUM(CASE WHEN type = 'financial' THEN amount ELSE 0 END), 0)::numeric AS financial_amount
            FROM supports
           GROUP BY user_id
        `),
        pool.query('SELECT user_id, COUNT(*)::int AS reactions FROM reactions GROUP BY user_id'),
        pool.query('SELECT author_id AS user_id, COUNT(*)::int AS comments FROM comments GROUP BY author_id'),
      ]);

      const metrics = new Map();
      const get = (userId) => {
        if (!metrics.has(userId)) {
          metrics.set(userId, {
            userId,
            posts: 0,
            resolvedPosts: 0,
            reactionsReceived: 0,
            commentsReceived: 0,
            supportsReceived: 0,
            supports: 0,
            supportedPosts: 0,
            reactions: 0,
            comments: 0,
            financialAmount: 0,
          });
        }
        return metrics.get(userId);
      };
      for (const row of posts.rows) {
        const item = get(row.user_id);
        item.posts = Number(row.posts) || 0;
        item.resolvedPosts = Number(row.resolved_posts) || 0;
        item.reactionsReceived = Number(row.reactions_received) || 0;
        item.commentsReceived = Number(row.comments_received) || 0;
      }
      for (const row of supports.rows) {
        const item = get(row.user_id);
        item.supports = Number(row.supports) || 0;
        item.supportedPosts = Number(row.supported_posts) || 0;
        item.financialAmount = Number(row.financial_amount) || 0;
      }
      for (const row of reactions.rows) get(row.user_id).reactions = Number(row.reactions) || 0;
      for (const row of comments.rows) get(row.user_id).comments = Number(row.comments) || 0;

      res.json([...metrics.values()]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  const SUPPORT_TYPES = [
    'financial', 'materials', 'labor', 'volunteering',
    'equipment', 'space', 'food', 'transport', 'knowledge', 'sharing',
  ];

  // GET /my/supports — painel do apoiador (deve vir antes de /:id)
  router.get('/my/supports', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${SUPPORT_OWNER_SQL.split(', ').map((c) => `s.${c}`).join(', ')}, p.title AS post_title, p.type AS post_type,
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

  // GET /admin-snapshot — leitura para o painel da operação (decisões de
  // implementação §2: o dm-api não aprova nada). Só contas de DM_OPERATION_USER_IDS;
  // apoios sem mensagem e detalhes livres, comentários sem o texto.
  router.get('/admin-snapshot', auth, operation, async (_req, res) => {
    try {
      const [posts, supports, comments] = await Promise.all([
        pool.query(`SELECT ${POST_SQL}, visibility FROM posts ORDER BY created_at DESC`),
        pool.query(`SELECT ${SUPPORT_OPERATION_SQL} FROM supports ORDER BY created_at DESC`),
        pool.query('SELECT id, post_id, author_id, author_name, created_at FROM comments ORDER BY created_at ASC'),
      ]);
      res.json({
        posts: posts.rows,
        supports: supports.rows,
        comments: comments.rows,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id
  router.get('/:id', async (req, res) => {
    try {
      await pool.query(`UPDATE posts SET views_count=views_count+1 WHERE id=$1 AND ${VISIBLE}`, [req.params.id]);
      const { rows } = await pool.query(`SELECT ${POST_SQL} FROM posts WHERE id=$1 AND ${VISIBLE}`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Post não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /
  router.post('/', auth, institutional, async (req, res) => {
    const { type, title, description, latitude, longitude, neighborhood, city, images, videos, tags } = req.body;
    if (!type || !title || !description)
      return res.status(400).json({ error: 'type, title e description são obrigatórios' });
    if (!canPublish(req.user, type))
      return res.status(403).json({ error: `Seu perfil não publica "${type}"` });
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (!coordinates)
      return res.status(400).json({ error: 'latitude e longitude são obrigatórias e devem formar uma localização válida' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO posts
          (author_id,author_name,author_avatar,type,title,description,latitude,longitude,neighborhood,city,images,videos,tags)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${POST_SQL}`,
        [req.user.userId, req.user.name || req.user.email, req.user.avatarUrl || null, type, title, description,
         coordinates?.latitude ?? null, coordinates?.longitude ?? null, neighborhood, city, images || [], videos || [], tags || []]
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // PUT /:id
  router.put('/:id', auth, institutional, async (req, res) => {
    const { title, description, images, videos, tags, latitude, longitude } = req.body ?? {};
    if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'status'))
      return res.status(400).json({ error: 'O status da publicação não é editável' });
    const hasLocation = Object.prototype.hasOwnProperty.call(req.body, 'latitude')
      || Object.prototype.hasOwnProperty.call(req.body, 'longitude');
    const coordinates = normalizeCoordinates(latitude, longitude);
    if (hasLocation && (latitude != null || longitude != null) && !coordinates)
      return res.status(400).json({ error: 'latitude e longitude devem formar uma localização válida' });
    try {
      const { rows: existing } = await pool.query('SELECT author_id FROM posts WHERE id=$1', [req.params.id]);
      if (!existing.length) return res.status(404).json({ error: 'Post não encontrado' });
      if (existing[0].author_id !== req.user.userId)
        return res.status(403).json({ error: 'Sem permissão' });

      const updates = [
        'title=COALESCE($1,title)',
        'description=COALESCE($2,description)',
        'images=COALESCE($3,images)',
        'videos=COALESCE($4,videos)',
        'tags=COALESCE($5,tags)',
      ];
      const values = [title, description, images, videos, tags];
      if (hasLocation) {
        updates.push(`latitude=$${values.length + 1}`, `longitude=$${values.length + 2}`);
        values.push(coordinates?.latitude ?? null, coordinates?.longitude ?? null);
      }
      values.push(req.params.id);

      const { rows } = await pool.query(
        `UPDATE posts SET ${updates.join(', ')}, updated_at=NOW()
         WHERE id=$${values.length} RETURNING ${POST_SQL}`,
        values
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
      const { rows: visible } = await pool.query(VISIBLE_POST, [id]);
      if (!visible.length) return res.status(404).json({ error: 'Post não encontrado' });
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
        `SELECT ${COMMENT_SQL} FROM comments WHERE post_id=$1 AND EXISTS (${VISIBLE_POST}) ORDER BY created_at ASC`, [req.params.id]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /:id/comments
  router.post('/:id/comments', auth, institutional, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Conteúdo obrigatório' });
    try {
      const { rows: visible } = await pool.query(VISIBLE_POST, [req.params.id]);
      if (!visible.length) return res.status(404).json({ error: 'Post não encontrado' });
      const { rows } = await pool.query(
        `INSERT INTO comments (post_id,author_id,author_name,content) VALUES ($1,$2,$3,$4) RETURNING ${COMMENT_SQL}`,
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
           FROM supports WHERE post_id=$1 AND EXISTS (${VISIBLE_POST})
          GROUP BY type ORDER BY count DESC`,
        [req.params.id]
      );
      const { rows: list } = await pool.query(
        `SELECT id, type, created_at FROM supports WHERE post_id=$1 AND EXISTS (${VISIBLE_POST}) ORDER BY created_at DESC`,
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
        `SELECT ${SUPPORT_OWNER_SQL} FROM supports WHERE post_id=$1 AND user_id=$2 ORDER BY created_at DESC`,
        [req.params.id, req.user.userId]
      );
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /:id/supports — criar ou atualizar apoio com detalhes
  router.post('/:id/supports', auth, institutional, async (req, res) => {
    const { type, message, amount, payment_method, details } = req.body;
    if (!type || !SUPPORT_TYPES.includes(type))
      return res.status(400).json({ error: 'Tipo de apoio inválido' });
    if (!canSupport(req.user, type))
      return res.status(403).json({ error: 'Seu perfil apoia com divulgação' });
    if (type === 'financial') {
      return res.status(503).json({
        error: 'Apoio financeiro indisponível: nenhum provedor de pagamento está configurado.',
      });
    }

    const { id } = req.params;
    const userId = req.user.userId;
    const userName = req.user.name || req.user.email;
    const supportStatus = 'confirmed';
    const detailsJson = JSON.stringify(details || {});

    try {
      const { rows: postRows } = await pool.query(VISIBLE_POST, [id]);
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
            RETURNING ${SUPPORT_OWNER_SQL}`,
          [message || null, amount || null, payment_method || null,
           detailsJson, supportStatus, id, userId, type]
        );
        supportRow = rows[0];
        action = 'updated';
      } else {
        const { rows } = await pool.query(
          `INSERT INTO supports
            (post_id,user_id,user_name,type,message,amount,payment_method,details,status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${SUPPORT_OWNER_SQL}`,
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

module.exports.POST_PUBLIC_COLUMNS = POST_PUBLIC_COLUMNS;
