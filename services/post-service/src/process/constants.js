// Vocabulário do Processo de Conexão (T-05-01). Fonte: Modelo de Conexão §11
// (protocolo), §14 (responsável atual), §16 (status padronizados), §26–§28
// (quem se conecta e com o quê) e §35 (linha do tempo por conexão); decisões
// 13 e 16 de dm-docs/fonte-da-verdade/decisoes-de-implementacao.md. Os valores
// são os dos enums da migração post-service/026-connection-processes.sql;
// test/process-domain.test.js confere as listas e as transições.

// §16: o fluxo (9) e as situações de exceção (6).
const MAIN_FLOW = [
  'recebida', 'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
  'aprovada_para_execucao', 'em_execucao', 'concluida', 'prestacao_de_contas',
];
const EXCEPTION_STATUSES = [
  'aguardando_documentacao', 'aguardando_recurso', 'nao_e_de_competencia', 'nao_aprovada', 'suspensa', 'cancelada',
];
const PROCESS_STATUSES = [...MAIN_FLOW, ...EXCEPTION_STATUSES];

const PROCESS_STATUS_LABELS = {
  recebida: 'Recebida',
  em_analise: 'Em análise',
  solicitacao_de_informacoes: 'Solicitação de informações',
  encaminhada: 'Encaminhada',
  em_articulacao: 'Em articulação',
  aprovada_para_execucao: 'Aprovada para execução',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  prestacao_de_contas: 'Prestação de contas / Resultados',
  aguardando_documentacao: 'Aguardando documentação',
  aguardando_recurso: 'Aguardando recurso',
  nao_e_de_competencia: 'Não é competência do órgão',
  nao_aprovada: 'Não aprovada',
  suspensa: 'Suspensa',
  cancelada: 'Cancelada',
};

// Pausas: guardam o status anterior e voltam a ele.
const PAUSE_STATUSES = ['aguardando_documentacao', 'aguardando_recurso', 'suspensa'];
// Encerram o processo (closed_at).
const FINAL_STATUSES = ['nao_e_de_competencia', 'nao_aprovada', 'cancelada', 'prestacao_de_contas'];
// "Recusar a demanda informando o motivo" (§10) e as interrupções.
const STATUSES_REQUIRING_NOTE = ['nao_e_de_competencia', 'nao_aprovada', 'suspensa', 'cancelada'];
// Status em que o processo pode nascer (o do órgão herda o do acompanhamento).
const INITIAL_STATUSES = [
  'recebida', 'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao',
  'aprovada_para_execucao', 'em_execucao',
];
// Só o Poder Público declara que a demanda não é da sua competência.
const GOVERNMENT_ONLY_STATUSES = ['encaminhada', 'nao_e_de_competencia'];

// Quem muda para qual status. O Agente conduz a execução e a prestação de
// contas; a parte conectada conduz a análise (§10, §26, §27). Voltar de uma
// pausa ao status anterior vale para os dois lados.
const ACTOR_STATUSES = {
  agente: ['em_execucao', 'concluida', 'prestacao_de_contas', 'aguardando_recurso', 'suspensa', 'cancelada'],
  parte: [
    'em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'em_articulacao', 'aprovada_para_execucao',
    'aguardando_documentacao', 'aguardando_recurso', 'nao_e_de_competencia', 'nao_aprovada', 'suspensa', 'cancelada',
  ],
};

// Tipo de ator da parte (§26–§27): Poder Público e subperfis de Parceiro.
const PARTY_KINDS = ['poder_publico', 'empresa', 'marca', 'comercio_local', 'patrocinador', 'investidor', 'parceiro_outro'];
const PARTY_KIND_LABELS = {
  poder_publico: 'Poder Público',
  empresa: 'Empresa',
  marca: 'Marca',
  comercio_local: 'Comércio local',
  patrocinador: 'Patrocinador',
  investidor: 'Investidor',
  parceiro_outro: 'Parceiro',
};
// Subperfil da conta (src/lib/app/types.ts) → tipo de parte.
const PROFILE_PARTY_KIND = {
  empresa: 'empresa', marca: 'marca', comercio_local: 'comercio_local', patrocinador: 'patrocinador',
  investidor: 'investidor',
};

// O que cada conectado contribui (§26–§28).
const CONTRIBUTION_KINDS = [
  'apoio_financeiro', 'patrocinio', 'materiais', 'equipamentos', 'servicos', 'equipe', 'conhecimento_tecnico',
  'execucao_de_etapa', 'infraestrutura', 'articulacao', 'autorizacao', 'encaminhamento', 'programa_publico',
  'recurso_publico',
];
const CONTRIBUTION_KIND_LABELS = {
  apoio_financeiro: 'Apoio financeiro',
  patrocinio: 'Patrocínio',
  materiais: 'Materiais',
  equipamentos: 'Equipamentos',
  servicos: 'Serviços',
  equipe: 'Equipe',
  conhecimento_tecnico: 'Conhecimento técnico',
  execucao_de_etapa: 'Execução de etapa',
  infraestrutura: 'Infraestrutura',
  articulacao: 'Articulação',
  autorizacao: 'Autorização',
  encaminhamento: 'Encaminhamento',
  programa_publico: 'Programa público',
  recurso_publico: 'Recurso público',
};
// Contribuições em que cabe valor em centavos.
const FINANCIAL_CONTRIBUTIONS = ['apoio_financeiro', 'patrocinio'];

// Oferta declarada no interesse de apoio (T15) → contribuição do processo.
const INTEREST_OFFER_CONTRIBUTION = {
  recursos: 'apoio_financeiro',
  investimento: 'apoio_financeiro',
  produtos: 'materiais',
  servicos: 'servicos',
  conhecimento: 'conhecimento_tecnico',
  estrutura: 'infraestrutura',
  // Modelo §27 (T-05-15, migração 038): o mesmo vocabulário do processo.
  materiais: 'materiais',
  equipamentos: 'equipamentos',
  equipe: 'equipe',
  execucao_de_etapa: 'execucao_de_etapa',
  patrocinio: 'patrocinio',
  parceria: 'articulacao',
};
// Forma de apoio do órgão (T13, Fluxo 3 slide 12) → contribuição do processo.
const SUPPORT_TYPE_CONTRIBUTION = {
  recursos_publicos: 'recurso_publico',
  servicos_publicos: 'servicos',
  programas_e_politicas_publicas: 'programa_publico',
  infraestrutura: 'infraestrutura',
  equipamentos: 'equipamentos',
  espacos_publicos: 'infraestrutura',
  equipes: 'equipe',
  conhecimento_tecnico: 'conhecimento_tecnico',
  encaminhamentos_administrativos: 'encaminhamento',
  articulacao_institucional: 'articulacao',
  parcerias: 'articulacao',
};

// `conexao_direta`: conexão pedida pelo Agente a um potencial parceiro (T30),
// aceita pela outra parte (migração 030).
const ORIGIN_KINDS = ['interesse', 'oferta_institucional', 'acompanhamento_institucional', 'conexao_direta'];

// Tipo da conexão do user-service (routes/connections.js) → contribuição
// inicial do processo nascido da conexão direta; a parte ajusta depois.
const CONNECTION_TYPE_CONTRIBUTION = {
  sponsorship: ['patrocinio'],
  resources: ['materiais'],
  support: [],
  partnership: ['articulacao'],
  meeting: [],
  outreach: [],
};

// Eventos que o processo grava em demand_events (triggers da migração 026).
// Os públicos expõem só payload->'public' (protocolo, número, tipo de parte,
// contribuição, status; o nome só quando a parte é órgão público).
const PROCESS_EVENT_TYPES = ['processo_formalizado', 'processo_status_alterado'];
const PROCESS_PRIVATE_EVENT_TYPES = [
  'responsavel_do_processo_definido', 'prazo_definido', 'prazo_cumprido', 'prazo_vencido',
];

// Prazos por etapa (§15, T-05-03; migração 028). A sugestão de dias é a da
// tabela da fonte; `outra` exige o nome da etapa e os dias ou a data.
const DEADLINE_STAGES = [
  'analise_inicial', 'envio_de_documentacao', 'analise_tecnica', 'elaboracao_do_plano', 'execucao', 'outra',
];
const DEADLINE_STAGE_LABELS = {
  analise_inicial: 'Análise inicial',
  envio_de_documentacao: 'Envio de documentação',
  analise_tecnica: 'Análise técnica',
  elaboracao_do_plano: 'Elaboração do plano',
  execucao: 'Execução',
  outra: 'Outra etapa',
};
const DEADLINE_DEFAULT_DAYS = {
  analise_inicial: 5,
  envio_de_documentacao: 3,
  analise_tecnica: 10,
  elaboracao_do_plano: 7,
  execucao: 60,
};
// Quem responde pela etapa e define o prazo dela: a parte conectada
// (Poder Público/Parceiro) na análise; o Agente na documentação, no plano e
// na execução. Em `outra`, quem define escolhe o lado responsável.
const DEADLINE_STAGE_SIDE = {
  analise_inicial: 'parte',
  envio_de_documentacao: 'agente',
  analise_tecnica: 'parte',
  elaboracao_do_plano: 'agente',
  execucao: 'agente',
};
const DEADLINE_SIDES = ['agente', 'parte'];
const DEADLINE_STATUSES = ['aberto', 'cumprido', 'vencido'];
const DEADLINE_STATUS_LABELS = { aberto: 'Em aberto', cumprido: 'Cumprido', vencido: 'Vencido' };
// "Prazos próximos": aviso a partir de 3 dias antes da data limite.
const DEADLINE_WARNING_DAYS = 3;
const DEADLINE_MAX_DAYS = 365;
const DEADLINE_EVENT_TYPES = ['prazo_definido', 'prazo_cumprido', 'prazo_vencido'];

const PROTOCOL_RE = /^DM-\d{4}-\d{6}$/;

const LIMITS = {
  note: 2000,
  description: 3000,
  name: 255,
  maxAmountCents: 100_000_000_000,
};

module.exports = {
  MAIN_FLOW,
  EXCEPTION_STATUSES,
  PROCESS_STATUSES,
  PROCESS_STATUS_LABELS,
  PAUSE_STATUSES,
  FINAL_STATUSES,
  STATUSES_REQUIRING_NOTE,
  INITIAL_STATUSES,
  GOVERNMENT_ONLY_STATUSES,
  ACTOR_STATUSES,
  PARTY_KINDS,
  PARTY_KIND_LABELS,
  PROFILE_PARTY_KIND,
  CONTRIBUTION_KINDS,
  CONTRIBUTION_KIND_LABELS,
  FINANCIAL_CONTRIBUTIONS,
  INTEREST_OFFER_CONTRIBUTION,
  SUPPORT_TYPE_CONTRIBUTION,
  ORIGIN_KINDS,
  CONNECTION_TYPE_CONTRIBUTION,
  PROCESS_EVENT_TYPES,
  PROCESS_PRIVATE_EVENT_TYPES,
  DEADLINE_STAGES,
  DEADLINE_STAGE_LABELS,
  DEADLINE_DEFAULT_DAYS,
  DEADLINE_STAGE_SIDE,
  DEADLINE_SIDES,
  DEADLINE_STATUSES,
  DEADLINE_STATUS_LABELS,
  DEADLINE_WARNING_DAYS,
  DEADLINE_MAX_DAYS,
  DEADLINE_EVENT_TYPES,
  PROTOCOL_RE,
  LIMITS,
};
