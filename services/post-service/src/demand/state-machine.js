// Máquina de estados da demanda (Fluxo 2, slides 20 e 21; decisões 2, 4 e 7).
//
// Estado = `status` + `reviewState` (etapa da análise enquanto `em_analise`).
// Cada ação diz quem pode executá-la:
// - agente: o autor da demanda (Agente de Transformação);
// - gestao: a equipe da plataforma no dm-gestao (sessão `gestao_app`);
// - sistema: o próprio portal (ex.: conexão aceita marca `conectada`).
//
// É o espelho de demands_guard / demand_status_transition_allowed da migração
// post-service/007-demands.sql: o banco recusa o que esta tabela recusa.
//
//   em_analise/rascunho ──enviar──▶ em_analise/aguardando_analise
//   em_analise/devolvida ──enviar──▶ em_analise/aguardando_analise
//   em_analise/aguardando_analise ──devolver (gestão, parecer)──▶ em_analise/devolvida
//   em_analise/aguardando_analise ──publicar (gestão)──▶ publicada
//   publicada ──buscar_parceiro──▶ em_busca_de_parceiro
//   publicada | em_busca_de_parceiro ──conectar──▶ conectada
//   conectada ──iniciar_execucao──▶ em_execucao ──concluir──▶ concluida
//   concluida ──prestar_contas──▶ prestacao_de_contas
//   qualquer status (menos arquivada) ──arquivar (gestão, motivo)──▶ arquivada

const { STATUSES, PUBLIC_STATUSES, ACTORS } = require('./constants');

const ACTIONS = {
  enviar: {
    label: 'Enviar para análise',
    actors: ['agente'],
    from: { status: ['em_analise'], reviewState: ['rascunho', 'devolvida'] },
    to: { status: 'em_analise', reviewState: 'aguardando_analise' },
    // T06a: instituição do agente validada; dados completos (validation.js).
    requires: ['instituicao_validada', 'dados_completos'],
  },
  devolver: {
    label: 'Devolver para ajustes',
    actors: ['gestao'],
    from: { status: ['em_analise'], reviewState: ['aguardando_analise'] },
    to: { status: 'em_analise', reviewState: 'devolvida' },
    requires: ['revisor', 'parecer'],
  },
  publicar: {
    label: 'Publicar',
    actors: ['gestao'],
    from: { status: ['em_analise'], reviewState: ['aguardando_analise'] },
    to: { status: 'publicada', reviewState: 'aprovada' },
    requires: ['revisor'],
  },
  buscar_parceiro: {
    label: 'Buscar parceiro',
    actors: ['agente', 'sistema'],
    from: { status: ['publicada'] },
    to: { status: 'em_busca_de_parceiro' },
    requires: [],
  },
  conectar: {
    label: 'Marcar como conectada',
    actors: ['agente', 'sistema'],
    from: { status: ['publicada', 'em_busca_de_parceiro'] },
    to: { status: 'conectada' },
    requires: [],
  },
  iniciar_execucao: {
    label: 'Iniciar execução',
    actors: ['agente'],
    from: { status: ['conectada'] },
    to: { status: 'em_execucao' },
    requires: [],
  },
  concluir: {
    label: 'Concluir',
    actors: ['agente'],
    from: { status: ['em_execucao'] },
    to: { status: 'concluida' },
    requires: [],
  },
  // TODO(fonte-da-verdade): Modelo de Conexão §22 — o ciclo termina em prestacao_de_contas; falta um estado final de encerramento após a prestação de contas.
  prestar_contas: {
    label: 'Iniciar prestação de contas',
    actors: ['agente'],
    from: { status: ['concluida'] },
    to: { status: 'prestacao_de_contas' },
    requires: [],
  },
  arquivar: {
    label: 'Arquivar',
    actors: ['gestao'],
    from: { status: STATUSES.filter((s) => s !== 'arquivada') },
    to: { status: 'arquivada' },
    requires: ['revisor', 'motivo'],
  },
};

function stateOf(demand) {
  return { status: demand?.status, reviewState: demand?.reviewState ?? demand?.review_state };
}

function matchesFrom(action, { status, reviewState }) {
  if (!action.from.status.includes(status)) return false;
  return !action.from.reviewState || action.from.reviewState.includes(reviewState);
}

/** Conteúdo e itens só mudam em rascunho ou devolvida. */
function isEditable(demand) {
  const { status, reviewState } = stateOf(demand);
  return status === 'em_analise' && (reviewState === 'rascunho' || reviewState === 'devolvida');
}

/** Aparece em rota pública (da publicação em diante, fora `arquivada`). */
function isPublic(demand) {
  return PUBLIC_STATUSES.includes(stateOf(demand).status);
}

/** Ações que `actor` pode executar a partir do estado atual. */
function availableActions(demand, actor) {
  const state = stateOf(demand);
  return Object.entries(ACTIONS)
    .filter(([, action]) => action.actors.includes(actor) && matchesFrom(action, state))
    .map(([name]) => name);
}

/**
 * Aplica a ação sem efeitos colaterais. Retorna
 * `{ ok: true, next: { status, reviewState }, event }` ou
 * `{ ok: false, code, error }`. `context`: `{ actor, reviewer, note, reason }`.
 * As exigências externas (`instituicao_validada`, `dados_completos`) são
 * verificadas por quem chama (gate.js e validation.js), antes de gravar.
 */
function applyAction(demand, actionName, context = {}) {
  const action = ACTIONS[actionName];
  if (!action) return { ok: false, code: 'unknown_action', error: 'Ação desconhecida' };
  const { actor } = context;
  if (!ACTORS.includes(actor)) return { ok: false, code: 'unknown_actor', error: 'Ator desconhecido' };
  if (!action.actors.includes(actor)) {
    return { ok: false, code: 'forbidden_actor', error: `${action.label}: ação não permitida para ${actor}` };
  }
  const state = stateOf(demand);
  if (!matchesFrom(action, state)) {
    return {
      ok: false,
      code: 'invalid_transition',
      error: `${action.label}: não permitido a partir de ${state.status}${state.reviewState ? `/${state.reviewState}` : ''}`,
    };
  }
  const reviewer = typeof context.reviewer === 'string' ? context.reviewer.trim() : '';
  const note = typeof context.note === 'string' ? context.note.trim() : '';
  const reason = typeof context.reason === 'string' ? context.reason.trim() : '';
  if (action.requires.includes('revisor') && !reviewer) {
    return { ok: false, code: 'reviewer_required', error: 'Informe quem decidiu' };
  }
  if (action.requires.includes('parecer') && !note) {
    return { ok: false, code: 'note_required', error: 'O parecer é obrigatório na devolução' };
  }
  if (action.requires.includes('motivo') && !reason) {
    return { ok: false, code: 'reason_required', error: 'O motivo é obrigatório para arquivar' };
  }
  const next = {
    status: action.to.status,
    reviewState: action.to.reviewState ?? state.reviewState,
  };
  return {
    ok: true,
    next,
    event: {
      action: actionName,
      fromStatus: state.status,
      toStatus: next.status,
      reviewState: next.reviewState,
      actorType: actor,
      note: note || reason || null,
    },
  };
}

/** Transição de status permitida a `actor` (fora da análise), como no banco. */
function statusTransitionAllowed(from, to, actor) {
  return Object.values(ACTIONS).some((action) => action.actors.includes(actor)
    && action.to.status === to
    && action.from.status.includes(from)
    && !action.from.reviewState
    && to !== 'arquivada');
}

module.exports = {
  ACTIONS,
  isEditable,
  isPublic,
  availableActions,
  applyAction,
  statusTransitionAllowed,
};
