// Vocabulário e validação da execução (T17): as listas do domínio são os enums
// da migração 014, e a validação recusa o que a fonte exige (data do registro,
// justificativa da alteração de prazo, valor executado por item ou etapa).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const E = require('../src/execution');
const store = require('../src/execution/store');

const sql = fs.readFileSync(path.join(__dirname, '../migrations/014-execution.sql'), 'utf8');
const demandsSql = fs.readFileSync(path.join(__dirname, '../migrations/007-demands.sql'), 'utf8');

function enumValues(text, type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(text);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('os marcos do registro são o enum do cronograma (slide 14)', () => {
  assert.deepEqual(enumValues(demandsSql, 'demand_record_milestone'), E.RECORD_MILESTONES);
  assert.deepEqual(Object.keys(E.RECORD_MILESTONE_LABELS).sort(), [...E.RECORD_MILESTONES].sort());
});

test('fotografia e filmagem são o enum demand_evidence_media (slide 12)', () => {
  assert.deepEqual(enumValues(sql, 'demand_evidence_media'), E.EVIDENCE_MEDIA_KINDS);
  assert.deepEqual(Object.keys(E.EVIDENCE_PURPOSE_BY_MEDIA).sort(), [...E.EVIDENCE_MEDIA_KINDS].sort());
  assert.equal(E.EVIDENCE_PURPOSE_BY_MEDIA.foto, 'demand_evidence_photo');
  assert.equal(E.EVIDENCE_PURPOSE_BY_MEDIA.video, 'demand_evidence_video');
});

test('a situação da etapa é o enum demand_stage_progress (slide 23)', () => {
  assert.deepEqual(enumValues(sql, 'demand_stage_progress'), E.STAGE_PROGRESS);
  assert.deepEqual(Object.keys(E.STAGE_PROGRESS_LABELS).sort(), [...E.STAGE_PROGRESS].sort());
});

test('os eventos da execução são os gravados pelos triggers da 014', () => {
  for (const type of E.EXECUTION_EVENT_TYPES) {
    assert.ok(sql.includes(`'${type}'`), `evento ${type} não é gravado pela migração`);
  }
  assert.deepEqual(E.TRANSITION_REQUIRED_MILESTONE, { iniciar_execucao: 'antes', concluir: 'depois' });
});

test('a evidência exige arquivo, marco, tipo e data do registro, sem data futura', () => {
  const { errors } = E.validateEvidence({});
  assert.ok(errors.reference && errors.milestone && errors.mediaKind && errors.recordedOn);

  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const { errors: futureErrors } = E.validateEvidence({
    reference: 'upload:11111111-1111-4111-8111-111111111111',
    milestone: 'antes', mediaKind: 'foto', recordedOn: future,
  });
  assert.match(futureErrors.recordedOn, /não fica no futuro/);

  const { value, errors: ok } = E.validateEvidence({
    reference: 'upload:11111111-1111-4111-8111-111111111111',
    milestone: 'depois', mediaKind: 'video', recordedOn: '2026-09-01',
    caption: ' Praça entregue ', pairEvidenceId: '22222222-2222-4222-8222-222222222222',
  });
  assert.deepEqual(ok, {});
  assert.equal(value.caption, 'Praça entregue');
  assert.equal(value.pairEvidenceId, '22222222-2222-4222-8222-222222222222');
});

test('o pareamento antes/depois só é gravado no registro do "depois"', () => {
  const { errors } = E.validateEvidence({
    reference: 'upload:11111111-1111-4111-8111-111111111111',
    milestone: 'antes', mediaKind: 'foto', recordedOn: '2026-09-01',
    pairEvidenceId: '22222222-2222-4222-8222-222222222222',
  });
  assert.match(errors.pairEvidenceId, /"depois"/);
});

test('andamento: etapa com situação, prazo com justificativa e despesa com alvo', () => {
  assert.match(E.validateProgressUpdate({}).errors.partialResults, /ao menos uma informação/);

  const stage = { errors: E.validateProgressUpdate({ scheduleItemId: '33333333-3333-4333-8333-333333333333' }).errors };
  assert.match(stage.errors.stageProgress, /como está a etapa/);

  const deadline = E.validateProgressUpdate({
    scheduleItemId: '33333333-3333-4333-8333-333333333333',
    stageProgress: 'em_andamento', newEndsOn: '2026-12-01',
  });
  assert.match(deadline.errors.deadlineReason, /Justifique/);

  const looseDeadline = E.validateProgressUpdate({ newEndsOn: '2026-12-01', deadlineReason: 'Chuvas' });
  assert.match(looseDeadline.errors.scheduleItemId, /etapa do cronograma/);

  const expense = E.validateProgressUpdate({
    partialResults: 'Metade do muro pintado', expenses: [{ executedAmountCents: 100_00 }],
  });
  assert.match(expense.errors['expenses.0.budgetItemId'], /item do orçamento ou etapa/);

  const ok = E.validateProgressUpdate({
    scheduleItemId: '33333333-3333-4333-8333-333333333333',
    stageProgress: 'concluida',
    onSchedule: true,
    partialResults: 'Muro pintado',
    note: 'Conferir recibo',
    expenses: [{ budgetItemId: '44444444-4444-4444-8444-444444444444', executedAmountCents: 250_000 }],
  });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.expenses.length, 1);
  assert.equal(ok.value.expenses[0].executedAmountCents, 250_000);
});

test('a justificativa de ausência de registro é obrigatória e limitada', () => {
  assert.match(E.validateRecordWaiver({}).errors.reason, /Explique/);
  assert.match(E.validateRecordWaiver({ reason: 'x'.repeat(E.MAX_REASON + 1) }).errors.reason, /no máximo/);
  assert.equal(E.validateRecordWaiver({ reason: ' Ação de formação, sem obra ' }).value.reason,
    'Ação de formação, sem obra');
});

test('o histórico visual pareia o "depois" com o "antes" do mesmo tipo', () => {
  const before = {
    id: 'a', milestone: 'antes', mediaKind: 'foto', pairEvidenceId: null, stage: 'Preparo',
  };
  const after = { id: 'b', milestone: 'depois', mediaKind: 'foto', pairEvidenceId: 'a', stage: null };
  const orphan = { id: 'c', milestone: 'depois', mediaKind: 'foto', pairEvidenceId: null, stage: null };
  const pairs = store.pairsOf([before, after, orphan]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].before.id, 'a');
  assert.equal(pairs[0].after.id, 'b');
  assert.equal(pairs[0].stage, 'Preparo');
  assert.deepEqual(store.milestoneCounts([before, after, orphan]),
    { antes: 1, acompanhamento: 0, depois: 2 });
});

test('a migração 014 é só inserção e a gestão só lê', () => {
  assert.match(sql, /a gestão só lê o andamento da execução/);
  assert.match(sql, /a gestão só lê as evidências/);
  assert.match(sql, /a gestão só lê a execução orçamentária/);
  assert.match(sql, /o andamento registrado não muda nem é excluído/);
  assert.match(sql, /evidências não são excluídas/);
  for (const trigger of ['demand_progress_block_truncate', 'demand_expenses_block_truncate',
    'demand_evidences_block_truncate']) {
    assert.ok(sql.includes(trigger), `trigger ${trigger} ausente`);
  }
});
