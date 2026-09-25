// Vocabulário da execução, das evidências e do acompanhamento (T17).
//
// Fonte: 02-fluxo-cadastro-agente-de-transformacao.html — slide 11 (registro
// do "antes" e do "depois"), slide 12 (o que o registro deve contemplar),
// slide 14 (os momentos de registro no cronograma: situação inicial,
// acompanhamento e resultado final), slide 23 (execução e acompanhamento:
// etapas concluídas, etapas em andamento, cumprimento do cronograma,
// alterações de prazo, execução orçamentária, resultados parciais e
// evidências) e slide 24 (os registros de antes e depois ficam vinculados à
// demanda e compõem o histórico visual).
//
// Os valores são os mesmos dos enums da migração post-service/014-execution.sql
// (test/execution-domain.test.js confere), e `src/lib/app/execution.ts` os
// repete no frontend.

// Marcos do registro (enum `demand_record_milestone`, criado na migração 007
// para o cronograma e reutilizado pela evidência).
const RECORD_MILESTONES = ['antes', 'acompanhamento', 'depois'];

const RECORD_MILESTONE_LABELS = {
  antes: 'Antes (situação inicial)',
  acompanhamento: 'Acompanhamento (durante a execução)',
  depois: 'Depois (resultado final)',
};

// Fotografia e filmagem (slide 12: fotografias do antes e do depois, filmagem
// do processo e registro audiovisual do resultado final).
const EVIDENCE_MEDIA_KINDS = ['foto', 'video'];

const EVIDENCE_MEDIA_LABELS = {
  foto: 'Fotografia',
  video: 'Filmagem',
};

// Finalidade de upload (T08) de cada tipo de registro.
const EVIDENCE_PURPOSE_BY_MEDIA = {
  foto: 'demand_evidence_photo',
  video: 'demand_evidence_video',
};

// Situação da etapa do cronograma (slide 23; Modelo de Conexão §18: "Não
// iniciada, Em andamento, Concluída, Atrasada, Bloqueada"). `atrasada` também
// é gravada pela plataforma (`demand_stage_delays`, migração 034) quando o
// prazo corrente vence; `bloqueada` é declarada com o motivo.
const STAGE_PROGRESS = ['nao_iniciada', 'em_andamento', 'concluida', 'atrasada', 'bloqueada'];

const STAGE_PROGRESS_LABELS = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  atrasada: 'Atrasada',
  bloqueada: 'Bloqueada',
};

// Ocorrências da execução (Modelo de Conexão §19), enums da migração 034.
const INCIDENT_KINDS = [
  'atraso', 'bloqueio', 'alteracao_de_escopo', 'problema_tecnico', 'seguranca', 'clima',
  'fornecedor', 'outra',
];

const INCIDENT_KIND_LABELS = {
  atraso: 'Atraso',
  bloqueio: 'Bloqueio',
  alteracao_de_escopo: 'Alteração de escopo',
  problema_tecnico: 'Problema técnico',
  seguranca: 'Segurança',
  clima: 'Clima',
  fornecedor: 'Fornecedor',
  outra: 'Outra',
};

const INCIDENT_IMPACTS = ['prazo', 'custo', 'escopo', 'nenhum'];

const INCIDENT_IMPACT_LABELS = {
  prazo: 'Prazo',
  custo: 'Custo',
  escopo: 'Escopo',
  nenhum: 'Sem impacto',
};

// Desfecho do atraso gravado (`demand_stage_delays.resolution`).
const DELAY_RESOLUTIONS = ['concluida', 'novo_prazo', 'bloqueada', 'fim_da_execucao'];

/**
 * Etapa atrasada: prazo corrente (`YYYY-MM-DD`) antes de hoje e etapa não
 * concluída nem bloqueada. É a mesma regra da gravação
 * (`demand_record_stage_delays`, migração 034) e da gestão
 * (`App\Support\ExecutionDelay`); só vale com a demanda em execução.
 */
function isLate(currentEndsOn, progress, today = new Date()) {
  if (typeof currentEndsOn !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(currentEndsOn)) return false;
  if (progress === 'concluida' || progress === 'bloqueada') return false;
  const day = typeof today === 'string' ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  return currentEndsOn.slice(0, 10) < day;
}

/**
 * Situação corrente da etapa: a declarada, com `atrasada` quando há atraso
 * gravado em aberto ou quando o prazo venceu (entre duas passadas do laço).
 */
function stageStatus({ declared = null, openDelay = false, currentEndsOn = null, running = true }, today = new Date()) {
  if (declared === 'concluida' || declared === 'bloqueada') return declared;
  if (running && (openDelay || isLate(currentEndsOn, declared, today))) return 'atrasada';
  return declared ?? 'nao_iniciada';
}

// A evidência é registrada da publicação em diante — o "antes" precede o
// início da execução.
const EVIDENCE_OPEN_STATUSES = [
  'publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao', 'concluida', 'prestacao_de_contas',
];

// O andamento é registrado a partir do início da execução.
const PROGRESS_OPEN_STATUSES = ['em_execucao', 'concluida', 'prestacao_de_contas'];

// Estados em que o Agente ainda pode justificar a ausência de execução física.
const WAIVER_OPEN_STATUSES = ['publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao'];

// Marco exigido por transição (`iniciar_execucao` e `concluir`), salvo
// justificativa de ausência de execução física. O trigger
// `demand_execution_guard` impõe a mesma regra no banco.
const TRANSITION_REQUIRED_MILESTONE = {
  iniciar_execucao: 'antes',
  concluir: 'depois',
};

// Linha do tempo (triggers da migração 014). Todos são públicos e expõem só
// `payload->'public'`.
const EXECUTION_EVENT_TYPES = [
  'evidencia_registrada', 'registro_pareado', 'andamento_registrado',
  'prazo_alterado', 'registro_dispensado',
  // Migração 034 (T-05-11): atraso gravado e ocorrências.
  'etapa_atrasada', 'ocorrencia_registrada', 'ocorrencia_resolvida',
];

const MAX_CAPTION = 500;
const MAX_PARTIAL_RESULTS = 4000;
const MAX_NOTE = 2000;
const MAX_REASON = 2000;
const MAX_INCIDENT_TEXT = 4000;
const MAX_EXPENSE_DESCRIPTION = 500;
const MAX_EXPENSES = 50;
// R$ 99.999.999,99 em centavos, o mesmo teto do orçamento da demanda.
const MAX_EXECUTED_CENTS = 9_999_999_999;

module.exports = {
  RECORD_MILESTONES,
  RECORD_MILESTONE_LABELS,
  EVIDENCE_MEDIA_KINDS,
  EVIDENCE_MEDIA_LABELS,
  EVIDENCE_PURPOSE_BY_MEDIA,
  STAGE_PROGRESS,
  STAGE_PROGRESS_LABELS,
  INCIDENT_KINDS,
  INCIDENT_KIND_LABELS,
  INCIDENT_IMPACTS,
  INCIDENT_IMPACT_LABELS,
  DELAY_RESOLUTIONS,
  isLate,
  stageStatus,
  EVIDENCE_OPEN_STATUSES,
  PROGRESS_OPEN_STATUSES,
  WAIVER_OPEN_STATUSES,
  TRANSITION_REQUIRED_MILESTONE,
  EXECUTION_EVENT_TYPES,
  MAX_CAPTION,
  MAX_PARTIAL_RESULTS,
  MAX_NOTE,
  MAX_REASON,
  MAX_INCIDENT_TEXT,
  MAX_EXPENSE_DESCRIPTION,
  MAX_EXPENSES,
  MAX_EXECUTED_CENTS,
};
