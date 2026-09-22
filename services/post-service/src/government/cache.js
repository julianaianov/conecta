// Cache curto do painel do Poder Público (T22).
//
// "Monitoramento em tempo real" aqui é consulta a cada abertura, com cache de
// 60 s por (órgão × recorte × período × filtros) e índices (migração 019): o
// painel acompanha o território sem que cada requisição repita a agregação, e
// sem laço de pré-agregação como o dos rankings (T21), que agrega a plataforma
// inteira e por isso é materializado.
//
// É um Map com TTL e teto de entradas, no processo. Não é estado
// compartilhado: cada réplica tem o seu, e perder o cache só custa uma
// consulta. Falha de cache nunca falha a requisição.

const { CACHE_MAX_ENTRIES, CACHE_TTL_MS } = require('./constants');

function createIndicatorCache({ ttlMs = CACHE_TTL_MS, maxEntries = CACHE_MAX_ENTRIES, now = () => Date.now() } = {}) {
  const entries = new Map();

  const evict = () => {
    while (entries.size >= maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  };

  return {
    /** Valor em cache ou `null`. */
    get(key) {
      const hit = entries.get(key);
      if (!hit) return null;
      if (hit.expiresAt <= now()) {
        entries.delete(key);
        return null;
      }
      return hit.value;
    },
    set(key, value) {
      if (ttlMs <= 0) return value;
      evict();
      entries.set(key, { value, expiresAt: now() + ttlMs });
      return value;
    },
    /** Descarta o que o órgão tem em cache (depois de uma escrita dele). */
    invalidate(prefix) {
      for (const key of [...entries.keys()]) if (key.startsWith(prefix)) entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    get size() {
      return entries.size;
    },
    ttlMs,
  };
}

/** Chave estável do recorte (a ordem dos campos não depende do que veio na query). */
function cacheKey(organizationId, view, filters) {
  return [
    organizationId,
    view,
    filters.scope,
    filters.period.from ?? '-',
    filters.period.to,
    (filters.categories ?? []).join('|') || '-',
    (filters.priorities ?? []).join('|') || '-',
    filters.territory ?? '-',
  ].join('::');
}

module.exports = { createIndicatorCache, cacheKey };
