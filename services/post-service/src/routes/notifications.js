// Central de notificações do post_db (T-05-16; migração 039). O portal junta
// esta lista com a do user-service (`api.notifications`).
//
// - GET  /notifications?unread=1&limit=&kind=a,b&before=<ISO>&institution=1
//   Avisos da conta e, com `institution=1` e conta do Poder Público validado
//   (própria ou por vínculo, T29), os do órgão (encaminhamento recebido etc.).
// - POST /notifications/read            `{ ids: [...] }` ou `{ all: true }`
// - GET  /notifications/preferences     todos os tipos, aplicativo e e-mail
// - PUT  /notifications/preferences     `{ preferences: [{ kind, inApp, email }] }`

const express = require('express');
const {
  parseListQuery, parseReadBody, parsePreferencesBody, preferencesFromRows, serializeNotification,
} = require('../notifications');
const { evaluateGovernmentActor } = require('../institutional/gate');

const COLUMNS = `id, kind, title, summary, href, demand_id, process_id, organization_id, created_at, read_at`;

module.exports = function notificationsRoutes({ pool, auth, institutionStatus }) {
  const router = express.Router();

  /** Órgão do Poder Público da conta, quando pedido; falha = só os avisos da conta. */
  async function organizationOf(req, wanted) {
    if (!wanted || typeof institutionStatus !== 'function') return null;
    try {
      const result = evaluateGovernmentActor(req.user, await institutionStatus(req));
      return result.allowed ? result.organizationId : null;
    } catch (err) {
      console.error(`[notifications] órgão indisponível: ${err.message}`);
      return null;
    }
  }

  const wantsInstitution = (req) => ['1', 'true'].includes(String(req.query.institution ?? req.body?.institution ?? ''));
  const recipient = `(user_id = $1 OR ($2::uuid IS NOT NULL AND organization_id = $2::uuid))`;

  router.get('/notifications', auth, async (req, res) => {
    const parsed = parseListQuery(req.query);
    if (parsed.errors) return res.status(422).json({ error: 'Filtro inválido', code: 'validation_failed', fields: parsed.errors });
    const { unreadOnly, limit, kinds, before } = parsed.value;
    try {
      const organizationId = await organizationOf(req, wantsInstitution(req));
      const params = [req.user.userId, organizationId];
      let filter = '';
      if (unreadOnly) filter += ' AND read_at IS NULL';
      if (kinds) {
        params.push(kinds);
        filter += ` AND kind = ANY($${params.length}::text[])`;
      }
      if (before) {
        params.push(before);
        filter += ` AND created_at < $${params.length}::timestamptz`;
      }
      params.push(limit + 1);
      const list = await pool.query(
        `SELECT ${COLUMNS} FROM notifications
          WHERE ${recipient}${filter}
          ORDER BY created_at DESC, id DESC
          LIMIT $${params.length}`,
        params,
      );
      const count = await pool.query(
        `SELECT count(*)::int AS n FROM notifications WHERE ${recipient} AND read_at IS NULL`,
        [req.user.userId, organizationId],
      );
      const rows = list.rows.slice(0, limit);
      res.json({
        notifications: rows.map(serializeNotification),
        unreadCount: count.rows[0]?.n ?? 0,
        hasMore: list.rows.length > limit,
        organizationScope: organizationId != null,
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
      const organizationId = await organizationOf(req, wantsInstitution(req));
      const params = [req.user.userId, organizationId];
      let filter = '';
      if (!parsed.value.all) {
        params.push(parsed.value.ids);
        filter = ` AND id = ANY($3::uuid[])`;
      }
      const { rowCount } = await pool.query(
        `UPDATE notifications SET read_at = NOW() WHERE ${recipient} AND read_at IS NULL${filter}`,
        params,
      );
      const count = await pool.query(
        `SELECT count(*)::int AS n FROM notifications WHERE ${recipient} AND read_at IS NULL`,
        [req.user.userId, organizationId],
      );
      res.json({ updated: rowCount ?? 0, unreadCount: count.rows[0]?.n ?? 0 });
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
