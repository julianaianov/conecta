// Vocabulário da prestação de contas e da prestação de resultados (T18).
//
// Fonte: 02-fluxo-cadastro-agente-de-transformacao.html — slide 24 ("Etapa 10 ·
// Prestação de resultados": ao longo e ao final da execução deverão ser
// registrados documentos e evidências, incluindo, **obrigatoriamente quando
// aplicável**: fotos do antes e depois, filmagem do antes e depois, registros
// das ações realizadas, comprovantes financeiros quando aplicável, relatórios
// de execução, atualização do cronograma, número de beneficiários, resultados
// alcançados e indicadores de impacto), slide 15 (metas, resultados esperados,
// indicadores de acompanhamento e forma de mensuração — a prestação fecha cada
// um com o valor medido), slide 23 (execução orçamentária e resultados
// parciais, registrados na T17) e slide 25, passo 18.
//
// Os valores são os mesmos dos enums da migração
// post-service/015-accountability.sql (test/accountability-domain.test.js
// confere), e `src/lib/app/accountability.ts` os repete no frontend.

// Estado do registro final: o Agente monta em `rascunho` e congela ao concluir.
const ACCOUNTABILITY_STATUSES = ['rascunho', 'concluida'];

const ACCOUNTABILITY_STATUS_LABELS = {
  rascunho: 'Em preparação',
  concluida: 'Prestação concluída',
};

// Anexos do slide 24 e, desde a migração 035 (T-05-12), as evidências
// documentais do Modelo de Conexão §20: notas fiscais, laudos, certificados,
// registros técnicos, relatórios e documentos. Ordem do enum
// `demand_accountability_document_kind`; vale também para os documentos da
// execução (`demand_execution_documents`).
const DOCUMENT_KINDS = [
  'comprovante_financeiro', 'relatorio_execucao', 'registro_acao', 'outro',
  'nota_fiscal', 'laudo', 'certificado', 'registro_tecnico', 'relatorio', 'documento',
];

const DOCUMENT_KIND_LABELS = {
  comprovante_financeiro: 'Comprovante financeiro',
  relatorio_execucao: 'Relatório de execução',
  registro_acao: 'Registro da ação realizada',
  outro: 'Outro documento',
  nota_fiscal: 'Nota fiscal',
  laudo: 'Laudo',
  certificado: 'Certificado',
  registro_tecnico: 'Registro técnico',
  relatorio: 'Relatório',
  documento: 'Documento',
};

// Finalidade de upload (T08) dos anexos da prestação.
const ACCOUNTABILITY_UPLOAD_PURPOSE = 'demand_accountability_document';

// A prestação só existe com a demanda no último status canônico (decisão 4).
const ACCOUNTABILITY_OPEN_STATUSES = ['prestacao_de_contas'];

// Linha do tempo (trigger da migração 015). Público.
const ACCOUNTABILITY_EVENT_TYPES = ['prestacao_de_contas_concluida'];

/**
 * Exigências da conclusão. `condition`:
 * - `sempre`: a fonte pede em toda prestação;
 * - `execucao_fisica`: só quando a demanda declarou execução física e o Agente
 *   não registrou a justificativa de ausência de registro (T17);
 * - `apoio_financeiro`: só quando o Agente declara apoio financeiro recebido
 *   ("comprovantes financeiros, **quando aplicável**");
 * - `previsto_no_cronograma` (T-02-04): quando alguma etapa do cronograma
 *   previu o registro do acompanhamento (Fluxo 2, slide 14). É **informativa**
 *   (`informative: true`): aparece na lista, nunca bloqueia a conclusão — a
 *   fonte diz "quando aplicável" (slide 12, filmagem do processo).
 */
const REQUIREMENTS = [
  { key: 'execution_report', condition: 'sempre', label: 'Relatório de execução' },
  { key: 'actions_record', condition: 'sempre', label: 'Registros das ações realizadas' },
  { key: 'schedule_summary', condition: 'sempre', label: 'Atualização final do cronograma' },
  { key: 'beneficiaries_reached', condition: 'sempre', label: 'Número de beneficiários alcançados' },
  { key: 'impact_indicators', condition: 'sempre', label: 'Indicadores de impacto' },
  // Modelo de Conexão §21 (T-05-13, migração 036).
  { key: 'participants', condition: 'sempre', label: 'Quem participou' },
  { key: 'final_result', condition: 'sempre', label: 'Resultado final' },
  { key: 'results', condition: 'sempre', label: 'Resultado alcançado de cada meta declarada' },
  { key: 'evidence_antes', condition: 'execucao_fisica', label: 'Registro do "antes" (foto ou filmagem)' },
  { key: 'evidence_depois', condition: 'execucao_fisica', label: 'Registro do "depois" (foto ou filmagem)' },
  { key: 'financial_summary', condition: 'apoio_financeiro', label: 'Resumo da aplicação do apoio financeiro' },
  { key: 'financial_receipt', condition: 'apoio_financeiro', label: 'Comprovante financeiro anexado' },
  {
    key: 'evidence_acompanhamento',
    condition: 'previsto_no_cronograma',
    label: 'Registro do acompanhamento previsto no cronograma',
    informative: true,
  },
];

const REQUIREMENT_KEYS = REQUIREMENTS.map((r) => r.key);

const MAX_EXECUTION_REPORT = 20000;
const MAX_ACTIONS_RECORD = 8000;
const MAX_SCHEDULE_SUMMARY = 8000;
const MAX_IMPACT_INDICATORS = 8000;
const MAX_FINANCIAL_SUMMARY = 8000;
const MAX_BENEFICIARIES_NOTE = 4000;
const MAX_PARTICIPANTS = 4000;
const MAX_LOCATION_SUMMARY = 2000;
const MAX_FINAL_RESULT = 8000;

// As dez perguntas do registro de resultados (Modelo de Conexão §21), com o
// campo que responde cada uma na prestação de contas.
const RESULT_QUESTIONS = [
  { key: 'what', question: 'O que foi realizado?' },
  { key: 'where', question: 'Onde?' },
  { key: 'when', question: 'Quando?' },
  { key: 'who', question: 'Quem participou?' },
  { key: 'howMany', question: 'Quantas pessoas?' },
  { key: 'goals', question: 'Quais metas?' },
  { key: 'indicators', question: 'Quais indicadores?' },
  { key: 'resources', question: 'Quais recursos?' },
  { key: 'evidence', question: 'Quais evidências?' },
  { key: 'finalResult', question: 'Qual foi o resultado final?' },
];
const MAX_RESULT_NOTE = 4000;
const MAX_MEASURED_VALUE = 500;
const MAX_MEASUREMENT_METHOD = 2000;
const MAX_DOCUMENT_TITLE = 200;
const MAX_DOCUMENT_DESCRIPTION = 2000;
const MAX_DOCUMENTS = 60;
// 100 milhões de pessoas: teto do CHECK da migração.
const MAX_BENEFICIARIES = 100_000_000;
// R$ 99.999.999,99 em centavos, o mesmo teto do orçamento da demanda.
const MAX_AMOUNT_CENTS = 9_999_999_999;

module.exports = {
  ACCOUNTABILITY_STATUSES,
  ACCOUNTABILITY_STATUS_LABELS,
  DOCUMENT_KINDS,
  DOCUMENT_KIND_LABELS,
  ACCOUNTABILITY_UPLOAD_PURPOSE,
  ACCOUNTABILITY_OPEN_STATUSES,
  ACCOUNTABILITY_EVENT_TYPES,
  REQUIREMENTS,
  REQUIREMENT_KEYS,
  MAX_EXECUTION_REPORT,
  MAX_ACTIONS_RECORD,
  MAX_SCHEDULE_SUMMARY,
  MAX_IMPACT_INDICATORS,
  MAX_FINANCIAL_SUMMARY,
  MAX_BENEFICIARIES_NOTE,
  MAX_PARTICIPANTS,
  MAX_LOCATION_SUMMARY,
  MAX_FINAL_RESULT,
  RESULT_QUESTIONS,
  MAX_RESULT_NOTE,
  MAX_MEASURED_VALUE,
  MAX_MEASUREMENT_METHOD,
  MAX_DOCUMENT_TITLE,
  MAX_DOCUMENT_DESCRIPTION,
  MAX_DOCUMENTS,
  MAX_BENEFICIARIES,
  MAX_AMOUNT_CENTS,
};
