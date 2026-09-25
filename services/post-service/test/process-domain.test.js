const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const P = require('../src/process');
const store = require('../src/process/store');

// Vocabulário, máquina de estados e validação do Processo de Conexão (T-05-01).
const sql = fs.readFileSync(path.join(__dirname, '../migrations/026-connection-processes.sql'), 'utf8');

function enumValues(type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('enums da migração 026 = constantes do domínio (Modelo §16, §26–§28)', () => {
  assert.deepEqual(enumValues('connection_process_status'), P.PROCESS_STATUSES);
  assert.deepEqual(enumValues('connection_party_kind'), P.PARTY_KINDS);
  assert.deepEqual(enumValues('connection_contribution_kind'), P.CONTRIBUTION_KINDS);
  assert.deepEqual(enumValues('connection_process_origin'), P.ORIGIN_KINDS);
  assert.equal(P.MAIN_FLOW.length, 9, '9 status do fluxo');
  assert.equal(P.EXCEPTION_STATUSES.length, 6, '6 situações de exceção');
  assert.deepEqual(Object.keys(P.PROCESS_STATUS_LABELS), P.PROCESS_STATUSES);
  assert.deepEqual(Object.keys(P.PARTY_KIND_LABELS), P.PARTY_KINDS);
  assert.deepEqual(Object.keys(P.CONTRIBUTION_KIND_LABELS), P.CONTRIBUTION_KINDS);
  assert.equal(P.PROCESS_STATUS_LABELS.aprovada_para_execucao, 'Aprovada para execução');
});

test('transições do SQL = TRANSITIONS do domínio; nota, finais e pausas iguais', () => {
  const body = /connection_process_transition_allowed\([\s\S]*?SELECT CASE from_status([\s\S]*?)ELSE false/.exec(sql)[1];
  const fromSql = {};
  for (const m of body.matchAll(/WHEN '([a-z_]+)' THEN to_status IN \(([^)]*)\)/g)) {
    fromSql[m[1]] = [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
  }
  const fromJs = Object.fromEntries(Object.entries(P.TRANSITIONS).filter(([, to]) => to.length).map(([k, v]) => [k, [...v].sort()]));
  assert.deepEqual(fromSql, fromJs);
  const list = (fn) => [...new RegExp(`${fn}[\\s\\S]*?IN \\(([^)]*)\\)`).exec(sql)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual(list('connection_process_requires_note'), P.STATUSES_REQUIRING_NOTE);
  assert.deepEqual(list('FUNCTION connection_process_is_final'), P.FINAL_STATUSES);
  for (const pause of P.PAUSE_STATUSES) {
    assert.match(body, new RegExp(`WHEN '${pause}'[\\s\\S]*?OR to_status = previous`), `${pause} volta ao anterior`);
  }
  for (const final of P.FINAL_STATUSES) assert.deepEqual(P.TRANSITIONS[final], [], `${final} é final`);
});

test('checkTransition: fluxo, exceções, motivo, ator e retomada da pausa', () => {
  const proc = (status, extra = {}) => ({ status, previousStatus: null, partyKind: 'empresa', ...extra });
  const flow = ['recebida', 'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
    'aprovada_para_execucao', 'em_execucao', 'concluida', 'prestacao_de_contas'];
  for (let i = 1; i < flow.length; i += 1) assert.ok(P.checkTransition(proc(flow[i - 1]), flow[i]).ok, flow[i]);
  assert.equal(P.checkTransition(proc('recebida'), 'concluida').code, 'invalid_transition');
  assert.equal(P.checkTransition(proc('prestacao_de_contas'), 'cancelada', 'x').code, 'invalid_transition');
  assert.equal(P.checkTransition(proc('em_analise'), 'nao_aprovada').code, 'note_required');
  assert.ok(P.checkTransition(proc('em_analise'), 'nao_aprovada', 'Fora do escopo').ok);
  assert.equal(P.checkTransition(proc('em_analise'), 'nao_e_de_competencia', 'x').code, 'invalid_transition', 'só órgão');
  assert.ok(P.checkTransition(proc('em_analise', { partyKind: 'poder_publico' }), 'nao_e_de_competencia', 'x').ok);
  assert.equal(P.checkTransition(proc('recebida'), 'xyz').code, 'invalid_status');
  // Ator: análise é da parte; execução é do Agente.
  assert.equal(P.checkTransition(proc('recebida'), 'em_analise', null, 'agente').code, 'forbidden_status');
  assert.ok(P.checkTransition(proc('recebida'), 'em_analise', null, 'parte').ok);
  assert.equal(P.checkTransition(proc('aprovada_para_execucao'), 'em_execucao', null, 'parte').code, 'forbidden_status');
  assert.ok(P.checkTransition(proc('aprovada_para_execucao'), 'em_execucao', null, 'agente').ok);
  // Pausa volta ao anterior, pelos dois lados.
  const paused = proc('suspensa', { previousStatus: 'em_articulacao' });
  assert.deepEqual(P.nextStatuses('suspensa', 'em_articulacao')[0], 'em_articulacao');
  assert.ok(P.checkTransition(paused, 'em_articulacao', null, 'agente').ok);
  assert.ok(P.checkTransition(paused, 'em_articulacao', null, 'parte').ok);
  assert.equal(P.checkTransition(paused, 'em_execucao', null, 'agente').code, 'invalid_transition');
  assert.ok(P.statusesFor('agente', { status: 'em_execucao', partyKind: 'empresa' }).includes('concluida'));
  assert.ok(!P.statusesFor('parte', { status: 'em_analise', partyKind: 'empresa' }).includes('encaminhada'));
});

test('validação: status, responsável, contribuição e formalização', () => {
  assert.ok(P.validateStatusChange({}).errors.status);
  assert.ok(P.validateStatusChange({ status: 'cancelada' }).errors.note);
  assert.deepEqual(P.validateStatusChange({ status: 'cancelada', note: ' Sem recurso ' }).value, { status: 'cancelada', note: 'Sem recurso' });
  assert.ok(P.validateResponsible({}).errors.name);
  assert.ok(P.validateResponsible({ dueOn: '2026-02-30' }).errors.dueOn);
  assert.deepEqual(P.validateResponsible({ sector: 'Fiscalização', name: '' }).value, { sector: 'Fiscalização', name: null });
  assert.ok(P.validateContribution({ contributionKinds: ['foguete'] }).errors.contributionKinds);
  assert.ok(P.validateContribution({ contributionKinds: ['materiais', 'materiais'] }).errors.contributionKinds);
  assert.ok(P.validateContribution({ contributionKinds: ['materiais'], contributionAmountCents: 10 }).errors.contributionAmountCents);
  assert.deepEqual(P.validateContribution({ contributionKinds: ['patrocinio'], contributionAmountCents: 10 }).errors, {});
  assert.ok(P.validateContribution({ contributionAmountCents: 1.5 }, { partial: true }).errors.contributionAmountCents);
  assert.ok(P.validateFormalize({}).errors.origin);
  assert.ok(P.validateFormalize({ interestId: 'x' }).errors.interestId);
  assert.ok(P.validateFormalize({ interestId: '11111111-1111-4111-8111-111111111111', offerId: '11111111-1111-4111-8111-111111111111' }).errors.origin);
  assert.deepEqual(P.validateFormalize({ offerId: '11111111-1111-4111-8111-111111111111' }).errors, {});
});

test('origem → parte e contribuição; projeção pública sem nome de pessoa', () => {
  const fromPartner = store.fromInterest({
    id: 'i', user_id: 'u', user_name: 'Construtora', user_category: 'parceiro', profile_type: 'patrocinador',
    organization_id: null, offer_types: ['recursos', 'investimento', 'produtos'], message: 'Apoio',
  });
  assert.equal(fromPartner.party.kind, 'patrocinador');
  assert.deepEqual(fromPartner.contribution.contributionKinds, ['apoio_financeiro', 'materiais']);
  assert.equal(store.fromInterest({ user_category: 'poder_publico', organization_id: null }), null, 'órgão sem id não formaliza');
  const fromOrgan = store.fromTrack(
    { id: 't', organization_id: 'o', organization_name: 'Secretaria', status: 'em_articulacao' },
    { id: 'of', author_id: 'a', support_types: ['equipes', 'parcerias', 'articulacao_institucional'], description: 'x' },
  );
  assert.equal(fromOrgan.status, 'em_articulacao', 'herda o status do acompanhamento');
  assert.deepEqual(fromOrgan.contribution.contributionKinds, ['equipe', 'articulacao']);
  assert.equal(fromOrgan.origin.kind, 'oferta_institucional');
  assert.equal(store.initialStatusFromTrack('recebida'), 'recebida');
  assert.equal(store.initialStatusFromTrack('nao_e_de_competencia'), 'recebida');
  const row = {
    id: 'p', protocol: 'DM-2026-000001', demand_id: 'd', sequence_in_demand: 1, party_kind: 'empresa',
    party_name: 'Fulano de Tal', party_user_id: 'u', contribution_kinds: ['materiais'], status: 'recebida',
  };
  const pub = store.serializePublicProcess(row);
  assert.equal(pub.organizationName, null);
  assert.ok(!JSON.stringify(pub).includes('Fulano'));
  assert.equal(store.serializePublicProcess({ ...row, party_kind: 'poder_publico', party_name: 'Secretaria' }).organizationName, 'Secretaria');
  assert.ok(store.isProcessRef('DM-2026-000184'));
  assert.ok(!store.isProcessRef('DM-26-1'));
});

test('taxas do processo (T-05-06, decisão 14): Empresa com R$ 10.000 → R$ 11.000; Poder Público sem taxas', () => {
  const base = {
    id: 'p', protocol: 'DM-2026-000002', demand_id: 'd', sequence_in_demand: 2, party_user_id: 'u',
    party_name: 'Fulano de Tal', contribution_kinds: ['apoio_financeiro'], status: 'recebida',
  };
  const empresa = {
    ...base, party_kind: 'empresa', fee_applies: true, contribution_amount_cents: '1000000',
    agent_fee_cents: '40000', platform_fee_cents: '60000', total_with_fees_cents: '1100000',
  };
  const expected = {
    applies: true, contributionAmountCents: 1_000_000, agentFeeCents: 40_000, platformFeeCents: 60_000,
    totalWithFeesCents: 1_100_000,
  };
  assert.deepEqual(store.serializeProcess(empresa).fees, expected);
  assert.deepEqual(store.serializePublicProcess(empresa).fees, expected);
  assert.equal(store.serializePublicProcess(empresa).feeApplies, true);
  const orgao = {
    ...base, party_kind: 'poder_publico', party_name: 'Secretaria', fee_applies: false,
    contribution_amount_cents: '1000000', agent_fee_cents: '0', platform_fee_cents: '0', total_with_fees_cents: '1000000',
  };
  assert.deepEqual(store.serializePublicProcess(orgao).fees, {
    applies: false, contributionAmountCents: 1_000_000, agentFeeCents: 0, platformFeeCents: 0, totalWithFeesCents: 1_000_000,
  });
  assert.equal(store.serializeProcess({ ...base, party_kind: 'marca', fee_applies: true, contribution_amount_cents: null }).fees, null);
  assert.match(store.PROCESS_SQL, /p\.agent_fee_cents/);
  assert.match(store.PROCESS_SQL, /p\.total_with_fees_cents/);
});
