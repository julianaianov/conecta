// Cliente do modelo (T23). Provedor aprovado: **API do Claude** (Anthropic),
// pela decisão 6 da fonte da verdade e pela regra global do workspace — as
// APIs do GPT/OpenAI não são usadas para raciocínio, análise ou geração de
// texto nesta plataforma.
//
// SDK oficial `@anthropic-ai/sdk`, modelo padrão `claude-opus-5`, saída presa
// a um esquema JSON (`output_config.format`) e esforço baixo, porque as
// tarefas do slide 23 são classificação e redação curta: é o ajuste mais
// barato que mantém a qualidade.
//
// O cliente é injetável: em teste, `createAiService` recebe um duplo e
// **nenhum teste chama a API de verdade**.

const { DEFAULTS } = require('./constants');

/** Erro de chamada ao modelo, com um código curto para o registro de uso. */
class ModelError extends Error {
  constructor(code, message, { retryable = false, status = null } = {}) {
    super(message);
    this.name = 'ModelError';
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/** Primeiro bloco de texto da resposta. */
function textOf(message) {
  const blocks = Array.isArray(message?.content) ? message.content : [];
  return blocks.filter((b) => b?.type === 'text').map((b) => b.text).join('').trim();
}

/**
 * Cliente do modelo. `sdk` existe para teste (um objeto com
 * `messages.create`); em produção, o `@anthropic-ai/sdk` é carregado aqui.
 */
function createModelClient({
  apiKey,
  model = DEFAULTS.model,
  timeoutMs = DEFAULTS.timeoutMs,
  maxRetries = DEFAULTS.maxRetries,
  maxOutputTokens = DEFAULTS.maxOutputTokens,
  sdk = null,
} = {}) {
  if (!sdk && !apiKey) return null;
  let client = sdk;
  const resolve = () => {
    if (client) return client;
    const Anthropic = require('@anthropic-ai/sdk');
    // `maxRetries: 0`: a retentativa é a daqui, contada e registrada.
    client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 0 });
    return client;
  };

  return {
    model,
    /**
     * Uma sugestão. Devolve `{ value, model, latencyMs, usage }` ou lança
     * `ModelError`. Quem chama trata o erro como "sem sugestão" (falha aberta).
     */
    async complete({ system, user, schema }) {
      const startedAt = Date.now();
      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          const response = await resolve().messages.create({
            model,
            max_tokens: maxOutputTokens,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: { effort: 'low', format: { type: 'json_schema', schema } },
          }, { timeout: timeoutMs });
          if (response?.stop_reason === 'refusal') {
            throw new ModelError('recusa', 'o modelo recusou a solicitação');
          }
          const raw = textOf(response);
          let value;
          try {
            value = JSON.parse(raw);
          } catch {
            throw new ModelError('resposta_invalida', 'o modelo respondeu fora do formato JSON');
          }
          return {
            value,
            model: response?.model ?? model,
            latencyMs: Date.now() - startedAt,
            usage: {
              inputTokens: response?.usage?.input_tokens ?? null,
              outputTokens: response?.usage?.output_tokens ?? null,
            },
          };
        } catch (err) {
          lastError = err instanceof ModelError ? err : classify(err);
          if (!lastError.retryable || attempt === maxRetries) throw lastError;
          await sleep(250 * (attempt + 1));
        }
      }
      throw lastError ?? new ModelError('erro', 'falha desconhecida ao chamar o modelo');
    },
  };
}

/** Erro do SDK/rede → `ModelError` com código curto. */
function classify(err) {
  const status = Number(err?.status);
  if (err?.name === 'APIConnectionTimeoutError' || err?.code === 'ETIMEDOUT' || /timeout/i.test(err?.message ?? '')) {
    return new ModelError('timeout', 'o modelo não respondeu no tempo esperado', { retryable: true });
  }
  if (status === 401 || status === 403) {
    return new ModelError('credencial', 'a chave de acesso ao modelo foi recusada', { status });
  }
  if (status === 429) {
    return new ModelError('limite_do_provedor', 'o provedor do modelo limitou as chamadas', { retryable: true, status });
  }
  if (Number.isFinite(status) && status >= 500) {
    return new ModelError('indisponivel', 'o provedor do modelo está indisponível', { retryable: true, status });
  }
  if (Number.isFinite(status)) {
    return new ModelError('requisicao', `o modelo recusou a requisição (${status})`, { status });
  }
  return new ModelError('erro', err?.message ? `falha ao chamar o modelo: ${err.message}` : 'falha ao chamar o modelo', {
    retryable: true,
  });
}

module.exports = { createModelClient, ModelError, classify, textOf };
