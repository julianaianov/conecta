// Validação das entradas do Processo de Conexão (T-05-01). Puro: devolve
// `{ value, errors }` (campo → mensagem, em camelCase como na API). O banco
// repete as regras estruturais (CHECKs e trigger da migração 026).

const {
  PROCESS_STATUSES, CONTRIBUTION_KINDS, FINANCIAL_CONTRIBUTIONS, LIMITS,
  DEADLINE_STAGES, DEADLINE_DEFAULT_DAYS, DEADLINE_STAGE_SIDE, DEADLINE_SIDES, DEADLINE_MAX_DAYS,
} = require('./constants');
const { requiresNote } = require('./state-machine');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function optionalText(raw, field, max, errors) {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    errors[field] = 'Texto inválido';
    return null;
  }
  const value = raw.trim();
  if (!value) return null;
  if (value.length > max) {
    errors[field] = `Use no máximo ${max} caracteres`;
    return null;
  }
  return value;
}

function isoDate(raw, field, errors) {
  if (raw === undefined || raw === null || raw === '') return null;
  const match = typeof raw === 'string' ? DATE_RE.exec(raw) : null;
  if (!match) {
    errors[field] = 'Data no formato AAAA-MM-DD';
    return null;
  }
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d || y < 2000 || y > 2100) {
    errors[field] = 'Data inválida';
    return null;
  }
  return raw;
}

/** Mudança de status: `{ status, note }` (a transição é conferida contra o processo). */
function validateStatusChange(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const status = typeof input.status === 'string' ? input.status : '';
  if (!PROCESS_STATUSES.includes(status)) errors.status = 'Escolha um status do processo';
  const note = optionalText(input.note, 'note', LIMITS.note, errors);
  if (!errors.status && requiresNote(status) && !note && !errors.note) errors.note = 'Informe o motivo';
  return { value: { status, note }, errors };
}

// Responsável atual (§14): instituição, órgão, secretaria, setor, pessoa,
// cargo e data limite da próxima ação. Campo ausente mantém o valor; vazio apaga.
const RESPONSIBLE_FIELDS = {
  organizationName: 'responsible_organization_name',
  organ: 'responsible_organ',
  department: 'responsible_department',
  sector: 'responsible_sector',
  name: 'responsible_name',
  role: 'responsible_role',
};

function validateResponsible(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const value = {};
  for (const key of Object.keys(RESPONSIBLE_FIELDS)) {
    if (has(input, key)) value[key] = optionalText(input[key], key, LIMITS.name, errors);
  }
  if (has(input, 'dueOn')) value.dueOn = isoDate(input.dueOn, 'dueOn', errors);
  if (!Object.keys(value).length && !Object.keys(errors).length) {
    errors.name = 'Informe ao menos um dado do responsável';
  }
  return { value, errors };
}

/**
 * Contribuição do conectado (§28): tipos, descrição e, em apoio financeiro ou
 * patrocínio, o valor em centavos. `partial`: só os campos enviados.
 */
function validateContribution(body, { partial = false } = {}) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const value = {};
  if (!partial || has(input, 'contributionKinds')) {
    const raw = input.contributionKinds ?? [];
    if (!Array.isArray(raw) || raw.some((k) => !CONTRIBUTION_KINDS.includes(k))) {
      errors.contributionKinds = 'Escolha as formas de contribuição da lista';
    } else if (new Set(raw).size !== raw.length) {
      errors.contributionKinds = 'Forma de contribuição repetida';
    } else {
      value.contributionKinds = raw;
    }
  }
  if (!partial || has(input, 'contributionDescription')) {
    value.contributionDescription = optionalText(input.contributionDescription, 'contributionDescription',
      LIMITS.description, errors);
  }
  if (!partial || has(input, 'contributionAmountCents')) {
    const raw = input.contributionAmountCents;
    if (raw === undefined || raw === null || raw === '') {
      value.contributionAmountCents = null;
    } else if (!Number.isSafeInteger(raw) || raw < 0 || raw > LIMITS.maxAmountCents) {
      errors.contributionAmountCents = 'Valor em centavos inteiros, não negativo';
    } else {
      value.contributionAmountCents = raw;
    }
  }
  const kinds = value.contributionKinds;
  if (kinds && value.contributionAmountCents !== null && value.contributionAmountCents !== undefined
      && !kinds.some((k) => FINANCIAL_CONTRIBUTIONS.includes(k))) {
    errors.contributionAmountCents = 'Valor só em apoio financeiro ou patrocínio';
  }
  return { value, errors };
}

/**
 * Formalização pelo Agente autor: `{ interestId | offerId, contribution… }`.
 * Exatamente uma origem.
 */
function validateFormalize(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const origins = ['interestId', 'offerId'].filter((k) => input[k] !== undefined && input[k] !== null && input[k] !== '');
  if (origins.length !== 1) {
    errors.origin = 'Informe o interesse (interestId) ou a oferta do órgão (offerId)';
  } else if (typeof input[origins[0]] !== 'string' || !UUID_RE.test(input[origins[0]])) {
    errors[origins[0]] = 'Identificador inválido';
  }
  const contribution = validateContribution(input, { partial: true });
  Object.assign(errors, contribution.errors);
  return {
    value: {
      interestId: origins[0] === 'interestId' ? input.interestId : null,
      offerId: origins[0] === 'offerId' ? input.offerId : null,
      contribution: contribution.value,
    },
    errors,
  };
}

/** Dias de prazo: inteiro de 1 a `DEADLINE_MAX_DAYS` (ausente → null). */
function dueDays(raw, field, errors) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : raw;
  if (!Number.isInteger(n) || n < 1 || n > DEADLINE_MAX_DAYS) {
    errors[field] = `Prazo em dias, de 1 a ${DEADLINE_MAX_DAYS}`;
    return null;
  }
  return n;
}

/**
 * Prazo de uma etapa (§15): `{ stage, stageLabel?, dueDays? | dueOn?,
 * responsibleSide?, note? }`. Sem dias nem data, vale a sugestão da fonte
 * (`DEADLINE_DEFAULT_DAYS`); em `outra`, nome da etapa e prazo são
 * obrigatórios. `actor` (`agente` | `parte`) é quem define: só o lado
 * responsável pela etapa define o prazo dela.
 */
function validateDeadline(body, actor) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const stage = typeof input.stage === 'string' ? input.stage : '';
  if (!DEADLINE_STAGES.includes(stage)) errors.stage = 'Escolha a etapa';
  const stageLabel = stage === 'outra' ? optionalText(input.stageLabel, 'stageLabel', 120, errors) : null;
  if (stage === 'outra' && !stageLabel && !errors.stageLabel) errors.stageLabel = 'Informe o nome da etapa';
  const days = dueDays(input.dueDays, 'dueDays', errors);
  const dueOn = isoDate(input.dueOn, 'dueOn', errors);
  if (days !== null && dueOn) errors.dueOn = 'Informe os dias ou a data, não os dois';
  let responsibleSide = DEADLINE_STAGE_SIDE[stage] ?? null;
  if (stage === 'outra') {
    const side = input.responsibleSide ?? actor;
    if (!DEADLINE_SIDES.includes(side)) errors.responsibleSide = 'Escolha quem responde pela etapa';
    else responsibleSide = side;
  }
  if (stage === 'outra' && days === null && !dueOn && !errors.dueDays && !errors.dueOn) {
    errors.dueDays = 'Informe o prazo em dias ou a data limite';
  }
  const note = optionalText(input.note, 'note', 1000, errors);
  const forbidden = !errors.stage && stage !== 'outra' && DEADLINE_SIDES.includes(actor) && responsibleSide !== actor;
  return {
    value: {
      stage,
      stageLabel,
      responsibleSide,
      dueOn,
      days: dueOn ? null : days ?? DEADLINE_DEFAULT_DAYS[stage] ?? null,
      note,
    },
    errors,
    forbidden,
  };
}

/** Prazo cumprido: `{ note? }`. */
function validateFulfill(body) {
  const input = isObject(body) ? body : {};
  const errors = {};
  const note = optionalText(input.note, 'note', 1000, errors);
  return { value: { note }, errors };
}

module.exports = {
  dueDays,
  validateDeadline,
  validateFulfill,
  RESPONSIBLE_FIELDS,
  validateStatusChange,
  validateResponsible,
  validateContribution,
  validateFormalize,
};
