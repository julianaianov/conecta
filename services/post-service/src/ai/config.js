// Configuração dos recursos de IA pelo ambiente (T23, decisão 6).
//
// Flag desligada por padrão: sem `DM_AI_ENABLED=true`, nada chama o modelo e
// as rotas respondem `available: false` com o motivo `desligado`. Com a flag
// ligada e sem `ANTHROPIC_API_KEY`, o motivo é `sem_chave` — a interface diz
// que o recurso está indisponível e **não** inventa resultado.
//
// Variáveis (todas opcionais; os padrões estão em src/ai/constants.js):
//   DM_AI_ENABLED                    'true' liga; qualquer outra coisa desliga
//   ANTHROPIC_API_KEY                chave da API do Claude (SSM em produção)
//   DM_AI_MODEL                      id do modelo (padrão claude-opus-5)
//   DM_AI_TIMEOUT_MS                 timeout de cada chamada (padrão 15000)
//   DM_AI_MAX_RETRIES                retentativas por chamada (padrão 1)
//   DM_AI_MAX_CALLS_PER_HOUR         teto de chamadas por hora no serviço
//   DM_AI_MAX_CALLS_PER_USER_PER_HOUR teto por conta por hora
//
// Desligar por ambiente é só tirar `DM_AI_ENABLED`: o resto da aplicação não
// muda de comportamento (as rotas continuam existindo e respondendo o motivo).

const { DEFAULTS } = require('./constants');

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/** Inteiro positivo da variável, ou o padrão quando ausente/ inválida. */
function positiveInt(raw, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const value = Number(trimmed(raw));
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

/** Inteiro não negativo (0 é válido: desliga a retentativa). */
function countInt(raw, fallback, max) {
  const value = Number(trimmed(raw));
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > max) return fallback;
  return value;
}

/**
 * Lê o ambiente. Retorna sempre um objeto: `enabled`, `apiKey`, `model`,
 * limites e `unavailableReason` (`null` quando dá para chamar o modelo).
 */
function readAiConfig(env = process.env) {
  const enabled = trimmed(env.DM_AI_ENABLED).toLowerCase() === 'true';
  const apiKey = trimmed(env.ANTHROPIC_API_KEY);
  const model = trimmed(env.DM_AI_MODEL) || DEFAULTS.model;
  const config = {
    enabled,
    apiKey,
    model,
    timeoutMs: positiveInt(env.DM_AI_TIMEOUT_MS, DEFAULTS.timeoutMs, { min: 500, max: 120_000 }),
    maxRetries: countInt(env.DM_AI_MAX_RETRIES, DEFAULTS.maxRetries, 3),
    maxOutputTokens: DEFAULTS.maxOutputTokens,
    windowMs: DEFAULTS.windowMs,
    maxCallsPerWindow: positiveInt(env.DM_AI_MAX_CALLS_PER_HOUR, DEFAULTS.maxCallsPerWindow, { max: 100_000 }),
    maxCallsPerUserPerWindow: positiveInt(
      env.DM_AI_MAX_CALLS_PER_USER_PER_HOUR, DEFAULTS.maxCallsPerUserPerWindow, { max: 10_000 },
    ),
    breakerThreshold: DEFAULTS.breakerThreshold,
    breakerCooldownMs: DEFAULTS.breakerCooldownMs,
  };
  config.unavailableReason = !enabled ? 'desligado' : (apiKey ? null : 'sem_chave');
  return config;
}

module.exports = { readAiConfig };
