// Gate da área institucional (T13): só conta do Poder Público com cadastro
// institucional validado pelo dm-gestao (Fluxo 3, etapa 02: "após a validação,
// o Poder Público terá acesso a um ambiente institucional").
//
// Usa o mesmo cliente de src/institution-gate.js (GET /me/institution/status
// no user-service, cache curto, falha fechada com 503). Diferente de
// `requireValidatedGovernment`, que deixa passar as demais categorias, aqui a
// categoria também é exigida.

const { normalizeRole } = require('../roles');

/** Decide o acesso: `{ allowed: true, organizationId }` ou `{ allowed: false, httpStatus, code, error }`. */
function evaluateGovernmentActor(user, access) {
  if (normalizeRole(user?.role, user?.profileType) !== 'government') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'not_government',
      error: 'A atuação institucional é do Poder Público',
    };
  }
  const validated = access?.kind === 'poder_publico' && access?.canActInstitutionally === true
    && access?.status === 'validada';
  if (!validated) {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'institution_not_validated',
      error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
      validationStatus: access?.status ?? null,
    };
  }
  if (typeof access.organizationId !== 'string' || !access.organizationId) {
    return {
      allowed: false,
      httpStatus: 503,
      code: 'institution_unavailable',
      error: 'Não foi possível confirmar o órgão do Poder Público',
    };
  }
  return { allowed: true, organizationId: access.organizationId };
}

/** Middleware (depois de `auth`). Em sucesso, `req.government = { organizationId }`. */
function requireGovernmentActor(lookup) {
  return async (req, res, next) => {
    if (normalizeRole(req.user?.role, req.user?.profileType) !== 'government') {
      const denied = evaluateGovernmentActor(req.user, null);
      return res.status(denied.httpStatus).json({ error: denied.error, code: denied.code });
    }
    let access;
    try {
      access = await lookup(req);
    } catch (err) {
      console.error(`[institutional-gate] ${err.message}`);
      return res.status(503).json({ error: 'Não foi possível confirmar a validação institucional' });
    }
    const result = evaluateGovernmentActor(req.user, access);
    if (!result.allowed) {
      const body = { error: result.error, code: result.code };
      if (result.code === 'institution_not_validated') body.validationStatus = result.validationStatus;
      return res.status(result.httpStatus).json(body);
    }
    req.government = { organizationId: result.organizationId };
    return next();
  };
}

module.exports = { evaluateGovernmentActor, requireGovernmentActor };
