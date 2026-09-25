// Documentos da demanda no nível de visibilidade (T-05-18; Modelo de Conexão
// §33; decisão 13): `publico`, `institucional` (padrão: envolvidos no
// processo) e `restrito` (autor, delegados, operação e `restricted_to`).
// Tabela `demand_document_access` (migração 043); sem registro, vale o padrão.

const { PUBLIC_STATUSES } = require('../demand/constants');
const { isUuid } = require('../security');
const { parseUploadRef, formatUploadRef } = require('../uploads');
const {
  MANAGING_ROLES, demandPartyRole, loadAccessDemand, recordConsultation,
} = require('./process-party');

const ACCESS_LEVELS = ['publico', 'institucional', 'restrito'];
const DEFAULT_ACCESS_LEVEL = 'institucional';
const MAX_RESTRICTED = 50;

const DOCUMENT_SQL = `
  d.id, d.demand_id, d.position, d.document_type, d.title, d.description, d.reference,
  coalesce(a.access_level::text, '${DEFAULT_ACCESS_LEVEL}') AS access_level,
  coalesce(a.restricted_to, '{}'::uuid[])::text[] AS restricted_to`;
const DOCUMENT_FROM = 'demand_documents d LEFT JOIN demand_document_access a ON a.document_id = d.id';

/** A conta, com o papel que tem na demanda, vê o documento? */
function canSeeDocument(role, doc, userId) {
  if (!role) return false;
  if (MANAGING_ROLES.includes(role)) return true;
  if (doc.access_level === 'restrito') {
    return (doc.restricted_to ?? []).some((id) => typeof userId === 'string' && id.toLowerCase() === userId.toLowerCase());
  }
  return true;
}

function serializeDocument(doc, { manage = false } = {}) {
  const uploadId = parseUploadRef(doc.reference);
  const link = !uploadId && /^https:\/\//i.test(doc.reference ?? '');
  return {
    id: doc.id,
    position: doc.position,
    type: doc.document_type,
    title: doc.title,
    description: doc.description ?? null,
    accessLevel: doc.access_level,
    ...(manage ? { restrictedTo: doc.restricted_to ?? [] } : {}),
    hasFile: Boolean(uploadId || link),
  };
}

/** `{ value, errors }` do corpo do PUT de acesso. */
function validateAccess(body) {
  const errors = {};
  const accessLevel = body?.accessLevel;
  if (!ACCESS_LEVELS.includes(accessLevel)) errors.accessLevel = `Valores aceitos: ${ACCESS_LEVELS.join(', ')}`;
  let restrictedTo = [];
  if (body?.restrictedTo !== undefined && body?.restrictedTo !== null) {
    if (!Array.isArray(body.restrictedTo) || body.restrictedTo.length > MAX_RESTRICTED
        || !body.restrictedTo.every((id) => typeof id === 'string' && isUuid(id))) {
      errors.restrictedTo = `Lista de até ${MAX_RESTRICTED} contas (identificadores)`;
    } else {
      restrictedTo = [...new Set(body.restrictedTo.map((id) => id.toLowerCase()))];
    }
  }
  if (accessLevel !== 'restrito') restrictedTo = [];
  return { value: { accessLevel, restrictedTo }, errors };
}

/**
 * Leitura de upload no nível Institucional para `GET /uploads/:id` e
 * `/uploads/:id/content` (src/uploads.js, `institutionalAccess`). Só o
 * `demand_document` referenciado por um documento da demanda: `publico` com a
 * demanda publicada vale para todos; os demais níveis exigem token e papel
 * (a leitura por quem não é autor nem operação é registrada).
 */
function createInstitutionalUploadAccess({ institutionStatus = null, operationUserIds = new Set() } = {}) {
  return async function institutionalAccess(db, row, req) {
    if (row.purpose !== 'demand_document' || !row.demand_id) return false;
    const { rows } = await db.query(
      `SELECT ${DOCUMENT_SQL} FROM ${DOCUMENT_FROM} WHERE d.demand_id = $1 AND d.reference = $2
        ORDER BY d.position, d.id LIMIT 1`,
      [row.demand_id, formatUploadRef(row.id)],
    );
    const doc = rows[0];
    if (!doc) return false;
    const demand = await loadAccessDemand(db, row.demand_id);
    if (!demand) return false;
    if (doc.access_level === 'publico' && PUBLIC_STATUSES.includes(demand.status)) return true;
    if (!req?.user) return false;
    const role = await demandPartyRole(db, req, demand, { institutionStatus, operationUserIds });
    if (!canSeeDocument(role, doc, req.user.userId)) return false;
    await recordConsultation(db, req, {
      demandId: demand.id,
      role,
      eventType: 'documento_consultado',
      payload: { document_id: doc.id, upload_id: row.id, document_type: doc.document_type, access_level: doc.access_level },
    });
    return true;
  };
}

module.exports = {
  ACCESS_LEVELS,
  DEFAULT_ACCESS_LEVEL,
  MAX_RESTRICTED,
  DOCUMENT_SQL,
  DOCUMENT_FROM,
  canSeeDocument,
  serializeDocument,
  validateAccess,
  createInstitutionalUploadAccess,
};
