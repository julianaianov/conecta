// Divulgação de ações do Poder Público (T22, slide 24): validação pura do que
// o órgão publica. A gravação (post do feed + resposta institucional + vínculo)
// fica em ./store.js; o schema é a migração 019-government-indicators.sql.

const { ACTION_KINDS, ACTION_RESPONSE_TYPE, LIMITS } = require('./constants');

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value, field, { required = false, max, errors }) {
  if (value === undefined || value === null || String(value).trim() === '') {
    if (required) errors[field] = 'Campo obrigatório';
    return null;
  }
  const trimmed = String(value).trim();
  if (max && trimmed.length > max) {
    errors[field] = `Use no máximo ${max} caracteres`;
    return null;
  }
  return trimmed;
}

function isoDate(value, field, errors) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (!ISO_DATE.test(raw) || Number.isNaN(new Date(`${raw}T00:00:00Z`).getTime())) {
    errors[field] = 'Use uma data AAAA-MM-DD';
    return null;
  }
  return raw;
}

/**
 * Ação, programa, obra, serviço, evento ou edital divulgado pelo órgão.
 * `demandId` é opcional: sem ele, a ação é do território.
 */
function validateAction(body = {}) {
  const errors = {};
  const kind = body.kind === undefined || body.kind === null || body.kind === '' ? null : String(body.kind);
  if (!kind) errors.kind = 'Campo obrigatório';
  else if (!ACTION_KINDS.includes(kind)) errors.kind = `Valores aceitos: ${ACTION_KINDS.join(', ')}`;

  const title = text(body.title, 'title', { required: true, max: LIMITS.title, errors });
  const summary = text(body.summary, 'summary', { required: true, max: LIMITS.summary, errors });
  const programName = text(body.programName, 'programName', { max: LIMITS.programName, errors });
  const programUrl = text(body.programUrl, 'programUrl', { max: LIMITS.programUrl, errors });
  if (programUrl && !/^https:\/\/\S+$/.test(programUrl)) errors.programUrl = 'Use um endereço https://';
  const territory = text(body.territory, 'territory', { max: LIMITS.territory, errors });
  const municipality = text(body.municipality, 'municipality', { max: LIMITS.municipality, errors });

  let uf = null;
  if (body.uf !== undefined && body.uf !== null && String(body.uf).trim() !== '') {
    uf = String(body.uf).trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(uf)) {
      errors.uf = 'UF inválida';
      uf = null;
    }
  }

  let demandId = null;
  if (body.demandId !== undefined && body.demandId !== null && String(body.demandId).trim() !== '') {
    demandId = String(body.demandId).trim();
    if (!UUID.test(demandId)) {
      errors.demandId = 'Demanda inválida';
      demandId = null;
    }
  }

  const startsOn = isoDate(body.startsOn, 'startsOn', errors);
  const endsOn = isoDate(body.endsOn, 'endsOn', errors);
  if (startsOn && endsOn && endsOn < startsOn) errors.endsOn = 'O fim vem depois do início';

  // "Programa público relacionado" da T13 exige o nome do programa: quando a
  // ação vira resposta institucional desse tipo, o nome é obrigatório.
  if (!errors.kind && kind && demandId
      && ACTION_RESPONSE_TYPE[kind] === 'programa_publico_relacionado' && !programName) {
    errors.programName = 'Informe o nome do programa ou serviço público';
  }

  if (Object.keys(errors).length) return { errors };
  return {
    errors: {},
    value: {
      kind, title, summary, programName, programUrl, territory, municipality, uf,
      demandId, startsOn, endsOn,
    },
  };
}

/** Corpo da resposta institucional gerada pela ação ligada a uma demanda. */
function actionResponse(value) {
  const parts = [value.summary];
  if (value.programUrl) parts.push(`Mais informações: ${value.programUrl}`);
  if (value.startsOn) parts.push(`Início previsto: ${value.startsOn}`);
  return {
    type: ACTION_RESPONSE_TYPE[value.kind],
    body: `${value.title}\n\n${parts.join('\n\n')}`.slice(0, 5000),
    responsibleSector: null,
    programName: value.programName,
    programUrl: value.programUrl,
    plannedFor: value.startsOn,
  };
}

module.exports = { validateAction, actionResponse };
