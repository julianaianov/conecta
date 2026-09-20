const express = require('express');

function mapRow(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    from: {
      userId: r.from_user_id,
      name: r.from_name || 'Usuário',
      avatarUrl: r.from_avatar_url || null,
      role: r.from_role || 'member',
      profileType: r.from_profile_type || null,
    },
    to: {
      userId: r.to_user_id,
      name: r.to_name || 'Usuário',
      avatarUrl: r.to_avatar_url || null,
      role: r.to_role || 'member',
      profileType: r.to_profile_type || null,
    },
    message: r.message,
    postId: r.post_id || null,
    postTitle: r.post_title || null,
    outcome: r.outcome || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    events: r.events || [],
  };
}

module.exports = (pool, auth) => {
  const router = express.Router();

  // GET /targets — contas disponíveis para conectar
  router.get('/targets', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT user_id, name, avatar_url, role, profile_type
           FROM profiles
          WHERE user_id != $1
          ORDER BY name ASC`,
        [req.user.userId]
      );
      res.json(rows.map((r) => ({
        userId: r.user_id,
        name: r.name,
        avatarUrl: r.avatar_url || null,
        role: r.role,
        profileType: r.profile_type || null,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET / — conexões do usuário logado
  router.get('/', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.outcome, c.events, c.created_at, c.updated_at,
           p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
           p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
         FROM connections c
         LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
         LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
         WHERE c.from_user_id = $1 OR c.to_user_id = $1
         ORDER BY c.updated_at DESC`,
        [req.user.userId]
      );
      res.json(rows.map(mapRow));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id — detalhes de uma conexão
  router.get('/:id', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.outcome, c.events, c.created_at, c.updated_at,
           p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
           p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
         FROM connections c
         LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
         LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
         WHERE c.id = $1`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Conexão não encontrada' });
      res.json(mapRow(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST / — criar solicitação de conexão
  router.post('/', auth, async (req, res) => {
    const { toUserId, type, message, postId, postTitle } = req.body;
    if (!toUserId || !type || !message) {
      return res.status(400).json({ error: 'toUserId, type e message são obrigatórios' });
    }
    const now = new Date().toISOString();
    const initialEvents = [
      { id: `e-${Date.now()}`, label: 'Conexão solicitada', detail: null, icon: 'send', at: now },
    ];
    try {
      const { rows } = await pool.query(
        `INSERT INTO connections (type, status, from_user_id, to_user_id, message, post_id, post_title, events, created_at, updated_at)
         VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [type, req.user.userId, toUserId, message, postId || null, postTitle || null, JSON.stringify(initialEvents)]
      );
      const createdId = rows[0].id;
      const detail = await pool.query(
        `SELECT
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.outcome, c.events, c.created_at, c.updated_at,
           p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
           p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
         FROM connections c
         LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
         LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
         WHERE c.id = $1`,
        [createdId]
      );
      res.status(201).json(mapRow(detail.rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // PUT /:id — atualizar status e desfecho
  router.put('/:id', auth, async (req, res) => {
    const { status, outcome } = req.body;
    try {
      const { rows: existing } = await pool.query('SELECT * FROM connections WHERE id = $1', [req.params.id]);
      if (!existing.length) return res.status(404).json({ error: 'Conexão não encontrada' });
      const c = existing[0];
      const isFrom = c.from_user_id === req.user.userId;
      const isTo = c.to_user_id === req.user.userId;
      if (!isFrom && !isTo) return res.status(403).json({ error: 'Sem permissão' });

      const now = new Date().toISOString();
      const events = Array.isArray(c.events) ? [...c.events] : [];
      let label = 'Conexão atualizada';
      let icon = 'star';
      if (status === 'accepted') {
        label = 'Conexão aceita';
        icon = 'check';
      } else if (status === 'declined') {
        label = 'Pedido recusado';
        icon = 'close';
      } else if (status === 'done') {
        label = 'Resultado registrado';
        icon = 'star';
      }
      events.push({ id: `e-${Date.now()}`, label, detail: outcome || null, icon, at: now });

      const { rows } = await pool.query(
        `UPDATE connections
            SET status = COALESCE($1, status),
                outcome = COALESCE($2, outcome),
                events = $3,
                updated_at = NOW()
          WHERE id = $4
          RETURNING *`,
        [status || c.status, outcome !== undefined ? outcome : c.outcome, JSON.stringify(events), req.params.id]
      );

      const detail = await pool.query(
        `SELECT
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.outcome, c.events, c.created_at, c.updated_at,
           p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
           p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
         FROM connections c
         LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
         LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
         WHERE c.id = $1`,
        [rows[0].id]
      );
      res.json(mapRow(detail.rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
