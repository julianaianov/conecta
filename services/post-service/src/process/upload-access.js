// Nível Institucional (§33, decisão 13; T-05-18) para os arquivos do Processo
// de Conexão (T-05-02 e T-05-04): quem abre, por `GET /uploads/:id`, as
// finalidades `process_document` e `process_attachment`, e quem abre o arquivo
// de um documento do processo (routes/process-documents.js). A regra de quem é
// "envolvido no processo" é a de src/access/process-party.js; aqui só se soma
// o papel no próprio processo (a parte de um processo cancelado continua vendo
// o que foi trocado nele).
//
// - Documento do processo: o remetente sempre; `publico` qualquer sessão;
//   `institucional` os envolvidos; `restrito` autor, delegados, operação e
//   `restricted_to` (contas ou o órgão em nome do qual a conta atua).
// - Anexo da comunicação: as partes do processo e quem administra a demanda
//   (autor, delegados, operação) — a conversa é das partes.

const { MANAGING_ROLES, demandPartyRole, loadAccessDemand, recordConsultation } = require('../access/process-party');
const { canSeeDocument } = require('../access/documents');

const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/**
 * Papel de quem vê na demanda do processo: `autor`/`parte` pelo próprio
 * processo, senão o de `demandPartyRole` (delegado, operação, parte de outro
 * processo, órgão com acompanhamento, interessado) ou `null`.
 */
async function processAccessRole(db, req, row, { institutionStatus = null, operationUserIds = new Set() } = {}) {
  if (!req?.user?.userId) return null;
  // Carregado aqui para não criar ciclo (process/store usa demand/store).
  const store = require('./store');
  let own = null;
  try {
    own = await store.viewerRoleFor(req, row, institutionStatus);
  } catch {
    own = null;
  }
  if (own === 'agente') return 'autor';
  if (own === 'parte') return 'parte';
  const demand = await loadAccessDemand(db, row.demand_id);
  return demand ? demandPartyRole(db, req, demand, { institutionStatus, operationUserIds }) : null;
}

/** O documento do processo abre para esta conta? `organizationId`: órgão em nome do qual ela atua. */
function canOpenProcessDocument(doc, { userId = null, role = null, organizationId = null } = {}) {
  if (!userId) return false;
  if (sameId(doc.uploaded_by, userId)) return true;
  if (doc.access_level === 'publico') return true;
  if (canSeeDocument(role, doc, userId)) return true;
  return Boolean(role) && doc.access_level === 'restrito'
    && (doc.restricted_to ?? []).some((id) => sameId(id, organizationId));
}

/** Registro privado da consulta (decisão 13), como nos documentos da demanda. */
function recordProcessDocumentConsultation(db, req, { role, doc }) {
  return recordConsultation(db, req, {
    demandId: doc.demand_id,
    role,
    eventType: 'documento_consultado',
    payload: {
      process_id: doc.process_id, process_document_id: doc.id, upload_id: doc.upload_id,
      document_type: doc.document_type, access_level: doc.access_level,
    },
  });
}

/** `institutionalAccess` de `GET /uploads/:id` para as finalidades do processo. */
function createProcessUploadAccess({ institutionStatus = null, operationUserIds = new Set() } = {}) {
  return async function processUploadAccess(db, row, req) {
    if (!row.process_id || !req?.user) return false;
    const store = require('./store');
    const processRow = await store.findProcess(db, row.process_id);
    if (!processRow) return false;
    const role = await processAccessRole(db, req, processRow, { institutionStatus, operationUserIds });
    if (row.purpose === 'process_attachment') {
      return role === 'parte' || MANAGING_ROLES.includes(role);
    }
    if (row.purpose !== 'process_document') return false;
    const { rows: [doc] } = await db.query(
      `SELECT id, process_id, demand_id, upload_id, uploaded_by, document_type::text AS document_type,
              access_level::text AS access_level, restricted_to::text[] AS restricted_to
         FROM connection_process_documents WHERE upload_id = $1`,
      [row.id],
    );
    if (!doc) return false;
    const organizationId = await store.governmentOrganizationOf(req, institutionStatus).catch(() => null);
    if (!canOpenProcessDocument(doc, { userId: req.user.userId, role, organizationId })) return false;
    await recordProcessDocumentConsultation(db, req, { role, doc });
    return true;
  };
}

module.exports = {
  processAccessRole,
  canOpenProcessDocument,
  recordProcessDocumentConsultation,
  createProcessUploadAccess,
};
