// Laço que grava o atraso das etapas (T-05-11; decisão 16: "o atraso é
// gravado, não só calculado na leitura").
//
// A cada `DM_EXECUTION_DELAY_INTERVAL_MS` (padrão 1 h; 0 desliga) chama
// `demand_record_stage_delays(hoje)` (migração 034): uma passada fecha os
// atrasos que deixaram de valer e abre os novos, com o evento público
// `etapa_atrasada`. Cada atualização de andamento já reavalia a própria
// demanda no banco; o laço cobre o prazo que vence sem ninguém escrever nada.
// A leitura nunca espera por ele: a projeção também deriva `atrasada` pela
// data (`isLate`).

const DEFAULT_INTERVAL_MS = 3_600_000;

function createDelayRecorder({ pool, now = () => new Date() } = {}) {
  if (!pool) throw new Error('createDelayRecorder exige o pool');
  let timer = null;
  let running = false;
  const state = { lastRun: null, lastOpened: null, lastError: null, runs: 0 };

  /** Uma passada; devolve quantos atrasos novos foram gravados (`null` se já havia uma em curso). */
  async function recordNow(today = now()) {
    if (running) return null;
    running = true;
    try {
      const day = typeof today === 'string' ? today.slice(0, 10) : today.toISOString().slice(0, 10);
      const { rows: [row] } = await pool.query('SELECT demand_record_stage_delays($1::date) AS opened', [day]);
      state.lastRun = new Date().toISOString();
      state.lastOpened = Number(row?.opened ?? 0);
      state.lastError = null;
      state.runs += 1;
      return state.lastOpened;
    } catch (err) {
      state.lastError = err;
      throw err;
    } finally {
      running = false;
    }
  }

  /** Nunca lança: a falha fica em `state` e a próxima passada tenta de novo. */
  function tick() {
    recordNow().catch((err) => console.error('[execução] gravação do atraso falhou:', err.message));
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

  return { recordNow, start, stop, state };
}

module.exports = { createDelayRecorder, DEFAULT_INTERVAL_MS };
