const express = require('express');
const { ensureProfile, isForeignKeyViolation } = require('../profile-provision');
const { isUuid } = require('../security');

const MAX_CONTENT_LENGTH = 2000;

// Valida o corpo de recados e depoimentos; devolve o erro ou os valores limpos.
function socialInput(body, userId, { allowSelf }) {
  const targetUserId = body?.targetUserId;
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!targetUserId || !content) return { status: 400, error: 'targetUserId e content são obrigatórios' };
  if (!isUuid(targetUserId)) return { status: 404, error: 'Perfil de destino não encontrado' };
  if (content.length > MAX_CONTENT_LENGTH) return { status: 400, error: `O texto aceita até ${MAX_CONTENT_LENGTH} caracteres` };
  if (!allowSelf && targetUserId.toLowerCase() === String(userId).toLowerCase()) {
    return { status: 400, error: 'Não é possível escrever um depoimento para si mesmo' };
  }
  return { targetUserId, content };
}

module.exports = (pool, auth, operation) => {
  if (typeof operation !== 'function') throw new Error('social routes exigem o middleware de operação');
  const router = express.Router();

  // ── Scraps (Recados) ──────────────────────────────────────
  router.get('/scraps/:userId', async (req, res) => {
    if (!isUuid(req.params.userId)) return res.json([]);
    try {
      const { rows } = await pool.query(
        `SELECT s.id, s.author_id, s.target_user_id, s.content, s.created_at,
                p.name AS author_name, p.avatar_url AS author_avatar
           FROM scraps s
           LEFT JOIN profiles p ON p.user_id = s.author_id
          WHERE s.target_user_id = $1
          ORDER BY s.created_at DESC`,
        [req.params.userId]
      );
      res.json(rows.map((r) => ({
        id: r.id,
        authorId: r.author_id,
        authorName: r.author_name || '',
        authorAvatar: r.author_avatar || null,
        targetUserId: r.target_user_id,
        content: r.content,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.post('/scraps', auth, async (req, res) => {
    const input = socialInput(req.body, req.user.userId, { allowSelf: true });
    if (input.error) return res.status(input.status).json({ error: input.error });
    const { targetUserId, content } = input;
    try {
      await ensureProfile(pool, req.user);
      const { rows } = await pool.query(
        `INSERT INTO scraps (author_id, target_user_id, content, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, author_id, target_user_id, content, created_at`,
        [req.user.userId, targetUserId, content]
      );
      const s = rows[0];
      const author = await pool.query('SELECT name, avatar_url FROM profiles WHERE user_id = $1', [req.user.userId]);
      const p = author.rows[0];
      res.status(201).json({
        id: s.id,
        authorId: s.author_id,
        authorName: p?.name || req.user.name || '',
        authorAvatar: p?.avatar_url || req.user.avatarUrl || null,
        targetUserId: s.target_user_id,
        content: s.content,
        createdAt: s.created_at,
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) return res.status(404).json({ error: 'Perfil de destino não encontrado' });
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // ── Testimonials (Depoimentos) ───────────────────────────
  router.get('/testimonials/:userId', async (req, res) => {
    if (!isUuid(req.params.userId)) return res.json([]);
    try {
      const { rows } = await pool.query(
        `SELECT t.id, t.author_id, t.target_user_id, t.content, t.created_at,
                p.name AS author_name, p.avatar_url AS author_avatar
           FROM testimonials t
           LEFT JOIN profiles p ON p.user_id = t.author_id
          WHERE t.target_user_id = $1
          ORDER BY t.created_at DESC`,
        [req.params.userId]
      );
      res.json(rows.map((r) => ({
        id: r.id,
        authorId: r.author_id,
        authorName: r.author_name || '',
        authorAvatar: r.author_avatar || null,
        targetUserId: r.target_user_id,
        content: r.content,
        createdAt: r.created_at,
      })));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.post('/testimonials', auth, async (req, res) => {
    const input = socialInput(req.body, req.user.userId, { allowSelf: false });
    if (input.error) return res.status(input.status).json({ error: input.error });
    const { targetUserId, content } = input;
    try {
      await ensureProfile(pool, req.user);
      const { rows } = await pool.query(
        `INSERT INTO testimonials (author_id, target_user_id, content, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, author_id, target_user_id, content, created_at`,
        [req.user.userId, targetUserId, content]
      );
      const t = rows[0];
      const author = await pool.query('SELECT name, avatar_url FROM profiles WHERE user_id = $1', [req.user.userId]);
      const p = author.rows[0];
      res.status(201).json({
        id: t.id,
        authorId: t.author_id,
        authorName: p?.name || req.user.name || '',
        authorAvatar: p?.avatar_url || req.user.avatarUrl || null,
        targetUserId: t.target_user_id,
        content: t.content,
        createdAt: t.created_at,
      });
    } catch (err) {
      if (isForeignKeyViolation(err)) return res.status(404).json({ error: 'Perfil de destino não encontrado' });
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // ── Ranking ──────────────────────────────────────────────
  router.get('/ranking', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT user_id, name, avatar_url, role, profile_type, city
           FROM profiles
          WHERE role IN ('partner', 'agent', 'member')
          ORDER BY name ASC`
      );
      const partners = rows.filter((p) => p.role === 'partner');
      const agents = rows.filter((p) => p.role === 'agent');
      const members = rows.filter((p) => p.role === 'member');

      const formatRank = (list) => list.map((p) => ({
        userId: p.user_id,
        name: p.name,
        avatarUrl: p.avatar_url || null,
        role: p.role,
        profileType: p.profile_type || null,
        city: p.city || null,
      }));

      // A pontuação e a posição dependem dos eventos persistidos no post-service.
      // Este serviço fornece somente a identidade real dos perfis elegíveis.
      const result = {
        partner: formatRank(partners),
        agent: formatRank(agents),
        volunteer: formatRank(members),
      };

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // ── Notificações ─────────────────────────────────────────
  // TODO(fonte-da-verdade): Modelo de Conexão §08/§34 — falta central de notificações persistente (nova demanda compatível, prazo, solicitação de análise, atualização de processo, mensagem, documento) com e-mail como alerta (sem provedor hoje); o "recado" é legado.
  router.get('/notifications', auth, async (req, res) => {
    try {
      const userId = req.user.userId;
      const notifs = [];

      // Conexões pendentes recebidas
      const pendingConn = await pool.query(
        `SELECT c.id, c.type, c.created_at, p.name AS from_name
           FROM connections c
           LEFT JOIN profiles p ON p.user_id = c.from_user_id
          WHERE c.to_user_id = $1 AND c.status = 'pending'
          ORDER BY c.created_at DESC LIMIT 10`,
        [userId]
      );
      for (const r of pendingConn.rows) {
        notifs.push({
          id: `n-conn-${r.id}`,
          kind: 'connection',
          actorName: r.from_name || '',
          postId: '',
          postTitle: 'Conexão',
          summary: r.from_name ? `${r.from_name} enviou uma solicitação de conexão` : 'Uma solicitação de conexão foi recebida',
          icon: 'link',
          href: `/conexoes/${r.id}`,
          createdAt: r.created_at,
        });
      }

      // Conexões aceitas
      const acceptedConn = await pool.query(
        `SELECT c.id, c.type, c.updated_at, p.name AS to_name
           FROM connections c
           LEFT JOIN profiles p ON p.user_id = c.to_user_id
          WHERE c.from_user_id = $1 AND c.status = 'accepted'
          ORDER BY c.updated_at DESC LIMIT 10`,
        [userId]
      );
      for (const r of acceptedConn.rows) {
        notifs.push({
          id: `n-acc-${r.id}`,
          kind: 'connection',
          actorName: r.to_name || '',
          postId: '',
          postTitle: 'Conexão aceita',
          summary: r.to_name ? `${r.to_name} aceitou sua conexão` : 'Sua conexão foi aceita',
          icon: 'check',
          href: `/conexoes/${r.id}`,
          createdAt: r.updated_at,
        });
      }

      // Mensagens não lidas na conversa da conexão (T27): a outra parte
      // escreveu depois da última leitura desta conta. Uma consulta só.
      const unreadMessages = await pool.query(
        `SELECT c.id, c.last_message_at,
                p.name AS other_name,
                (SELECT count(*)::int FROM connection_messages m
                  WHERE m.connection_id = c.id AND m.author_id <> $1
                    AND m.created_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)) AS unread
           FROM connections c
           LEFT JOIN connection_message_reads r ON r.connection_id = c.id AND r.user_id = $1
           LEFT JOIN profiles p ON p.user_id = CASE WHEN c.from_user_id = $1 THEN c.to_user_id ELSE c.from_user_id END
          WHERE (c.from_user_id = $1 OR c.to_user_id = $1)
            AND c.last_message_at IS NOT NULL
            AND c.last_message_at > COALESCE(r.last_read_at, 'epoch'::timestamptz)
          ORDER BY c.last_message_at DESC LIMIT 10`,
        [userId]
      );
      for (const r of unreadMessages.rows) {
        if (!r.unread) continue;
        notifs.push({
          id: `n-msg-${r.id}-${new Date(r.last_message_at).getTime()}`,
          kind: 'message',
          actorName: r.other_name || '',
          postId: '',
          postTitle: 'Conversa',
          summary: r.unread > 1
            ? `enviou ${r.unread} mensagens na conexão`
            : 'enviou uma mensagem na conexão',
          icon: 'message',
          href: `/conexoes/${r.id}`,
          createdAt: r.last_message_at,
        });
      }

      // Recados recebidos
      const scraps = await pool.query(
        `SELECT s.id, s.created_at, p.name AS author_name
           FROM scraps s
           LEFT JOIN profiles p ON p.user_id = s.author_id
          WHERE s.target_user_id = $1
          ORDER BY s.created_at DESC LIMIT 10`,
        [userId]
      );
      for (const r of scraps.rows) {
        notifs.push({
          id: `n-scr-${r.id}`,
          kind: 'comment',
          actorName: r.author_name || '',
          postId: '',
          postTitle: 'Recado',
          summary: r.author_name ? `${r.author_name} deixou um recado no seu perfil` : 'Um recado foi deixado no seu perfil',
          icon: 'chat',
          href: `/perfil/${userId}`,
          createdAt: r.created_at,
        });
      }

      notifs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      res.json(notifs.slice(0, 20));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // ── Admin Snapshot (Base de usuários e conexões para overview) ─
  // Leitura para a operação da plataforma (decisões de implementação §2: o dm-api
  // não aprova nada). Só contas de DM_OPERATION_USER_IDS; sem telefone e sem o
  // conteúdo privado das conexões (mensagem, desfecho, eventos).
  router.get('/admin-snapshot', auth, operation, async (_req, res) => {
    try {
      const [users, communities, connections, scraps, testimonials] = await Promise.all([
        pool.query(
          `SELECT user_id, name, role, profile_type, neighborhood, city, member_since, created_at, avatar_url
             FROM profiles ORDER BY name ASC`
        ),
        pool.query(
          `SELECT id, name, description, category, member_count, image_url
             FROM communities ORDER BY member_count DESC`
        ),
        pool.query(
          `SELECT
             c.id, c.type, c.status, c.post_id, c.post_title, c.created_at, c.updated_at,
             p_from.user_id as from_user_id, p_from.name as from_name, p_from.avatar_url as from_avatar_url, p_from.role as from_role, p_from.profile_type as from_profile_type,
             p_to.user_id as to_user_id, p_to.name as to_name, p_to.avatar_url as to_avatar_url, p_to.role as to_role, p_to.profile_type as to_profile_type
           FROM connections c
           LEFT JOIN profiles p_from ON p_from.user_id = c.from_user_id
           LEFT JOIN profiles p_to ON p_to.user_id = c.to_user_id
           ORDER BY c.created_at DESC`
        ),
        pool.query(
          `SELECT s.id, s.author_id, s.target_user_id, s.content, s.created_at,
                  p.name AS author_name, p.avatar_url AS author_avatar
             FROM scraps s
             LEFT JOIN profiles p ON p.user_id = s.author_id
            ORDER BY s.created_at DESC`
        ),
        pool.query(
          `SELECT t.id, t.author_id, t.target_user_id, t.content, t.created_at,
                  p.name AS author_name, p.avatar_url AS author_avatar
             FROM testimonials t
             LEFT JOIN profiles p ON p.user_id = t.author_id
            ORDER BY t.created_at DESC`
        ),
      ]);

      res.json({
        users: users.rows.map((u) => ({
          id: u.user_id,
          name: u.name,
          role: u.role,
          profileType: u.profile_type,
          neighborhood: u.neighborhood || null,
          city: u.city || null,
          memberSince: u.member_since || u.created_at,
          avatarUrl: u.avatar_url || null,
        })),
        communities: communities.rows.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          category: c.category,
          memberCount: c.member_count,
          imageUrl: c.image_url,
        })),
        connections: connections.rows.map((r) => ({
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
          message: '',
          postId: r.post_id || null,
          postTitle: r.post_title || null,
          outcome: null,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          events: [],
        })),
        scraps: scraps.rows.map((r) => ({
          id: r.id,
          authorId: r.author_id,
          authorName: r.author_name || '',
          authorAvatar: r.author_avatar || null,
          targetUserId: r.target_user_id,
          content: r.content,
          createdAt: r.created_at,
        })),
        testimonials: testimonials.rows.map((r) => ({
          id: r.id,
          authorId: r.author_id,
          authorName: r.author_name || '',
          authorAvatar: r.author_avatar || null,
          targetUserId: r.target_user_id,
          content: r.content,
          createdAt: r.created_at,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
