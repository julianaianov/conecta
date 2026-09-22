// Vocabulário da atuação institucional do Poder Público (T13). Fonte:
// 03-fluxo-cadastro-poder-publico.html (slides 10, 12 e 13) e decisão 4 de
// decisoes-de-implementacao.md. Os valores são os mesmos dos enums da migração
// post-service/010-institutional-tracks.sql; test/institutional-domain.test.js
// confere as listas.

// Status institucional, por órgão e por demanda (slide 13): os 7 do fluxo e as
// duas situações de fora da competência.
const INSTITUTIONAL_STATUSES = [
  'recebida', 'em_analise', 'encaminhada', 'em_articulacao', 'acao_programada',
  'em_execucao', 'concluida', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel',
];

const INSTITUTIONAL_STATUS_LABELS = {
  recebida: 'Recebida',
  em_analise: 'Em análise',
  encaminhada: 'Encaminhada',
  em_articulacao: 'Em articulação',
  acao_programada: 'Ação programada',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  nao_e_de_competencia: 'Não é de competência',
  encaminhada_ao_orgao_responsavel: 'Encaminhada ao órgão responsável',
};

// Mudanças que exigem justificativa ("impossibilidade de atendimento dentro
// daquela competência, com o devido encaminhamento quando aplicável").
const STATUSES_REQUIRING_NOTE = ['nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel'];

// "A resposta poderá informar" (slide 10).
const RESPONSE_TYPES = [
  'recebimento', 'analise_em_andamento', 'orgao_ou_setor_responsavel', 'encaminhamento_realizado',
  'programa_publico_relacionado', 'acao_prevista', 'informacoes_adicionais',
  'impossibilidade_com_encaminhamento',
];

const RESPONSE_TYPE_LABELS = {
  recebimento: 'Recebimento da demanda',
  analise_em_andamento: 'Análise em andamento',
  orgao_ou_setor_responsavel: 'Órgão ou setor responsável',
  encaminhamento_realizado: 'Encaminhamento realizado',
  programa_publico_relacionado: 'Programa público relacionado',
  acao_prevista: 'Ação prevista',
  informacoes_adicionais: 'Necessidade de informações adicionais',
  impossibilidade_com_encaminhamento: 'Impossibilidade de atendimento nesta competência',
};

// "Recursos e formas de apoio" (slide 12).
const SUPPORT_TYPES = [
  'recursos_publicos', 'servicos_publicos', 'programas_e_politicas_publicas', 'infraestrutura',
  'equipamentos', 'espacos_publicos', 'equipes', 'conhecimento_tecnico',
  'encaminhamentos_administrativos', 'articulacao_institucional', 'parcerias',
];

const SUPPORT_TYPE_LABELS = {
  recursos_publicos: 'Recursos públicos',
  servicos_publicos: 'Serviços públicos',
  programas_e_politicas_publicas: 'Programas e políticas públicas',
  infraestrutura: 'Infraestrutura',
  equipamentos: 'Equipamentos',
  espacos_publicos: 'Espaços públicos',
  equipes: 'Equipes',
  conhecimento_tecnico: 'Conhecimento técnico',
  encaminhamentos_administrativos: 'Encaminhamentos administrativos',
  articulacao_institucional: 'Articulação institucional',
  parcerias: 'Parcerias',
};

// Eventos que a atuação institucional grava em demand_events (triggers da
// migração 010). Os públicos expõem só payload->'public' na linha do tempo.
const INSTITUTIONAL_EVENT_TYPES = [
  'acompanhamento_institucional_aberto', 'status_institucional_alterado',
  'resposta_institucional', 'apoio_institucional_oferecido',
];

// Filtro da lista do Poder Público: demandas ainda sem acompanhamento do órgão.
const WITHOUT_TRACK = 'sem_acompanhamento';

// Alcance da lista: território de atuação do órgão (município/UF pela esfera)
// ou todas as demandas publicadas.
const SCOPES = ['jurisdicao', 'todas'];

const LIMITS = {
  body: 5000,
  note: 2000,
  description: 3000,
  name: 255,
  url: 1000,
};

module.exports = {
  INSTITUTIONAL_STATUSES,
  INSTITUTIONAL_STATUS_LABELS,
  STATUSES_REQUIRING_NOTE,
  RESPONSE_TYPES,
  RESPONSE_TYPE_LABELS,
  SUPPORT_TYPES,
  SUPPORT_TYPE_LABELS,
  INSTITUTIONAL_EVENT_TYPES,
  WITHOUT_TRACK,
  SCOPES,
  LIMITS,
};
