// Laço de recálculo dos rankings e selos (T21).
//
// O recálculo é de fundo: a leitura pública nunca espera por ele e nunca roda
// agregação. `DM_RANKING_INTERVAL_MS` controla o período (padrão 5 min; 0
// desliga o laço — útil em teste e no e2e, que chamam `refreshNow()`).

const store = require('./store');

const DEFAULT_INTERVAL_MS = 300_000;

function createRankingService({ pool, refresh = store.refresh } = {}) {
  if (!pool) throw new Error('createRankingService exige o pool');
  let timer = null;
  let running = false;
  const state = { lastRun: null, lastError: null, runs: 0 };

  async function refreshNow(options = {}) {
    if (running) return null;
    running = true;
    try {
      const result = await refresh(pool, options);
      state.lastRun = result;
      state.lastError = null;
      state.runs += 1;
      return result;
    } catch (err) {
      state.lastError = err;
      throw err;
    } finally {
      running = false;
    }
  }

  /** Nunca lança: uma passada que falha só fica registrada em `state`. */
  function tick() {
    refreshNow().catch((err) => console.error('[ranking] recálculo falhou:', err.message));
  }

  function start(intervalMs = DEFAULT_INTERVAL_MS) {
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval <= 0) return null;
    stop();
    tick();
    timer = setInterval(tick, interval);
    timer.unref?.();
    return timer;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { refreshNow, start, stop, state };
}

module.exports = { createRankingService, DEFAULT_INTERVAL_MS };
