// Vínculo de usuários a organizações com níveis de permissão delegada (T29).
// Montada em `/` antes das rotas com `/:id` do perfil; público em
// `/api/users/me/organization/members*` e `/api/users/me/memberships*`.
//
// Fonte: Arquitetura de Perfis §4 ("vínculo/autorização") e §5 ("permissões
// delegadas"); Modelo de Conexão §32. Migração user 013; domínio em
// src/organization-members.js.
//
// Titular (conta do perfil dono da organização) ou membro ativo `gestor`:
//   GET  /me/organization/members               equipe (todos os estados)
//   GET  /me/organization/members/candidates?q= contas que podem ser convidadas
//   POST /me/organization/members               { userId, level }
//   PUT  /me/organization/members/:id           { level }
//   POST /me/organization/members/:id/remove
// Qualquer conta:
//   GET  /me/memberships                        convites em aberto e vínculo ativo
//   POST /me/memberships/:id/accept | /decline | /leave
//
// Regras: só instituição com cadastro institucional; convite só a conta com
// perfil, que não seja o titular, não tenha cadastro institucional próprio nem
// vínculo ativo em outra instituição (409 com código). A delegação em si é
// lida em GET /me/institution/status (routes/institutions.js).

const express = require('express');
const { isUuid } = require('../security');
const { ensureProfile } = require('../profile-provision');
const {
  LEVELS, LEVEL_LABELS, PERMISSIONS, PERMISSION_LABELS, LEVEL_PERMISSIONS, STATUSES, STATUS_LABELS,
  permissionsFor, hasPermission, isLevel,
} = require('../organization-members');

const CANDIDATES_LIMIT = 20;
const MEMBERS_LIMIT = 200;

const VOCABULARY = {
  levels: LEVELS.map((value) => ({ value, label: LEVEL_LABELS[value], permissions: LEVEL_PERMISSIONS[value] })),
  permissions: PERMISSIONS.map((value) => ({ value, label: PERMISSION_LABELS[value] })),
  statuses: STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
};

const MEMBER_SQL = `m.id, m.organization_id, m.user_id, m.level, m.status, m.invited_by, m.invited_at,
                    m.responded_at, m.ended_at, m.created_at, m.updated_at,
                    p.name AS user_name, p.avatar_url AS user_avatar_url, p.role AS user_role,
                    p.profile_type AS user_profile_type`;

const ORG_PUBLIC_SQL = `o.id AS organization_id, o.institution_kind, o.validation_status,
                        coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), o.org_name) AS organization_name`;

const likePattern = (value) => `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

function serializeMember(r) {
  return {
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    name: r.user_name || '',
    avatarUrl: r.user_avatar_url || null,
    role: r.user_role || null,
    profileType: r.user_profile_type || null,
    level: r.level,
    permissions: permissionsFor(r.level),
    status: r.status,
    invitedAt: r.invited_at,
    respondedAt: r.responded_at || null,
    endedAt: r.ended_at || null,
    updatedAt: r.updated_at,
  };
}

function serializeMembership(r) {
  return {
    id: r.id,
    level: r.level,
    permissions: permissionsFor(r.level),
    status: r.status,
    organization: {
      id: r.organization_id,
      name: r.organization_name || 'Instituição',
      kind: r.institution_kind,
      validationStatus: r.validation_status,
    },
    invitedAt: r.invited_at,
    respondedAt: r.responded_at || null,
    endedAt: r.ended_at || null,
    updatedAt: r.updated_at,
  };
}

/**
 * Instituição que a conta administra: a própria (titular) ou a de um vínculo
 * ativo com `gerir_vinculos`. `null` quando não administra nenhuma.
 */
async function managedOrganization(db, userId) {
  const own = await db.query(
    `SELECT ${ORG_PUBLIC_SQL}
       FROM organizations o JOIN profiles p ON p.id = o.profile_id
      WHERE p.user_id = $1 AND o.institution_kind IS NOT NULL`,
    [userId],
  );
  if (own.rows.length) return { ...own.rows[0], managerRole: 'titular' };
  const member = await db.query(
    `SELECT ${ORG_PUBLIC_SQL}, m.level
       FROM organization_members m JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1 AND m.status = 'ativo' AND o.institution_kind IS NOT NULL`,
    [userId],
  );
  const row = member.rows[0];
  if (row && hasPermission(row.level, 'gerir_vinculos')) return { ...row, managerRole: 'gestor' };
  return null;
}

module.exports = (pool, auth) => {
  const router = express.Router();

  const requireManager = async (req, res, next) => {
    try {
      const org = await managedOrganization(pool, req.user.userId);
      if (!org) {
        return res.status(403).json({
          error: 'A equipe é gerida pelo titular do cadastro institucional ou por um gestor da instituição',
          code: 'not_organization_manager',
        });
      }
      req.organization = org;
      return next();
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  router.get('/me/organization/members', auth, requireManager, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${MEMBER_SQL} FROM organization_members m
           LEFT JOIN profiles p ON p.user_id = m.user_id
          WHERE m.organization_id = $1
          ORDER BY (m.status = 'ativo') DESC, (m.status = 'convidado') DESC, m.created_at DESC
          LIMIT $2`,
        [req.organization.organization_id, MEMBERS_LIMIT],
      );
      res.json({
        vocabulary: VOCABULARY,
        organization: {
          id: req.organization.organization_id,
          name: req.organization.organization_name,
          kind: req.organization.institution_kind,
          validationStatus: req.organization.validation_status,
        },
        managerRole: req.organization.managerRole,
        members: rows.map(serializeMember),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.get('/me/organization/members/candidates', auth, requireManager, async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.replace(/\s+/g, ' ').trim() : '';
    if (q.length < 2 || q.length > 120) {
      return res.status(422).json({ error: 'Busque por pelo menos 2 caracteres', code: 'validation_failed', fields: { q: 'Entre 2 e 120 caracteres' } });
    }
    try {
      const { rows } = await pool.query(
        `SELECT p.user_id, p.name, p.avatar_url, p.role, p.profile_type
           FROM profiles p
          WHERE p.name ILIKE $2 ESCAPE '\\' AND p.anonymized_at IS NULL AND p.user_id <> $3
            AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.profile_id = p.id AND o.institution_kind IS NOT NULL)
            AND NOT EXISTS (SELECT 1 FROM organization_members m
                             WHERE m.user_id = p.user_id AND (m.status = 'ativo' OR (m.status = 'convidado' AND m.organization_id = $1)))
          ORDER BY p.name ASC
          LIMIT $4`,
        [req.organization.organization_id, likePattern(q), req.user.userId, CANDIDATES_LIMIT],
      );
      res.json({
        candidates: rows.map((r) => ({
          userId: r.user_id, name: r.name, avatarUrl: r.avatar_url || null, role: r.role, profileType: r.profile_type || null,
        })),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.post('/me/organization/members', auth, requireManager, async (req, res) => {
    const { userId, level } = req.body ?? {};
    const fields = {};
    if (!isUuid(userId)) fields.userId = 'Escolha uma conta';
    if (!isLevel(level)) fields.level = `Níveis: ${LEVELS.join(', ')}`;
    if (Object.keys(fields).length) return res.status(422).json({ error: 'Confira os campos', code: 'validation_failed', fields });
    if (String(userId).toLowerCase() === String(req.user.userId).toLowerCase()) {
      return res.status(409).json({ error: 'Você já faz parte da instituição', code: 'member_is_self' });
    }
    try {
      const { rows: target } = await pool.query(
        `SELECT p.user_id,
                EXISTS (SELECT 1 FROM organizations o WHERE o.profile_id = p.id AND o.institution_kind IS NOT NULL) AS has_own,
                EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = p.user_id AND m.status = 'ativo') AS has_active,
                EXISTS (SELECT 1 FROM organization_members m WHERE m.user_id = p.user_id AND m.status = 'convidado' AND m.organization_id = $2) AS has_invite
           FROM profiles p WHERE p.user_id = $1 AND p.anonymized_at IS NULL`,
        [userId, req.organization.organization_id],
      );
      const t = target[0];
      if (!t) return res.status(404).json({ error: 'Perfil não encontrado', code: 'profile_not_found' });
      if (t.has_own) return res.status(409).json({ error: 'Esta conta tem cadastro institucional próprio', code: 'member_has_own_institution' });
      if (t.has_active) return res.status(409).json({ error: 'Esta conta já atua em nome de outra instituição', code: 'member_already_linked' });
      if (t.has_invite) return res.status(409).json({ error: 'Já há um convite em aberto para esta conta', code: 'member_invite_exists' });
      const { rows } = await pool.query(
        `INSERT INTO organization_members (organization_id, user_id, level, invited_by) VALUES ($1, $2, $3, $4) RETURNING id`,
        [req.organization.organization_id, userId, level, req.user.userId],
      );
      const detail = await pool.query(
        `SELECT ${MEMBER_SQL} FROM organization_members m LEFT JOIN profiles p ON p.user_id = m.user_id WHERE m.id = $1`,
        [rows[0].id],
      );
      res.status(201).json({ member: serializeMember(detail.rows[0]) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  async function loadMember(id, organizationId) {
    if (!isUuid(id)) return null;
    const { rows } = await pool.query(
      `SELECT ${MEMBER_SQL} FROM organization_members m LEFT JOIN profiles p ON p.user_id = m.user_id
        WHERE m.id = $1 AND m.organization_id = $2`,
      [id, organizationId],
    );
    return rows[0] ?? null;
  }

  router.put('/me/organization/members/:id', auth, requireManager, async (req, res) => {
    const { level } = req.body ?? {};
    if (!isLevel(level)) return res.status(422).json({ error: 'Nível inválido', code: 'validation_failed', fields: { level: `Níveis: ${LEVELS.join(', ')}` } });
    try {
      const member = await loadMember(req.params.id, req.organization.organization_id);
      if (!member) return res.status(404).json({ error: 'Vínculo não encontrado', code: 'member_not_found' });
      if (!['convidado', 'ativo'].includes(member.status)) {
        return res.status(409).json({ error: 'Só vínculo em convite ou ativo muda de nível', code: 'member_closed' });
      }
      await pool.query('UPDATE organization_members SET level = $2 WHERE id = $1', [member.id, level]);
      const updated = await loadMember(member.id, req.organization.organization_id);
      res.json({ member: serializeMember(updated) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.post('/me/organization/members/:id/remove', auth, requireManager, async (req, res) => {
    try {
      const member = await loadMember(req.params.id, req.organization.organization_id);
      if (!member) return res.status(404).json({ error: 'Vínculo não encontrado', code: 'member_not_found' });
      if (member.status !== 'ativo') return res.status(409).json({ error: 'Só vínculo ativo é removido', code: 'member_closed' });
      await pool.query(`UPDATE organization_members SET status = 'removido' WHERE id = $1 AND status = 'ativo'`, [member.id]);
      const updated = await loadMember(member.id, req.organization.organization_id);
      res.json({ member: serializeMember(updated) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // ── A própria conta: convites e vínculo ───────────────────────────────────

  const MEMBERSHIP_SQL = `SELECT m.id, m.level, m.status, m.invited_at, m.responded_at, m.ended_at, m.updated_at, ${ORG_PUBLIC_SQL}
                            FROM organization_members m JOIN organizations o ON o.id = m.organization_id`;

  router.get('/me/memberships', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        `${MEMBERSHIP_SQL} WHERE m.user_id = $1 AND m.status IN ('convidado', 'ativo')
          ORDER BY (m.status = 'ativo') DESC, m.created_at DESC`,
        [req.user.userId],
      );
      const memberships = rows.map(serializeMembership);
      res.json({
        vocabulary: VOCABULARY,
        active: memberships.find((m) => m.status === 'ativo') ?? null,
        invites: memberships.filter((m) => m.status === 'convidado'),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  async function respond(req, res, fromStatus, toStatus) {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Vínculo não encontrado', code: 'membership_not_found' });
    try {
      await ensureProfile(pool, req.user);
      const { rows: existing } = await pool.query(
        `${MEMBERSHIP_SQL} WHERE m.id = $1 AND m.user_id = $2`,
        [req.params.id, req.user.userId],
      );
      const current = existing[0];
      if (!current) return res.status(404).json({ error: 'Vínculo não encontrado', code: 'membership_not_found' });
      if (current.status !== fromStatus) {
        return res.status(409).json({ error: `Este vínculo não está mais em "${STATUS_LABELS[current.status]}"`, code: 'membership_state' });
      }
      if (toStatus === 'ativo') {
        const { rows: active } = await pool.query(
          `SELECT 1 FROM organization_members WHERE user_id = $1 AND status = 'ativo'`,
          [req.user.userId],
        );
        if (active.length) return res.status(409).json({ error: 'Você já atua em nome de outra instituição; saia dela antes de aceitar', code: 'member_already_linked' });
      }
      await pool.query(
        `UPDATE organization_members SET status = $3 WHERE id = $1 AND user_id = $2 AND status = $4`,
        [current.id, req.user.userId, toStatus, fromStatus],
      );
      const { rows } = await pool.query(`${MEMBERSHIP_SQL} WHERE m.id = $1 AND m.user_id = $2`, [current.id, req.user.userId]);
      return res.json({ membership: serializeMembership(rows[0]) });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  }

  router.post('/me/memberships/:id/accept', auth, (req, res) => respond(req, res, 'convidado', 'ativo'));
  router.post('/me/memberships/:id/decline', auth, (req, res) => respond(req, res, 'convidado', 'recusado'));
  router.post('/me/memberships/:id/leave', auth, (req, res) => respond(req, res, 'ativo', 'saiu'));

  return router;
};

module.exports.VOCABULARY = VOCABULARY;
module.exports.managedOrganization = managedOrganization;
module.exports.serializeMember = serializeMember;
module.exports.serializeMembership = serializeMembership;
