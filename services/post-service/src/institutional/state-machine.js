// Máquina de estados do status institucional (T13). Espelha a função
// institutional_status_transition_allowed da migração 010, que é a regra que
// vale no banco; test/institutional-domain.test.js compara as duas.
//
// O fluxo da fonte é Recebida → Em análise → Encaminhada → Em articulação →
// Ação programada → Em execução → Concluída. "Não é de competência" e
// "Encaminhada ao órgão responsável" podem ser registradas enquanto o órgão
// ainda não programou a ação, e voltam à análise diante de fato novo.
// Concluída é final.

const { INSTITUTIONAL_STATUSES, STATUSES_REQUIRING_NOTE } = require('./constants');

const TRANSITIONS = {
  recebida: ['em_analise', 'encaminhada', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel'],
  em_analise: ['encaminhada', 'em_articulacao', 'acao_programada', 'em_execucao',
    'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel'],
  encaminhada: ['em_analise', 'em_articulacao', 'acao_programada', 'em_execucao',
    'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel'],
  em_articulacao: ['encaminhada', 'acao_programada', 'em_execucao', 'encaminhada_ao_orgao_responsavel'],
  acao_programada: ['em_articulacao', 'em_execucao'],
  em_execucao: ['concluida'],
  concluida: [],
  nao_e_de_competencia: ['em_analise'],
  encaminhada_ao_orgao_responsavel: ['em_analise'],
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
