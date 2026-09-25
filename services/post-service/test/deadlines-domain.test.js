const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../src/process');
const D = require('../src/process/deadlines');
const { validateForwarding } = require('../src/institutional');
const { validateResponsible } = require('../src/institutional');

// Controle de prazos (T-05-03; Modelo de Conexão §13–§15, migração 028):
// vocabulário × SQL, validação, datas no horário de Brasília e alertas.
const sql = fs.readFileSync(path.join(__dirname, '../migrations/028-deadlines.sql'), 'utf8');

function enumValues(type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('etapas e status da migração 028 = constantes; sugestões do §15', () => {
  assert.deepEqual(enumValues('connection_deadline_stage'), P.DEADLINE_STAGES);
  assert.deepEqual(enumValues('connection_deadline_status'), P.DEADLINE_STATUSES);
  assert.deepEqual(Object.keys(P.DEADLINE_STAGE_LABELS), P.DEADLINE_STAGES);
  // Tabela do §15: 5, 3, 10, 7 e 60 dias.
  assert.deepEqual(P.DEADLINE_DEFAULT_DAYS, {
    analise_inicial: 5, envio_de_documentacao: 3, analise_tecnica: 10, elaboracao_do_plano: 7, execucao: 60,
  });
  for (const stage of P.DEADLINE_STAGES.filter((s) => s !== 'outra')) {
    assert.ok(P.DEADLINE_SIDES.includes(P.DEADLINE_STAGE_SIDE[stage]), stage);
  }
  assert.equal(P.DEADLINE_WARNING_DAYS, 3);
});

test('validateDeadline: sugestão, dias, data, outra etapa e lado responsável', () => {
  const suggested = P.validateDeadline({ stage: 'analise_inicial' }, 'parte');
  assert.deepEqual(suggested.errors, {});
  assert.equal(suggested.forbidden, false);
  assert.equal(suggested.value.days, 5);
  assert.equal(suggested.value.responsibleSide, 'parte');
  assert.equal(P.validateDeadline({ stage: 'analise_inicial' }, 'agente').forbidden, true);
  assert.equal(P.validateDeadline({ stage: 'execucao', dueDays: '45' }, 'agente').value.days, 45);
  const date = P.validateDeadline({ stage: 'execucao', dueOn: '2030-02-01' }, 'agente');
  assert.equal(date.value.days, null);
  assert.equal(date.value.dueOn, '2030-02-01');
  assert.ok(P.validateDeadline({ stage: 'execucao', dueOn: '2030-02-30' }, 'agente').errors.dueOn);
  assert.ok(P.validateDeadline({ stage: 'execucao', dueDays: 0 }, 'agente').errors.dueDays);
  const other = P.validateDeadline({ stage: 'outra', stageLabel: 'Vistoria', dueDays: 2, responsibleSide: 'parte' }, 'agente');
  assert.deepEqual(other.errors, {});
  assert.equal(other.forbidden, false, 'em outra etapa quem define escolhe o lado');
  assert.equal(other.value.responsibleSide, 'parte');
  assert.ok(P.validateDeadline({ stage: 'outra', stageLabel: 'Vistoria' }, 'agente').errors.dueDays);
  assert.ok(P.validateDeadline({ stage: 'nenhuma' }, 'agente').errors.stage);
});

test('datas no horário de Brasília', () => {
  assert.equal(D.saoPauloDay(new Date('2026-09-26T02:30:00Z')), '2026-09-25', '23h30 em Brasília ainda é dia 25');
  assert.equal(D.saoPauloDay(new Date('2026-09-26T03:30:00Z')), '2026-09-26');
  assert.equal(D.addDays('2026-12-28', 10), '2027-01-07');
  assert.equal(D.daysBetween('2026-09-25', '2026-09-20'), -5);
});

test('serializeDeadline: vencido pela data antes do laço; substituído não está em aberto', () => {
  const row = {
    id: 'd1', process_id: 'p1', stage: 'analise_tecnica', stage_label: null, responsible_side: 'parte',
    default_days: 10, due_on: '2026-09-20', set_by_kind: 'parte', status: 'aberto', created_at: new Date(),
  };
  const open = D.serializeDeadline(row, '2026-09-25');
  assert.equal(open.overdue, true);
  assert.equal(open.daysLeft, -5);
  assert.equal(open.stageLabel, 'Análise técnica');
  const superseded = D.serializeDeadline({ ...row, superseded_by: 'd2', superseded_at: new Date() }, '2026-09-25');
  assert.equal(superseded.open, false);
  assert.equal(superseded.overdue, false);
  assert.equal(D.serializeDeadline({ ...row, stage: 'outra', stage_label: 'Vistoria' }).stageLabel, 'Vistoria');
});

test('alertMessages: próximo/vencido para as duas partes; órgão no encaminhamento', () => {
  const processCandidate = {
    target_kind: 'prazo_do_processo', target_id: 'd1', due_on: '2026-09-27', stage: 'envio_de_documentacao',
    process_id: 'p1', protocol: 'DM-2026-000001', demand_id: 'x', demand_title: 'Praça', author_id: 'agente',
    party_kind: 'poder_publico', party_user_id: 'rep', party_organization_id: 'org',
  };
  const soon = D.alertMessages(processCandidate, '2026-09-25');
  assert.equal(soon.length, 2);
  assert.ok(soon.every((m) => m.kind === 'prazo_proximo' && m.href === '/processos/DM-2026-000001'));
  assert.equal(soon[0].userId, 'agente');
  assert.equal(soon[1].organizationId, 'org', 'processo do órgão: o órgão inteiro é avisado');
  assert.match(soon[0].body, /Envio de documentação.*27\/09\/2026/);
  const late = D.alertMessages({ ...processCandidate, party_kind: 'empresa', party_organization_id: null }, '2026-09-28');
  assert.ok(late.every((m) => m.kind === 'prazo_vencido'));
  assert.equal(late[1].userId, 'rep');

  const forwarding = {
    target_kind: 'encaminhamento', target_id: 'f1', due_on: '2026-09-27', stage_label: 'Meio Ambiente', demand_id: 'x',
    demand_title: 'Praça', organization_id: 'destino', origin_organization_id: 'origem',
  };
  assert.deepEqual(D.alertMessages(forwarding, '2026-09-25').map((m) => m.organizationId), ['destino']);
  assert.deepEqual(D.alertMessages(forwarding, '2026-09-28').map((m) => m.organizationId), ['destino', 'origem'],
    'no vencimento, quem encaminhou também é avisado');
});

test('encaminhamento aceita prazo em dias ou data; responsável do órgão com setor e data limite', () => {
  const base = { destinationKind: 'setor_interno', destinationSector: 'Departamento de Parques', reason: 'Competência técnica' };
  assert.equal(validateForwarding({ ...base, dueDays: 10 }).value.dueDays, 10);
  assert.equal(validateForwarding(base).value.dueDays, null);
  assert.ok(validateForwarding({ ...base, dueDays: -1 }).errors.dueDays);
  assert.ok(validateForwarding({ ...base, dueDays: 3, dueOn: '2030-01-01' }).errors.dueOn);
  assert.equal(validateForwarding({ ...base, dueOn: '2030-01-01' }).value.dueOn, '2030-01-01');
  const responsible = validateResponsible({ responsibleSector: 'Parques', responsibleDueOn: '2030-01-01' });
  assert.deepEqual(responsible.errors, {});
  assert.deepEqual(responsible.value, { responsibleSector: 'Parques', responsibleDueOn: '2030-01-01' });
  assert.ok(validateResponsible({ responsibleDueOn: '01/01/2030' }).errors.responsibleDueOn);
});
