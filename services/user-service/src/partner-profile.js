// Perfil de apoio (T15): onde a conta atua, categorias de interesse e recursos
// que oferece. Base da compatibilidade com as demandas, calculada no
// post-service (src/interest/compatibility.js). Os vocabulários são os da
// demanda no post-service (src/demand/constants.js e src/interest/constants.js);
// test/partner-profile.test.js confere.

const { normalizeRole } = require('./roles');

// Os 12 tipos de demanda do Modelo de Conexão §03 (decisão 15), iguais a
// post_db demand_category; CHECK na migração user 015.
const INTEREST_CATEGORIES = [
  'projeto_social', 'projeto_ambiental', 'necessidade_de_patrocinio',
  'problema_urbano', 'problema_urgente',
  'obra_ou_melhoria_de_infraestrutura', 'revitalizacao_de_espaco', 'recuperacao_ambiental',
  'apoio_tecnico', 'apoio_com_servicos', 'apoio_com_materiais', 'outras_demandas_territoriais',
];

const OFFERED_RESOURCES = [
  'recursos_financeiros', 'materiais', 'servicos', 'equipamentos', 'mao_de_obra',
  'estrutura', 'apoio_tecnico', 'conhecimento_especializado', 'servicos_de_fotografia_e_filmagem',
];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

// Quem mantém perfil de apoio: quem filtra oportunidades (slides 10 e 11).
const PARTNER_PROFILE_ROLES = ['partner', 'government'];

const MAX_PLACES = 30;
const MAX_PLACE_LENGTH = 120;

function canHavePartnerProfile(user) {
  return PARTNER_PROFILE_ROLES.includes(normalizeRole(user?.role, user?.profileType));
}

const clean = (value) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '');

function uniqueBy(values, key) {
  const seen = new Set();
  return values.filter((v) => {
    const k = key(v);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function stringList(raw, field, errors) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
    errors[field] = 'Envie uma lista de textos';
    return [];
  }
  return raw.map(clean).filter(Boolean);
}

function subset(raw, allowed, field, errors) {
  const values = stringList(raw, field, errors);
  if (values.some((v) => !allowed.includes(v))) {
    errors[field] = `Valores aceitos: ${allowed.join(', ')}`;
    return [];
  }
  return [...new Set(values)];
}

/**
 * Corpo do PUT → `{ value, errors }`. Municípios no formato "Município/UF"
 * (a UF entra no encontro: há municípios de mesmo nome em estados diferentes).
 */
function validatePartnerProfile(input) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  if (body.nationwide !== undefined && typeof body.nationwide !== 'boolean') errors.nationwide = 'Use verdadeiro ou falso';

  const ufs = [...new Set(stringList(body.ufs, 'ufs', errors).map((v) => v.toUpperCase()))];
  if (ufs.some((uf) => !UFS.includes(uf))) errors.ufs = 'UF inválida';

  const municipalities = [];
  for (const entry of stringList(body.municipalities, 'municipalities', errors)) {
    const match = /^([^/|]+)\/([A-Za-z]{2})$/.exec(entry);
    const name = match ? clean(match[1]) : '';
    const uf = match ? match[2].toUpperCase() : '';
    if (!match || !name || name.length > MAX_PLACE_LENGTH || !UFS.includes(uf)) {
      errors.municipalities = 'Use o formato Município/UF (ex.: Rio de Janeiro/RJ)';
      break;
    }
    municipalities.push(`${name}/${uf}`);
  }

  const territories = stringList(body.territories, 'territories', errors);
  if (territories.some((t) => t.length > MAX_PLACE_LENGTH || t.includes('|'))) {
    errors.territories = `Cada território com até ${MAX_PLACE_LENGTH} caracteres`;
  }

  const value = {
    nationwide: body.nationwide === true,
    ufs,
    municipalities: uniqueBy(municipalities, (m) => m.toLowerCase()),
    territories: uniqueBy(territories, (t) => t.toLowerCase()),
    interestCategories: subset(body.interestCategories, INTEREST_CATEGORIES, 'interestCategories', errors),
    offeredResources: subset(body.offeredResources, OFFERED_RESOURCES, 'offeredResources', errors),
  };
  if (value.municipalities.length > MAX_PLACES) errors.municipalities = `No máximo ${MAX_PLACES} municípios`;
  if (value.territories.length > MAX_PLACES) errors.territories = `No máximo ${MAX_PLACES} territórios`;
  return { value, errors };
}

function serializePartnerProfile(row) {
  if (!row) {
    return {
      exists: false, nationwide: false, ufs: [], municipalities: [], territories: [],
      interestCategories: [], offeredResources: [], updatedAt: null,
    };
  }
  return {
    exists: true,
    nationwide: row.nationwide === true,
    ufs: row.ufs ?? [],
    municipalities: row.municipalities ?? [],
    territories: row.territories ?? [],
    interestCategories: row.interest_categories ?? [],
    offeredResources: row.offered_resources ?? [],
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at ?? null,
  };
}

module.exports = {
  INTEREST_CATEGORIES,
  OFFERED_RESOURCES,
  UFS,
  PARTNER_PROFILE_ROLES,
  canHavePartnerProfile,
  validatePartnerProfile,
  serializePartnerProfile,
};
