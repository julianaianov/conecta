// Critérios de prioridade definidos pela plataforma (Fluxo 2, slide 8: "Nível
// de prioridade conforme critérios definidos pela plataforma"; decisão 17 em
// dm-docs/fonte-da-verdade/decisoes-de-implementacao.md).
//
// A prioridade (baixa, média, alta, urgente) é declarada pelo Agente no
// assistente, junto com os critérios que a justificam; a análise na gestão
// confere a escolha e o prompt de urgência da IA (src/ai/prompts.js) usa os
// mesmos quatro critérios. Os critérios declarados ficam em
// `demands.priority_criteria` (migração 042) e entram no registro do envio na
// linha do tempo.
//
// `src/lib/app/demand.ts` repete esta lista no frontend e
// `src/lib/app/demand.test.mjs` compara os dois arquivos; o dm-gestao repete os
// rótulos em `App\Support\PriorityCriteria`.

const PRIORITY_CRITERIA = [
  {
    id: 'risco_vida_seguranca',
    label: 'Risco à vida ou à segurança',
    description: 'Há risco à vida, à saúde ou à segurança das pessoas, ou um dano em curso.',
  },
  {
    id: 'pessoas_afetadas',
    label: 'Número de pessoas afetadas',
    description: 'Quantas pessoas a situação atinge, conforme a estimativa de beneficiados.',
  },
  {
    id: 'prazo_sazonalidade',
    label: 'Prazo ou sazonalidade',
    description: 'Existe um prazo ou uma época do ano que torna a ação mais urgente (chuvas, volta às aulas, eventos).',
  },
  {
    id: 'recurso_disponivel',
    label: 'Recurso ou parceiro já disponível',
    description: 'Já existe recurso, parceiro ou programa disponível que permite agir agora.',
  },
];

const PRIORITY_CRITERIA_IDS = PRIORITY_CRITERIA.map((c) => c.id);

// Níveis que pedem ao menos um critério declarado. É aviso na revisão, não
// bloqueio: a regra não está na fonte como campo obrigatório.
const PRIORITIES_EXPECTING_CRITERIA = ['alta', 'urgente'];

/** Texto único dos quatro critérios, para prompts e documentos. */
function priorityCriteriaText() {
  return PRIORITY_CRITERIA.map((c) => c.label.toLowerCase()).join('; ');
}

module.exports = {
  PRIORITY_CRITERIA,
  PRIORITY_CRITERIA_IDS,
  PRIORITIES_EXPECTING_CRITERIA,
  priorityCriteriaText,
};
