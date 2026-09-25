// Vocabulário, exigências e validação da prestação de contas (T18): as listas
// do domínio são os enums da migração 015, e as exigências seguem o slide 24
// ("obrigatoriamente quando aplicável"): o que vale sempre e o que vale só com
// execução física ou com apoio financeiro declarado.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const A = require('../src/accountability');
const store = require('../src/accountability/store');

const sql = fs.readFileSync(path.join(__dirname, '../migrations/015-accountability.sql'), 'utf8');

function enumValues(text, type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`, 's').exec(text);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('os estados e os tipos de anexo são os enums das migrações 015 e 035', () => {
  const added = fs.readFileSync(path.join(__dirname, '../migrations/035-execution-documents.sql'), 'utf8');
  assert.deepEqual(enumValues(sql, 'demand_accountability_status'), A.ACCOUNTABILITY_STATUSES);
  assert.deepEqual([
    ...enumValues(sql, 'demand_accountability_document_kind'),
    ...[...added.matchAll(/ALTER TYPE demand_accountability_document_kind ADD VALUE IF NOT EXISTS '([a-z_]+)'/g)]
      .map((m) => m[1]),
  ], A.DOCUMENT_KINDS);
  assert.deepEqual(Object.keys(A.ACCOUNTABILITY_STATUS_LABELS).sort(), [...A.ACCOUNTABILITY_STATUSES].sort());
  assert.deepEqual(Object.keys(A.DOCUMENT_KIND_LABELS).sort(), [...A.DOCUMENT_KINDS].sort());
});

test('a prestação só existe no último status canônico e usa a finalidade própria de upload', () => {
  assert.deepEqual(A.ACCOUNTABILITY_OPEN_STATUSES, ['prestacao_de_contas']);
  assert.equal(A.ACCOUNTABILITY_UPLOAD_PURPOSE, 'demand_accountability_document');
  assert.match(sql, /demand_accountability_document/);
  assert.deepEqual(A.ACCOUNTABILITY_EVENT_TYPES, ['prestacao_de_contas_concluida']);
  assert.match(sql, /'prestacao_de_contas_concluida'/);
});

test('a migração congela a prestação concluída e deixa a gestão só ler', () => {
  assert.match(sql, /a gestão só lê a prestação de contas/);
  assert.match(sql, /a prestação de contas concluída não muda mais/);
  assert.match(sql, /a prestação de contas não é excluída/);
  // Nova versão do dossiê (T10) com trigger_kind próprio.
  assert.match(sql, /trigger_kind IN \('envio', 'reenvio', 'publicacao', 'conclusao', 'prestacao_de_contas'\)/);
});

test('o rascunho aceita campo a campo, sem exigir nada', () => {
  const { value, sent, errors } = A.validateAccountabilityDraft({ executionReport: '  Obra concluída  ' });
  assert.deepEqual(errors, {});
  assert.equal(value.executionReport, 'Obra concluída');
  assert.equal(sent.executionReport, true);
  assert.equal(sent.impactIndicators, false);

  const bad = A.validateAccountabilityDraft({ beneficiariesReached: -3, financialSupport: 'sim' });
  assert.match(bad.errors.beneficiariesReached, /inteiro/);
  assert.match(bad.errors.financialSupport, /verdadeiro ou falso/);
});

test('o resultado da meta exige valor medido, forma de mensuração e se foi cumprida (slide 15)', () => {
  const empty = A.validateAccountabilityResult({});
  assert.match(empty.errors.measuredValue, /valor medido/);
  assert.match(empty.errors.measurementMethod, /mensurado/);
  assert.match(empty.errors.achieved, /cumprida/);

  const ok = A.validateAccountabilityResult({
    measuredValue: '320 mudas plantadas',
    measurementMethod: 'Contagem em campo com lista de presença',
    achieved: true,
    evidenceId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.achieved, true);
  assert.equal(ok.value.evidenceId, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');
});

test('o comprovante financeiro exige data e valor; os demais anexos, não', () => {
  const today = new Date('2026-09-22T00:00:00Z');
  const receipt = A.validateAccountabilityDocument({
    kind: 'comprovante_financeiro', title: 'Nota fiscal 123', reference: 'upload:x',
  }, { today });
  assert.match(receipt.errors.amountCents, /valor do comprovante/);
  assert.match(receipt.errors.issuedOn, /data do comprovante/);

  const report = A.validateAccountabilityDocument({
    kind: 'relatorio_execucao', title: 'Relatório final', reference: 'upload:x',
  }, { today });
  assert.deepEqual(report.errors, {});

  const future = A.validateAccountabilityDocument({
    kind: 'registro_acao', title: 'Mutirão', reference: 'upload:x', issuedOn: '2027-01-01',
  }, { today });
  assert.match(future.errors.issuedOn, /não fica no futuro/);
});

const completeState = (extra = {}) => ({
  accountability: {
    executionReport: 'Relatório',
    actionsRecord: 'Ações',
    scheduleSummary: 'Cronograma',
    beneficiariesReached: 300,
    impactIndicators: 'Impacto',
    financialSupport: false,
    financialSummary: null,
  },
  hasPhysicalExecution: false,
  recordWaived: false,
  milestones: { antes: 0, depois: 0 },
  goalsTotal: 2,
  resultsTotal: 2,
  financialReceipts: 0,
  ...extra,
});

test('o obrigatório sempre não depende de execução física nem de apoio financeiro', () => {
  const requirements = A.checkRequirements(completeState());
  const always = requirements.filter((r) => r.condition === 'sempre');
  assert.equal(always.length, 6);
  assert.ok(always.every((r) => r.applies && r.satisfied));
  // Sem execução física e sem apoio financeiro, o condicional não se aplica.
  assert.ok(requirements.filter((r) => r.condition !== 'sempre').every((r) => !r.applies));
  assert.deepEqual(A.conclusionErrors(completeState()), {});

  const incomplete = A.conclusionErrors(completeState({
    accountability: { ...completeState().accountability, executionReport: null, beneficiariesReached: null },
  }));
  assert.match(incomplete.executionReport, /relatório de execução/i);
  assert.match(incomplete.beneficiariesReached, /quantas pessoas/);
});

test('execução física declarada torna o antes e o depois obrigatórios; a dispensa da T17 desliga', () => {
  const physical = completeState({ hasPhysicalExecution: true });
  const errors = A.conclusionErrors(physical);
  assert.match(errors['evidences.antes'], /"antes"/);
  assert.match(errors['evidences.depois'], /"depois"/);

  const waived = A.checkRequirements(completeState({ hasPhysicalExecution: true, recordWaived: true }));
  const antes = waived.find((r) => r.key === 'evidence_antes');
  assert.equal(antes.applies, false);
  assert.match(antes.reason, /não tem execução física/);
  assert.deepEqual(A.conclusionErrors(completeState({ hasPhysicalExecution: true, recordWaived: true })), {});

  const registered = completeState({ hasPhysicalExecution: true, milestones: { antes: 1, depois: 2 } });
  assert.deepEqual(A.conclusionErrors(registered), {});
});

test('apoio financeiro declarado exige resumo e comprovante ("quando aplicável")', () => {
  const base = completeState();
  const declared = completeState({
    accountability: { ...base.accountability, financialSupport: true },
  });
  const errors = A.conclusionErrors(declared);
  assert.match(errors.financialSummary, /apoio financeiro/);
  assert.match(errors['documents.comprovante_financeiro'], /comprovante financeiro/);

  const complete = completeState({
    accountability: { ...base.accountability, financialSupport: true, financialSummary: 'Aplicado em materiais' },
    financialReceipts: 2,
  });
  assert.deepEqual(A.conclusionErrors(complete), {});
});

test('o resultado de cada meta declarada é obrigatório', () => {
  const missing = A.conclusionErrors(completeState({ goalsTotal: 3, resultsTotal: 2 }));
  assert.match(missing.results, /cada meta declarada/);
  // Demanda sem meta declarada não trava a conclusão.
  assert.deepEqual(A.conclusionErrors(completeState({ goalsTotal: 0, resultsTotal: 0 })), {});
});

test('as projeções públicas não levam nota interna nem arquivo do comprovante', () => {
  const result = store.serializePublicResult({
    id: 'r1', goal_id: 'g1', position: 0, goal_snapshot: 'Meta', indicator_snapshot: 'Indicador',
    measured_value: '10', measurement_method: 'Contagem', achieved: true, note: 'interno',
    evidence_id: null, created_at: null, updated_at: null,
  });
  assert.equal('note' in result, false);
  assert.equal(result.measuredValue, '10');

  const document = store.serializePublicDocument({
    id: 'd1', kind: 'comprovante_financeiro', title: 'Nota', reference: 'upload:abc',
    upload_id: 'abc', issued_on: '2026-09-01', amount_cents: '15000', description: 'interno',
  });
  assert.deepEqual(Object.keys(document).sort(), ['amountCents', 'id', 'issuedOn', 'kind', 'title']);
  assert.equal(document.amountCents, 15000);

  const summary = store.summarize(
    [{ achieved: true }, { achieved: false }],
    [{ kind: 'comprovante_financeiro', amountCents: 1000 }, { kind: 'relatorio_execucao', amountCents: null }],
  );
  assert.deepEqual(summary, {
    goalsTotal: 2, goalsAchieved: 1, documentsTotal: 2, financialReceipts: 1, financialReceiptsCents: 1000,
  });
});

test('as chaves das exigências e as mensagens da conclusão cobrem a lista da fonte', () => {
  assert.deepEqual(A.REQUIREMENT_KEYS.sort(), Object.keys(A.REQUIREMENT_FIELD).sort());
  assert.deepEqual(Object.keys(A.REQUIREMENT_FIELD).sort(), Object.keys(A.REQUIREMENT_MESSAGE).sort());
  for (const requirement of A.REQUIREMENTS) {
    assert.ok(['sempre', 'execucao_fisica', 'apoio_financeiro', 'previsto_no_cronograma'].includes(requirement.condition),
      requirement.key);
  }
});

test('acompanhamento previsto no cronograma é exigência informativa, nunca bloqueia (T-02-04)', () => {
  const complete = {
    accountability: {
      executionReport: 'r', actionsRecord: 'a', scheduleSummary: 's', beneficiariesReached: 10,
      impactIndicators: 'i', financialSupport: false,
    },
    hasPhysicalExecution: false,
    milestones: { antes: 0, acompanhamento: 0, depois: 0 },
    goalsTotal: 0,
    resultsTotal: 0,
  };
  const planned = A.checkRequirements({ ...complete, plannedMonitoring: true })
    .find((r) => r.key === 'evidence_acompanhamento');
  assert.equal(planned.applies, true);
  assert.equal(planned.satisfied, false);
  assert.equal(planned.informative, true);
  assert.equal(planned.condition, 'previsto_no_cronograma');
  assert.deepEqual(A.conclusionErrors({ ...complete, plannedMonitoring: true }), {}, 'não bloqueia a conclusão');

  const registered = A.checkRequirements({
    ...complete, plannedMonitoring: true, milestones: { antes: 0, acompanhamento: 1, depois: 0 },
  }).find((r) => r.key === 'evidence_acompanhamento');
  assert.equal(registered.satisfied, true);

  const notPlanned = A.checkRequirements(complete).find((r) => r.key === 'evidence_acompanhamento');
  assert.equal(notPlanned.applies, false);
  assert.ok(A.checkRequirements(complete).filter((r) => r.key !== 'evidence_acompanhamento')
    .every((r) => r.informative === false));
});
