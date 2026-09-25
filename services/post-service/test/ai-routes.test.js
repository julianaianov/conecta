// Rotas de inteligência artificial (T23) com banco e modelo simulados.
//
// **Nenhum teste chama a API do Claude**: o serviço recebe um cliente de
// modelo duplo, que também serve para conferir exatamente o que seria enviado.
// O ciclo contra PostgreSQL está em ai-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { createAiService } = require('../src/ai/service');
const { readAiConfig } = require('../src/ai/config');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRO = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG = '88888888-8888-4888-8888-888888888888';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SUGGESTION = '99999999-9999-4999-8999-999999999999';
const INTEREST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const EDITAL = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

const agentToken = (userId = AGENT) => jwt.sign(
  { userId, role: 'agent', profileType: 'ong', name: 'Ana Agente' }, SECRET,
);
const govToken = jwt.sign(
  { userId: GOV, role: 'government', profileType: 'secretaria', name: 'Carlos Representante' }, SECRET,
);

const DEMAND_ROW = {
  id: DEMAND,
  author_id: AGENT,
  author_name: 'Ana Agente',
  title: 'Reforma da quadra',
  description: 'A quadra está sem iluminação. Ligue para Ana no (21) 99999-8888.',
  objective: 'Devolver a quadra ao uso',
  justification: 'Risco de acidente',
  beneficiaries_estimate: 300,
  beneficiaries_profile: 'Crianças do bairro',
  priority: 'media',
  cep: '24210000',
  street: 'Rua das Flores',
  district: 'Centro',
  municipality: 'Niterói',
  uf: 'RJ',
  territory: 'Centro',
  has_physical_execution: true,
  total_amount_cents: 1_100_000,
  category: 'problema_urbano',
  status: 'em_analise',
  review_state: 'rascunho',
};

const VALIDATED_GOV = {
  kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG,
};
const GOV_PROFILE = {
  name: 'Secretaria de Obras', department: 'Zeladoria', governmentSphere: 'municipal',
  municipality: 'Niterói', uf: 'RJ', competenceAreas: ['Obras'],
};

/** Banco simulado com o mínimo de que as rotas de IA precisam. */
function fakePool({ interests = [], editais = [], suggestion = null, author = AGENT } = {}) {
  const inserted = [];
  const logged = [];
  const query = async (text, params = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
    if (/FROM demands d WHERE d\.id/.test(text)) {
      return { rows: [{ ...DEMAND_ROW, author_id: author }] };
    }
    // Antes do cronograma: a projeção do interesse lê a etapa oferecida (T-05-15).
    if (/FROM demand_interests i/.test(text)) return { rows: interests };
    if (/FROM demand_budget_items/.test(text) || /FROM demand_schedule_items/.test(text)
        || /FROM demand_goals/.test(text) || /FROM demand_documents/.test(text)) return { rows: [] };
    if (/FROM demand_resources/.test(text)) {
      return {
        rows: [
          { id: '1', position: 1, kind: 'necessario', resource_type: 'materiais', description: null },
          { id: '2', position: 2, kind: 'necessario', resource_type: 'mao_de_obra', description: null },
        ],
      };
    }
    if (/FROM government_actions/.test(text)) return { rows: editais };
    if (/FROM demand_interests i/.test(text)) return { rows: interests };
    if (/FROM ai_usage_log/.test(text)) return { rows: [{ total: 0, mine: 0 }] };
    if (/INSERT INTO ai_usage_log/.test(text)) { logged.push(params); return { rows: [] }; }
    if (/INSERT INTO ai_suggestions/.test(text)) {
      inserted.push(params);
      const [kind, demandId, organizationId, , , model, promptFields, payload, rationale, evidence] = params;
      return {
        rows: [{
          id: SUGGESTION,
          kind,
          demand_id: demandId,
          organization_id: organizationId,
          model,
          prompt_fields: promptFields,
          payload: JSON.parse(payload),
          rationale,
          evidence: JSON.parse(evidence),
          status: 'sugerida',
          reviewed_at: null,
          review_note: null,
          created_at: new Date('2026-09-22T12:00:00Z'),
        }],
      };
    }
    if (/SELECT .* FROM ai_suggestions WHERE id/.test(text)) {
      return { rows: suggestion ? [suggestion] : [] };
    }
    if (/UPDATE ai_suggestions/.test(text)) {
      return { rows: [{ ...suggestion, status: params[1], reviewed_at: new Date(), review_note: params[3] }] };
    }
    if (/FROM ai_suggestions/.test(text)) return { rows: suggestion ? [suggestion] : [] };
    if (/WITH\s+base AS/.test(text) && /totals AS/.test(text)) {
      return {
        rows: [{
          totals: { received: 12, urgent: 3, forwarded: 2, in_execution: 1, concluded: 4, supported: 5 },
          by_territory: [{ label: 'Centro', uf: 'RJ', total: 8, urgent: 2, concluded: 3 }],
          by_category: [{ category: 'problema_urbano', total: 6, urgent: 2, concluded: 1 }],
          accountability: { beneficiaries: '900', reports: 2 },
          results: 7,
        }],
      };
    }
    throw new Error(`Consulta inesperada: ${text}`);
  };
  return { inserted, logged, query, async connect() { return { query, release() {} }; } };
}

/** Cliente de modelo duplo: guarda o prompt e devolve o que for combinado. */
function fakeModel(reply) {
  const seen = [];
  return {
    seen,
    client: {
      model: 'claude-opus-5',
      async complete(prompt) {
        seen.push(prompt);
        if (reply instanceof Error) throw reply;
        return {
          value: typeof reply === 'function' ? reply(prompt) : reply,
          model: 'claude-opus-5',
          latencyMs: 12,
          usage: { inputTokens: 100, outputTokens: 40 },
        };
      },
    },
  };
}

const enabledConfig = () => readAiConfig({ DM_AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'chave-de-teste' });

async function withServer(pool, aiOptions, callback, { access = VALIDATED_GOV, profile = GOV_PROFILE } = {}) {
  const ai = createAiService({ pool, ...aiOptions });
  const server = createApp({
    pool,
    ai,
    secret: SECRET,
    operationUserIds: new Set(),
    uploadStorage: null,
    dossierService: null,
    rankings: null,
    institutionStatus: async () => access,
    governmentProfile: async () => profile,
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`, ai);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, path, token, body) => fetch(`${base}${path}`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

test('flag desligada: a rota diz que está indisponível e não chama o modelo', async () => {
  const pool = fakePool();
  const { client, seen } = fakeModel({});
  await withServer(pool, { config: readAiConfig({}), model: client }, async (base) => {
    const status = await (await fetch(`${base}/ai/status`, {
      headers: { authorization: `Bearer ${agentToken()}` },
    })).json();
    assert.equal(status.enabled, false);
    assert.equal(status.available, false);
    assert.equal(status.reason, 'desligado');
    assert.equal(status.model, null);
    assert.equal(status.features.length, 5);
    assert.equal(status.features.find((f) => f.kind === 'sugestao_de_editais').stage, 'em_desenvolvimento');

    const res = await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken());
    assert.equal(res.status, 200, 'sem IA o fluxo segue: não é erro');
    const body = await res.json();
    assert.equal(body.available, false);
    assert.equal(body.reason, 'desligado');
    assert.ok(body.message.includes('desligados'));
    assert.equal(body.suggestion, undefined, 'nada é inventado no lugar');
  });
  assert.equal(seen.length, 0, 'o modelo não foi chamado');
  assert.equal(pool.inserted.length, 0);
  assert.equal(pool.logged.length, 1, 'a tentativa recusada fica registrada');
  assert.equal(pool.logged[0][5], 'desligado');
});

test('ligada sem chave: indisponível por falta de credencial', async () => {
  const pool = fakePool();
  await withServer(pool, { config: readAiConfig({ DM_AI_ENABLED: 'true' }), model: null }, async (base) => {
    const status = await (await fetch(`${base}/ai/status`, {
      headers: { authorization: `Bearer ${agentToken()}` },
    })).json();
    assert.equal(status.enabled, true);
    assert.equal(status.available, false);
    assert.equal(status.reason, 'sem_chave');
    const body = await (await post(base, `/demands/${DEMAND}/ai/organization`, agentToken())).json();
    assert.equal(body.reason, 'sem_chave');
  });
});

test('organização e urgência: sugestão gravada, marcada como IA, sem dado pessoal no prompt', async () => {
  const pool = fakePool();
  const { client, seen } = fakeModel((prompt) => (/prioridade/.test(prompt.system)
    ? { prioridade: 'urgente', sinais: ['risco à noite'], confianca: 'alta', justificativa: 'há risco' }
    : { categoria: 'problema_urbano', territorio: 'Centro', eixos: ['iluminacao'], confianca: 'alta', justificativa: 'é urbano' }));
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const org = await (await post(base, `/demands/${DEMAND}/ai/organization`, agentToken())).json();
    assert.equal(org.available, true);
    assert.equal(org.aiGenerated, true);
    assert.equal(org.label, 'Sugestão de IA');
    assert.equal(org.suggestion.status, 'sugerida');
    assert.equal(org.suggestion.payload.categoria, 'problema_urbano');
    assert.deepEqual(org.suggestion.payload.eixos, ['iluminacao']);
    assert.equal(org.suggestion.aiGenerated, true);
    // Número verificável ao lado do texto.
    assert.equal(org.suggestion.evidence.categoria_atual, 'problema_urbano');

    const urg = await (await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken())).json();
    assert.equal(urg.suggestion.payload.prioridade, 'urgente');
    assert.equal(urg.suggestion.rationale, 'há risco');
  });
  assert.equal(seen.length, 2);
  const enviado = JSON.stringify(seen);
  for (const proibido of ['Ana Agente', '99999-8888', 'Rua das Flores', '24210000', AGENT, DEMAND]) {
    assert.ok(!enviado.includes(proibido), `vazou para o modelo: ${proibido}`);
  }
  assert.equal(pool.inserted.length, 2);
  assert.ok(pool.inserted[0][6].includes('titulo'), 'os campos enviados ficam gravados');
  assert.equal(pool.logged.filter((l) => l[5] === 'sucesso').length, 2);
});

test('falha do modelo não derruba o fluxo e abre o disjuntor', async () => {
  const pool = fakePool();
  const erro = new Error('provedor fora');
  erro.code = 'indisponivel';
  const { client } = fakeModel(erro);
  await withServer(pool, { config: enabledConfig(), model: client }, async (base, ai) => {
    for (let i = 0; i < 3; i += 1) {
      const body = await (await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken())).json();
      assert.equal(body.available, false);
      assert.equal(body.reason, 'erro');
    }
    assert.equal(ai.budget.snapshot().breakerOpen, true);
    const body = await (await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken())).json();
    assert.equal(body.reason, 'circuito');
    assert.equal(ai.status().reason, 'circuito');
  });
  assert.equal(pool.inserted.length, 0);
});

test('resposta fora do formato é descartada, não "corrigida"', async () => {
  const pool = fakePool();
  const { client } = fakeModel({ categoria: 'inventada', confianca: 'alta', justificativa: 'x' });
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const body = await (await post(base, `/demands/${DEMAND}/ai/organization`, agentToken())).json();
    assert.equal(body.available, false);
    assert.equal(body.reason, 'resposta_invalida');
  });
  assert.equal(pool.inserted.length, 0);
  assert.equal(pool.logged[0][5], 'resposta_invalida');
});

test('teto de chamadas por conta: a sugestão para, o fluxo não', async () => {
  const pool = fakePool();
  const { client } = fakeModel({
    prioridade: 'alta', sinais: [], confianca: 'media', justificativa: 'ok',
  });
  const config = { ...enabledConfig(), maxCallsPerUserPerWindow: 1 };
  await withServer(pool, { config, model: client }, async (base) => {
    assert.equal((await (await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken())).json()).available, true);
    const segunda = await (await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken())).json();
    assert.equal(segunda.available, false);
    assert.equal(segunda.reason, 'limite');
  });
});

test('só o Agente autor pede e lê as sugestões da demanda', async () => {
  const pool = fakePool({ author: OUTRO });
  const { client } = fakeModel({});
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    // Outro Agente: a demanda não é dele → 404 (não revela a existência).
    assert.equal((await post(base, `/demands/${DEMAND}/ai/urgency`, agentToken())).status, 404);
    // Poder Público não usa as rotas da demanda.
    assert.equal((await post(base, `/demands/${DEMAND}/ai/urgency`, govToken)).status, 403);
    // Sem token.
    assert.equal((await fetch(`${base}/demands/${DEMAND}/ai/suggestions`)).status, 401);
  });
});

test('editais: sem base cadastrada, o recurso se declara em desenvolvimento', async () => {
  const pool = fakePool({ editais: [] });
  const { client, seen } = fakeModel({});
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const body = await (await post(base, `/demands/${DEMAND}/ai/editais`, agentToken())).json();
    assert.equal(body.available, false);
    assert.equal(body.reason, 'sem_base');
    assert.equal(body.stage, 'em_desenvolvimento');
    assert.deepEqual(body.editais, []);
    assert.ok(body.message.includes('depende de os órgãos'));
  });
  assert.equal(seen.length, 0, 'sem edital cadastrado o modelo nem é chamado');
});

test('editais: com base, o modelo referencia pelo número e a rota devolve o edital real', async () => {
  const pool = fakePool({
    editais: [{
      id: EDITAL, title: 'Edital de Cultura', summary: 'Apoio a projetos culturais',
      program_name: 'Cultura Viva', territory: 'Centro', municipality: 'Niterói', uf: 'RJ',
      starts_on: '2026-09-01', ends_on: '2026-12-01',
    }],
  });
  const { client, seen } = fakeModel({
    editais: [{ referencia: 1, aderencia: 'alta', justificativa: 'o objeto combina' }], observacao: null,
  });
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const body = await (await post(base, `/demands/${DEMAND}/ai/editais`, agentToken())).json();
    assert.equal(body.available, true);
    assert.equal(body.editais.length, 1);
    assert.equal(body.editais[0].edital.id, EDITAL);
    assert.equal(body.suggestion.evidence.editais_considerados, 1);
  });
  assert.ok(!JSON.stringify(seen).includes(EDITAL), 'o id do edital não vai ao modelo');
});

test('patrocinadores: complementa a compatibilidade transparente e não inventa contato', async () => {
  const interests = [{
    id: INTEREST, demand_id: DEMAND, kind: 'apoio', offer_types: ['materiais'],
    message: 'Podemos doar material', connection_id: null, connection_status: null,
    connection_requested_at: null, connection_answered_at: null, withdrawn_at: null,
    created_at: new Date(), user_id: OUTRO, user_name: 'Bruno Patrocinador', user_avatar: null,
    user_category: 'partner', profile_type: 'empresa', event_id: null,
  }];
  const pool = fakePool({ interests });
  const { client, seen } = fakeModel({
    patrocinadores: [{ referencia: 1, posicao: 1, justificativa: 'oferece o material necessário' }],
    observacao: null,
  });
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const body = await (await post(base, `/demands/${DEMAND}/ai/partners`, agentToken())).json();
    assert.equal(body.available, true);
    assert.equal(body.partners[0].interestId, INTEREST);
    // A compatibilidade transparente da T15 continua ao lado, com o número.
    assert.equal(body.partners[0].compatibility.score, 50);
    assert.equal(body.partners[0].compatibility.level, 'media');
    assert.deepEqual(body.partners[0].compatibility.matched, ['materiais']);
  });
  const enviado = JSON.stringify(seen);
  assert.ok(!enviado.includes('Bruno Patrocinador'));
  assert.ok(!enviado.includes(INTEREST));
  assert.ok(!enviado.includes('Podemos doar material'));
});

test('sem interessados, a sugestão de patrocinadores não procura ninguém de fora', async () => {
  const pool = fakePool({ interests: [] });
  const { client, seen } = fakeModel({});
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const body = await (await post(base, `/demands/${DEMAND}/ai/partners`, agentToken())).json();
    assert.equal(body.available, false);
    assert.equal(body.reason, 'sem_base');
    assert.deepEqual(body.partners, []);
  });
  assert.equal(seen.length, 0);
});

test('aceitar uma sugestão registra o desfecho e não altera a demanda', async () => {
  const suggestion = {
    id: SUGGESTION, kind: 'deteccao_de_urgencia', demand_id: DEMAND, organization_id: null,
    model: 'claude-opus-5', prompt_fields: ['titulo'], payload: { prioridade: 'urgente' },
    rationale: 'há risco', evidence: {}, status: 'sugerida', reviewed_at: null, review_note: null,
    created_at: new Date(), requested_by: AGENT,
  };
  const pool = fakePool({ suggestion });
  const { client } = fakeModel({});
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const res = await post(base, `/demands/${DEMAND}/ai/suggestions/${SUGGESTION}/review`, agentToken(), {
      status: 'aceita', note: 'confere',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.suggestion.status, 'aceita');
    assert.equal(body.applied, false, 'a IA não altera dado sem ação humana');
    assert.match(body.message, /não altera nada sozinha/);

    const invalido = await post(base, `/demands/${DEMAND}/ai/suggestions/${SUGGESTION}/review`, agentToken(), {
      status: 'aplicada',
    });
    assert.equal(invalido.status, 422);
  });
});

test('relatório para governo: gate do Poder Público e números ao lado do texto', async () => {
  const pool = fakePool();
  const { client, seen } = fakeModel({
    titulo: 'Relatório de atuação', resumo: 'No período, 12 demandas foram recebidas.',
    secoes: [{ titulo: 'Panorama', texto: 'Texto do panorama.' }], observacao: null,
  });
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const body = await (await post(base, '/government/ai/report', govToken, { period: '30d' })).json();
    assert.equal(body.available, true);
    assert.equal(body.suggestion.payload.titulo, 'Relatório de atuação');
    // Os indicadores da T22 vêm junto, verificáveis.
    assert.equal(body.report.indicators.demandas_recebidas, 12);
    assert.equal(body.suggestion.evidence.indicadores.demandas_recebidas, 12);
    assert.equal(body.suggestion.organizationId, ORG);

    // Agente não usa a rota do governo.
    assert.equal((await post(base, '/government/ai/report', agentToken())).status, 403);
  });
  assert.ok(JSON.stringify(seen).includes('Secretaria de Obras'));
  assert.ok(!JSON.stringify(seen).includes(GOV), 'o id da conta não vai ao modelo');
});

test('Poder Público sem validação não gera relatório', async () => {
  const pool = fakePool();
  const { client } = fakeModel({});
  await withServer(pool, { config: enabledConfig(), model: client }, async (base) => {
    const res = await post(base, '/government/ai/report', govToken, {});
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'institution_not_validated');
  }, { access: { kind: 'poder_publico', status: 'pendente', canActInstitutionally: false, organizationId: null } });
});
