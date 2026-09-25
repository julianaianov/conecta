// Máquina de estados do Processo de Conexão (T-05-01, Modelo de Conexão §16,
// decisão 16). Espelha connection_process_transition_allowed da migração 026,
// que é a regra que vale no banco; test/process-domain.test.js compara.
//
// Fluxo: Recebida → Em análise → Solicitação de informações → Encaminhada →
// Em articulação → Aprovada para execução → Em execução → Concluída →
// Prestação de contas / Resultados. Na análise, as etapas se alternam e podem
// ser puladas; de qualquer etapa aberta cabem as exceções. Aguardando
// documentação, Aguardando recurso e Suspensa voltam ao status de onde saíram
// (`previousStatus`). Não aprovada, Não é competência do órgão, Cancelada e
// Prestação de contas encerram o processo.

const {
  PROCESS_STATUSES, PAUSE_STATUSES, FINAL_STATUSES, STATUSES_REQUIRING_NOTE, ACTOR_STATUSES,
  GOVERNMENT_ONLY_STATUSES,
} = require('./constants');

const ANALYSIS_EXCEPTIONS = [
  'aguardando_documentacao', 'aguardando_recurso', 'suspensa', 'nao_e_de_competencia', 'nao_aprovada', 'cancelada',
];

const TRANSITIONS = {
  recebida: ['em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao', 'aprovada_para_execucao',
    'em_execucao', ...ANALYSIS_EXCEPTIONS],
  em_analise: ['solicitacao_de_informacoes', 'encaminhada', 'em_articulacao', 'aprovada_para_execucao', 'em_execucao',
    ...ANALYSIS_EXCEPTIONS],
  solicitacao_de_informacoes: ['em_analise', 'encaminhada', 'em_articulacao', 'aprovada_para_execucao', 'em_execucao',
    ...ANALYSIS_EXCEPTIONS],
  encaminhada: ['em_analise', 'solicitacao_de_informacoes', 'em_articulacao', 'aprovada_para_execucao', 'em_execucao',
    ...ANALYSIS_EXCEPTIONS],
  em_articulacao: ['em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'aprovada_para_execucao', 'em_execucao',
    ...ANALYSIS_EXCEPTIONS],
  aprovada_para_execucao: ['em_articulacao', 'em_execucao', 'aguardando_documentacao', 'aguardando_recurso', 'suspensa',
    'cancelada'],
  em_execucao: ['concluida', 'aguardando_recurso', 'suspensa', 'cancelada'],
  concluida: ['prestacao_de_contas'],
  prestacao_de_contas: [],
  // Além destas, a pausa volta ao status anterior.
  aguardando_documentacao: ['aguardando_recurso', 'suspensa', 'nao_e_de_competencia', 'nao_aprovada', 'cancelada'],
  aguardando_recurso: ['aguardando_documentacao', 'suspensa', 'nao_e_de_competencia', 'nao_aprovada', 'cancelada'],
  suspensa: ['aguardando_documentacao', 'aguardando_recurso', 'nao_e_de_competencia', 'nao_aprovada', 'cancelada'],
  nao_e_de_competencia: [],
  nao_aprovada: [],
  cancelada: [],
};

const isFinal = (status) => FINAL_STATUSES.includes(status);
const requiresNote = (status) => STATUSES_REQUIRING_NOTE.includes(status);

/** Próximos status a partir de `status` (com a volta da pausa, quando há `previous`). */
function nextStatuses(status, previous = null) {
  const list = TRANSITIONS[status] ? [...TRANSITIONS[status]] : [];
  if (PAUSE_STATUSES.includes(status) && previous && !list.includes(previous)) list.unshift(previous);
  return list;
}

/**
 * Status que este ator pode escolher agora. `actor`: `agente` | `parte`;
 * `partyKind`: tipo da parte do processo. "Encaminhada" e "Não é competência
 * do órgão" são do Poder Público.
 */
function statusesFor(actor, { status, previousStatus = null, partyKind }) {
  const allowed = ACTOR_STATUSES[actor] ?? [];
  return nextStatuses(status, previousStatus).filter((to) => {
    if (GOVERNMENT_ONLY_STATUSES.includes(to) && partyKind !== 'poder_publico') return false;
    if (PAUSE_STATUSES.includes(status) && to === previousStatus) return true;
    return allowed.includes(to);
  });
}

/**
 * Confere uma mudança de status pedida por um ator. `{ ok: true }` ou
 * `{ ok: false, code, error }`: `invalid_status` e `note_required` → 422,
 * `invalid_transition` → 409, `forbidden_status` → 403.
 */
function checkTransition(process, to, note, actor) {
  if (!PROCESS_STATUSES.includes(to)) {
    return { ok: false, code: 'invalid_status', error: 'Status do processo desconhecido' };
  }
  const from = process.status;
  if (!nextStatuses(from, process.previousStatus).includes(to)
      || (to === 'nao_e_de_competencia' && process.partyKind !== 'poder_publico')) {
    return {
      ok: false,
      code: 'invalid_transition',
      error: from === to ? 'O processo já está neste status' : 'Mudança de status não permitida a partir do status atual',
    };
  }
  if (actor && !statusesFor(actor, process).includes(to)) {
    return {
      ok: false,
      code: 'forbidden_status',
      error: actor === 'agente'
        ? 'Este status é registrado pela parte conectada'
        : 'Este status é registrado pelo Agente autor da demanda',
    };
  }
  if (requiresNote(to) && !(typeof note === 'string' && note.trim())) {
    return { ok: false, code: 'note_required', error: 'Informe o motivo' };
  }
  return { ok: true };
}

module.exports = { TRANSITIONS, isFinal, requiresNote, nextStatuses, statusesFor, checkTransition };
