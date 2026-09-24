// Clientes do user-service usados pela T15, pela rede interna
// (DM_INTERNAL_USER_API_URL) e sempre com o token do próprio usuário: o
// user-service continua decidindo quem pode o quê (só o destinatário aceita,
// só o remetente cancela, Poder Público sem validação recebe 403).
//
// - perfil de apoio: GET /me/partner-profile (null quando a conta não tem);
// - conexões: POST /connections (com `demandId`), GET /connections/:id,
//   PUT /connections/:id.
//
// Falha de rede ou resposta inesperada vira 503 `connections_unavailable` ou
// `partner_profile_unavailable` (HttpError de src/demand/store.js); os erros
// de regra do user-service passam adiante com o mesmo status.

const { HttpError } = require('../demand/store');

const DEFAULT_TIMEOUT_MS = 3000;

function createUserServiceCaller({
  baseUrl = process.env.DM_INTERNAL_USER_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';
  return async function call(req, method, path, body) {
    if (!base) throw new Error('DM_INTERNAL_USER_API_URL não configurada');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: { authorization: req.headers?.authorization ?? '', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await res.json().catch(() => null);
      return { status: res.status, body: payload };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Perfil de apoio da conta; `get(req)` resolve o perfil ou `null`.
 * `match(req, criteria)` (T30) lista os perfis de apoio que cruzam os critérios
 * da demanda (`GET /partner-profiles/match`), com o token do Agente.
 */
function createPartnerProfileClient(options = {}) {
  const call = options.call ?? createUserServiceCaller(options);
  return {
    async get(req) {
      const res = await call(req, 'GET', '/me/partner-profile');
      if (res.status === 404) return null;
      if (res.status !== 200 || !res.body || typeof res.body !== 'object') {
        throw new Error(`user-service respondeu ${res.status}`);
      }
      return res.body.exists === false ? null : res.body;
    },
    async match(req, criteria = {}) {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(criteria)) {
        if (Array.isArray(value)) { if (value.length) query.set(key, value.join(',')); }
        else if (typeof value === 'string' && value.trim()) query.set(key, value.trim());
        else if (typeof value === 'number') query.set(key, String(value));
      }
      const qs = query.toString();
      try {
        const res = await call(req, 'GET', `/partner-profiles/match${qs ? `?${qs}` : ''}`);
        if (res.status !== 200 || !res.body || !Array.isArray(res.body.candidates)) {
          throw new Error(`user-service respondeu ${res.status}`);
        }
        return res.body.candidates;
      } catch (err) {
        if (err instanceof HttpError) throw err;
        console.error(`[interests] user-service match: ${err?.message ?? err}`);
        throw new HttpError(503, {
          error: 'Não foi possível consultar os perfis de apoio agora. Tente de novo.',
          code: 'partner_profile_unavailable',
        });
      }
    },
  };
}

/** Conexão do user-service → forma usada aqui (camelCase já vem do user-service). */
function toConnection(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    type: raw.type,
    status: raw.status,
    fromUserId: raw.from?.userId ?? null,
    toUserId: raw.to?.userId ?? null,
    demandId: raw.demandId ?? null,
    postId: raw.postId ?? null,
  };
}

function unavailable(err) {
  if (err instanceof HttpError) return err;
  console.error(`[interests] user-service: ${err?.message ?? err}`);
  return new HttpError(503, {
    error: 'Não foi possível falar com o serviço de conexões agora. Tente de novo.',
    code: 'connections_unavailable',
  });
}

/** Resposta de erro do user-service → HttpError com o mesmo sentido. */
function ruleError(res) {
  const message = typeof res.body?.error === 'string' ? res.body.error : `Erro ${res.status}`;
  if (res.status === 400) return new HttpError(422, { error: message, code: 'validation_failed', fields: {} });
  if (res.status === 403) return new HttpError(403, { ...(res.body ?? {}), error: message });
  if (res.status === 404) return new HttpError(404, { error: message, code: 'connection_not_found' });
  if (res.status === 409) return new HttpError(409, { error: message, code: 'connection_conflict' });
  return null;
}

function createConnectionsClient(options = {}) {
  const call = options.call ?? createUserServiceCaller(options);
  async function run(fn) {
    try {
      return await fn();
    } catch (err) {
      throw unavailable(err);
    }
  }
  return {
    create(req, input) {
      return run(async () => {
        const res = await call(req, 'POST', '/connections', input);
        if (res.status === 201) {
          const connection = toConnection(res.body);
          if (connection) return connection;
        }
        throw ruleError(res) ?? new Error(`POST /connections respondeu ${res.status}`);
      });
    },
    get(req, id) {
      return run(async () => {
        const res = await call(req, 'GET', `/connections/${encodeURIComponent(id)}`);
        if (res.status === 404) return null;
        if (res.status === 200) {
          const connection = toConnection(res.body);
          if (connection) return connection;
        }
        throw ruleError(res) ?? new Error(`GET /connections respondeu ${res.status}`);
      });
    },
    update(req, id, status) {
      return run(async () => {
        const res = await call(req, 'PUT', `/connections/${encodeURIComponent(id)}`, { status });
        if (res.status === 200) {
          const connection = toConnection(res.body);
          if (connection) return connection;
        }
        throw ruleError(res) ?? new Error(`PUT /connections respondeu ${res.status}`);
      });
    },
  };
}

module.exports = {
  createUserServiceCaller,
  createPartnerProfileClient,
  createConnectionsClient,
  toConnection,
};
