// Clientes internos do auth-service e do post-service usados pelos direitos do
// titular (T24). O user-service orquestra porque é quem tem a fila de
// solicitações (`user_db.data_subject_requests`) e o bucket de uploads.
//
// As chamadas vão pela rede interna (`DM_INTERNAL_AUTH_API_URL`,
// `DM_INTERNAL_POST_API_URL`) **com o token do próprio titular**: nenhum
// serviço aceita pedido de dados em nome de outra conta. Falha fechada — sem
// resposta confiável, a exportação e a eliminação são recusadas (503), nunca
// entregues pela metade sem aviso.

const DEFAULT_TIMEOUT_MS = 10_000;

class ServiceUnavailable extends Error {
  constructor(service, detail) {
    super(`${service}: ${detail}`);
    this.service = service;
  }
}

function createServiceClient({
  name,
  baseUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';

  return async function call(path, { method = 'GET', authorization, body } = {}) {
    if (!base) throw new ServiceUnavailable(name, 'URL interna não configurada');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          authorization: authorization ?? '',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 204) return null;
      if (!res.ok) throw new ServiceUnavailable(name, `respondeu ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err instanceof ServiceUnavailable) throw err;
      throw new ServiceUnavailable(name, err?.name === 'AbortError' ? 'tempo esgotado' : String(err?.message ?? err));
    } finally {
      clearTimeout(timer);
    }
  };
}

/** `{ accountData, checkPassword, anonymize }` no auth-service. */
function createAuthClient(options = {}) {
  const call = createServiceClient({
    name: 'auth-service', baseUrl: process.env.DM_INTERNAL_AUTH_API_URL, ...options,
  });
  return {
    accountData: (authorization) => call('/me/account-data', { authorization }),
    /** `true` quando a senha confere; `false` quando não. */
    async checkPassword(authorization, password) {
      try {
        await call('/me/password-check', { method: 'POST', authorization, body: { password } });
        return true;
      } catch (err) {
        if (err instanceof ServiceUnavailable && /respondeu 401/.test(err.message)) return false;
        throw err;
      }
    },
    anonymize: (authorization, protocol) => call('/me/anonymize', { method: 'POST', authorization, body: { protocol } }),
  };
}

/** `{ data, anonymize }` no post-service. */
function createPostClient(options = {}) {
  const call = createServiceClient({
    name: 'post-service', baseUrl: process.env.DM_INTERNAL_POST_API_URL, ...options,
  });
  return {
    data: (authorization) => call('/me/privacy/data', { authorization }),
    anonymize: (authorization, protocol) => call('/me/privacy/anonymize', {
      method: 'POST', authorization, body: { protocol },
    }),
  };
}

module.exports = { ServiceUnavailable, createServiceClient, createAuthClient, createPostClient };
