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

// Situação da etapa do cronograma na atualização de andamento (slide 23).
// TODO(fonte-da-verdade): Modelo de Conexão §18 — faltam os status Atrasada e Bloqueada; ver TODO em migrations/014-execution.sql.
const STAGE_PROGRESS = ['nao_iniciada', 'em_andamento', 'concluida'];

const STAGE_PROGRESS_LABELS = {
  nao_iniciada: 'Não iniciada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

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
];

const MAX_CAPTION = 500;
const MAX_PARTIAL_RESULTS = 4000;
const MAX_NOTE = 2000;
const MAX_REASON = 2000;
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
  EVIDENCE_OPEN_STATUSES,
  PROGRESS_OPEN_STATUSES,
  WAIVER_OPEN_STATUSES,
  TRANSITION_REQUIRED_MILESTONE,
  EXECUTION_EVENT_TYPES,
  MAX_CAPTION,
  MAX_PARTIAL_RESULTS,
  MAX_NOTE,
  MAX_REASON,
  MAX_EXPENSE_DESCRIPTION,
  MAX_EXPENSES,
  MAX_EXECUTED_CENTS,
};
