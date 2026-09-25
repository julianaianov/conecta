// Competência do órgão → eixos temáticos (T-03-01; decisão 17). Fonte: Fluxo 3,
// slide 7 item 5 ("Identificar demandas relacionadas à sua competência"),
// slide 16 e slide 17 passo 03 ("Definição da área de atuação").
//
// A competência continua texto livre no cadastro (user-service,
// `organizations.competence_areas`); os eixos da T26 (`demand_themes`) são
// derivados por este mapa só para sugerir o filtro da lista institucional.
// Competência sem correspondência não sugere nada; nenhuma demanda é escondida
// por causa disso.

const { THEMES } = require('../demand/constants');

/** Normaliza para comparação: minúsculas, sem acento, espaços simples. */
function normalizeCompetence(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Chaves já normalizadas. As sugestões do cadastro
// (`COMPETENCE_AREA_SUGGESTIONS` do user-service) e os próprios rótulos dos eixos.
const COMPETENCE_THEME_MAP = {
  saneamento: ['saneamento'],
  'meio ambiente': ['meio_ambiente'],
  educacao: ['educacao'],
  'esporte e lazer': ['esporte'],
  esporte: ['esporte'],
  cultura: ['cultura'],
  'mobilidade e transporte': ['mobilidade'],
  mobilidade: ['mobilidade'],
  'mobilidade urbana': ['mobilidade'],
  transporte: ['mobilidade'],
  'seguranca publica': ['seguranca'],
  seguranca: ['seguranca'],
  'infraestrutura urbana': ['iluminacao', 'limpeza'],
  iluminacao: ['iluminacao'],
  'iluminacao publica': ['iluminacao'],
  limpeza: ['limpeza'],
  'limpeza urbana': ['limpeza'],
};

/** Eixos sugeridos pelas áreas de competência, na ordem de `THEMES`. */
function suggestedThemesFor(competenceAreas) {
  const found = new Set();
  for (const area of Array.isArray(competenceAreas) ? competenceAreas : []) {
    for (const theme of COMPETENCE_THEME_MAP[normalizeCompetence(area)] ?? []) found.add(theme);
  }
  return THEMES.filter((t) => found.has(t));
}

module.exports = { COMPETENCE_THEME_MAP, normalizeCompetence, suggestedThemesFor };
