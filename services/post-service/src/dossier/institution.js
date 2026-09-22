// Identificação do Agente para o dossiê: projeção pública da instituição
// validada no user-service (GET /:userId/institution, sem contatos), lida pela
// rede interna (DM_INTERNAL_USER_API_URL). Não precisa do token do usuário:
// a geração também roda depois da publicação feita pelo dm-gestao.
//
// Resolve com o objeto (snake_case), `null` quando não há instituição validada
// (404) e lança erro quando o user-service não responde (a geração tenta de novo).

const DEFAULT_TIMEOUT_MS = 3000;

function createPublicInstitutionClient({
  baseUrl = process.env.DM_INTERNAL_USER_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';
  return async function fetchInstitution(userId) {
    if (!base) throw new Error('DM_INTERNAL_USER_API_URL não configurada');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}/${encodeURIComponent(userId)}/institution`, { signal: controller.signal });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`user-service respondeu ${res.status}`);
      const body = await res.json();
      if (!body || typeof body !== 'object') throw new Error('resposta de instituição inválida');
      return body;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createPublicInstitutionClient };
