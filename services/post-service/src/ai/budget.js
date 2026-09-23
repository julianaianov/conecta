// Custo controlado e disjuntor dos recursos de IA (T23).
//
// Duas contenções, as duas no processo (como o cache do painel do governo, da
// T22): não são estado compartilhado, e perder o estado só custa uma chamada.
//
//   - **Limite de chamadas por período**: um teto por serviço e um por conta
//     numa janela deslizante (padrão: 60 e 10 por hora). Atingido o teto, a
//     rota responde `available: false, reason: 'limite'` — o fluxo não trava,
//     só fica sem sugestão. O registro append-only (`ai_usage_log`) guarda
//     cada chamada, inclusive as recusadas pelo limite, para auditar custo.
//   - **Disjuntor**: 3 falhas seguidas do modelo suspendem o recurso por 5
//     minutos (`circuito`). Um sucesso zera a contagem. Assim uma indisponi-
//     bilidade da API não vira uma fila de esperas de 15 s por requisição.
//
// Nada aqui bloqueia o fluxo do usuário: quem chama trata "indisponível" como
// resposta normal (falha aberta).

const { DEFAULTS } = require('./constants');

function createAiBudget({
  windowMs = DEFAULTS.windowMs,
  maxCallsPerWindow = DEFAULTS.maxCallsPerWindow,
  maxCallsPerUserPerWindow = DEFAULTS.maxCallsPerUserPerWindow,
  breakerThreshold = DEFAULTS.breakerThreshold,
  breakerCooldownMs = DEFAULTS.breakerCooldownMs,
  now = () => Date.now(),
} = {}) {
  /** Momentos das chamadas, no total e por conta. */
  let calls = [];
  const byUser = new Map();
  let consecutiveFailures = 0;
  let openedUntil = 0;

  const prune = (list, cutoff) => list.filter((at) => at > cutoff);

  const sweep = () => {
    const cutoff = now() - windowMs;
    calls = prune(calls, cutoff);
    for (const [user, list] of byUser) {
      const kept = prune(list, cutoff);
      if (kept.length) byUser.set(user, kept);
      else byUser.delete(user);
    }
  };

  return {
    /**
     * Pode chamar o modelo agora? `{ allowed }` ou `{ allowed: false, reason }`
     * com `limite` ou `circuito`.
     */
    check(userId = null) {
      if (openedUntil > now()) return { allowed: false, reason: 'circuito', retryAt: openedUntil };
      sweep();
      if (calls.length >= maxCallsPerWindow) return { allowed: false, reason: 'limite', scope: 'servico' };
      const mine = userId ? (byUser.get(userId) ?? []) : [];
      if (userId && mine.length >= maxCallsPerUserPerWindow) {
        return { allowed: false, reason: 'limite', scope: 'conta' };
      }
      return { allowed: true };
    },
    /** Marca uma chamada que de fato saiu para o modelo. */
    record(userId = null) {
      const at = now();
      calls.push(at);
      if (userId) byUser.set(userId, [...(byUser.get(userId) ?? []), at]);
    },
    succeeded() {
      consecutiveFailures = 0;
      openedUntil = 0;
    },
    failed() {
      consecutiveFailures += 1;
      if (consecutiveFailures >= breakerThreshold) openedUntil = now() + breakerCooldownMs;
    },
    /** Estado para diagnóstico (rota /ai/status e testes). */
    snapshot() {
      sweep();
      return {
        callsInWindow: calls.length,
        maxCallsPerWindow,
        maxCallsPerUserPerWindow,
        consecutiveFailures,
        breakerOpen: openedUntil > now(),
      };
    },
    reset() {
      calls = [];
      byUser.clear();
      consecutiveFailures = 0;
      openedUntil = 0;
    },
  };
}

module.exports = { createAiBudget };
