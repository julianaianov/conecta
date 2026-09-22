// T06a — enviar demanda para análise exige Agente de Transformação com
// instituição (CNPJ + CNAE) validada no dm-gestao (Fluxo 2, etapas 01 e 02;
// decisão 3: Líder Comunitário e Representante de Bairro só enviam depois de
// vincular o perfil a uma instituição com CNPJ validada).
//
// O estado vem do user-service (GET /me/institution/status) pelo cliente de
// src/institution-gate.js: cache curto e falha fechada (sem resposta confiável,
// o envio é recusado com 503). Rascunho não passa por aqui: o Agente pode
// preparar a demanda enquanto a instituição está em validação.
//
// A gestão confere de novo na publicação: user_db.organizations.validation_status
// da demanda.organization_id precisa continuar `validada` (contrato em
// dm-docs/docs/gestao/04-modelagem-de-dados.md §3).

const { normalizeRole } = require('../roles');

/**
 * Decide se a conta pode enviar demanda. `access` é o retorno do lookup
 * (`{ kind, status, canActInstitutionally, organizationId }`). Retorna
 * `{ allowed: true, organizationId }` ou `{ allowed: false, httpStatus, code, error, validationStatus }`.
 */
function evaluateDemandAuthor(user, access) {
  if (normalizeRole(user?.role, user?.profileType) !== 'agent') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'demand_author_not_agent',
      error: 'Só Agentes de Transformação publicam demandas',
    };
  }
  const validated = access?.kind === 'agente_transformacao' && access?.canActInstitutionally === true
    && access?.status === 'validada';
  if (!validated) {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'institution_not_validated',
      error: 'Para enviar a demanda, a instituição (CNPJ + CNAE) precisa estar validada pela plataforma',
      validationStatus: access?.status ?? null,
    };
  }
  if (typeof access.organizationId !== 'string' || !access.organizationId) {
    // Validada, mas sem o id da instituição: não há como vincular a demanda.
    return {
      allowed: false,
      httpStatus: 503,
      code: 'institution_unavailable',
      error: 'Não foi possível confirmar a instituição do Agente',
    };
  }
  return { allowed: true, organizationId: access.organizationId };
}

/**
 * Middleware (depois de `auth`) para o envio da demanda. Em caso de sucesso,
 * `req.demandAuthor = { organizationId }`.
 */
function requireValidatedAgent(lookup) {
  return async (req, res, next) => {
    if (normalizeRole(req.user?.role, req.user?.profileType) !== 'agent') {
      const denied = evaluateDemandAuthor(req.user, null);
      return res.status(denied.httpStatus).json({ error: denied.error, code: denied.code });
    }
    let access;
    try {
      access = await lookup(req);
    } catch (err) {
      console.error(`[demand-gate] ${err.message}`);
      return res.status(503).json({ error: 'Não foi possível confirmar a validação institucional' });
    }
    const result = evaluateDemandAuthor(req.user, access);
    if (!result.allowed) {
      const body = { error: result.error, code: result.code };
      if (result.code === 'institution_not_validated') body.validationStatus = result.validationStatus;
      return res.status(result.httpStatus).json(body);
    }
    req.demandAuthor = { organizationId: result.organizationId };
    return next();
  };
}

module.exports = { evaluateDemandAuthor, requireValidatedAgent };
