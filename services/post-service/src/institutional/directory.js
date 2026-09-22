// Diretório dos órgãos do Poder Público validados (T14), lido do user-service
// pela rede interna (DM_INTERNAL_USER_API_URL) com o token do próprio
// representante: GET /institutions/government (busca por nome, esfera,
// município e UF) e GET /institutions/government/:organizationId. Projeção
// pública (sem contatos nem representante). Serve à escolha do órgão de
// destino de um encaminhamento e à confirmação, no servidor, de que o destino
// é um órgão validado.
//
// `search(req, filters)` resolve `[]` ou a lista; `byId(req, id)` resolve o
// órgão ou `null` (404). Os dois lançam quando o user-service não responde.

const DEFAULT_TIMEOUT_MS = 3000;

/** Projeção do user-service (snake_case) → retrato usado no acompanhamento. */
function toGovernmentOrganization(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.organization_id !== 'string') return null;
  return {
    organizationId: raw.organization_id,
    name: String(raw.trade_name || raw.legal_name || '').trim() || 'Órgão do Poder Público',
    legalName: raw.legal_name ?? null,
    governmentSphere: ['municipal', 'estadual', 'federal'].includes(raw.government_sphere) ? raw.government_sphere : null,
    department: raw.department ?? null,
    competenceAreas: Array.isArray(raw.competence_areas) ? raw.competence_areas : [],
    territory: raw.territory ?? null,
    municipality: raw.municipality ?? null,
    uf: typeof raw.uf === 'string' ? raw.uf.toUpperCase() : null,
  };
}

function createGovernmentDirectoryClient({
  baseUrl = process.env.DM_INTERNAL_USER_API_URL,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const base = typeof baseUrl === 'string' ? baseUrl.replace(/\/+$/, '') : '';

  async function get(req, path) {
    if (!base) throw new Error('DM_INTERNAL_USER_API_URL não configurada');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        headers: { authorization: req.headers?.authorization ?? '' },
        signal: controller.signal,
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`user-service respondeu ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async search(req, { q, sphere, municipality, uf, limit } = {}) {
      const query = new URLSearchParams();
      if (q) query.set('q', q);
      if (sphere) query.set('sphere', sphere);
      if (municipality) query.set('municipality', municipality);
      if (uf) query.set('uf', uf);
      if (limit) query.set('limit', String(limit));
      const body = await get(req, `/institutions/government?${query.toString()}`);
      if (!body || !Array.isArray(body.organizations)) throw new Error('resposta do diretório inválida');
      return body.organizations.map(toGovernmentOrganization).filter(Boolean);
    },
    async byId(req, organizationId) {
      const body = await get(req, `/institutions/government/${encodeURIComponent(organizationId)}`);
      return body ? toGovernmentOrganization(body) : null;
    },
  };
}

module.exports = { createGovernmentDirectoryClient, toGovernmentOrganization };
