// Serviço de IA do post-service (T23). Une configuração, contenção de custo,
// disjuntor, cliente do modelo, validação da resposta e persistência.
//
// Contrato único, para as rotas não repetirem regra:
//
//   ai.status()                              → o que está ligado e por quê
//   ai.suggest({ kind, context, subject, user, evidence, references })
//       → { available: true, suggestion }    quando o modelo respondeu
//       → { available: false, reason, message } em qualquer outro caso
//
// **Nunca lança** por falha de IA: `suggest` devolve `available: false` e a
// rota responde 200 com o motivo, para o fluxo seguir sem IA (decisão 6:
// "nunca bloqueiam o fluxo se falharem"; falha aberta).
//
// Toda tentativa — inclusive a recusada por flag, chave, limite ou disjuntor —
// vira uma linha em `ai_usage_log` (append-only), para auditoria de uso e de
// custo.

const { KIND_AUDIENCE, KIND_LABELS, KIND_SOURCES, KIND_STAGE, KINDS, STAGE_NOTES, SUGGESTION_DISCLAIMER, SUGGESTION_LABEL, UNAVAILABLE_REASONS } = require('./constants');
const { readAiConfig } = require('./config');
const { createAiBudget } = require('./budget');
const { createModelClient } = require('./model');
const { buildPrompt, rationaleOf, validateSuggestion } = require('./prompts');
const { promptFields } = require('./redaction');
const store = require('./store');

const unavailable = (reason, extra = {}) => ({
  available: false,
  reason,
  message: UNAVAILABLE_REASONS[reason] ?? UNAVAILABLE_REASONS.erro,
  ...extra,
});

/**
 * @param {object} deps
 * @param {object} deps.pool         pool do post_db
 * @param {object} [deps.config]     retorno de readAiConfig (padrão: ambiente)
 * @param {object} [deps.model]      cliente do modelo (injetado nos testes)
 * @param {object} [deps.budget]     contenção de custo/disjuntor
 */
function createAiService({ pool, config = readAiConfig(), model, budget } = {}) {
  const limiter = budget ?? createAiBudget({
    windowMs: config.windowMs,
    maxCallsPerWindow: config.maxCallsPerWindow,
    maxCallsPerUserPerWindow: config.maxCallsPerUserPerWindow,
    breakerThreshold: config.breakerThreshold,
    breakerCooldownMs: config.breakerCooldownMs,
  });
  const client = model === undefined
    ? createModelClient({
      apiKey: config.apiKey,
      model: config.model,
      timeoutMs: config.timeoutMs,
      maxRetries: config.maxRetries,
      maxOutputTokens: config.maxOutputTokens,
    })
    : model;

  /** Motivo de não dar para chamar agora, ou `null`. */
  const blocked = (userId) => {
    if (config.unavailableReason) return config.unavailableReason;
    if (!client) return 'sem_chave';
    const check = limiter.check(userId);
    return check.allowed ? null : check.reason;
  };

  const features = () => KINDS.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    source: KIND_SOURCES[kind],
    audience: KIND_AUDIENCE[kind],
    stage: KIND_STAGE[kind],
    note: STAGE_NOTES[kind] ?? null,
  }));

  return {
    config,
    budget: limiter,
    /** Estado do recurso para a interface (e para o diagnóstico da operação). */
    status() {
      const reason = config.unavailableReason ?? (client ? null : 'sem_chave');
      const limits = limiter.snapshot();
      const effective = reason ?? (limits.breakerOpen ? 'circuito' : null);
      return {
        enabled: config.enabled,
        available: effective === null,
        reason: effective,
        message: effective ? (UNAVAILABLE_REASONS[effective] ?? UNAVAILABLE_REASONS.erro) : null,
        model: config.enabled ? config.model : null,
        label: SUGGESTION_LABEL,
        disclaimer: SUGGESTION_DISCLAIMER,
        features: features(),
        limits,
      };
    },

    /**
     * Gera uma sugestão e a grava. `subject` é `{ demandId }` ou
     * `{ organizationId }`; `evidence` são os números verificáveis que a
     * interface mostra ao lado; `references`, o tamanho da lista que o modelo
     * pode referenciar por número.
     */
    async suggest({ kind, context, subject = {}, user, evidence = {}, references = 0 }) {
      if (!KINDS.includes(kind)) throw new Error(`recurso de IA desconhecido: ${kind}`);
      const base = {
        kind,
        demandId: subject.demandId ?? null,
        organizationId: subject.organizationId ?? null,
        requestedBy: user?.userId ?? null,
        model: config.model,
      };
      const reason = blocked(user?.userId);
      if (reason) {
        await store.logUsage(pool, { ...base, outcome: reason, model: null });
        return unavailable(reason);
      }
      // Segunda contenção, que atravessa réplicas: o registro append-only.
      try {
        const used = await store.countCallsInWindow(pool, {
          windowMs: config.windowMs, requestedBy: user?.userId ?? null,
        });
        if (used.total >= config.maxCallsPerWindow || used.mine >= config.maxCallsPerUserPerWindow) {
          await store.logUsage(pool, { ...base, outcome: 'limite', model: null });
          return unavailable('limite');
        }
      } catch (err) {
        // Sem o histórico, vale o teto do processo. Não trava o fluxo.
        console.error(`[ai] não foi possível ler o uso recente: ${err.message}`);
      }

      const prompt = buildPrompt(kind, context);
      limiter.record(user?.userId ?? null);
      let result;
      try {
        result = await client.complete(prompt);
      } catch (err) {
        limiter.failed();
        const code = err?.code ?? 'erro';
        console.error(`[ai] ${kind}: ${err?.message ?? err}`);
        await store.logUsage(pool, { ...base, outcome: 'erro', errorCode: code });
        return unavailable('erro', { errorCode: code });
      }
      limiter.succeeded();

      const checked = validateSuggestion(kind, result.value, { references });
      if (!checked.valid) {
        await store.logUsage(pool, {
          ...base,
          model: result.model,
          outcome: 'resposta_invalida',
          errorCode: checked.error,
          latencyMs: result.latencyMs,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
        });
        return unavailable('resposta_invalida', { errorCode: checked.error });
      }

      const suggestion = await store.insertSuggestion(pool, {
        kind,
        demandId: base.demandId,
        organizationId: base.organizationId,
        requestedBy: user.userId,
        requesterRole: KIND_AUDIENCE[kind],
        model: result.model,
        promptFields: promptFields(context),
        payload: checked.value,
        rationale: rationaleOf(kind, checked.value),
        evidence,
      });
      await store.logUsage(pool, {
        ...base,
        model: result.model,
        outcome: 'sucesso',
        latencyMs: result.latencyMs,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        suggestionId: suggestion.id,
      });
      return { available: true, suggestion };
    },
  };
}

module.exports = { createAiService };
