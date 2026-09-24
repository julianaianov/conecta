// Identificação de potenciais conexões (Arquitetura de Perfis §6, etapa 3;
// Modelo de Conexão §07): o apoiador vê as demandas compatíveis em
// /opportunities (T15) e o Agente vê os perfis de apoio compatíveis com a
// demanda em /mine/:id/potential-partners (T30), ambos sob demanda.
// TODO(fonte-da-verdade): Modelo de Conexão §07 — falta a identificação automática no ato da publicação, com aviso aos dois lados (depende da central de notificações, §08); ver TODO em migrations/007-demands.sql (demands_record_event).
// Compatibilidade entre o perfil de apoio e a demanda (T15). Cálculo
// transparente, sem IA: três critérios com pesos fixos (território 40,
// categoria 30, recursos 30), cada um com o motivo em texto. A fonte pede que a
// demanda publicada seja vista pelos parceiros "de acordo com suas
// características e critérios de compatibilidade" (Fluxo 2, slides 20 e 22).
//
// Perfil (user-service GET /me/partner-profile): `nationwide`, `ufs`,
// `municipalities` ("Município/UF"), `territories` (bairros, regiões),
// `interestCategories` (categorias da demanda) e `offeredResources` (tipos de
// recurso necessário da demanda). Demanda: `territory`, `district`,
// `municipality`, `uf`, `category` e `neededResources`.

const { CATEGORY_LABELS } = require('../demand/constants');
const { RESOURCE_TYPE_LABELS } = require('../dossier/content');
const {
  COMPATIBILITY_WEIGHTS, TERRITORY_POINTS, COMPATIBILITY_LEVELS,
} = require('./constants');

/** Texto comparável: sem acento, minúsculo, espaços simples. */
function normalizePlace(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "Rio de Janeiro/RJ" → { name: 'rio de janeiro', uf: 'RJ' }. */
function parseMunicipality(entry) {
  const match = /^(.+)\/([A-Za-z]{2})$/.exec(typeof entry === 'string' ? entry.trim() : '');
  if (!match) return null;
  return { name: normalizePlace(match[1]), uf: match[2].toUpperCase(), label: `${match[1].trim()}/${match[2].toUpperCase()}` };
}

const list = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim()) : []);

/** O perfil tem algum critério preenchido? */
function profileHasCriteria(profile) {
  if (!profile) return false;
  return Boolean(profile.nationwide) || list(profile.ufs).length > 0 || list(profile.municipalities).length > 0
    || list(profile.territories).length > 0 || list(profile.interestCategories).length > 0
    || list(profile.offeredResources).length > 0;
}

function territoryReason(profile, demand) {
  const max = COMPATIBILITY_WEIGHTS.territorio;
  const municipalities = list(profile.municipalities).map(parseMunicipality).filter(Boolean);
  const demandMunicipality = normalizePlace(demand.municipality);
  const demandUf = typeof demand.uf === 'string' ? demand.uf.toUpperCase() : '';
  const municipalityMatch = municipalities.find((m) => m.name === demandMunicipality && m.uf === demandUf);

  // Bairro/território: vale quando o perfil não restringe município ou quando o
  // município também confere (bairros de mesmo nome existem em várias cidades).
  const places = [demand.territory, demand.district].map(normalizePlace).filter(Boolean);
  const territory = list(profile.territories).find((t) => places.includes(normalizePlace(t)));
  if (territory && (municipalities.length === 0 || municipalityMatch)) {
    return { criterion: 'territorio', points: TERRITORY_POINTS.territorio, maxPoints: max, matched: true,
      text: `Atua no território da demanda (${territory.trim()})` };
  }
  if (municipalityMatch) {
    return { criterion: 'territorio', points: TERRITORY_POINTS.municipio, maxPoints: max, matched: true,
      text: `Atua no município da demanda (${municipalityMatch.label})` };
  }
  const uf = list(profile.ufs).map((u) => u.toUpperCase()).find((u) => u === demandUf);
  if (uf) {
    return { criterion: 'territorio', points: TERRITORY_POINTS.uf, maxPoints: max, matched: true,
      text: `Atua no estado da demanda (${uf})` };
  }
  if (profile.nationwide) {
    return { criterion: 'territorio', points: TERRITORY_POINTS.nacional, maxPoints: max, matched: true,
      text: 'Atuação em todo o país' };
  }
  const hasPlaces = municipalities.length || list(profile.ufs).length || list(profile.territories).length;
  const where = [demand.territory, [demand.municipality, demandUf].filter(Boolean).join('/')].filter(Boolean).join(', ');
  return { criterion: 'territorio', points: 0, maxPoints: max, matched: false,
    text: hasPlaces
      ? `A demanda fica fora da sua área de atuação${where ? ` (${where})` : ''}`
      : 'Informe no perfil de apoio onde você atua' };
}

function categoryReason(profile, demand) {
  const max = COMPATIBILITY_WEIGHTS.categoria;
  const categories = list(profile.interestCategories);
  const label = CATEGORY_LABELS[demand.category] ?? demand.category;
  if (categories.includes(demand.category)) {
    return { criterion: 'categoria', points: max, maxPoints: max, matched: true, text: `Categoria de interesse: ${label}` };
  }
  return { criterion: 'categoria', points: 0, maxPoints: max, matched: false,
    text: categories.length ? `${label} não está entre as suas áreas de interesse` : 'Informe no perfil de apoio as áreas de interesse' };
}

function resourcesReason(profile, demand) {
  const max = COMPATIBILITY_WEIGHTS.recursos;
  const needed = [...new Set(list(demand.neededResources))];
  const offered = list(profile.offeredResources);
  if (!needed.length) {
    return { criterion: 'recursos', points: 0, maxPoints: max, matched: false, matchedResources: [],
      text: 'A demanda não lista recursos necessários' };
  }
  const matchedResources = needed.filter((type) => offered.includes(type));
  const labels = matchedResources.map((type) => RESOURCE_TYPE_LABELS[type] ?? type);
  if (!matchedResources.length) {
    return { criterion: 'recursos', points: 0, maxPoints: max, matched: false, matchedResources,
      text: offered.length ? 'Você não oferece os recursos que a demanda precisa' : 'Informe no perfil de apoio os recursos que você oferece' };
  }
  return {
    criterion: 'recursos',
    points: Math.round((max * matchedResources.length) / needed.length),
    maxPoints: max,
    matched: true,
    matchedResources,
    text: `Oferece ${matchedResources.length} de ${needed.length} recursos necessários: ${labels.join(', ')}`,
  };
}

function levelOf(score) {
  return COMPATIBILITY_LEVELS.find((entry) => score >= entry.min).level;
}

/**
 * Pontuação 0–100 com os motivos visíveis. `profile` nulo (sem perfil de
 * apoio) dá `profileComplete: false` e pontuação 0.
 */
function computeCompatibility(profile, demand) {
  const safeProfile = profile ?? {};
  const reasons = [
    territoryReason(safeProfile, demand),
    categoryReason(safeProfile, demand),
    resourcesReason(safeProfile, demand),
  ];
  const score = reasons.reduce((sum, r) => sum + r.points, 0);
  return {
    score,
    maxScore: Object.values(COMPATIBILITY_WEIGHTS).reduce((a, b) => a + b, 0),
    level: levelOf(score),
    profileComplete: profileHasCriteria(profile),
    reasons,
  };
}

module.exports = {
  normalizePlace,
  parseMunicipality,
  profileHasCriteria,
  computeCompatibility,
};
