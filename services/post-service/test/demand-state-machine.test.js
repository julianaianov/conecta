const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ACTIONS, applyAction, availableActions, isEditable, isPublic, statusTransitionAllowed,
} = require('../src/demand/state-machine');
const { STATUSES, REVIEW_STATES } = require('../src/demand/constants');

const d = (status, reviewState) => ({ status, reviewState });
const AGENTE = { actor: 'agente' };
const GESTAO = { actor: 'gestao', reviewer: 'Equipe DM' };
const SISTEMA = { actor: 'sistema' };

test('ciclo completo da fonte: em análise → … → prestação de contas', () => {
  let demand = d('em_analise', 'rascunho');
  const steps = [
    ['enviar', AGENTE, 'em_analise', 'aguardando_analise'],
    ['publicar', GESTAO, 'publicada', 'aprovada'],
    ['buscar_parceiro', SISTEMA, 'em_busca_de_parceiro', 'aprovada'],
    ['conectar', AGENTE, 'conectada', 'aprovada'],
    ['iniciar_execucao', AGENTE, 'em_execucao', 'aprovada'],
    ['concluir', AGENTE, 'concluida', 'aprovada'],
    ['prestar_contas', AGENTE, 'prestacao_de_contas', 'aprovada'],
    ['encerrar', AGENTE, 'encerrada', 'aprovada'],
  ];
  for (const [action, ctx, status, reviewState] of steps) {
    const result = applyAction(demand, action, ctx);
    assert.ok(result.ok, `${action}: ${result.error}`);
    assert.deepEqual(result.next, { status, reviewState });
    assert.equal(result.event.fromStatus, demand.status);
    assert.equal(result.event.actorType, ctx.actor);
    demand = result.next;
  }
});

test('devolução para ajustes mantém em análise, exige parecer e permite reenvio', () => {
  const waiting = d('em_analise', 'aguardando_analise');
  assert.equal(applyAction(waiting, 'devolver', GESTAO).code, 'note_required');
  assert.equal(applyAction(waiting, 'devolver', { actor: 'gestao', note: 'Falta cotação' }).code, 'reviewer_required');
  const returned = applyAction(waiting, 'devolver', { ...GESTAO, note: '  Falta cotação ' });
  assert.ok(returned.ok);
  assert.deepEqual(returned.next, { status: 'em_analise', reviewState: 'devolvida' });
  assert.equal(returned.event.note, 'Falta cotação');
  assert.ok(isEditable(returned.next));
  const resent = applyAction(returned.next, 'enviar', AGENTE);
  assert.deepEqual(resent.next, { status: 'em_analise', reviewState: 'aguardando_analise' });
});

test('quem pode cada ação', () => {
  const expected = {
    enviar: ['agente'],
    devolver: ['gestao'],
    publicar: ['gestao'],
    buscar_parceiro: ['agente', 'sistema'],
    conectar: ['agente', 'sistema'],
    iniciar_execucao: ['agente'],
    concluir: ['agente'],
    prestar_contas: ['agente'],
    encerrar: ['agente'],
    arquivar: ['gestao'],
  };
  assert.deepEqual(Object.fromEntries(Object.entries(ACTIONS).map(([k, v]) => [k, v.actors])), expected);
  assert.equal(applyAction(d('em_analise', 'aguardando_analise'), 'publicar', AGENTE).code, 'forbidden_actor');
  assert.equal(applyAction(d('em_analise', 'rascunho'), 'enviar', SISTEMA).code, 'forbidden_actor');
  assert.equal(applyAction(d('em_analise', 'rascunho'), 'enviar', GESTAO).code, 'forbidden_actor');
  assert.equal(applyAction(d('conectada', 'aprovada'), 'iniciar_execucao', SISTEMA).code, 'forbidden_actor');
  assert.equal(applyAction(d('publicada', 'aprovada'), 'arquivar', { actor: 'agente', reason: 'x' }).code, 'forbidden_actor');
  assert.equal(applyAction(d('publicada', 'aprovada'), 'publicar', { actor: 'root' }).code, 'unknown_actor');
  assert.equal(applyAction(d('publicada', 'aprovada'), 'apagar', AGENTE).code, 'unknown_action');
});

test('não se pulam etapas', () => {
  assert.equal(applyAction(d('em_analise', 'rascunho'), 'publicar', GESTAO).code, 'invalid_transition', 'rascunho não vai direto à publicação');
  assert.equal(applyAction(d('em_analise', 'devolvida'), 'publicar', GESTAO).code, 'invalid_transition', 'devolvida precisa ser reenviada');
  assert.equal(applyAction(d('em_analise', 'aguardando_analise'), 'enviar', AGENTE).code, 'invalid_transition');
  assert.equal(applyAction(d('publicada', 'aprovada'), 'iniciar_execucao', AGENTE).code, 'invalid_transition');
  assert.equal(applyAction(d('em_execucao', 'aprovada'), 'prestar_contas', AGENTE).code, 'invalid_transition');
  assert.equal(applyAction(d('prestacao_de_contas', 'aprovada'), 'concluir', AGENTE).code, 'invalid_transition');
  assert.equal(applyAction(d('concluida', 'aprovada'), 'encerrar', AGENTE).code, 'invalid_transition');
  assert.equal(applyAction(d('em_execucao', 'aprovada'), 'encerrar', AGENTE).code, 'invalid_transition');
});

test('encerramento (§22): só o Agente, da prestação de contas; encerrada é final e pública', () => {
  assert.equal(applyAction(d('prestacao_de_contas', 'aprovada'), 'encerrar', SISTEMA).code, 'forbidden_actor');
  assert.equal(applyAction(d('prestacao_de_contas', 'aprovada'), 'encerrar', GESTAO).code, 'forbidden_actor');
  assert.deepEqual(ACTIONS.encerrar.requires, ['prestacao_concluida', 'registro_final']);
  assert.deepEqual(availableActions(d('prestacao_de_contas', 'aprovada'), 'agente'), ['encerrar']);
  assert.deepEqual(availableActions(d('encerrada', 'aprovada'), 'agente'), []);
  assert.deepEqual(availableActions(d('encerrada', 'aprovada'), 'sistema'), []);
  assert.deepEqual(availableActions(d('encerrada', 'aprovada'), 'gestao'), ['arquivar']);
  assert.ok(isPublic(d('encerrada', 'aprovada')));
});

test('conexão direto da publicação ou depois da busca de parceiro', () => {
  assert.ok(applyAction(d('publicada', 'aprovada'), 'conectar', SISTEMA).ok);
  assert.ok(applyAction(d('em_busca_de_parceiro', 'aprovada'), 'conectar', SISTEMA).ok);
});

test('arquivamento pela gestão, com motivo, de qualquer status; arquivada é final', () => {
  for (const status of STATUSES.filter((s) => s !== 'arquivada')) {
    const demand = d(status, status === 'em_analise' ? 'aguardando_analise' : 'aprovada');
    assert.equal(applyAction(demand, 'arquivar', GESTAO).code, 'reason_required');
    const result = applyAction(demand, 'arquivar', { ...GESTAO, reason: 'Viola as regras de uso' });
    assert.ok(result.ok, status);
    assert.equal(result.next.status, 'arquivada');
    assert.equal(result.next.reviewState, demand.reviewState, 'a etapa da análise fica registrada');
  }
  const archived = d('arquivada', 'aprovada');
  for (const actor of ['agente', 'gestao', 'sistema']) assert.deepEqual(availableActions(archived, actor), []);
});

test('ações disponíveis por estado e ator', () => {
  assert.deepEqual(availableActions(d('em_analise', 'rascunho'), 'agente'), ['enviar']);
  assert.deepEqual(availableActions(d('em_analise', 'aguardando_analise'), 'agente'), []);
  assert.deepEqual(availableActions(d('em_analise', 'aguardando_analise'), 'gestao'), ['devolver', 'publicar', 'arquivar']);
  assert.deepEqual(availableActions(d('em_analise', 'rascunho'), 'gestao'), ['arquivar']);
  assert.deepEqual(availableActions(d('publicada', 'aprovada'), 'agente'), ['buscar_parceiro', 'conectar']);
  assert.deepEqual(availableActions(d('publicada', 'aprovada'), 'sistema'), ['buscar_parceiro', 'conectar']);
  assert.deepEqual(availableActions({ status: 'concluida', review_state: 'aprovada' }, 'agente'), ['prestar_contas']);
});

test('edição só em rascunho ou devolvida; público da publicação em diante', () => {
  for (const status of STATUSES) {
    for (const reviewState of REVIEW_STATES) {
      const editable = status === 'em_analise' && ['rascunho', 'devolvida'].includes(reviewState);
      assert.equal(isEditable(d(status, reviewState)), editable, `${status}/${reviewState}`);
    }
    assert.equal(isPublic(d(status, 'aprovada')), !['em_analise', 'arquivada'].includes(status), status);
  }
});

test('transições de status equivalentes a demand_status_transition_allowed do banco', () => {
  // Tabela das migrações 007 e 037 (fora da análise e do arquivamento).
  const allowed = new Set([
    'publicada>em_busca_de_parceiro:agente', 'publicada>em_busca_de_parceiro:sistema',
    'publicada>conectada:agente', 'publicada>conectada:sistema',
    'em_busca_de_parceiro>conectada:agente', 'em_busca_de_parceiro>conectada:sistema',
    'conectada>em_execucao:agente', 'em_execucao>concluida:agente', 'concluida>prestacao_de_contas:agente',
    'prestacao_de_contas>encerrada:agente',
  ]);
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      for (const actor of ['agente', 'gestao', 'sistema']) {
        assert.equal(statusTransitionAllowed(from, to, actor), allowed.has(`${from}>${to}:${actor}`), `${from}>${to}:${actor}`);
      }
    }
  }
});
