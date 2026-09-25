const express = require('express');
const { ensureProfile, isForeignKeyViolation } = require('../profile-provision');
const { isUuid } = require('../security');
const { institutionStatus } = require('./institutions');

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
    // Conversa dentro da conexão (T27, migração user 012).
    messagesCount: Number(r.messages_count ?? 0),
    lastMessageAt: r.last_message_at || null,
  };
}

const DETAIL_SQL = `SELECT
           c.id, c.type, c.status, c.message, c.post_id, c.post_title, c.demand_id, c.outcome, c.events, c.created_at, c.updated_at,
           c.messages_count, c.last_message_at,
           p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
           p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
         FROM connections c
         LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
         LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
         WHERE c.id = $1`;

// Espelha ConnectionType em src/lib/app/types.ts.
// A conexão é a Camada 2 (pedido e aceite). Formalizada, vira Processo de
// Conexão com protocolo DM-AAAA-NNNNNN no post_db (connection_processes,
// migração post 026, decisão 13); o post-service cria o processo no aceite.
// Depois do protocolo, a comunicação (§12) e os documentos (§17) são do
// processo (post-service: connection_process_messages e
// connection_process_documents, T-05-02/T-05-04); a conversa daqui é a da
// fase de pedido (decisão 13).
// TODO(fonte-da-verdade): Modelo de Conexão §15 — prazos do processo (T-05-03).
const CONNECTION_TYPES = ['support', 'sponsorship', 'partnership', 'meeting', 'resources', 'outreach'];
const MAX_MESSAGE_LENGTH = 2000;

// Conversa dentro da conexão (T27): aberta enquanto o pedido está em
// andamento ou a conexão ativa; em estado final a conversa fica registrada.
const OPEN_STATUSES = ['pending', 'accepted'];
const MESSAGES_LIMIT_DEFAULT = 50;
const MESSAGES_LIMIT_MAX = 100;

function mapMessage(r, meId) {
  return {
    id: r.id,
    connectionId: r.connection_id,
    authorId: r.author_id,
    authorName: r.author_name || '',
    authorAvatarUrl: r.author_avatar_url || null,
    mine: r.author_id === meId,
    // Instituição e cargo/perfil no envio (T-05-02, Modelo §12; migração user 014).
    authorOrganizationName: r.author_organization_name || null,
    authorRoleLabel: r.author_role_label || null,
    body: r.body,
    createdAt: r.created_at,
  };
}

const MESSAGE_SQL = `SELECT m.id, m.connection_id, m.author_id, m.body, m.created_at,
                            m.author_organization_name, m.author_role_label,
                            p.name AS author_name, p.avatar_url AS author_avatar_url
                       FROM connection_messages m
                       LEFT JOIN profiles p ON p.user_id = m.author_id`;

/** Conexão da qual o usuário é parte, ou null (mesmo 404 para inexistente e alheia). */
async function loadParty(pool, id, userId) {
  const { rows } = await pool.query(
    'SELECT id, status, from_user_id, to_user_id FROM connections WHERE id = $1 AND (from_user_id = $2 OR to_user_id = $2)',
    [id, userId],
  );
  return rows[0] ?? null;
}

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
           c.messages_count, c.last_message_at,
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

  // GET /:id/messages — a conversa da conexão (T27), em ordem cronológica.
  // Só as duas partes; `limit` ≤ 100 e `before=<ISO>` paginam para trás. A
  // leitura registra a última leitura do leitor (para o sino).
  router.get('/:id/messages', auth, async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Conexão não encontrada' });
    let limit = MESSAGES_LIMIT_DEFAULT;
    if (req.query.limit !== undefined && req.query.limit !== '') {
      const parsed = Number(req.query.limit);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MESSAGES_LIMIT_MAX) {
        return res.status(400).json({ error: `limit entre 1 e ${MESSAGES_LIMIT_MAX}` });
      }
      limit = parsed;
    }
    let before = null;
    if (typeof req.query.before === 'string' && req.query.before.trim()) {
      before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) return res.status(400).json({ error: 'before inválido' });
    }
    try {
      const c = await loadParty(pool, req.params.id, req.user.userId);
      if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
      const params = [c.id];
      let where = 'm.connection_id = $1';
      if (before) {
        params.push(before.toISOString());
        where += ` AND m.created_at < $${params.length}`;
      }
      params.push(limit + 1);
      const { rows } = await pool.query(
        `${MESSAGE_SQL} WHERE ${where} ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}`,
        params,
      );
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit).reverse();
      await pool.query(
        `INSERT INTO connection_message_reads (connection_id, user_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (connection_id, user_id) DO UPDATE SET last_read_at = NOW()`,
        [c.id, req.user.userId],
      );
      res.json({
        messages: page.map((r) => mapMessage(r, req.user.userId)),
        hasMore,
        open: OPEN_STATUSES.includes(c.status),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /:id/messages — escrever na conversa (T27). Só as partes; só com a
  // conexão em andamento ou ativa (409 `connection_closed` nos estados finais).
  router.post('/:id/messages', auth, async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Conexão não encontrada' });
    const body = typeof req.body?.body === 'string' ? req.body.body.trim() : '';
    if (!body) return res.status(400).json({ error: 'Escreva a mensagem' });
    if (body.length > MAX_MESSAGE_LENGTH) {
      return res.status(400).json({ error: `A mensagem aceita até ${MAX_MESSAGE_LENGTH} caracteres` });
    }
    try {
      const c = await loadParty(pool, req.params.id, req.user.userId);
      if (!c) return res.status(404).json({ error: 'Conexão não encontrada' });
      if (!OPEN_STATUSES.includes(c.status)) {
        return res.status(409).json({
          error: 'A conexão foi encerrada; a conversa fica registrada e não recebe novas mensagens',
          code: 'connection_closed',
        });
      }
      await ensureProfile(pool, req.user);
      // Retrato de quem escreve (instituição e cargo/perfil), como no
      // GET /me/institution/status (delegação T29 incluída).
      const author = await institutionStatus(pool, req.user);
      const { rows } = await pool.query(
        `INSERT INTO connection_messages (connection_id, author_id, body, author_organization_name, author_role_label)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [c.id, req.user.userId, body, author.organizationName ?? null, author.roleLabel ?? null],
      );
      const detail = await pool.query(`${MESSAGE_SQL} WHERE m.id = $1`, [rows[0].id]);
      await pool.query(
        `INSERT INTO connection_message_reads (connection_id, user_id, last_read_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (connection_id, user_id) DO UPDATE SET last_read_at = NOW()`,
        [c.id, req.user.userId],
      );
      res.status(201).json(mapMessage(detail.rows[0], req.user.userId));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // PUT /:id — atualizar status e desfecho. A conversa entre as partes vive em
  // /:id/messages (T27); aqui só o ciclo pedido → aceite → resultado.
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
module.exports.OPEN_STATUSES = OPEN_STATUSES;
module.exports.MESSAGES_LIMIT_MAX = MESSAGES_LIMIT_MAX;
