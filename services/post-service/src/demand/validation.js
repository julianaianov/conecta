// Validação da demanda (Fluxo 2, etapas 03 a 07; slide 25, passos 03 a 10).
//
// `validateDemand(input, { forSubmission })` normaliza o que o Agente enviou e
// devolve `{ value, errors, warnings, composition }`:
// - `errors` é um objeto campo → mensagem (vazio quando ok). Chaves de lista
//   usam o índice: `budgetItems[0].quantity`, `goals[1].indicator`.
// - Rascunho (`forSubmission: false`, padrão): só o formato do que veio; campo
//   ausente é permitido.
// - Envio para análise (`forSubmission: true`): exige os obrigatórios da fonte
//   (fotografia, localização com CEP, orçamento detalhado, cronograma, e também
//   categoria, título, descrição, objetivo, justificativa, público beneficiado
//   com estimativa e perfil, prioridade, território, metas com indicadores) e a
//   regra do registro fotográfico/audiovisual quando houver execução física.
// - `warnings`: o que a fonte pede "sempre que possível" (vínculo das etapas ao
//   custo, marco de acompanhamento) e o que ela não exige mas a plataforma
//   incentiva (os eixos temáticos do slide 26), e os critérios de prioridade
//   (decisão 17) quando a prioridade é alta ou urgente; não bloqueia.
// - `composition`: composição financeira calculada dos itens (finance.js).
//
// O banco repete as regras estruturais no envio (demand_assert_submittable).

const {
  CATEGORIES, PRIORITIES, RECORD_MILESTONES, RESOURCE_KINDS, RESOURCE_TYPES_BY_KIND, DOCUMENT_TYPES,
  THEMES,
} = require('./constants');
const { quantityToMilli, lineTotalCents, computeComposition, MAX_BUDGET_CENTS } = require('./finance');
const { PRIORITY_CRITERIA_IDS, PRIORITIES_EXPECTING_CRITERIA } = require('./priority');
const {
  FIELD_BY_KEY, MAX_AREA_M2, MODULE_FIELDS, MODULE_LABELS, BASE_MILESTONES, moduleOf, milestonesFor,
} = require('./modules');
const { parseUploadRef, formatUploadRef } = require('../uploads');

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR',
  'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const LIMITS = {
  title: 200,
  description: 10_000,
  objective: 5_000,
  justification: 5_000,
  beneficiariesProfile: 2_000,
  territory: 255,
  street: 255,
  addressNumber: 30,
  addressComplement: 120,
  district: 120,
  municipality: 120,
  reference: 1_000,
  itemDescription: 500,
  unit: 30,
  stage: 255,
  activities: 5_000,
  responsible: 255,
  goalText: 2_000,
  resourceDescription: 2_000,
  documentTitle: 255,
  documentDescription: 2_000,
};

const MAX_ITEMS = 200;
const MAX_BENEFICIARIES = 100_000_000;

// TODO(fonte-da-verdade): Modelo de Conexão §04 — faltam "Problema identificado" e "Área de abrangência" distintos de descrição e território; ver TODO em migrations/007-demands.sql.
const REQUIRED_ON_SUBMIT = [
  ['category', 'Selecione a categoria da demanda'],
  ['title', 'Informe o título da demanda'],
  ['description', 'Descreva a demanda'],
  ['objective', 'Informe o objetivo: o que se pretende resolver ou realizar'],
  ['justification', 'Explique a necessidade da ação (justificativa)'],
  ['beneficiariesEstimate', 'Informe a estimativa de pessoas beneficiadas'],
  ['beneficiariesProfile', 'Descreva o perfil dos beneficiários'],
  ['priority', 'Selecione o nível de prioridade'],
  ['photoRef', 'A fotografia da situação, local ou projeto é obrigatória'],
  ['cep', 'A localização com CEP é obrigatória'],
  ['latitude', 'Marque no mapa o ponto da demanda: sem ele a demanda não aparece no mapa'],
  ['municipality', 'Informe o município'],
  ['uf', 'Informe a UF'],
  ['territory', 'Informe o território de abrangência (bairro, comunidade ou região)'],
];

function isBlank(value) {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function text(errors, key, raw, max, { multiline = false } = {}) {
  if (isBlank(raw)) return null;
  if (typeof raw !== 'string') {
    errors[key] = 'Valor inválido';
    return null;
  }
  const value = multiline ? raw.trim() : raw.trim().replace(/\s+/g, ' ');
  if (value.length > max) errors[key] = `Use no máximo ${max} caracteres`;
  return value;
}

function oneOf(errors, key, raw, allowed, message) {
  if (isBlank(raw)) return null;
  if (!allowed.includes(raw)) {
    errors[key] = message;
    return null;
  }
  return raw;
}

/**
 * Referência de arquivo: upload confirmado (`upload:<id>` ou o id puro, T08;
 * a rota confere dono, finalidade e vínculo) ou link https (compatibilidade).
 */
function reference(errors, key, raw, label) {
  const value = text(errors, key, raw, LIMITS.reference);
  if (value === null || errors[key]) return value;
  const uploadId = parseUploadRef(value);
  if (uploadId) return formatUploadRef(uploadId);
  let url;
  try {
    url = new URL(value);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== 'https:' || !url.hostname) {
    errors[key] = `${label}: envie o arquivo ou use um link https`;
  }
  return value;
}

function isoDate(errors, key, raw) {
  if (isBlank(raw)) return null;
  const match = typeof raw === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim()) : null;
  const date = match ? new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])) : null;
  if (!date || date.getUTCMonth() !== +match[2] - 1 || date.getUTCDate() !== +match[3]) {
    errors[key] = 'Data inválida (use AAAA-MM-DD)';
    return null;
  }
  return raw.trim();
}

function coordinate(errors, key, raw, limit) {
  if (isBlank(raw)) return null;
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    errors[key] = 'Coordenada inválida';
    return null;
  }
  return value;
}

function list(errors, key, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors[key] = 'Lista inválida';
    return [];
  }
  if (raw.length > MAX_ITEMS) {
    errors[key] = `No máximo ${MAX_ITEMS} itens`;
    return [];
  }
  return raw.map((item) => (item && typeof item === 'object' ? item : {}));
}

function optionalId(raw) {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function normalizeBudgetItem(errors, raw, i, scheduleIds) {
  const key = (field) => `budgetItems[${i}].${field}`;
  const item = {
    id: optionalId(raw.id),
    description: text(errors, key('description'), raw.description, LIMITS.itemDescription),
    quantity: null,
    unit: text(errors, key('unit'), raw.unit, LIMITS.unit),
    unitPriceCents: null,
    totalCents: null,
    isAudiovisualRecord: raw.isAudiovisualRecord === true,
    scheduleItemId: optionalId(raw.scheduleItemId),
  };
  if (item.description === null && !errors[key('description')]) errors[key('description')] = 'Descreva o item';
  if (item.unit === null && !errors[key('unit')]) errors[key('unit')] = 'Informe a unidade';

  const milli = quantityToMilli(raw.quantity);
  if (milli === null) errors[key('quantity')] = 'Quantidade maior que zero, com até 3 casas decimais';
  else item.quantity = Number(milli) / 1000;

  if (!Number.isSafeInteger(raw.unitPriceCents) || raw.unitPriceCents < 0 || raw.unitPriceCents > MAX_BUDGET_CENTS) {
    errors[key('unitPriceCents')] = 'Valor unitário inválido (centavos inteiros, não negativo)';
  } else {
    item.unitPriceCents = raw.unitPriceCents;
  }
  if (item.quantity !== null && item.unitPriceCents !== null) {
    item.totalCents = lineTotalCents(item.quantity, item.unitPriceCents);
  }
  if (item.scheduleItemId && !scheduleIds.has(item.scheduleItemId)) {
    errors[key('scheduleItemId')] = 'A etapa vinculada não faz parte do cronograma desta demanda';
  }
  if (raw.isAudiovisualRecord !== undefined && typeof raw.isAudiovisualRecord !== 'boolean') {
    errors[key('isAudiovisualRecord')] = 'Valor inválido';
  }
  return item;
}

function normalizeScheduleItem(errors, raw, i) {
  const key = (field) => `scheduleItems[${i}].${field}`;
  const item = {
    id: optionalId(raw.id),
    stage: text(errors, key('stage'), raw.stage, LIMITS.stage),
    activities: text(errors, key('activities'), raw.activities, LIMITS.activities, { multiline: true }),
    startsOn: isoDate(errors, key('startsOn'), raw.startsOn),
    endsOn: isoDate(errors, key('endsOn'), raw.endsOn),
    responsible: text(errors, key('responsible'), raw.responsible, LIMITS.responsible),
    recordMilestones: [],
  };
  if (item.stage === null && !errors[key('stage')]) errors[key('stage')] = 'Informe a etapa';
  if (item.activities === null && !errors[key('activities')]) errors[key('activities')] = 'Descreva as atividades previstas';
  if (item.startsOn === null && !errors[key('startsOn')]) errors[key('startsOn')] = 'Informe a data de início';
  if (item.endsOn === null && !errors[key('endsOn')]) errors[key('endsOn')] = 'Informe a data de término';
  if (item.startsOn && item.endsOn && item.endsOn < item.startsOn) {
    errors[key('endsOn')] = 'O término não pode ser antes do início';
  }
  const milestones = raw.recordMilestones ?? [];
  if (!Array.isArray(milestones) || milestones.some((m) => !RECORD_MILESTONES.includes(m))) {
    errors[key('recordMilestones')] = 'Marcos de registro: antes, acompanhamento ou depois '
      + '(no módulo ambiental também diagnóstico, intervenção e monitoramento)';
  } else {
    item.recordMilestones = RECORD_MILESTONES.filter((m) => milestones.includes(m));
  }
  return item;
}

function normalizeGoal(errors, raw, i) {
  const key = (field) => `goals[${i}].${field}`;
  const goal = {
    id: optionalId(raw.id),
    goal: text(errors, key('goal'), raw.goal, LIMITS.goalText, { multiline: true }),
    expectedResult: text(errors, key('expectedResult'), raw.expectedResult, LIMITS.goalText, { multiline: true }),
    indicator: text(errors, key('indicator'), raw.indicator, LIMITS.goalText, { multiline: true }),
    measurementMethod: text(errors, key('measurementMethod'), raw.measurementMethod, LIMITS.goalText, { multiline: true }),
  };
  const messages = {
    goal: 'Informe a meta',
    expectedResult: 'Informe o resultado esperado',
    indicator: 'Informe o indicador de acompanhamento',
    measurementMethod: 'Informe a forma de mensuração',
  };
  for (const [field, message] of Object.entries(messages)) {
    if (goal[field] === null && !errors[key(field)]) errors[key(field)] = message;
  }
  return goal;
}

function normalizeResource(errors, raw, i, seen) {
  const key = (field) => `resources[${i}].${field}`;
  const kind = oneOf(errors, key('kind'), raw.kind, RESOURCE_KINDS, 'Tipo: recurso necessário ou contrapartida');
  if (kind === null && !errors[key('kind')]) errors[key('kind')] = 'Tipo: recurso necessário ou contrapartida';
  let type = null;
  if (kind) {
    type = oneOf(errors, key('type'), raw.type, RESOURCE_TYPES_BY_KIND[kind],
      kind === 'necessario' ? 'Recurso necessário fora da lista da plataforma' : 'Contrapartida fora da lista da plataforma');
    if (type === null && !errors[key('type')]) errors[key('type')] = 'Selecione o recurso';
    if (type) {
      const id = `${kind}:${type}`;
      if (seen.has(id)) errors[key('type')] = 'Recurso repetido';
      seen.add(id);
    }
  }
  return {
    id: optionalId(raw.id),
    kind,
    type,
    description: text(errors, key('description'), raw.description, LIMITS.resourceDescription, { multiline: true }),
  };
}

function normalizeDocument(errors, raw, i) {
  const key = (field) => `documents[${i}].${field}`;
  const doc = {
    id: optionalId(raw.id),
    type: oneOf(errors, key('type'), raw.type, DOCUMENT_TYPES, 'Tipo de documento fora da lista'),
    title: text(errors, key('title'), raw.title, LIMITS.documentTitle),
    reference: reference(errors, key('reference'), raw.reference, 'Documento'),
    description: text(errors, key('description'), raw.description, LIMITS.documentDescription, { multiline: true }),
  };
  if (doc.type === null && !errors[key('type')]) errors[key('type')] = 'Selecione o tipo do documento';
  if (doc.title === null && !errors[key('title')]) errors[key('title')] = 'Informe o nome do documento';
  if (doc.reference === null && !errors[key('reference')]) errors[key('reference')] = 'Anexe o documento';
  return doc;
}

/**
 * Eixos temáticos do território (T26, slide 26): lista sem repetição, na ordem
 * da fonte. **Opcional** — lista ausente ou vazia é válida, inclusive no envio;
 * o que a fonte exige está em REQUIRED_ON_SUBMIT.
 */
function normalizeThemes(errors, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.themes = 'Lista de eixos inválida';
    return [];
  }
  if (raw.some((theme) => typeof theme !== 'string' || !THEMES.includes(theme))) {
    errors.themes = 'Eixo temático fora dos nove da plataforma';
    return [];
  }
  return THEMES.filter((theme) => raw.includes(theme));
}

/**
 * Critérios de prioridade declarados (T-02-01, decisão 17): subconjunto dos
 * quatro da plataforma, na ordem de `priority.js`, sem repetição.
 */
function normalizePriorityCriteria(errors, raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.priorityCriteria = 'Lista de critérios inválida';
    return [];
  }
  if (raw.some((c) => typeof c !== 'string' || !PRIORITY_CRITERIA_IDS.includes(c))) {
    errors.priorityCriteria = 'Critério de prioridade fora dos quatro da plataforma';
    return [];
  }
  return PRIORITY_CRITERIA_IDS.filter((c) => raw.includes(c));
}

/**
 * Informações específicas do módulo (T-05-08, `demands.module_details`).
 * Aceita as chaves de qualquer módulo (a etapa pode gravar antes da
 * categoria); a leitura mostra só as do módulo da categoria. Texto vazio é
 * omitido; `null` apaga a chave.
 */
function normalizeModuleDetails(errors, raw) {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    errors.moduleDetails = 'Informações do módulo inválidas';
    return {};
  }
  const out = {};
  const cleanText = (value, max, key) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      errors[key] = 'Texto inválido';
      return null;
    }
    const trimmed = value.replace(/\r\n/g, '\n').trim();
    if (trimmed.length > max) errors[key] = `Até ${max} caracteres`;
    return trimmed || null;
  };
  for (const [name, value] of Object.entries(raw)) {
    const field = FIELD_BY_KEY[name];
    const key = `moduleDetails.${name}`;
    if (!field) {
      errors[key] = 'Campo fora dos módulos da plataforma';
      continue;
    }
    if (value === null || value === undefined || value === '') continue;
    if (field.type === 'number') {
      const number = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
      if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > MAX_AREA_M2) {
        errors[key] = 'Informe um número válido (m²)';
      } else {
        out[name] = Math.round(number * 100) / 100;
      }
    } else if (field.type === 'group') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        errors[key] = 'Informações inválidas';
        continue;
      }
      const group = {};
      for (const [sub, subValue] of Object.entries(value)) {
        const def = field.fields.find((f) => f.key === sub);
        if (!def) {
          errors[`${key}.${sub}`] = 'Campo fora do módulo';
          continue;
        }
        const text = cleanText(subValue, def.max, `${key}.${sub}`);
        if (text) group[sub] = text;
      }
      if (Object.keys(group).length) out[name] = group;
    } else {
      const text = cleanText(value, field.max, key);
      if (text) out[name] = text;
    }
  }
  return out;
}

function normalizeCep(errors, raw) {
  if (isBlank(raw)) return null;
  const digits = typeof raw === 'string' || typeof raw === 'number' ? String(raw).replace(/\D/g, '') : '';
  if (digits.length !== 8) {
    errors.cep = 'CEP com 8 dígitos';
    return null;
  }
  return digits;
}

function normalizeBeneficiaries(errors, raw) {
  if (isBlank(raw)) return null;
  const value = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BENEFICIARIES) {
    errors.beneficiariesEstimate = 'Estimativa de pessoas: número inteiro maior que zero';
    return null;
  }
  return value;
}

/**
 * Normaliza e valida a demanda. Ver o comentário do módulo para o formato de
 * entrada (camelCase) e de saída.
 */
function validateDemand(input, { forSubmission = false } = {}) {
  const body = input && typeof input === 'object' ? input : {};
  const errors = {};
  const warnings = {};

  const value = {
    category: oneOf(errors, 'category', body.category, CATEGORIES, 'Categoria fora dos doze tipos da plataforma'),
    title: text(errors, 'title', body.title, LIMITS.title),
    description: text(errors, 'description', body.description, LIMITS.description, { multiline: true }),
    objective: text(errors, 'objective', body.objective, LIMITS.objective, { multiline: true }),
    justification: text(errors, 'justification', body.justification, LIMITS.justification, { multiline: true }),
    beneficiariesEstimate: normalizeBeneficiaries(errors, body.beneficiariesEstimate),
    beneficiariesProfile: text(errors, 'beneficiariesProfile', body.beneficiariesProfile, LIMITS.beneficiariesProfile, { multiline: true }),
    priority: oneOf(errors, 'priority', body.priority, PRIORITIES, 'Nível de prioridade inválido'),
    priorityCriteria: normalizePriorityCriteria(errors, body.priorityCriteria),
    photoRef: reference(errors, 'photoRef', body.photoRef, 'Fotografia'),
    cep: normalizeCep(errors, body.cep),
    street: text(errors, 'street', body.street, LIMITS.street),
    addressNumber: text(errors, 'addressNumber', body.addressNumber, LIMITS.addressNumber),
    addressComplement: text(errors, 'addressComplement', body.addressComplement, LIMITS.addressComplement),
    district: text(errors, 'district', body.district, LIMITS.district),
    municipality: text(errors, 'municipality', body.municipality, LIMITS.municipality),
    uf: null,
    latitude: coordinate(errors, 'latitude', body.latitude, 90),
    longitude: coordinate(errors, 'longitude', body.longitude, 180),
    territory: text(errors, 'territory', body.territory, LIMITS.territory),
    themes: normalizeThemes(errors, body.themes),
    moduleDetails: normalizeModuleDetails(errors, body.moduleDetails),
    hasPhysicalExecution: body.hasPhysicalExecution === undefined ? true : body.hasPhysicalExecution,
    budgetItems: [],
    scheduleItems: [],
    goals: [],
    resources: [],
    documents: [],
  };

  if (!isBlank(body.uf)) {
    const uf = typeof body.uf === 'string' ? body.uf.trim().toUpperCase() : '';
    if (UFS.includes(uf)) value.uf = uf;
    else errors.uf = 'UF inválida';
  }
  if (typeof value.hasPhysicalExecution !== 'boolean') {
    errors.hasPhysicalExecution = 'Valor inválido';
    value.hasPhysicalExecution = true;
  }
  if ((value.latitude === null) !== (value.longitude === null) && !errors.latitude && !errors.longitude) {
    errors.latitude = 'Informe latitude e longitude juntas';
  }

  value.scheduleItems = list(errors, 'scheduleItems', body.scheduleItems).map((raw, i) => normalizeScheduleItem(errors, raw, i));
  const scheduleIds = new Set(value.scheduleItems.map((item) => item.id).filter(Boolean));
  value.budgetItems = list(errors, 'budgetItems', body.budgetItems).map((raw, i) => normalizeBudgetItem(errors, raw, i, scheduleIds));
  value.goals = list(errors, 'goals', body.goals).map((raw, i) => normalizeGoal(errors, raw, i));
  const seenResources = new Set();
  value.resources = list(errors, 'resources', body.resources).map((raw, i) => normalizeResource(errors, raw, i, seenResources));
  value.documents = list(errors, 'documents', body.documents).map((raw, i) => normalizeDocument(errors, raw, i));

  let composition = null;
  const base = value.budgetItems.reduce((sum, item) => sum + (item.totalCents ?? 0), 0);
  if (base > MAX_BUDGET_CENTS) {
    errors.budgetItems = 'Orçamento acima do limite da plataforma';
  } else if (value.budgetItems.every((item) => item.totalCents !== null)) {
    composition = computeComposition(base);
  }

  if (forSubmission) {
    for (const [field, message] of REQUIRED_ON_SUBMIT) {
      if (value[field] === null && !errors[field]) errors[field] = message;
    }
    if (value.budgetItems.length === 0 && !errors.budgetItems) {
      errors.budgetItems = 'O orçamento detalhado é obrigatório';
    } else if (composition && composition.budgetAmountCents === 0) {
      errors.budgetItems = 'O orçamento precisa ter valor';
    }
    if (value.scheduleItems.length === 0 && !errors.scheduleItems) {
      errors.scheduleItems = 'O cronograma de execução é obrigatório';
    }
    if (value.goals.length === 0 && !errors.goals) {
      errors.goals = 'Informe ao menos uma meta, com resultado esperado, indicador e forma de mensuração';
    }

    // Registro fotográfico e audiovisual do antes e do depois (slides 11 e 12):
    // item obrigatório do orçamento e momentos previstos no cronograma sempre
    // que houver execução física ou intervenção que permita o registro.
    if (value.hasPhysicalExecution) {
      const audiovisual = value.budgetItems.some((item) => item.isAudiovisualRecord && item.totalCents > 0);
      if (!audiovisual) {
        errors.audiovisualRecord = 'Com execução física, o orçamento deve prever o custo do registro fotográfico e audiovisual do antes e do depois';
      }
      const milestones = new Set(value.scheduleItems.flatMap((item) => item.recordMilestones));
      if (value.scheduleItems.length > 0 && (!milestones.has('antes') || !milestones.has('depois'))) {
        errors.recordMilestones = 'Com execução física, o cronograma deve prever o registro do antes e do depois';
      } else if (value.scheduleItems.length > 0 && !milestones.has('acompanhamento') && !milestones.has('monitoramento')) {
        warnings.recordMilestones = moduleOf(value.category) === 'ambiental'
          ? 'Considere prever os registros do diagnóstico, da intervenção e do monitoramento (antes → diagnóstico → intervenção → monitoramento → resultado)'
          : 'Considere prever também o registro de acompanhamento da execução';
      }
    }

    // Marcos próprios do módulo ambiental (§24) só valem nele (T-05-08).
    const allowed = new Set([...BASE_MILESTONES, ...milestonesFor(value.category)]);
    const outside = value.scheduleItems.flatMap((item) => item.recordMilestones).filter((m) => !allowed.has(m));
    if (outside.length && !errors.recordMilestones) {
      errors.recordMilestones = 'Diagnóstico, intervenção e monitoramento são marcos do módulo ambiental';
    }

    // Informações específicas do módulo (§23–§25): a fonte lista o que o
    // módulo pede; o que falta vira aviso, nunca bloqueio.
    const module = moduleOf(value.category);
    const missing = (MODULE_FIELDS[module] ?? []).filter((field) => value.moduleDetails[field.key] === undefined);
    if (missing.length) {
      warnings.moduleDetails = `${MODULE_LABELS[module]}: informe também ${missing.map((f) => f.label.toLowerCase()).join(', ')}`;
    }
  }

  // Eixos temáticos (T26, slide 26): opcionais, mas é deles que sai a
  // inteligência territorial por tema. No envio, a ausência vira incentivo —
  // aviso, nunca bloqueio.
  if (forSubmission && value.themes.length === 0 && !errors.themes) {
    warnings.themes = 'Marque os eixos temáticos desta demanda (Iluminação, Segurança, Saneamento, Limpeza, '
      + 'Esporte, Educação, Mobilidade, Cultura, Meio Ambiente): é assim que ela entra na leitura por tema do território';
  }

  // Prioridade alta ou urgente sem critério declarado (decisão 17): aviso na
  // revisão, para a análise ter com o que conferir; não bloqueia.
  if (forSubmission && PRIORITIES_EXPECTING_CRITERIA.includes(value.priority)
      && value.priorityCriteria.length === 0 && !errors.priorityCriteria) {
    warnings.priorityCriteria = 'Indique qual critério da plataforma justifica a prioridade alta ou urgente '
      + '(risco à vida ou à segurança, número de pessoas afetadas, prazo ou sazonalidade, recurso ou parceiro já disponível)';
  }

  // Cronograma físico-financeiro "sempre que possível" (slide 14).
  if (value.budgetItems.length > 0 && value.scheduleItems.length > 0
      && value.budgetItems.some((item) => !item.scheduleItemId)) {
    warnings.physicalFinancial = 'Vincule cada item do orçamento a uma etapa do cronograma (cronograma físico-financeiro)';
  }

  return { value, errors, warnings, composition };
}

module.exports = {
  validateDemand, normalizeThemes, normalizePriorityCriteria, normalizeModuleDetails, LIMITS, UFS, MAX_ITEMS,
};
