const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I = require('../src/institutional');
const { evaluateGovernmentActor } = require('../src/institutional/gate');
const { createGovernmentProfileClient } = require('../src/institutional/store');

// Vocabulário, máquina de estados e validação da atuação institucional (T13).
const sql = fs.readFileSync(path.join(__dirname, '../migrations/010-institutional-tracks.sql'), 'utf8');

function enumValues(type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('enums da migração 010 = constantes do domínio (fonte: slides 10, 12 e 13)', () => {
  assert.deepEqual(enumValues('institutional_status'), I.INSTITUTIONAL_STATUSES);
  assert.deepEqual(enumValues('institutional_response_type'), I.RESPONSE_TYPES);
  assert.deepEqual(enumValues('institutional_support_type'), I.SUPPORT_TYPES);
  assert.equal(I.INSTITUTIONAL_STATUSES.length, 14);
  // Decisão 16: subconjunto compatível do status do processo (Modelo §16).
  assert.ok(!I.INSTITUTIONAL_STATUSES.includes('acao_programada'));
  for (const s of ['aprovada_para_execucao', 'solicitacao_de_informacoes', 'aguardando_documentacao', 'nao_aprovada',
    'suspensa', 'cancelada', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel']) {
    assert.ok(I.INSTITUTIONAL_STATUSES.includes(s), s);
  }
  assert.equal(I.RESPONSE_TYPES.length, 8);
  assert.equal(I.SUPPORT_TYPES.length, 11);
  for (const list of [I.INSTITUTIONAL_STATUSES, I.RESPONSE_TYPES, I.SUPPORT_TYPES]) {
    const labels = list === I.INSTITUTIONAL_STATUSES ? I.INSTITUTIONAL_STATUS_LABELS
      : list === I.RESPONSE_TYPES ? I.RESPONSE_TYPE_LABELS : I.SUPPORT_TYPE_LABELS;
    assert.deepEqual(Object.keys(labels), list);
  }
});

test('transições do SQL = TRANSITIONS do domínio', () => {
  const body = /institutional_status_transition_allowed\([\s\S]*?SELECT CASE from_status::text([\s\S]*?)ELSE false/.exec(sql)[1];
  const fromSql = {};
  for (const m of body.matchAll(/WHEN '([a-z_]+)' THEN to_status::text IN \(([^)]*)\)/g)) {
    fromSql[m[1]] = [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  }
  const fromJs = Object.fromEntries(Object.entries(I.TRANSITIONS).filter(([, to]) => to.length));
  assert.deepEqual(fromSql, fromJs);
  assert.deepEqual(I.TRANSITIONS.concluida, [], 'concluída é final');
  assert.deepEqual(I.TRANSITIONS.cancelada, [], 'cancelada é final');
  const requiresNote = /institutional_status_requires_note[\s\S]*?to_status::text IN \(([^)]*)\)/.exec(sql)[1];
  assert.deepEqual([...requiresNote.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), I.STATUSES_REQUIRING_NOTE);
});

test('checkTransition: caminho da fonte, saltos recusados e justificativa obrigatória', () => {
  const path7 = ['recebida', 'em_analise', 'encaminhada', 'em_articulacao', 'aprovada_para_execucao', 'em_execucao', 'concluida'];
  for (let i = 1; i < path7.length; i += 1) assert.ok(I.checkTransition(path7[i - 1], path7[i]).ok, path7[i]);
  assert.equal(I.checkTransition('recebida', 'concluida').code, 'invalid_transition');
  assert.equal(I.checkTransition('concluida', 'em_analise').code, 'invalid_transition');
  assert.equal(I.checkTransition('recebida', 'recebida').code, 'invalid_transition');
  assert.equal(I.checkTransition('recebida', 'xyz').code, 'invalid_status');
  assert.equal(I.checkTransition('em_analise', 'nao_e_de_competencia').code, 'note_required');
  assert.ok(I.checkTransition('em_analise', 'nao_e_de_competencia', 'Competência estadual').ok);
  assert.ok(I.checkTransition('nao_e_de_competencia', 'em_analise').ok, 'volta à análise diante de fato novo');
  assert.equal(I.checkTransition('em_analise', 'nao_aprovada').code, 'note_required', 'recusa informa o motivo');
  assert.ok(I.checkTransition('em_analise', 'suspensa', 'Aguardando orçamento').ok);
  assert.ok(I.checkTransition('suspensa', 'em_execucao').ok);
});

test('validateResponse: tipo, texto e campos exigidos por tipo', () => {
  assert.deepEqual(Object.keys(I.validateResponse({}).errors).sort(), ['body', 'type']);
  assert.ok(I.validateResponse({ type: 'orgao_ou_setor_responsavel', body: 'x' }).errors.responsibleSector);
  assert.ok(I.validateResponse({ type: 'programa_publico_relacionado', body: 'x' }).errors.programName);
  assert.ok(I.validateResponse({ type: 'recebimento', body: 'x', programUrl: 'http://a' }).errors.programUrl);
  assert.ok(I.validateResponse({ type: 'acao_prevista', body: 'x', plannedFor: '2026-02-30' }).errors.plannedFor);
  assert.ok(I.validateResponse({ type: 'recebimento', body: 'x'.repeat(5001) }).errors.body);
  assert.ok(I.validateResponse({ type: 'recebimento', body: 'x', status: 'nao_e_de_competencia' }).errors.statusNote);
  const ok = I.validateResponse({
    type: 'programa_publico_relacionado', body: '  Programa municipal  ', programName: 'Hortas', programUrl: 'https://a.org/p',
    plannedFor: '2026-10-20', status: 'em_analise',
  });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.body, 'Programa municipal');
  assert.equal(ok.value.status, 'em_analise');
});

test('validateOffer e validateResponsible', () => {
  assert.ok(I.validateOffer({}).errors.supportTypes);
  assert.ok(I.validateOffer({ supportTypes: ['parcerias', 'parcerias'], description: 'x' }).errors.supportTypes);
  assert.ok(I.validateOffer({ supportTypes: ['parcerias'], description: 'x', connectionId: 'abc' }).errors.connectionId);
  const ok = I.validateOffer({ supportTypes: ['parcerias', 'recursos_publicos'], description: 'Apoio' });
  assert.deepEqual(ok.value.supportTypes, ['recursos_publicos', 'parcerias'], 'ordem da fonte');
  assert.ok(I.validateResponsible({}).errors.responsibleName);
  assert.deepEqual(I.validateResponsible({ responsibleName: ' Ana ', responsibleRole: '' }).value,
    { responsibleName: 'Ana', responsibleRole: null });
});

test('gate: só Poder Público com cadastro validado e órgão identificado', () => {
  const gov = { role: 'government', profileType: 'prefeitura' };
  const validated = { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: 'org' };
  assert.equal(evaluateGovernmentActor({ role: 'agent', profileType: 'ong' }, validated).code, 'not_government');
  assert.equal(evaluateGovernmentActor(gov, { ...validated, status: 'em_analise', canActInstitutionally: false }).code, 'institution_not_validated');
  assert.equal(evaluateGovernmentActor(gov, { ...validated, kind: 'agente_transformacao' }).code, 'institution_not_validated');
  assert.equal(evaluateGovernmentActor(gov, { ...validated, organizationId: null }).httpStatus, 503);
  assert.deepEqual(evaluateGovernmentActor(gov, validated), { allowed: true, organizationId: 'org' });
  // Delegação (T29): vínculo com atuar_institucionalmente num órgão validado age como Poder Público.
  const member = { role: 'member', profileType: 'morador' };
  const delegated = { ...validated, delegation: { level: 'publicador', permissions: ['atuar_institucionalmente'], organizationName: 'Prefeitura' } };
  assert.deepEqual(evaluateGovernmentActor(member, delegated), { allowed: true, organizationId: 'org' });
  assert.equal(evaluateGovernmentActor(member, { ...delegated, delegation: { level: 'colaborador', permissions: ['ver_documentos'] } }).code, 'not_government');
  assert.equal(evaluateGovernmentActor(member, { ...delegated, status: 'em_analise', canActInstitutionally: false }).code, 'institution_not_validated');
});

test('identificação do órgão: projeção pública, só poder_publico, com cache', async () => {
  let calls = 0;
  const client = createGovernmentProfileClient({
    fetchInstitution: async (userId) => {
      calls += 1;
      return userId === 'gov' ? {
        institution_kind: 'poder_publico', legal_name: 'Município X', trade_name: 'Prefeitura de X',
        government_sphere: 'municipal', municipality: 'X', uf: 'rj', competence_areas: ['Saúde'],
      } : { institution_kind: 'agente_transformacao', legal_name: 'ONG' };
    },
  });
  const profile = await client('gov');
  assert.equal(profile.name, 'Prefeitura de X');
  assert.equal(profile.uf, 'RJ');
  await client('gov');
  assert.equal(calls, 1);
  assert.equal(await client('ong'), null);
});
