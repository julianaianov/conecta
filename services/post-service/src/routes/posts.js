const express = require('express');
const { canPublish, canSupport } = require('../roles');
const { normalizeCoordinates } = require('../location');
const { isUuid } = require('../security');
const { POST_IMAGES_SQL } = require('../upload-policy');

// Projeção pública de um post. Colunas novas ficam fora da API até serem
// incluídas aqui de propósito.
const POST_PUBLIC_COLUMNS = [
  'id', 'author_id', 'author_name', 'author_avatar', 'type', 'title', 'description',
  'status', 'latitude', 'longitude', 'neighborhood', 'city', 'images', 'videos', 'tags',
  'reactions_count', 'comments_count', 'views_count', 'shares_count', 'created_at', 'updated_at',
  // Post-vitrine de demanda publicada (T06/T07): o frontend linka a demanda.
  'demand_id',
  // Post-vitrine de evento publicado (T25): o frontend linka o evento, e a
  // camada de conteúdos do mapa (T20, slide 19) mostra o evento **com data**.
  'event_id', 'event_starts_at',
];
// `images` com `upload:<id>` (foto da demanda no post-vitrine, T08) sai como
// endereço público estável /api/posts/uploads/<id>/content.
const POST_SQL = POST_PUBLIC_COLUMNS.map((c) => (c === 'images' ? POST_IMAGES_SQL : c)).join(', ');
const COMMENT_SQL = 'id, post_id, author_id, author_name, content, created_at';
// Apoio visto pelo próprio apoiador (e pela operação, sem mensagem nem detalhes).
// `modality` (T16, migração 013): as 6 modalidades da fonte; nos apoios do
// feed vem do mapeamento dos tipos antigos.
const SUPPORT_OWNER_SQL = 'id, post_id, user_id, user_name, type, modality, message, amount, payment_method, details, status, created_at, updated_at';
const SUPPORT_OPERATION_SQL = 'id, post_id, user_id, user_name, type, modality, amount, payment_method, status, created_at';

// Decisão 7 (dm-docs, decisoes-de-implementacao): o status dos posts antigos
// não é mais editado; a moderação só alterna a visibilidade (visible/hidden).
// Post oculto não aparece em rota pública nem aceita interação.
const VISIBLE = "visibility = 'visible'";
// Teto da camada de conteúdos do feed no mapa (T20).
const MAP_LIMIT_MAX = 500;
const VISIBLE_POST = `SELECT 1 FROM posts WHERE id=$1 AND ${VISIBLE}`;

// Post-vitrine de demanda (posts.demand_id): o conteúdo vem da demanda, então
// editar ou excluir pelo post é conflito de estado, não erro interno.
function showcaseConflict(res, demandId) {
  return res.status(409).json({
    error: 'Este post é a vitrine de uma demanda: o conteúdo é mantido pela demanda',
    code: 'demand_showcase',
    demandId: demandId ?? null,
  });
}

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

  // GET /map — lightweight data for map markers.
  // Camada de conteúdos do feed do mapa inteligente (T20, slide 18): aceita
  // `bbox=oeste,sul,leste,norte` e `limit` (teto de MAP_LIMIT_MAX) para que
  // nenhum movimento do mapa varra a tabela inteira. A resposta continua
  // sendo o array de posts (contrato antigo), já ordenada do mais recente.
  router.get('/map', async (req, res) => {
    const { type, status } = req.query;
    const params = [];
    let where = `WHERE ${VISIBLE} AND latitude IS NOT NULL AND longitude IS NOT NULL`;
    let i = 1;
    if (type)   { where += ` AND type=$${i++}`;   params.push(type); }
    if (status) { where += ` AND status=$${i++}`; params.push(status); }

    if (req.query.bbox !== undefined && req.query.bbox !== '') {
      const parts = String(req.query.bbox).split(',').map((v) => Number(v.trim()));
      const [west, south, east, north] = parts;
      const valid = parts.length === 4 && parts.every(Number.isFinite)
        && Math.abs(south) <= 90 && Math.abs(north) <= 90
        && Math.abs(west) <= 180 && Math.abs(east) <= 180
        && south <= north && west <= east;
      if (!valid) {
        return res.status(422).json({
          error: 'Filtro inválido',
          code: 'validation_failed',
          fields: { bbox: 'Use bbox=oeste,sul,leste,norte (longitude e latitude em graus)' },
        });
      }
      where += ` AND latitude BETWEEN $${i++} AND $${i++} AND longitude BETWEEN $${i++} AND $${i++}`;
      params.push(south, north, west, east);
    }

    let limit = MAP_LIMIT_MAX;
    if (req.query.limit !== undefined && req.query.limit !== '') {
      const parsed = Number(req.query.limit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAP_LIMIT_MAX) {
        return res.status(422).json({
          error: 'Filtro inválido',
          code: 'validation_failed',
          fields: { limit: `Entre 1 e ${MAP_LIMIT_MAX}` },
        });
      }
      limit = parsed;
    }
    params.push(limit);

    try {
      const { rows } = await pool.query(
        `SELECT ${POST_SQL} FROM posts ${where} ORDER BY created_at DESC LIMIT $${i}`,
        params
      );
      return res.json(rows);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
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
           -- Apoio cancelado ou rejeitado não pontua; o Poder Público não
           -- entra em ranking competitivo de apoiadores (fonte, slide 11).
           WHERE canceled_at IS NULL AND status <> 'rejected'
             AND (supporter_category IS NULL OR supporter_category <> 'poder_publico')
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

  // GET /my/supports — painel do apoiador com os apoios do feed (deve vir antes
  // de /:id). O apoio registrado em demanda está em GET /demands/supports/mine (T16).
  router.get('/my/supports', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${SUPPORT_OWNER_SQL.split(', ').map((c) => `s.${c}`).join(', ')}, p.title AS post_title, p.type AS post_type,
                p.neighborhood, p.city, p.status AS post_status
           FROM supports s
           JOIN posts p ON p.id = s.post_id
          WHERE s.user_id = $1 AND s.demand_id IS NULL
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
      const { rows: existing } = await pool.query('SELECT author_id, demand_id FROM posts WHERE id=$1', [req.params.id]);
      if (!existing.length) return res.status(404).json({ error: 'Post não encontrado' });
      if (existing[0].author_id !== req.user.userId)
        return res.status(403).json({ error: 'Sem permissão' });
      if (existing[0].demand_id) return showcaseConflict(res, existing[0].demand_id);

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
      // Corrida com a publicação/arquivamento: o trigger do post-vitrine recusa.
      if (err?.code === '23514' && /post-vitrine/.test(err.message)) return showcaseConflict(res, null);
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // DELETE /:id — posts não são excluídos pela API (a moderação oculta). O
  // post-vitrine de demanda responde 409 e aponta a demanda.
  router.delete('/:id', auth, async (req, res) => {
    try {
      const { rows } = await pool.query('SELECT author_id, demand_id FROM posts WHERE id=$1', [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Post não encontrado' });
      if (rows[0].author_id !== req.user.userId) return res.status(403).json({ error: 'Sem permissão' });
      if (rows[0].demand_id) return showcaseConflict(res, rows[0].demand_id);
      return res.status(405).json({ error: 'Publicações não são excluídas; a moderação pode ocultá-las' });
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
      const { rows: postRows } = await pool.query(
        `SELECT demand_id FROM posts WHERE id=$1 AND ${VISIBLE}`, [id]);
      if (!postRows.length) return res.status(404).json({ error: 'Post não encontrado' });
      // Post-vitrine de demanda: o apoio é registrado na demanda (T16), com
      // modalidade, valor declarado e confirmação do Agente.
      if (postRows[0].demand_id) {
        return res.status(409).json({
          error: 'O apoio a esta demanda é registrado na página da demanda',
          code: 'demand_support_flow',
          demandId: postRows[0].demand_id,
        });
      }

      const { rows: existing } = await pool.query(
        'SELECT id FROM supports WHERE post_id=$1 AND user_id=$2 AND type=$3 AND demand_id IS NULL',
        [id, userId, type]
      );

      let supportRow;
      let action;

      if (existing.length) {
        const { rows } = await pool.query(
          `UPDATE supports
              SET message=$1, amount=$2, payment_method=$3, details=$4,
                  status=$5, updated_at=NOW()
            WHERE post_id=$6 AND user_id=$7 AND type=$8 AND demand_id IS NULL
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
        'DELETE FROM supports WHERE post_id=$1 AND user_id=$2 AND type=$3 AND demand_id IS NULL',
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
