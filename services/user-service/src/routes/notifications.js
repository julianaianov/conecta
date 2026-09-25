// Central de notificações do user_db (T-05-16; migração 016): conexão pedida
// e aceita, mensagem na conversa da conexão (T27) e convite de vínculo (T29),
// gravados por trigger. O portal junta esta lista com a do post-service.
//
// - GET  /notifications?unread=1&limit=&kind=a,b&before=<ISO>
// - POST /notifications/read            `{ ids: [...] }` ou `{ all: true }`
// - GET  /notifications/preferences     todos os tipos, aplicativo e e-mail
// - PUT  /notifications/preferences     `{ preferences: [{ kind, inApp, email }] }`
//
// O nome de quem agiu vem do perfil na leitura (`actor_user_id` → profiles),
// então a anonimização do perfil vale também aqui.

const express = require('express');
const {
  parseListQuery, parseReadBody, parsePreferencesBody, preferencesFromRows, serializeNotification,
} = require('../notifications');

module.exports = function notificationsRoutes(pool, auth) {
  const router = express.Router();

  const unreadCount = async (userId) => {
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
      [userId],
    );
    return rows[0]?.n ?? 0;
  };

  router.get('/notifications', auth, async (req, res) => {
    const parsed = parseListQuery(req.query);
    if (parsed.errors) return res.status(422).json({ error: 'Filtro inválido', code: 'validation_failed', fields: parsed.errors });
    const { unreadOnly, limit, kinds, before } = parsed.value;
    const params = [req.user.userId];
    let filter = '';
    if (unreadOnly) filter += ' AND n.read_at IS NULL';
    if (kinds) {
      params.push(kinds);
      filter += ` AND n.kind = ANY($${params.length}::text[])`;
    }
    if (before) {
      params.push(before);
      filter += ` AND n.created_at < $${params.length}::timestamptz`;
    }
    params.push(limit + 1);
    try {
      const { rows } = await pool.query(
        `SELECT n.id, n.kind, n.title, n.summary, n.href, n.demand_id, n.process_id, n.connection_id,
                n.organization_id, n.created_at, n.read_at, p.name AS actor_name
           FROM notifications n
           LEFT JOIN profiles p ON p.user_id = n.actor_user_id
          WHERE n.user_id = $1${filter}
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT $${params.length}`,
        params,
      );
      res.json({
        notifications: rows.slice(0, limit).map(serializeNotification),
        unreadCount: await unreadCount(req.user.userId),
        hasMore: rows.length > limit,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.post('/notifications/read', auth, async (req, res) => {
    const parsed = parseReadBody(req.body);
    if (parsed.errors) return res.status(422).json({ error: 'Confira os campos', code: 'validation_failed', fields: parsed.errors });
    try {
      const params = [req.user.userId];
      let filter = '';
      if (!parsed.value.all) {
        params.push(parsed.value.ids);
        filter = ' AND id = ANY($2::uuid[])';
      }
      const { rowCount } = await pool.query(
        `UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL${filter}`,
        params,
      );
      res.json({ updated: rowCount ?? 0, unreadCount: await unreadCount(req.user.userId) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.get('/notifications/preferences', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT kind, in_app, email FROM notification_preferences WHERE user_id = $1',
        [req.user.userId],
      );
      res.json({ preferences: preferencesFromRows(rows) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.put('/notifications/preferences', auth, async (req, res) => {
    const parsed = parsePreferencesBody(req.body);
    if (parsed.errors) return res.status(422).json({ error: 'Confira os campos', code: 'validation_failed', fields: parsed.errors });
    try {
      await pool.query(
        `INSERT INTO notification_preferences (user_id, kind, in_app, email, updated_at)
         SELECT $1, p.kind, p.in_app, p.email, NOW()
           FROM unnest($2::text[], $3::boolean[], $4::boolean[]) AS p(kind, in_app, email)
         ON CONFLICT (user_id, kind) DO UPDATE
           SET in_app = EXCLUDED.in_app, email = EXCLUDED.email, updated_at = NOW()`,
        [req.user.userId, parsed.value.map((p) => p.kind), parsed.value.map((p) => p.inApp),
          parsed.value.map((p) => p.email)],
      );
      const { rows } = await pool.query(
        'SELECT kind, in_app, email FROM notification_preferences WHERE user_id = $1',
        [req.user.userId],
      );
      res.json({ preferences: preferencesFromRows(rows) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
