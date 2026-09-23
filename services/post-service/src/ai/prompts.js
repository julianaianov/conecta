// Prompts e formato de saída dos 5 recursos do slide 23 (T23).
//
// Cada recurso tem um esquema JSON estrito: o modelo responde com
// `output_config.format` e a resposta é validada aqui antes de virar linha em
// `ai_suggestions`. Resposta fora do formato é descartada (`resposta_invalida`),
// nunca "corrigida no chute".
//
// O sistema repete, em todos, as três regras da fonte e da decisão 6:
//   - a saída é sugestão para uma pessoa revisar, não decisão;
//   - só vale o que está no contexto enviado (nada de inventar demanda,
//     edital, patrocinador, número ou beneficiário);
//   - nenhum dado pessoal é pedido nem devolvido.

const {
  CATEGORIES, CATEGORY_LABELS, PRIORITIES, THEMES, THEME_LABELS,
} = require('../demand/constants');

const CONFIDENCE = ['baixa', 'media', 'alta'];

const BASE_SYSTEM = [
  'Você apoia a equipe do DM Conecta, uma plataforma brasileira que conecta demandas de território a apoiadores e ao Poder Público.',
  'Responda sempre em português do Brasil.',
  'Tudo que você produz é SUGESTÃO para revisão de uma pessoa. Você não decide, não aprova e não altera nada.',
  'Use exclusivamente o conteúdo recebido nesta mensagem. Se o contexto não permitir concluir, diga isso na justificativa e use a confiança mais baixa.',
  'Nunca invente demanda, edital, patrocinador, número, beneficiário, prazo ou valor.',
  'Nunca peça, deduza nem escreva dado pessoal (nome, e-mail, telefone, documento, endereço exato).',
  'Justificativas curtas e objetivas, no máximo três frases.',
].join(' ');

const categoryHelp = CATEGORIES.map((c) => `${c} (${CATEGORY_LABELS[c]})`).join(', ');
const themeHelp = THEMES.map((t) => `${t} (${THEME_LABELS[t]})`).join(', ');

const schema = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

const text = (maxLength) => ({ type: 'string', maxLength });

const PROMPTS = {
  organizacao_da_demanda: {
    system: `${BASE_SYSTEM} Sua tarefa é organizar a demanda: sugerir em qual das 5 categorias oficiais ela se encaixa `
      + `(${categoryHelp}) e qual território de abrangência descreve melhor a área atendida. `
      + 'O território é um texto curto (bairro, comunidade ou região) que já apareça no contexto; se não houver base, devolva null. '
      + `Sugira também os eixos temáticos do território a que a demanda pertence, entre os nove da plataforma (${themeHelp}). `
      + 'Uma demanda pode ter mais de um eixo; use no máximo três, os que o texto sustentar, e a lista vazia quando nenhum couber.',
    instruction: 'Sugira a categoria, o território e os eixos temáticos desta demanda.',
    schema: schema({
      categoria: { type: 'string', enum: CATEGORIES },
      territorio: { type: ['string', 'null'], maxLength: 255 },
      eixos: { type: 'array', maxItems: 3, items: { type: 'string', enum: THEMES } },
      confianca: { type: 'string', enum: CONFIDENCE },
      justificativa: text(600),
    }),
  },
  deteccao_de_urgencia: {
    system: `${BASE_SYSTEM} Sua tarefa é detectar urgência: sugerir um nível de prioridade entre `
      + `${PRIORITIES.join(', ')} e explicar por quê, apontando os sinais do próprio texto da demanda `
      + '(risco a pessoas, dano em curso, prazo, serviço essencial interrompido). '
      + 'Prioridade não é decisão de atendimento: a plataforma só a registra como sugestão.',
    instruction: 'Sugira o nível de prioridade desta demanda e a justificativa.',
    schema: schema({
      prioridade: { type: 'string', enum: PRIORITIES },
      sinais: { type: 'array', maxItems: 5, items: text(200) },
      confianca: { type: 'string', enum: CONFIDENCE },
      justificativa: text(600),
    }),
  },
  sugestao_de_editais: {
    system: `${BASE_SYSTEM} Sua tarefa é indicar, entre os editais e programas que os órgãos públicos já divulgaram `
      + 'na plataforma (a lista recebida), quais têm aderência a esta demanda. '
      + 'Use apenas os itens da lista, referenciados pelo número. Se nenhum tiver aderência, devolva a lista vazia.',
    instruction: 'Indique quais editais da lista têm aderência a esta demanda.',
    schema: schema({
      editais: {
        type: 'array',
        maxItems: 10,
        items: schema({
          referencia: { type: 'integer', minimum: 1 },
          aderencia: { type: 'string', enum: CONFIDENCE },
          justificativa: text(400),
        }),
      },
      observacao: { type: ['string', 'null'], maxLength: 600 },
    }),
  },
  conexao_com_patrocinadores: {
    system: `${BASE_SYSTEM} Sua tarefa é ordenar os interessados já registrados nesta demanda por aderência ao que ela precisa. `
      + 'A compatibilidade numérica recebida é calculada pela plataforma por critérios transparentes (território, categoria e recursos) '
      + 'e continua valendo: você complementa a leitura dela, não a substitui nem a recalcula. '
      + 'Use apenas os interessados da lista, referenciados pelo número, e não sugira procurar ninguém de fora dela.',
    instruction: 'Ordene os interessados desta demanda e explique cada posição.',
    schema: schema({
      patrocinadores: {
        type: 'array',
        maxItems: 10,
        items: schema({
          referencia: { type: 'integer', minimum: 1 },
          posicao: { type: 'integer', minimum: 1 },
          justificativa: text(400),
        }),
      },
      observacao: { type: ['string', 'null'], maxLength: 600 },
    }),
  },
  relatorio_para_governo: {
    system: `${BASE_SYSTEM} Sua tarefa é redigir um rascunho de relatório institucional a partir dos indicadores agregados recebidos. `
      + 'Escreva em tom institucional, sem adjetivos de propaganda e sem conclusões que os números não sustentem. '
      + 'Cite os números exatamente como vieram; a plataforma mostra cada um ao lado do texto, para conferência. '
      + 'Não compare o órgão com outros órgãos e não faça avaliação político-partidária.',
    instruction: 'Escreva o rascunho do relatório com base nestes indicadores.',
    schema: schema({
      titulo: text(160),
      resumo: text(1200),
      secoes: {
        type: 'array',
        maxItems: 6,
        items: schema({ titulo: text(120), texto: text(1500) }),
      },
      observacao: { type: ['string', 'null'], maxLength: 600 },
    }),
  },
};

/** Mensagens da chamada: `{ system, user, schema }`. */
function buildPrompt(kind, context) {
  const prompt = PROMPTS[kind];
  if (!prompt) throw new Error(`recurso de IA desconhecido: ${kind}`);
  return {
    system: prompt.system,
    user: `${prompt.instruction}\n\nContexto (JSON):\n${JSON.stringify(context, null, 2)}`,
    schema: prompt.schema,
  };
}

/**
 * Confere a resposta do modelo contra o esquema (o essencial: tipo, campos
 * obrigatórios, enums, tamanho e referências existentes). Devolve
 * `{ valid, value, error }` — `error` é um código curto para o registro de uso.
 */
function validateSuggestion(kind, value, { references = 0 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, error: 'formato' };
  }
  const check = (ok, error) => (ok ? null : error);
  const nonEmpty = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
  let error = null;
  if (kind === 'organizacao_da_demanda') {
    error = check(CATEGORIES.includes(value.categoria), 'categoria')
      ?? check(value.territorio === null || nonEmpty(value.territorio, 255), 'territorio')
      // Eixos temáticos (T26): lista da fonte, sem repetição e sem invenção.
      ?? check(Array.isArray(value.eixos) && value.eixos.length <= 3
        && value.eixos.every((t) => THEMES.includes(t))
        && new Set(value.eixos).size === value.eixos.length, 'eixos')
      ?? check(CONFIDENCE.includes(value.confianca), 'confianca')
      ?? check(nonEmpty(value.justificativa, 600), 'justificativa');
  } else if (kind === 'deteccao_de_urgencia') {
    error = check(PRIORITIES.includes(value.prioridade), 'prioridade')
      ?? check(Array.isArray(value.sinais) && value.sinais.length <= 5
        && value.sinais.every((s) => nonEmpty(s, 200)), 'sinais')
      ?? check(CONFIDENCE.includes(value.confianca), 'confianca')
      ?? check(nonEmpty(value.justificativa, 600), 'justificativa');
  } else if (kind === 'sugestao_de_editais' || kind === 'conexao_com_patrocinadores') {
    const key = kind === 'sugestao_de_editais' ? 'editais' : 'patrocinadores';
    const list = value[key];
    error = check(Array.isArray(list) && list.length <= 10, key)
      ?? check(list?.every?.((item) => item && typeof item === 'object'
        && Number.isInteger(item.referencia) && item.referencia >= 1 && item.referencia <= references
        && nonEmpty(item.justificativa, 400)
        && (kind === 'sugestao_de_editais'
          ? CONFIDENCE.includes(item.aderencia)
          : Number.isInteger(item.posicao) && item.posicao >= 1)), `${key}_itens`)
      ?? check(value.observacao === null || nonEmpty(value.observacao, 600), 'observacao');
  } else if (kind === 'relatorio_para_governo') {
    error = check(nonEmpty(value.titulo, 160), 'titulo')
      ?? check(nonEmpty(value.resumo, 1200), 'resumo')
      ?? check(Array.isArray(value.secoes) && value.secoes.length <= 6
        && value.secoes.every((s) => s && nonEmpty(s.titulo, 120) && nonEmpty(s.texto, 1500)), 'secoes')
      ?? check(value.observacao === null || nonEmpty(value.observacao, 600), 'observacao');
  } else {
    error = 'recurso';
  }
  return error ? { valid: false, error } : { valid: true, value };
}

/** Justificativa exibida junto da sugestão (a fonte pede "com justificativa"). */
function rationaleOf(kind, value) {
  if (kind === 'organizacao_da_demanda' || kind === 'deteccao_de_urgencia') return value.justificativa;
  if (kind === 'relatorio_para_governo') return value.resumo;
  return value.observacao ?? null;
}

module.exports = {
  BASE_SYSTEM, CONFIDENCE, PROMPTS, buildPrompt, validateSuggestion, rationaleOf,
};
