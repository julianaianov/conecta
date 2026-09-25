// Máquina de estados do status institucional (T13). Espelha a função
// institutional_status_transition_allowed da migração 010, que é a regra que
// vale no banco; test/institutional-domain.test.js compara as duas.
//
// O fluxo da fonte é Recebida → Em análise → Encaminhada → Em articulação →
// Aprovada para execução → Em execução → Concluída (Modelo de Conexão §16,
// decisão 16). "Não é de competência", "Encaminhada ao órgão responsável" e
// "Não aprovada" voltam à análise diante de fato novo; "Aguardando
// documentação" e "Suspensa" retomam o fluxo. Concluída e Cancelada são finais.

const { INSTITUTIONAL_STATUSES, STATUSES_REQUIRING_NOTE } = require('./constants');

const TRANSITIONS = {
  recebida: ['em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'nao_e_de_competencia',
    'encaminhada_ao_orgao_responsavel'],
  em_analise: ['solicitacao_de_informacoes', 'encaminhada', 'em_articulacao', 'aprovada_para_execucao',
    'em_execucao', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel', 'aguardando_documentacao',
    'nao_aprovada', 'suspensa', 'cancelada'],
  solicitacao_de_informacoes: ['em_analise', 'encaminhada', 'em_articulacao', 'aguardando_documentacao',
    'nao_e_de_competencia', 'nao_aprovada', 'cancelada'],
  encaminhada: ['em_analise', 'solicitacao_de_informacoes', 'em_articulacao', 'aprovada_para_execucao',
    'em_execucao', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel', 'nao_aprovada'],
  em_articulacao: ['solicitacao_de_informacoes', 'encaminhada', 'aprovada_para_execucao', 'em_execucao',
    'encaminhada_ao_orgao_responsavel', 'nao_aprovada', 'suspensa', 'cancelada'],
  aprovada_para_execucao: ['em_articulacao', 'em_execucao', 'suspensa', 'cancelada'],
  em_execucao: ['concluida', 'suspensa'],
  concluida: [],
  nao_e_de_competencia: ['em_analise'],
  encaminhada_ao_orgao_responsavel: ['em_analise'],
  aguardando_documentacao: ['em_analise', 'nao_aprovada', 'cancelada'],
  nao_aprovada: ['em_analise'],
  suspensa: ['em_analise', 'em_articulacao', 'aprovada_para_execucao', 'em_execucao', 'cancelada'],
  cancelada: [],
};

const INITIAL_STATUS = 'recebida';

function nextStatuses(status) {
  return TRANSITIONS[status] ? [...TRANSITIONS[status]] : [];
}

function canTransition(from, to) {
  return nextStatuses(from).includes(to);
}

function requiresNote(status) {
  return STATUSES_REQUIRING_NOTE.includes(status);
}

/**
 * Confere uma mudança de status. Retorna `{ ok: true }` ou
 * `{ ok: false, code, error }` (`invalid_status` → 422, `invalid_transition`
 * → 409, `note_required` → 422).
 */
function checkTransition(from, to, note) {
  if (!INSTITUTIONAL_STATUSES.includes(to)) {
    return { ok: false, code: 'invalid_status', error: 'Status institucional desconhecido' };
  }
  if (!canTransition(from, to)) {
    return {
      ok: false,
      code: 'invalid_transition',
      error: from === to
        ? 'O acompanhamento já está neste status'
        : 'Mudança de status não permitida a partir do status atual',
    };
  }
  if (requiresNote(to) && !(typeof note === 'string' && note.trim())) {
    return { ok: false, code: 'note_required', error: 'Informe a justificativa e, quando houver, o encaminhamento' };
  }
  return { ok: true };
}

module.exports = { TRANSITIONS, INITIAL_STATUS, nextStatuses, canTransition, requiresNote, checkTransition };
