const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateDemandAuthor, requireValidatedAgent } = require('../src/demand/gate');
const { createInstitutionStatusClient } = require('../src/institution-gate');

const ORG = 'cccccccc-0000-0000-0000-000000000001';
const AGENT = { userId: 'u1', role: 'agent', profileType: 'associacao' };
const validated = { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG };

test('Agente com instituição validada envia, com o id da instituição', () => {
  assert.deepEqual(evaluateDemandAuthor(AGENT, validated), { allowed: true, organizationId: ORG });
});

test('Líder Comunitário e Representante de Bairro: só com instituição com CNPJ validada (decisão 3)', () => {
  for (const profileType of ['lider_comunitario', 'representante_bairro']) {
    const user = { userId: 'u2', role: 'agent', profileType };
    assert.equal(evaluateDemandAuthor(user, { kind: null, status: null, canActInstitutionally: false }).code, 'institution_not_validated');
    assert.ok(evaluateDemandAuthor(user, validated).allowed);
  }
});

test('instituição não validada: pendente, em análise, devolvida ou revogada', () => {
  for (const status of ['pendente', 'em_analise', 'devolvida', 'revogada']) {
    const result = evaluateDemandAuthor(AGENT, { kind: 'agente_transformacao', status, canActInstitutionally: false, organizationId: ORG });
    assert.equal(result.allowed, false);
    assert.equal(result.httpStatus, 403);
    assert.equal(result.code, 'institution_not_validated');
    assert.equal(result.validationStatus, status);
  }
});

test('cadastro de Poder Público não serve para demanda; outras categorias não publicam', () => {
  assert.equal(evaluateDemandAuthor(AGENT, { ...validated, kind: 'poder_publico' }).code, 'institution_not_validated');
  for (const [role, profileType] of [['member', 'morador'], ['partner', 'empresa'], ['government', 'prefeitura'], ['media', 'jornalista']]) {
    assert.equal(evaluateDemandAuthor({ role, profileType }, validated).code, 'demand_author_not_agent', profileType);
  }
});

test('resposta incoerente não libera: canAct sem status validada, ou validada sem id', () => {
  assert.equal(evaluateDemandAuthor(AGENT, { ...validated, status: 'em_analise' }).allowed, false);
  assert.equal(evaluateDemandAuthor(AGENT, { ...validated, canActInstitutionally: false }).allowed, false);
  const noId = evaluateDemandAuthor(AGENT, { ...validated, organizationId: null });
  assert.deepEqual([noId.allowed, noId.httpStatus, noId.code], [false, 503, 'institution_unavailable']);
  assert.equal(evaluateDemandAuthor(AGENT, null).allowed, false);
});

function run(middleware, user) {
  return new Promise((resolve) => {
    const req = { user, headers: { authorization: 'Bearer t' } };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(body) { resolve({ req, status: this.statusCode, body }); },
    };
    middleware(req, res, () => resolve({ req, status: 'next' }));
  });
}

test('middleware: libera e anota a instituição; recusa com 403 e código', async () => {
  const ok = await run(requireValidatedAgent(async () => validated), AGENT);
  assert.equal(ok.status, 'next');
  assert.deepEqual(ok.req.demandAuthor, { organizationId: ORG });

  const denied = await run(requireValidatedAgent(async () => ({ kind: 'agente_transformacao', status: 'em_analise', canActInstitutionally: false })), AGENT);
  assert.equal(denied.status, 403);
  assert.deepEqual(denied.body.code, 'institution_not_validated');
  assert.equal(denied.body.validationStatus, 'em_analise');
});

test('middleware: falha fechada (503) e sem consulta para quem não é Agente', async () => {
  const down = await run(requireValidatedAgent(async () => { throw new Error('timeout'); }), AGENT);
  assert.equal(down.status, 503);

  let lookups = 0;
  const member = await run(requireValidatedAgent(async () => { lookups += 1; return validated; }), { role: 'member', profileType: 'morador' });
  assert.equal(member.status, 403);
  assert.equal(member.body.code, 'demand_author_not_agent');
  assert.equal(lookups, 0);
});

test('o cliente do user-service repassa o id da instituição', async () => {
  const lookup = createInstitutionStatusClient({
    baseUrl: 'http://user-service:3002',
    fetchImpl: async () => ({ ok: true, json: async () => ({ ...validated }) }),
  });
  const access = await lookup({ user: { userId: 'u1' }, headers: {} });
  assert.equal(access.organizationId, ORG);
  assert.ok(evaluateDemandAuthor(AGENT, access).allowed);

  const legacy = createInstitutionStatusClient({
    baseUrl: 'http://user-service:3002',
    fetchImpl: async () => ({ ok: true, json: async () => ({ kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true }) }),
  });
  assert.equal(evaluateDemandAuthor(AGENT, await legacy({ user: { userId: 'u9' }, headers: {} })).code, 'institution_unavailable');
});
