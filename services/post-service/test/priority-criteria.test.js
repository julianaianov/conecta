// Critérios de prioridade definidos pela plataforma (T-02-01, decisão 17):
// os quatro critérios, a validação do rascunho, o aviso do envio, o prompt de
// urgência da IA e a migração 042 usam a mesma lista.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  PRIORITY_CRITERIA, PRIORITY_CRITERIA_IDS, PRIORITIES_EXPECTING_CRITERIA, priorityCriteriaText,
} = require('../src/demand/priority');
const { PRIORITIES } = require('../src/demand/constants');
const { validateDemand } = require('../src/demand/validation');
const store = require('../src/demand/store');
const { buildPrompt } = require('../src/ai/prompts');

test('os quatro critérios da decisão 17, com texto único', () => {
  assert.deepEqual(PRIORITY_CRITERIA_IDS, [
    'risco_vida_seguranca', 'pessoas_afetadas', 'prazo_sazonalidade', 'recurso_disponivel',
  ]);
  assert.deepEqual(PRIORITY_CRITERIA.map((c) => c.label), [
    'Risco à vida ou à segurança',
    'Número de pessoas afetadas',
    'Prazo ou sazonalidade',
    'Recurso ou parceiro já disponível',
  ]);
  for (const c of PRIORITY_CRITERIA) assert.ok(c.description.length > 20, c.id);
  assert.ok(PRIORITIES_EXPECTING_CRITERIA.every((p) => PRIORITIES.includes(p)));
});

test('rascunho aceita subconjunto dos critérios, sem repetição e na ordem da plataforma', () => {
  const ok = validateDemand({ priorityCriteria: ['prazo_sazonalidade', 'risco_vida_seguranca', 'prazo_sazonalidade'] });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value.priorityCriteria, ['risco_vida_seguranca', 'prazo_sazonalidade']);
  assert.deepEqual(validateDemand({}).value.priorityCriteria, []);
  assert.ok(validateDemand({ priorityCriteria: ['inventado'] }).errors.priorityCriteria);
  assert.ok(validateDemand({ priorityCriteria: 'risco_vida_seguranca' }).errors.priorityCriteria);
});

test('prioridade alta ou urgente sem critério vira aviso no envio, nunca erro', () => {
  for (const priority of PRIORITIES) {
    const { errors, warnings } = validateDemand({ priority }, { forSubmission: true });
    assert.equal(errors.priorityCriteria, undefined, priority);
    assert.equal(Boolean(warnings.priorityCriteria), PRIORITIES_EXPECTING_CRITERIA.includes(priority), priority);
  }
  const declared = validateDemand({ priority: 'urgente', priorityCriteria: ['risco_vida_seguranca'] }, { forSubmission: true });
  assert.equal(declared.warnings.priorityCriteria, undefined);
  // Rascunho não avisa.
  assert.equal(validateDemand({ priority: 'urgente' }).warnings.priorityCriteria, undefined);
});

test('o rascunho grava os critérios na coluna e as projeções devolvem a lista', () => {
  assert.equal(store.SCALAR_COLUMNS.priorityCriteria, 'priority_criteria');
  const owner = store.serializeOwnerDemand({ id: 'd', priority_criteria: ['pessoas_afetadas'] }, null);
  assert.deepEqual(owner.priorityCriteria, ['pessoas_afetadas']);
  assert.deepEqual(store.serializeOwnerDemand({ id: 'd' }, null).priorityCriteria, []);
});

test('o prompt de urgência da IA cita os mesmos quatro critérios', () => {
  const prompt = buildPrompt('deteccao_de_urgencia', { titulo: 'x' });
  const text = JSON.stringify(prompt);
  for (const c of PRIORITY_CRITERIA) assert.ok(text.includes(c.label.toLowerCase()), c.id);
  assert.ok(priorityCriteriaText().split('; ').length === 4);
});

test('a migração 042 aceita exatamente os quatro critérios', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/042-priority-criteria.sql'), 'utf8');
  const check = sql.match(/priority_criteria <@ ARRAY\[([^\]]+)\]/);
  assert.ok(check);
  const ids = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, PRIORITY_CRITERIA_IDS);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS priority_criteria/);
  assert.match(sql, /enviada_para_analise/);
});
