// Vocabulário da inteligência artificial (T23). Fonte:
// dm-docs/fonte-da-verdade/01-apresentacao-institucional.html, slide 23
// ("Inteligência artificial": organização automática de demandas, detecção de
// urgência, sugestão de editais, conexão com patrocinadores ideais e geração
// de relatórios para governo). Decisão 6 de decisoes-de-implementacao.md.
//
// Os valores são os mesmos do enum `ai_suggestion_kind` da migração
// post-service/022-ai-suggestions.sql; test/ai-domain.test.js confere as duas
// listas, e src/lib/app/ai.ts é o espelho do frontend (ai.test.mjs compara).
//
// Duas regras atravessam este módulo inteiro:
//   1. Tudo que sai do modelo é **sugestão**, marcada como tal no banco e na
//      interface. Nada altera dado sozinho, nada entra no dossiê (T10) nem na
//      prestação de contas (T18).
//   2. Sem chave (`ANTHROPIC_API_KEY`) ou com a flag desligada
//      (`DM_AI_ENABLED`), o recurso responde "indisponível" com o motivo. Não
//      existe resultado inventado, nem fila, nem fallback.

const KINDS = [
  'organizacao_da_demanda', 'deteccao_de_urgencia', 'sugestao_de_editais',
  'conexao_com_patrocinadores', 'relatorio_para_governo',
];

const KIND_LABELS = {
  organizacao_da_demanda: 'Organização automática de demandas',
  deteccao_de_urgencia: 'Detecção de urgência',
  sugestao_de_editais: 'Sugestão de editais',
  conexao_com_patrocinadores: 'Conexão com patrocinadores ideais',
  relatorio_para_governo: 'Geração de relatórios para governo',
};

// A frase do slide 23 que cada recurso atende, exibida junto da sugestão.
const KIND_SOURCES = {
  organizacao_da_demanda: 'Apresentação Institucional, slide 23: "Organização automática de demandas".',
  deteccao_de_urgencia: 'Apresentação Institucional, slide 23: "Detecção de urgência".',
  sugestao_de_editais: 'Apresentação Institucional, slide 23: "Sugestão de editais".',
  conexao_com_patrocinadores: 'Apresentação Institucional, slide 23: "Conexão com patrocinadores ideais".',
  relatorio_para_governo: 'Apresentação Institucional, slide 23: "Geração de relatórios para governo".',
};

// Quem pede cada recurso.
const KIND_AUDIENCE = {
  organizacao_da_demanda: 'agente',
  deteccao_de_urgencia: 'agente',
  sugestao_de_editais: 'agente',
  conexao_com_patrocinadores: 'agente',
  relatorio_para_governo: 'poder_publico',
};

// `sugestao_de_editais` depende de os órgãos cadastrarem editais
// (government_actions.kind = 'edital', T22). Enquanto não houver base, o
// recurso se declara em desenvolvimento e **não** inventa edital nenhum —
// a fonte manda identificar como tal o que ainda está em desenvolvimento
// (slide 25 da Apresentação).
const KIND_STAGE = {
  organizacao_da_demanda: 'disponivel',
  deteccao_de_urgencia: 'disponivel',
  sugestao_de_editais: 'em_desenvolvimento',
  conexao_com_patrocinadores: 'disponivel',
  relatorio_para_governo: 'disponivel',
};

const STAGE_NOTES = {
  sugestao_de_editais: 'Depende de os órgãos cadastrarem editais na divulgação de ações. '
    + 'Sem edital cadastrado no território, a plataforma informa que não há base — nunca sugere um edital que não existe.',
};

const STATUSES = ['sugerida', 'aceita', 'ignorada'];

const STATUS_LABELS = {
  sugerida: 'Sugestão de IA aguardando revisão',
  aceita: 'Sugestão de IA aceita por uma pessoa',
  ignorada: 'Sugestão de IA ignorada por uma pessoa',
};

// Desfechos do registro de uso (enum `ai_call_outcome` da migração 022).
const CALL_OUTCOMES = [
  'sucesso', 'erro', 'desligado', 'sem_chave', 'limite', 'circuito', 'resposta_invalida',
];

// Rótulo obrigatório de toda saída do modelo, no banco e na interface.
const SUGGESTION_LABEL = 'Sugestão de IA';

const SUGGESTION_DISCLAIMER = 'Gerado por inteligência artificial a partir dos dados da própria plataforma. '
  + 'É uma sugestão para revisão humana: nada muda sem a sua ação.';

// Motivos de indisponibilidade devolvidos ao cliente (a interface mostra o
// texto; nunca um resultado inventado no lugar).
const UNAVAILABLE_REASONS = {
  desligado: 'Os recursos de inteligência artificial estão desligados neste ambiente.',
  sem_chave: 'Os recursos de inteligência artificial estão indisponíveis: falta a chave de acesso ao modelo.',
  limite: 'O limite de chamadas ao modelo no período foi atingido. Tente mais tarde.',
  circuito: 'O modelo falhou nas últimas tentativas e foi suspenso por alguns minutos. Tente mais tarde.',
  erro: 'Não foi possível falar com o modelo agora. Tente mais tarde.',
  resposta_invalida: 'O modelo respondeu fora do formato esperado e a sugestão foi descartada.',
};

// Padrões do ambiente. Todos ajustáveis por variável (src/ai/config.js).
const DEFAULTS = {
  // Flag desligada por padrão (decisão 6).
  enabled: false,
  model: 'claude-opus-5',
  // Timeout curto: a IA nunca segura o fluxo do usuário.
  timeoutMs: 15_000,
  // Retentativa limitada: uma única nova tentativa, só para falha transitória.
  maxRetries: 1,
  maxOutputTokens: 2_000,
  // Custo controlado: teto de chamadas por janela, no processo e no banco.
  windowMs: 60 * 60 * 1000,
  maxCallsPerWindow: 60,
  maxCallsPerUserPerWindow: 10,
  // Disjuntor: 3 falhas seguidas suspendem o recurso por 5 minutos.
  breakerThreshold: 3,
  breakerCooldownMs: 5 * 60 * 1000,
};

module.exports = {
  KINDS,
  KIND_LABELS,
  KIND_SOURCES,
  KIND_AUDIENCE,
  KIND_STAGE,
  STAGE_NOTES,
  STATUSES,
  STATUS_LABELS,
  CALL_OUTCOMES,
  SUGGESTION_LABEL,
  SUGGESTION_DISCLAIMER,
  UNAVAILABLE_REASONS,
  DEFAULTS,
};
