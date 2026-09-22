// Gate institucional do Poder Público (Fluxo 3, etapa 02: "após a validação, o
// Poder Público terá acesso a um ambiente institucional").
//
// O estado da validação mora no user_db (organizations.validation_status,
// mantido pelo dm-gestao). O post-service consulta o user-service em
// GET /me/institution/status com o próprio token do usuário, pela rede interna
// (DM_INTERNAL_USER_API_URL). Falha fechado: sem resposta confiável, a ação
// institucional é recusada (503). Cache curto por conta para não consultar a
// cada requisição.
//
// A regra equivalente para o Agente enviar demanda (decisão 3, T06a) está em
// src/demand/gate.js, que reutiliza `createInstitutionStatusClient`.

const { normalizeRole } = require('./roles');

const DEFAULT_TIMEOUT_MS = 2000;
const VALIDATED_TTL_MS = 60_000;
const NOT_VALIDATED_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 5_000;

/**
 * Cliente do estado institucional. `lookup(req)` devolve
 * `{ kind, status, canActInstitutionally, organizationId }` ou lança erro (rede, timeout,
 * resposta inválida, URL não configurada).
 */
function createInstitutionStatusClient({
  baseUrl = process.env.DM_INTERNAL_USER_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => Date.now(),
} = {}) {
  const cache = new Map();
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';

  return async function lookup(req) {
    const userId = req.user?.userId;
    const cached = userId ? cache.get(userId) : null;
    if (cached && cached.expiresAt > now()) return cached.value;
    if (!base) throw new Error('DM_INTERNAL_USER_API_URL não configurada');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}/me/institution/status`, {
        headers: { authorization: req.headers.authorization ?? '' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`user-service respondeu ${res.status}`);
      const body = await res.json();
      if (!body || typeof body.canActInstitutionally !== 'boolean') throw new Error('resposta de status inválida');
      const value = {
        kind: body.kind ?? null,
        status: body.status ?? null,
        canActInstitutionally: body.canActInstitutionally,
        organizationId: typeof body.organizationId === 'string' ? body.organizationId : null,
      };
      if (userId) {
        if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
        cache.set(userId, {
          value,
          expiresAt: now() + (value.canActInstitutionally ? VALIDATED_TTL_MS : NOT_VALIDATED_TTL_MS),
        });
      }
      return value;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Middleware (depois de `auth`): Poder Público só age com cadastro validado. */
function requireValidatedGovernment(lookup) {
  return async (req, res, next) => {
    if (normalizeRole(req.user?.role, req.user?.profileType) !== 'government') return next();
    let access;
    try {
      access = await lookup(req);
    } catch (err) {
      console.error(`[institution-gate] ${err.message}`);
      return res.status(503).json({ error: 'Não foi possível confirmar a validação institucional' });
    }
    if (access.canActInstitutionally) return next();
    return res.status(403).json({
      error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
      code: 'institution_not_validated',
      validationStatus: access.status,
    });
  };
}

module.exports = { createInstitutionStatusClient, requireValidatedGovernment };
