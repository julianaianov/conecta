const express = require('express');
const { ensureProfile, isForeignKeyViolation } = require('../profile-provision');
const { isUuid } = require('../security');

function mapRow(r) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    from: {
      userId: r.from_user_id,
      name: r.from_name || '',
      avatarUrl: r.from_avatar_url || null,
      role: r.from_role || null,
      profileType: r.from_profile_type || null,
    },
    to: {
      userId: r.to_user_id,
      name: r.to_name || '',
      avatarUrl: r.to_avatar_url || null,
      role: r.to_role || null,
      profileType: r.to_profile_type || null,
    },
    message: r.message,
    postId: r.post_id || null,
    postTitle: r.post_title || null,
    // Demanda de onde saiu o pedido (T15; post_db.demands.id).
    demandId: r.demand_id || null,
    outcome: r.outcome || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    events: r.events || [],
  };
}

const DETAIL_SQL = `SELECT
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.demand_id, c.outcome, c.events, c.created_at, c.updated_at,
           p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
           p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
         FROM connections c
         LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
         LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
         WHERE c.id = $1`;

// Espelha ConnectionType em src/lib/app/types.ts.
const CONNECTION_TYPES = ['support', 'sponsorship', 'partnership', 'meeting', 'resources', 'outreach'];
const MAX_MESSAGE_LENGTH = 2000;

/**
 * Quem pode levar a conexão para cada status, a partir do status atual.
 * pending → accepted/declined: só quem recebeu; pending → canceled: só quem pediu;
 * accepted → done (com resultado): qualquer das partes. Estados finais não mudam.
 */
function transitionAllowed(current, next, { isFrom, isTo }) {
  if (current === 'pending') {
    if (next === 'accepted' || next === 'declined') return isTo;
    if (next === 'canceled') return isFrom;
    return false;
  }
  if (current === 'accepted') return next === 'done' && (isFrom || isTo);
  return false;
}

module.exports = (pool, auth, institutionalGate = (_req, _res, next) => next()) => {
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
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.demand_id, c.outcome, c.events, c.created_at, c.updated_at,
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
  // Só as duas partes enxergam a conexão; para qualquer outra conta ela "não existe"
  // (404, sem revelar se o id é válido).
  router.get('/:id', auth, async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Conexão não encontrada' });
    try {
      const { rows } = await pool.query(
        `${DETAIL_SQL}
           AND (c.from_user_id = $2 OR c.to_user_id = $2)`,
        [req.params.id, req.user.userId]
      );
      if (!rows.length) return res.status(404).json({ error: 'Conexão não encontrada' });
      res.json(mapRow(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST / — criar solicitação de conexão
  router.post('/', auth, institutionalGate, async (req, res) => {
    const { toUserId, type, postId, postTitle, demandId } = req.body ?? {};
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!toUserId || !type || !message) {
      return res.status(400).json({ error: 'toUserId, type e message são obrigatórios' });
    }
    if (!isUuid(toUserId)) return res.status(404).json({ error: 'Perfil de destino não encontrado' });
    if (toUserId.toLowerCase() === String(req.user.userId).toLowerCase()) {
      return res.status(400).json({ error: 'Não é possível solicitar conexão consigo mesmo' });
    }
    if (!CONNECTION_TYPES.includes(type)) return res.status(400).json({ error: 'Tipo de conexão inválido' });
    if (message.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `A mensagem aceita até ${MAX_MESSAGE_LENGTH} caracteres` });
    }
    if (postId != null && postId !== '' && !isUuid(postId)) return res.status(400).json({ error: 'postId inválido' });
    if (demandId != null && demandId !== '' && !isUuid(demandId)) return res.status(400).json({ error: 'demandId inválido' });
    const now = new Date().toISOString();
    const initialEvents = [
      { id: `e-${Date.now()}`, label: 'Conexão solicitada', detail: null, icon: 'send', at: now },
    ];
    try {
      await ensureProfile(pool, req.user);
      const { rows } = await pool.query(
        `INSERT INTO connections (type, status, from_user_id, to_user_id, message, post_id, post_title, demand_id, events, created_at, updated_at)
         VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
         RETURNING id`,
        [type, req.user.userId, toUserId, message, postId || null,
         typeof postTitle === 'string' && postTitle.trim() ? postTitle.trim().slice(0, 255) : null,
         demandId ? String(demandId).toLowerCase() : null, JSON.stringify(initialEvents)]
      );
      const createdId = rows[0].id;
      const detail = await pool.query(
        DETAIL_SQL,
        [createdId]
      );
      res.status(201).json(mapRow(detail.rows[0]));
    } catch (err) {
      if (isForeignKeyViolation(err)) return res.status(404).json({ error: 'Perfil de destino não encontrado' });
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // PUT /:id — atualizar status e desfecho
  router.put('/:id', auth, async (req, res) => {
    const { status, outcome } = req.body ?? {};
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Conexão não encontrada' });
    if (outcome != null && (typeof outcome !== 'string' || outcome.length > MAX_MESSAGE_LENGTH)) {
      return res.status(400).json({ error: `O resultado aceita até ${MAX_MESSAGE_LENGTH} caracteres` });
    }
    try {
      const { rows: existing } = await pool.query(
        'SELECT id, status, from_user_id, to_user_id, outcome, events FROM connections WHERE id = $1',
        [req.params.id]
      );
      const c = existing[0];
      const isFrom = Boolean(c) && c.from_user_id === req.user.userId;
      const isTo = Boolean(c) && c.to_user_id === req.user.userId;
      // Quem não participa recebe o mesmo 404 de uma conexão inexistente.
      if (!c || (!isFrom && !isTo)) return res.status(404).json({ error: 'Conexão não encontrada' });
      if (!transitionAllowed(c.status, status, { isFrom, isTo })) {
        return res.status(409).json({ error: 'Esta mudança de status não é permitida para você nesta etapa' });
      }

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
      } else if (status === 'canceled') {
        label = 'Pedido cancelado';
        icon = 'close';
      }
      events.push({ id: `e-${Date.now()}`, label, detail: outcome || null, icon, at: now });

      const { rows } = await pool.query(
        `UPDATE connections
            SET status = COALESCE($1, status),
                outcome = COALESCE($2, outcome),
                events = $3,
                updated_at = NOW()
          WHERE id = $4 AND status = $5
          RETURNING id`,
        [status, outcome != null ? outcome : c.outcome, JSON.stringify(events), req.params.id, c.status]
      );
      // Outra atualização mudou o status entre a leitura e a escrita.
      if (!rows.length) return res.status(409).json({ error: 'A conexão foi atualizada por outra ação; recarregue' });

      const detail = await pool.query(
        DETAIL_SQL,
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

module.exports.transitionAllowed = transitionAllowed;
module.exports.CONNECTION_TYPES = CONNECTION_TYPES;
