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
const statusSql = fs.readFileSync(path.join(__dirname, '../migrations/034-execution-status.sql'), 'utf8');

/** Valores acrescentados depois por `ALTER TYPE ... ADD VALUE IF NOT EXISTS`. */
function addedValues(text, type) {
  return [...text.matchAll(new RegExp(`ALTER TYPE ${type} ADD VALUE IF NOT EXISTS '([a-z_]+)'`, 'g'))].map((m) => m[1]);
}

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

test('a situação da etapa é o enum demand_stage_progress (slide 23; Modelo §18)', () => {
  assert.deepEqual(
    [...enumValues(sql, 'demand_stage_progress'), ...addedValues(statusSql, 'demand_stage_progress')],
    E.STAGE_PROGRESS,
  );
  assert.deepEqual(E.STAGE_PROGRESS_LABELS, {
    nao_iniciada: 'Não iniciada', em_andamento: 'Em andamento', concluida: 'Concluída',
    atrasada: 'Atrasada', bloqueada: 'Bloqueada',
  });
  assert.deepEqual(Object.keys(E.STAGE_PROGRESS_LABELS).sort(), [...E.STAGE_PROGRESS].sort());
});

test('os eventos da execução são os gravados pelos triggers da 014 e da 034', () => {
  for (const type of E.EXECUTION_EVENT_TYPES) {
    assert.ok(sql.includes(`'${type}'`) || statusSql.includes(`'${type}'`),
      `evento ${type} não é gravado pela migração`);
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

test('ocorrências: tipos e impactos são os enums da migração 034 (Modelo §19)', () => {
  assert.deepEqual(enumValues(statusSql, 'demand_incident_kind'), E.INCIDENT_KINDS);
  assert.deepEqual(enumValues(statusSql, 'demand_incident_impact'), E.INCIDENT_IMPACTS);
  assert.deepEqual(Object.keys(E.INCIDENT_KIND_LABELS), E.INCIDENT_KINDS);
  assert.deepEqual(Object.keys(E.INCIDENT_IMPACT_LABELS), E.INCIDENT_IMPACTS);
  for (const resolution of E.DELAY_RESOLUTIONS) assert.ok(statusSql.includes(`'${resolution}'`));
});

test('etapa bloqueada exige o motivo, e o motivo só acompanha "Bloqueada"', () => {
  const stage = '33333333-3333-4333-8333-333333333333';
  const blocked = E.validateProgressUpdate({ scheduleItemId: stage, stageProgress: 'bloqueada' });
  assert.match(blocked.errors.blockReason, /bloqueia a etapa/);
  const loose = E.validateProgressUpdate({ scheduleItemId: stage, stageProgress: 'em_andamento', blockReason: 'Chuva' });
  assert.match(loose.errors.blockReason, /só acompanha/);
  const ok = E.validateProgressUpdate({ scheduleItemId: stage, stageProgress: 'bloqueada', blockReason: ' Falta licença ' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.blockReason, 'Falta licença');
});

test('atraso: prazo corrente vencido e etapa não concluída nem bloqueada', () => {
  const today = '2026-09-25';
  assert.equal(E.isLate('2026-09-24', 'em_andamento', today), true);
  assert.equal(E.isLate('2026-09-24', null, today), true);
  assert.equal(E.isLate('2026-09-25', 'em_andamento', today), false);
  assert.equal(E.isLate('2026-09-01', 'concluida', today), false);
  assert.equal(E.isLate('2026-09-01', 'bloqueada', today), false);
  assert.equal(E.isLate(null, null, today), false);

  assert.equal(E.stageStatus({ declared: 'em_andamento', currentEndsOn: '2026-09-01' }, today), 'atrasada');
  assert.equal(E.stageStatus({ declared: 'em_andamento', currentEndsOn: '2026-09-01', running: false }, today),
    'em_andamento');
  assert.equal(E.stageStatus({ declared: 'bloqueada', openDelay: true, currentEndsOn: '2026-09-01' }, today), 'bloqueada');
  assert.equal(E.stageStatus({ declared: null, openDelay: true, currentEndsOn: '2026-12-01' }, today), 'atrasada');
  assert.equal(E.stageStatus({ declared: null, currentEndsOn: '2026-12-01' }, today), 'nao_iniciada');
});

test('percentual de execução: etapas concluídas e executado sobre o planejado', () => {
  const schedule = [
    { stageProgress: 'concluida' }, { stageProgress: 'atrasada' },
  ];
  const summary = store.executionSummary(schedule, { plannedCents: 1_000_000, executedCents: 250_000 },
    [{ resolved: false }, { resolved: true }]);
  assert.equal(summary.percentComplete, 50);
  assert.equal(summary.percentByAmount, 25);
  assert.equal(summary.stagesLate, 1);
  assert.equal(summary.stagesBlocked, 0);
  assert.equal(summary.incidentsOpen, 1);
  const empty = store.executionSummary([], { plannedCents: 0, executedCents: 0 }, []);
  assert.equal(empty.percentComplete, null);
  assert.equal(empty.percentByAmount, null);
});

test('ocorrência: tipo, descrição e data; resolução com texto', () => {
  const { errors } = E.validateIncident({});
  assert.ok(errors.kind && errors.description && errors.occurredOn);
  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  assert.match(E.validateIncident({ kind: 'clima', description: 'Chuva', occurredOn: future }).errors.occurredOn,
    /ocorrência não fica no futuro/);
  assert.ok(E.validateIncident({ kind: 'clima', description: 'Chuva', occurredOn: '2026-09-01', impact: 'x' })
    .errors.impact);
  const ok = E.validateIncident({ kind: 'fornecedor', description: ' Entrega atrasou ', occurredOn: '2026-09-01' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.impact, 'nenhum');
  assert.equal(ok.value.description, 'Entrega atrasou');
  assert.match(E.validateIncidentResolution({}).errors.resolution, /resolvida/);
});

test('a migração 034 grava o atraso e guarda as ocorrências (só inserção, gestão só lê)', () => {
  assert.match(statusSql, /CREATE TABLE IF NOT EXISTS demand_stage_delays/);
  assert.match(statusSql, /CREATE OR REPLACE VIEW demand_stage_status/);
  assert.match(statusSql, /demand_record_stage_delays/);
  assert.match(statusSql, /a gestão só lê o atraso das etapas/);
  assert.match(statusSql, /a gestão só lê as ocorrências/);
  assert.match(statusSql, /ocorrências não são excluídas/);
  assert.match(statusSql, /a resolução da ocorrência é gravada uma vez/);
  // Valor novo de enum não é literal na mesma transação.
  assert.doesNotMatch(statusSql, /'bloqueada'::demand_stage_progress/);
});
