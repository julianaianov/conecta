// Domínio da inteligência artificial (T23): vocabulário igual ao da migração
// 022, leitura do ambiente com a flag desligada por padrão, o que sai da
// plataforma para o modelo (sem dado pessoal), contenção de custo e disjuntor,
// validação da resposta e o cliente do modelo.
//
// Nenhum teste chama a API do Claude: o cliente recebe um SDK duplo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  KINDS, KIND_AUDIENCE, KIND_LABELS, KIND_STAGE, STATUSES, CALL_OUTCOMES, DEFAULTS,
} = require('../src/ai/constants');
const { readAiConfig } = require('../src/ai/config');
const { createAiBudget } = require('../src/ai/budget');
const { createModelClient, ModelError, classify } = require('../src/ai/model');
const { buildPrompt, validateSuggestion, rationaleOf } = require('../src/ai/prompts');
const {
  demandContext, demandBrief, editalContext, governmentContext, interestContext, promptFields, scrubText,
} = require('../src/ai/redaction');
const { CATEGORIES, PRIORITIES } = require('../src/demand/constants');

const migration = fs.readFileSync(
  path.join(__dirname, '../migrations/022-ai-suggestions.sql'), 'utf8',
);

const DEMAND_ROW = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  author_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  author_name: 'Ana Agente',
  author_avatar: 'https://exemplo/ana.png',
  title: 'Reforma da quadra',
  description: 'A quadra está sem iluminação. Fale com Ana no (21) 99999-8888 ou ana@exemplo.com, CNPJ 12.345.678/0001-90, veja https://exemplo/foto.png',
  objective: 'Devolver a quadra ao uso',
  justification: 'Risco de acidente à noite',
  beneficiaries_estimate: 300,
  beneficiaries_profile: 'Crianças e jovens do bairro',
  priority: 'media',
  photo_ref: 'upload:1234',
  cep: '24210000',
  street: 'Rua das Flores',
  address_number: '100',
  address_complement: 'fundos',
  district: 'Centro',
  municipality: 'Niterói',
  uf: 'RJ',
  latitude: -22.9,
  longitude: -43.1,
  territory: 'Centro',
  has_physical_execution: true,
  total_amount_cents: 1_100_000,
  category: 'problema_urbano',
};

const RESOURCES = [
  { kind: 'necessario', resource_type: 'materiais' },
  { kind: 'necessario', resource_type: 'mao_de_obra' },
  { kind: 'contrapartida', resource_type: 'equipe' },
];

test('o vocabulário é o mesmo da migração 022', () => {
  for (const kind of KINDS) assert.match(migration, new RegExp(`'${kind}'`), `enum sem ${kind}`);
  for (const status of STATUSES) assert.match(migration, new RegExp(`'${status}'`));
  for (const outcome of CALL_OUTCOMES) assert.match(migration, new RegExp(`'${outcome}'`));
  // Os 5 recursos do slide 23, com rótulo e público.
  assert.equal(KINDS.length, 5);
  for (const kind of KINDS) {
    assert.ok(KIND_LABELS[kind], `sem rótulo: ${kind}`);
    assert.ok(['agente', 'poder_publico'].includes(KIND_AUDIENCE[kind]));
  }
  // Editais dependem de cadastro: identificado como em desenvolvimento.
  assert.equal(KIND_STAGE.sugestao_de_editais, 'em_desenvolvimento');
  assert.equal(KIND_STAGE.deteccao_de_urgencia, 'disponivel');
});

test('a migração 022 mantém a sugestão imutável e o registro de uso append-only', () => {
  assert.match(migration, /sugestão de IA não é excluída/);
  assert.match(migration, /o conteúdo da sugestão de IA não muda/);
  assert.match(migration, /o registro de uso da IA é somente acréscimo/);
  assert.match(migration, /a gestão só lê as sugestões de IA/);
});

test('a flag vem desligada e sem chave o recurso fica indisponível', () => {
  assert.equal(DEFAULTS.enabled, false);
  assert.equal(readAiConfig({}).enabled, false);
  assert.equal(readAiConfig({}).unavailableReason, 'desligado');
  assert.equal(readAiConfig({ DM_AI_ENABLED: 'false', ANTHROPIC_API_KEY: 'k' }).unavailableReason, 'desligado');
  assert.equal(readAiConfig({ DM_AI_ENABLED: 'true' }).unavailableReason, 'sem_chave');
  const ligado = readAiConfig({ DM_AI_ENABLED: 'true', ANTHROPIC_API_KEY: ' chave ' });
  assert.equal(ligado.unavailableReason, null);
  assert.equal(ligado.apiKey, 'chave');
  // Provedor aprovado: modelo do Claude (decisão 6; GPT não é usado).
  assert.equal(ligado.model, 'claude-opus-5');
  assert.equal(ligado.timeoutMs, DEFAULTS.timeoutMs);
  // Valores inválidos caem no padrão, nunca em "sem limite".
  const ajustado = readAiConfig({
    DM_AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'k',
    DM_AI_TIMEOUT_MS: 'abc', DM_AI_MAX_CALLS_PER_HOUR: '-3', DM_AI_MAX_RETRIES: '0',
  });
  assert.equal(ajustado.timeoutMs, DEFAULTS.timeoutMs);
  assert.equal(ajustado.maxCallsPerWindow, DEFAULTS.maxCallsPerWindow);
  assert.equal(ajustado.maxRetries, 0);
});

test('o que vai ao modelo não tem dado pessoal nem endereço fino', () => {
  const context = demandContext(DEMAND_ROW, RESOURCES);
  const serialized = JSON.stringify(context);
  for (const proibido of ['Ana Agente', 'ana@exemplo.com', '99999-8888', '12.345.678/0001-90',
    'Rua das Flores', '24210000', 'https://exemplo', 'upload:1234', DEMAND_ROW.author_id, DEMAND_ROW.id]) {
    assert.ok(!serialized.includes(proibido), `vazou para o prompt: ${proibido}`);
  }
  assert.ok(context.descricao.includes('[telefone removido]'));
  assert.ok(context.descricao.includes('[e-mail removido]'));
  assert.ok(context.descricao.includes('[documento removido]'));
  assert.ok(context.descricao.includes('[link removido]'));
  assert.deepEqual(context.recursos_necessarios, ['materiais', 'mao_de_obra']);
  assert.equal(context.municipio, 'Niterói');
  assert.equal(context.orcamento_total_reais, 11_000);
  // O resumo curto do brief não traz a descrição longa nem a justificativa.
  assert.ok(!('descricao' in demandBrief(DEMAND_ROW, RESOURCES)));
  // Os campos enviados ficam listados, para a auditoria de `prompt_fields`.
  const fields = promptFields(context);
  assert.ok(fields.includes('titulo'));
  assert.ok(fields.includes('recursos_necessarios[]'));
  assert.ok(!fields.some((f) => /nome|email|telefone|cep|latitude/.test(f)));
  assert.equal(scrubText('   '), null);
  assert.equal(scrubText('x'.repeat(3000)).length, 1_501);
});

test('interessados e editais vão ao modelo por referência numérica, sem identidade', () => {
  const interessados = interestContext([
    {
      id: 'iiiiiiii-iiii-4iii-8iii-iiiiiiiiiiii',
      accountCategory: 'partner',
      kind: 'apoio',
      offerTypes: ['materiais'],
      compatibilityScore: 50,
      compatibilityLevel: 'media',
      compatibilityReasons: ['Oferece 1 de 2 recursos necessários da demanda.'],
      user: { name: 'Bruno Patrocinador' },
    },
  ]);
  const serialized = JSON.stringify(interessados);
  assert.ok(!serialized.includes('Bruno Patrocinador'));
  assert.ok(!serialized.includes('iiiiiiii'));
  assert.equal(interessados[0].referencia, 1);
  assert.equal(interessados[0].compatibilidade_nota, 50);

  const editais = editalContext([{ id: 'x', title: 'Edital de Cultura', summary: 'Resumo', uf: 'rj' }]);
  assert.equal(editais[0].referencia, 1);
  assert.equal(editais[0].uf, 'RJ');
  assert.ok(!JSON.stringify(editais).includes('"id"'));
});

test('o relatório do governo leva só números agregados e o próprio órgão', () => {
  const context = governmentContext({
    organization: { name: 'Secretaria de Obras', governmentSphere: 'municipal', municipality: 'Niterói', uf: 'RJ' },
    scopeLabel: 'Jurisdição',
    period: { from: '2026-08-01', to: '2026-09-01' },
    indicators: { demandas_recebidas: 12, demandas_urgentes: 3 },
    territories: [{ label: 'Centro', total: 8 }],
    categories: [{ category: 'problema_urbano', total: 6 }],
  });
  assert.equal(context.indicadores.demandas_recebidas, 12);
  assert.equal(context.orgao, 'Secretaria de Obras');
  assert.ok(!JSON.stringify(context).includes('userId'));
});

test('a contenção de custo tem teto por serviço, por conta e disjuntor', () => {
  let agora = 1_000_000;
  const budget = createAiBudget({
    windowMs: 1_000, maxCallsPerWindow: 3, maxCallsPerUserPerWindow: 2,
    breakerThreshold: 2, breakerCooldownMs: 500, now: () => agora,
  });
  assert.equal(budget.check('a').allowed, true);
  budget.record('a');
  budget.record('a');
  assert.deepEqual(budget.check('a'), { allowed: false, reason: 'limite', scope: 'conta' });
  assert.equal(budget.check('b').allowed, true, 'o teto por conta não afeta outra conta');
  budget.record('b');
  assert.deepEqual(budget.check('b'), { allowed: false, reason: 'limite', scope: 'servico' });
  // A janela desliza.
  agora += 2_000;
  assert.equal(budget.check('a').allowed, true);
  // Disjuntor: duas falhas seguidas suspendem; o sucesso zera.
  budget.failed();
  assert.equal(budget.check('a').allowed, true);
  budget.failed();
  assert.equal(budget.check('a').reason, 'circuito');
  agora += 1_000;
  assert.equal(budget.check('a').allowed, true);
  budget.succeeded();
  assert.equal(budget.snapshot().consecutiveFailures, 0);
});

test('a resposta do modelo é validada campo a campo', () => {
  const ok = { categoria: CATEGORIES[0], territorio: 'Centro', confianca: 'alta', justificativa: 'porque sim' };
  assert.equal(validateSuggestion('organizacao_da_demanda', ok).valid, true);
  assert.equal(validateSuggestion('organizacao_da_demanda', { ...ok, categoria: 'outra' }).error, 'categoria');
  assert.equal(validateSuggestion('organizacao_da_demanda', 'texto').error, 'formato');
  assert.equal(validateSuggestion('deteccao_de_urgencia', {
    prioridade: PRIORITIES[3], sinais: ['risco'], confianca: 'media', justificativa: 'há risco',
  }).valid, true);
  // Referência fora da lista enviada é recusada: o modelo não inventa item.
  assert.equal(validateSuggestion('sugestao_de_editais', {
    editais: [{ referencia: 3, aderencia: 'alta', justificativa: 'combina' }], observacao: null,
  }, { references: 2 }).error, 'editais_itens');
  assert.equal(validateSuggestion('sugestao_de_editais', {
    editais: [], observacao: null,
  }, { references: 2 }).valid, true);
  assert.equal(validateSuggestion('conexao_com_patrocinadores', {
    patrocinadores: [{ referencia: 1, posicao: 1, justificativa: 'oferece o que falta' }], observacao: null,
  }, { references: 1 }).valid, true);
  assert.equal(validateSuggestion('relatorio_para_governo', {
    titulo: 'Relatório', resumo: 'Resumo', secoes: [{ titulo: 'A', texto: 'B' }], observacao: null,
  }).valid, true);
  assert.equal(rationaleOf('deteccao_de_urgencia', { justificativa: 'há risco' }), 'há risco');
});

test('o prompt carrega as regras da fonte e o esquema do recurso', () => {
  const prompt = buildPrompt('deteccao_de_urgencia', { titulo: 'x' });
  assert.match(prompt.system, /SUGESTÃO para revisão de uma pessoa/);
  assert.match(prompt.system, /Nunca invente/);
  assert.match(prompt.system, /Nunca peça, deduza nem escreva dado pessoal/);
  assert.match(prompt.user, /"titulo": "x"/);
  assert.equal(prompt.schema.additionalProperties, false);
  assert.throws(() => buildPrompt('inexistente', {}), /recurso de IA desconhecido/);
});

test('o cliente do modelo usa o Claude, respeita o esquema e tenta de novo só o que é transitório', async () => {
  const calls = [];
  const sdk = {
    messages: {
      create: async (params) => {
        calls.push(params);
        if (calls.length === 1) {
          const err = new Error('gateway');
          err.status = 503;
          throw err;
        }
        return {
          model: 'claude-opus-5',
          stop_reason: 'end_turn',
          content: [{ type: 'text', text: '{"prioridade":"alta","sinais":[],"confianca":"media","justificativa":"ok"}' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        };
      },
    },
  };
  const client = createModelClient({ sdk, model: 'claude-opus-5', maxRetries: 1 });
  const result = await client.complete(buildPrompt('deteccao_de_urgencia', {}));
  assert.equal(calls.length, 2, 'uma retentativa');
  assert.equal(calls[0].model, 'claude-opus-5');
  assert.equal(calls[0].output_config.format.type, 'json_schema');
  assert.equal(result.value.prioridade, 'alta');
  assert.equal(result.usage.inputTokens, 10);

  // Erro não transitório não é repetido.
  let tentativas = 0;
  const recusa = createModelClient({
    sdk: {
      messages: {
        create: async () => {
          tentativas += 1;
          const err = new Error('sem chave');
          err.status = 401;
          throw err;
        },
      },
    },
    maxRetries: 2,
  });
  await assert.rejects(() => recusa.complete(buildPrompt('deteccao_de_urgencia', {})), (err) => {
    assert.ok(err instanceof ModelError);
    assert.equal(err.code, 'credencial');
    return true;
  });
  assert.equal(tentativas, 1);

  // Recusa do modelo e resposta fora do JSON viram erro tratável.
  const refusal = createModelClient({
    sdk: { messages: { create: async () => ({ stop_reason: 'refusal', content: [] }) } }, maxRetries: 0,
  });
  await assert.rejects(() => refusal.complete(buildPrompt('deteccao_de_urgencia', {})), /recusou/);
  const invalido = createModelClient({
    sdk: { messages: { create: async () => ({ content: [{ type: 'text', text: 'não é json' }] }) } }, maxRetries: 0,
  });
  await assert.rejects(() => invalido.complete(buildPrompt('deteccao_de_urgencia', {})), /fora do formato JSON/);

  assert.equal(classify({ status: 429 }).retryable, true);
  assert.equal(classify({ status: 400 }).retryable, false);
  // Sem chave e sem SDK, não há cliente: a rota responde "indisponível".
  assert.equal(createModelClient({}), null);
});
