// Perfis declarados (T-04-03; decisão 18): perfil empresarial do Parceiro
// (Arquitetura de Perfis §3.3) e perfil profissional ou institucional da
// Comunicação (§3.5). A própria conta informa; a gestão não valida e não há
// selo — a interface mostra "informado pela própria conta".
//
// Módulo puro: validação e projeções. Não acessa banco nem rede.

const { normalizeRole } = require('./roles');
const { normalizeCnpj, isValidCnpj, formatCnpj } = require('./institution');

const DECLARATION_NOTICE = 'informado pela própria conta';

/** Categoria (role normalizada) → tipo de perfil declarado. */
const DECLARED_KIND_BY_ROLE = { partner: 'empresarial', media: 'comunicacao' };

function declaredKindForUser(user) {
  return DECLARED_KIND_BY_ROLE[normalizeRole(user?.role, user?.profileType)] ?? null;
}

function text(value, max) {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

function readFields(body, spec, errors) {
  const out = {};
  for (const [key, { column, max, required, label }] of Object.entries(spec)) {
    const v = text(body[key], max);
    if (v === undefined) errors[key] = `${label}: até ${max} caracteres`;
    else if (required && !v) errors[key] = `${label} é obrigatório`;
    out[column] = v ?? null;
  }
  return out;
}

function checkWebsite(value, errors) {
  if (value && !/^https?:\/\/\S+\.\S+/.test(value)) errors.website = 'Site deve começar com http:// ou https://';
}

/** Perfil empresarial: `{ value, errors }` com nomes de coluna de `business_profiles`. */
function validateBusinessProfile(input = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const value = readFields(body, {
    companyName: { column: 'company_name', max: 255, required: true, label: 'Nome da empresa ou razão social' },
    segment: { column: 'segment', max: 120, label: 'Segmento' },
    description: { column: 'description', max: 2000, label: 'Descrição' },
    website: { column: 'website', max: 500, label: 'Site' },
  }, errors);
  checkWebsite(value.website, errors);
  const cnpj = normalizeCnpj(body.cnpj ?? '');
  if (cnpj && !isValidCnpj(cnpj)) errors.cnpj = 'CNPJ inválido (dígitos verificadores não conferem)';
  value.cnpj = cnpj || null;
  return { value, errors };
}

/** Perfil da Comunicação: `{ value, errors }` com nomes de coluna de `media_profiles`. */
function validateMediaProfile(input = {}) {
  const body = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const errors = {};
  const value = readFields(body, {
    outletName: { column: 'outlet_name', max: 255, required: true, label: 'Veículo ou instituição' },
    professionalRegistry: { column: 'professional_registry', max: 60, label: 'Registro profissional' },
    coverageArea: { column: 'coverage_area', max: 255, label: 'Área de cobertura' },
    description: { column: 'description', max: 2000, label: 'Descrição' },
    website: { column: 'website', max: 500, label: 'Site' },
  }, errors);
  checkWebsite(value.website, errors);
  return { value, errors };
}

const BUSINESS_COLUMNS = ['company_name', 'cnpj', 'segment', 'description', 'website'];
const MEDIA_COLUMNS = ['outlet_name', 'professional_registry', 'coverage_area', 'description', 'website'];

const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

/** Visão da própria conta (camelCase). */
function serializeBusinessProfile(row) {
  return {
    kind: 'empresarial',
    companyName: row.company_name,
    cnpj: row.cnpj ?? null,
    segment: row.segment ?? null,
    description: row.description ?? null,
    website: row.website ?? null,
    updatedAt: iso(row.updated_at),
    declaration: DECLARATION_NOTICE,
  };
}

function serializeMediaProfile(row) {
  return {
    kind: 'comunicacao',
    outletName: row.outlet_name,
    professionalRegistry: row.professional_registry ?? null,
    coverageArea: row.coverage_area ?? null,
    description: row.description ?? null,
    website: row.website ?? null,
    updatedAt: iso(row.updated_at),
    declaration: DECLARATION_NOTICE,
  };
}

/**
 * Projeção pública: nome, CNPJ formatado (decisão 18), segmento ou área de
 * cobertura, descrição e site. Nunca contato nem registro profissional.
 */
function publicDeclaredProfile(kind, row) {
  if (!row) return null;
  if (kind === 'empresarial') {
    return {
      kind,
      name: row.company_name,
      cnpj: row.cnpj ? formatCnpj(row.cnpj) : null,
      segment: row.segment ?? null,
      description: row.description ?? null,
      website: row.website ?? null,
      declaration: DECLARATION_NOTICE,
    };
  }
  return {
    kind,
    name: row.outlet_name,
    coverageArea: row.coverage_area ?? null,
    description: row.description ?? null,
    website: row.website ?? null,
    declaration: DECLARATION_NOTICE,
  };
}

module.exports = {
  DECLARATION_NOTICE,
  DECLARED_KIND_BY_ROLE,
  BUSINESS_COLUMNS,
  MEDIA_COLUMNS,
  declaredKindForUser,
  validateBusinessProfile,
  validateMediaProfile,
  serializeBusinessProfile,
  serializeMediaProfile,
  publicDeclaredProfile,
};
