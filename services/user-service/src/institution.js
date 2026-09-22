// Cadastro institucional (fonte da verdade: Fluxo 2, etapas 01–02, e Fluxo 3,
// etapas 01–02; decisões 2 e 3 de dm-docs/docs/fonte-da-verdade/decisoes-de-implementacao.md).
//
// Módulo puro: validação de CNPJ (dígitos verificadores, inclusive o formato
// alfanumérico da Receita Federal), CNAE, CEP, UF, contatos e normalização do
// payload de cada tipo de instituição. Não acessa banco nem rede.
//
// A validação institucional (análise humana) é do dm-gestao: aqui só se garante
// que o cadastro enviado está bem formado.

const { normalizeRole } = require('./roles');

const INSTITUTION_KINDS = ['agente_transformacao', 'poder_publico'];

/** Categoria do perfil (role normalizada) → tipo de cadastro institucional. */
const KIND_BY_ROLE = { agent: 'agente_transformacao', government: 'poder_publico' };

const VALIDATION_STATUSES = ['pendente', 'em_analise', 'validada', 'devolvida', 'revogada'];

/** Estados em que o titular pode editar os dados e (re)enviar para validação. */
const EDITABLE_STATUSES = ['pendente', 'devolvida', 'revogada'];

const GOVERNMENT_SPHERES = ['municipal', 'estadual', 'federal'];

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

/**
 * Subperfis de Agente de Transformação que não são, eles mesmos, uma
 * organização: vinculam-se a uma instituição com CNPJ (decisão 3).
 */
const LINKED_AGENT_PROFILES = ['lider_comunitario', 'representante_bairro'];

/**
 * Referência de CNAEs frequentes no terceiro setor e na administração pública
 * (subclasses da CNAE 2.3, IBGE/CONCLA). Não é exaustiva: qualquer código bem
 * formado é aceito, com a descrição informada pelo titular; a conferência com
 * o cartão CNPJ é feita na validação do dm-gestao.
 */
const CNAE_REFERENCE = [
  { code: '8411600', description: 'Administração pública em geral' },
  { code: '8412400', description: 'Regulação das atividades de saúde, educação, serviços culturais e outros serviços sociais' },
  { code: '8413200', description: 'Regulação das atividades econômicas' },
  { code: '8424800', description: 'Segurança e ordem pública' },
  { code: '8425600', description: 'Defesa Civil' },
  { code: '8800600', description: 'Serviços de assistência social sem alojamento' },
  { code: '8599699', description: 'Outras atividades de ensino não especificadas anteriormente' },
  { code: '9001999', description: 'Artes cênicas, espetáculos e atividades complementares não especificadas anteriormente' },
  { code: '9103100', description: 'Atividades de jardins botânicos, zoológicos, parques nacionais, reservas ecológicas e áreas de proteção ambiental' },
  { code: '9312300', description: 'Clubes sociais, esportivos e similares' },
  { code: '9430800', description: 'Atividades de associações de defesa de direitos sociais' },
  { code: '9491000', description: 'Atividades de organizações religiosas ou filosóficas' },
  { code: '9493600', description: 'Atividades de organizações associativas ligadas à cultura e à arte' },
  { code: '9499500', description: 'Atividades associativas não especificadas anteriormente' },
  { code: '7220700', description: 'Pesquisa e desenvolvimento experimental em ciências sociais e humanas' },
  { code: '3811400', description: 'Coleta de resíduos não-perigosos' },
];

const CNAE_REFERENCE_BY_CODE = new Map(CNAE_REFERENCE.map((item) => [item.code, item.description]));

/** Áreas de competência sugeridas ao Poder Público (a lista aceita outras). */
const COMPETENCE_AREA_SUGGESTIONS = [
  'Assistência social', 'Cultura', 'Educação', 'Esporte e lazer', 'Habitação',
  'Infraestrutura urbana', 'Meio ambiente', 'Mobilidade e transporte', 'Saneamento',
  'Saúde', 'Segurança pública', 'Trabalho e renda', 'Defesa civil', 'Juventude',
];

const MAX_SECONDARY_CNAES = 20;
const MAX_COMPETENCE_AREAS = 20;

// ── CNPJ ────────────────────────────────────────────────────
// Desde julho de 2026 a Receita emite CNPJ alfanumérico (IN RFB 2.229/2024):
// 12 posições com letras maiúsculas ou dígitos e 2 dígitos verificadores
// numéricos. O valor de cada caractere é o código ASCII menos 48, o que mantém
// o cálculo do CNPJ numérico inalterado.

/** Remove pontuação e deixa em maiúsculas: "12.ABC.345/01DE-35" → "12ABC34501DE35". */
function normalizeCnpj(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).toUpperCase().replace(/[.\-/\s]/g, '');
}

function cnpjCheckDigit(base) {
  const weights = base.length === 12
    ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum = [...base].reduce((acc, ch, i) => acc + (ch.charCodeAt(0) - 48) * weights[i], 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** CNPJ válido (numérico ou alfanumérico), já normalizado ou com máscara. */
function isValidCnpj(value) {
  const cnpj = normalizeCnpj(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // 00000000000000, 11111111111111...
  const first = cnpjCheckDigit(cnpj.slice(0, 12));
  const second = cnpjCheckDigit(cnpj.slice(0, 12) + first);
  return cnpj.endsWith(`${first}${second}`);
}

/** "11222333000181" → "11.222.333/0001-81". */
function formatCnpj(value) {
  const c = normalizeCnpj(value);
  if (c.length !== 14) return c;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

// ── CNAE ────────────────────────────────────────────────────
// Subclasse CNAE 2.3: 7 dígitos, exibidos como "9430-8/00".

function normalizeCnae(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/[.\-/\s]/g, '');
}

function isValidCnae(value) {
  const code = normalizeCnae(value);
  // Seção A começa em 01; nenhum código tem divisão 00.
  return /^\d{7}$/.test(code) && code.slice(0, 2) !== '00';
}

/** "9430800" → "9430-8/00". */
function formatCnae(value) {
  const c = normalizeCnae(value);
  if (c.length !== 7) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}`;
}

function cnaeDescription(code) {
  return CNAE_REFERENCE_BY_CODE.get(normalizeCnae(code)) ?? null;
}

// ── Endereço e contatos ─────────────────────────────────────

function normalizeCep(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).replace(/\D/g, '');
}

function isValidCep(value) {
  const cep = normalizeCep(value);
  return /^\d{8}$/.test(cep) && cep !== '00000000';
}

function isValidUf(value) {
  return typeof value === 'string' && UFS.includes(value.trim().toUpperCase());
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

function isValidEmail(value) {
  return typeof value === 'string' && value.length <= 255 && EMAIL_RE.test(value.trim());
}

function normalizePhone(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  let digits = String(value).replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('55')) digits = digits.slice(2);
  return digits;
}

/** Telefone brasileiro com DDD: 10 (fixo) ou 11 dígitos (celular, começa com 9). */
function isValidPhone(value) {
  const phone = normalizePhone(value);
  if (!/^[1-9][1-9]\d{8,9}$/.test(phone)) return false;
  return phone.length === 10 || phone[2] === '9';
}

function isValidIbgeCode(value) {
  return typeof value === 'string' && /^\d{7}$/.test(value);
}

// ── Payload ─────────────────────────────────────────────────

function text(value, max) {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.length > max ? undefined : trimmed;
}

/** Tipo de cadastro permitido para o usuário do token, ou `null`. */
function kindForUser(user) {
  return KIND_BY_ROLE[normalizeRole(user?.role, user?.profileType)] ?? null;
}

/**
 * Valida e normaliza o cadastro enviado pelo titular. Retorna
 * `{ value, errors }`: `errors` é um objeto campo → mensagem (vazio quando ok).
 * `value` tem os nomes de coluna do banco (`organizations` e
 * `organization_representatives`).
 */
function validateInstitution(kind, input = {}) {
  const errors = {};
  const body = input && typeof input === 'object' ? input : {};
  const rep = body.representative && typeof body.representative === 'object' ? body.representative : {};

  const read = (field, source, key, max, { required = false, label } = {}) => {
    const v = text(source[key], max);
    if (v === undefined) errors[field] = `${label ?? field}: até ${max} caracteres`;
    else if (required && !v) errors[field] = `${label ?? field} é obrigatório`;
    return v ?? null;
  };

  const org = {};
  if (!INSTITUTION_KINDS.includes(kind)) {
    return { value: null, errors: { kind: 'Tipo de instituição inválido' } };
  }

  // CNPJ: obrigatório nos dois cadastros.
  const cnpj = normalizeCnpj(body.cnpj ?? '');
  if (!cnpj) errors.cnpj = 'CNPJ é obrigatório';
  else if (!isValidCnpj(cnpj)) errors.cnpj = 'CNPJ inválido (dígitos verificadores não conferem)';
  org.cnpj = cnpj || null;

  org.legal_name = read('legalName', body, 'legalName', 255, {
    required: true,
    label: kind === 'poder_publico' ? 'Órgão ou entidade' : 'Razão social',
  });
  org.trade_name = read('tradeName', body, 'tradeName', 255, { label: 'Nome fantasia' });

  // Endereço: obrigatório para o Agente (CEP é o dado de localização da fonte);
  // opcional para o Poder Público, que informa município e território.
  const addressRequired = kind === 'agente_transformacao';
  const cep = normalizeCep(body.cep ?? '');
  if (cep && !isValidCep(cep)) errors.cep = 'CEP inválido (8 dígitos)';
  else if (!cep && addressRequired) errors.cep = 'CEP é obrigatório';
  org.cep = cep || null;
  org.street = read('street', body, 'street', 255, { required: addressRequired, label: 'Logradouro' });
  org.address_number = read('addressNumber', body, 'addressNumber', 20, { required: addressRequired, label: 'Número' });
  org.address_complement = read('addressComplement', body, 'addressComplement', 120, { label: 'Complemento' });
  org.district = read('district', body, 'district', 120, { required: addressRequired, label: 'Bairro' });

  const uf = text(body.uf, 2);
  org.uf = uf ? uf.toUpperCase() : null;
  if (uf === undefined || (org.uf && !isValidUf(org.uf))) errors.uf = 'UF inválida';
  org.municipality = read('municipality', body, 'municipality', 120, { label: 'Município' });
  const ibge = text(body.municipalityIbgeCode, 7);
  if (ibge === undefined || (ibge && !isValidIbgeCode(ibge))) errors.municipalityIbgeCode = 'Código IBGE do município: 7 dígitos';
  org.municipality_ibge_code = ibge || null;

  // Contatos institucionais da organização (privados; ver rotas).
  org.institutional_email = read('institutionalEmail', body, 'institutionalEmail', 255, { label: 'E-mail institucional' });
  if (org.institutional_email && !isValidEmail(org.institutional_email)) errors.institutionalEmail = 'E-mail institucional inválido';
  const orgPhone = body.institutionalPhone ? normalizePhone(body.institutionalPhone) : '';
  if (orgPhone && !isValidPhone(orgPhone)) errors.institutionalPhone = 'Telefone institucional inválido (DDD + número)';
  org.institutional_phone = orgPhone || null;
  org.website = read('website', body, 'website', 500, { label: 'Site' });
  if (org.website && !/^https?:\/\/\S+\.\S+/.test(org.website)) errors.website = 'Site deve começar com http:// ou https://';

  org.territory = read('territory', body, 'territory', 255, {
    required: kind === 'poder_publico',
    label: 'Território de atuação',
  });

  if (kind === 'agente_transformacao') {
    if (!org.municipality) errors.municipality = 'Município é obrigatório';
    if (!org.uf && !errors.uf) errors.uf = 'UF é obrigatória';
    if (!org.institutional_email && !org.institutional_phone) {
      errors.institutionalContact = 'Informe e-mail ou telefone institucional';
    }

    const primary = normalizeCnae(body.cnaePrimary ?? '');
    if (!primary) errors.cnaePrimary = 'CNAE principal é obrigatório';
    else if (!isValidCnae(primary)) errors.cnaePrimary = 'CNAE inválido (7 dígitos, ex.: 9430-8/00)';
    org.cnae_primary = primary || null;
    const primaryDescription = text(body.cnaePrimaryDescription, 255);
    if (primaryDescription === undefined) errors.cnaePrimaryDescription = 'Descrição do CNAE: até 255 caracteres';
    org.cnae_primary_description = primaryDescription || cnaeDescription(primary);
    if (org.cnae_primary && !org.cnae_primary_description) errors.cnaePrimaryDescription = 'Descrição do CNAE principal é obrigatória';

    const secondaryInput = body.cnaeSecondary == null ? [] : body.cnaeSecondary;
    if (!Array.isArray(secondaryInput) || secondaryInput.length > MAX_SECONDARY_CNAES) {
      errors.cnaeSecondary = `CNAEs secundários: lista de até ${MAX_SECONDARY_CNAES}`;
      org.cnae_secondary = [];
    } else {
      const seen = new Set([primary]);
      org.cnae_secondary = [];
      secondaryInput.forEach((item, i) => {
        const raw = item && typeof item === 'object' ? item : { code: item };
        const code = normalizeCnae(raw.code ?? '');
        if (!isValidCnae(code)) { errors[`cnaeSecondary.${i}`] = 'CNAE secundário inválido'; return; }
        if (seen.has(code)) return;
        seen.add(code);
        const description = text(raw.description, 255);
        if (description === undefined) { errors[`cnaeSecondary.${i}`] = 'Descrição do CNAE: até 255 caracteres'; return; }
        org.cnae_secondary.push({ code, description: description || cnaeDescription(code) });
      });
    }
    org.government_sphere = null;
    org.department = null;
    org.competence_areas = [];
  } else {
    const sphere = typeof body.governmentSphere === 'string' ? body.governmentSphere.trim().toLowerCase() : '';
    if (!GOVERNMENT_SPHERES.includes(sphere)) errors.governmentSphere = 'Esfera deve ser municipal, estadual ou federal';
    org.government_sphere = GOVERNMENT_SPHERES.includes(sphere) ? sphere : null;
    if (sphere === 'municipal' && !org.municipality) errors.municipality = 'Município é obrigatório na esfera municipal';
    if ((sphere === 'municipal' || sphere === 'estadual') && !org.uf && !errors.uf) errors.uf = 'UF é obrigatória nas esferas municipal e estadual';
    org.department = read('department', body, 'department', 255, { required: true, label: 'Secretaria, órgão ou departamento' });

    const areas = body.competenceAreas;
    if (!Array.isArray(areas) || areas.length === 0 || areas.length > MAX_COMPETENCE_AREAS) {
      errors.competenceAreas = `Informe de 1 a ${MAX_COMPETENCE_AREAS} áreas de atuação ou competência`;
      org.competence_areas = [];
    } else {
      const list = [];
      for (const area of areas) {
        const v = text(area, 120);
        if (!v) { errors.competenceAreas = 'Cada área de competência: texto de até 120 caracteres'; break; }
        if (!list.some((a) => a.toLowerCase() === v.toLowerCase())) list.push(v);
      }
      org.competence_areas = list;
    }
    org.cnae_primary = null;
    org.cnae_primary_description = null;
    org.cnae_secondary = [];
  }

  // Representante (Poder Público) / responsável (Agente). Contatos privados.
  const representative = {
    full_name: read('representative.fullName', rep, 'fullName', 255, { required: true, label: 'Nome do representante' }),
    position: read('representative.position', rep, 'position', 255, { required: true, label: 'Cargo ou função' }),
    institutional_email: read('representative.institutionalEmail', rep, 'institutionalEmail', 255, { required: true, label: 'E-mail institucional do representante' }),
    institutional_phone: null,
    proof_document_ref: read('representative.proofDocumentRef', rep, 'proofDocumentRef', 500, { label: 'Referência do documento de comprovação' }),
    proof_description: read('representative.proofDescription', rep, 'proofDescription', 2000, { label: 'Informação de comprovação' }),
  };
  if (representative.institutional_email && !isValidEmail(representative.institutional_email)) {
    errors['representative.institutionalEmail'] = 'E-mail institucional do representante inválido';
  }
  const repPhone = normalizePhone(rep.institutionalPhone ?? '');
  if (!repPhone) errors['representative.institutionalPhone'] = 'Telefone institucional do representante é obrigatório';
  else if (!isValidPhone(repPhone)) errors['representative.institutionalPhone'] = 'Telefone institucional do representante inválido';
  representative.institutional_phone = repPhone || null;

  return { value: { organization: org, representative }, errors };
}

/**
 * Transições do estado de validação. O titular (user-service) só envia para
 * análise; as demais mudanças são do dm-gestao (decisão 2). A mesma regra é
 * imposta pelo trigger `organizations_validation_guard` (migração 008).
 */
const TRANSITIONS = {
  titular: { pendente: ['em_analise'], devolvida: ['em_analise'], revogada: ['em_analise'] },
  gestao: { em_analise: ['validada', 'devolvida'], validada: ['revogada'] },
};

function transitionAllowed(actor, from, to) {
  return Boolean(TRANSITIONS[actor]?.[from]?.includes(to));
}

/** Poder Público só atua institucionalmente com a instituição validada. */
function canActInstitutionally(kind, status) {
  return INSTITUTION_KINDS.includes(kind) && status === 'validada';
}

module.exports = {
  INSTITUTION_KINDS,
  VALIDATION_STATUSES,
  EDITABLE_STATUSES,
  GOVERNMENT_SPHERES,
  UFS,
  LINKED_AGENT_PROFILES,
  CNAE_REFERENCE,
  COMPETENCE_AREA_SUGGESTIONS,
  TRANSITIONS,
  normalizeCnpj,
  isValidCnpj,
  formatCnpj,
  normalizeCnae,
  isValidCnae,
  formatCnae,
  cnaeDescription,
  normalizeCep,
  isValidCep,
  isValidUf,
  isValidEmail,
  normalizePhone,
  isValidPhone,
  kindForUser,
  validateInstitution,
  transitionAllowed,
  canActInstitutionally,
};
