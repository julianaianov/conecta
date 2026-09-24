// Permissões delegadas por vínculo a uma organização (T29).
//
// Fonte: Arquitetura de Perfis §4 e §5 ("usuários individuais poderão estar
// vinculados a organizações e receber permissões delegadas"). O user-service
// devolve, em GET /me/institution/status, `delegation: { level, permissions,
// organizationName }` quando a conta não tem cadastro próprio mas tem vínculo
// ativo (migração user 013). Aqui a delegação vira o **papel efetivo**: uma
// conta de Membro da Comunidade com `publicar_demandas` numa instituição de
// Agente age como Agente; com `atuar_institucionalmente` num órgão, como
// Poder Público. A instituição continua tendo de estar validada (os gates de
// demanda e institucional conferem `status === 'validada'`).

const { normalizeRole } = require('./roles');

const DELEGATED_ROLE_RULES = [
  { role: 'agent', kind: 'agente_transformacao', permission: 'publicar_demandas' },
  { role: 'government', kind: 'poder_publico', permission: 'atuar_institucionalmente' },
];

/** Papel que a delegação empresta (`null` sem vínculo ou sem a permissão). */
function delegatedRole(access) {
  const delegation = access?.delegation;
  if (!delegation || !Array.isArray(delegation.permissions)) return null;
  const rule = DELEGATED_ROLE_RULES.find((r) => r.kind === access.kind && delegation.permissions.includes(r.permission));
  return rule ? rule.role : null;
}

/** A delegação inclui a permissão? */
function hasDelegatedPermission(access, permission) {
  return Array.isArray(access?.delegation?.permissions) && access.delegation.permissions.includes(permission);
}

/** Papel efetivo: o da conta quando já é Agente/Poder Público; senão, o delegado; senão, o da conta. */
function effectiveRole(user, access) {
  const own = normalizeRole(user?.role, user?.profileType);
  if (own === 'agent' || own === 'government') return own;
  return delegatedRole(access) ?? own;
}

/**
 * Middleware (depois de `auth`) que exige um dos papéis, aceitando a
 * delegação: quem já tem o papel passa sem consulta; quem não tem passa pelo
 * lookup do user-service e entra se a delegação emprestar o papel. Anota
 * `req.effectiveRole` e, quando consultou, `req.institutionAccess`. Sem lookup
 * configurado, vale só o papel da conta. Falha do lookup: 503.
 */
function requireEffectiveRole(lookup, roles, denied) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return async (req, res, next) => {
    const own = normalizeRole(req.user?.role, req.user?.profileType);
    if (allowed.includes(own)) {
      req.effectiveRole = own;
      return next();
    }
    if (typeof lookup === 'function') {
      let access;
      try {
        access = await lookup(req);
      } catch (err) {
        console.error(`[delegation] ${err.message}`);
        return res.status(503).json({ error: 'Não foi possível confirmar a validação institucional' });
      }
      const role = delegatedRole(access);
      if (role && allowed.includes(role)) {
        req.effectiveRole = role;
        req.institutionAccess = access;
        return next();
      }
    }
    return res.status(403).json(denied);
  };
}

module.exports = { delegatedRole, hasDelegatedPermission, effectiveRole, requireEffectiveRole };
