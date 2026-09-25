// Documentos do Processo de Conexão (T-05-04). Fonte: Modelo de Conexão §17
// ("área própria de documentos … nome, tipo, instituição responsável, usuário
// que enviou, data, hora, versão, status, permissão de acesso … controle de
// versões") e §33 (Público, Institucional, Restrito); decisão 13. Puro:
// vocabulário, validação e serialização. Quem abre é ./upload-access.js (regra
// de src/access/process-party.js, T-05-18). O schema é a migração
// post-service/029-process-documents.sql; as rotas, routes/process-documents.js.

const { parseUploadRef, formatUploadRef } = require('../uploads');

// Tipos (§17: Projeto técnico, Orçamento, Parecer técnico, Termo de parceria,
// Relatório de execução, Comprovantes, e os documentos citados no §20).
const DOCUMENT_TYPES = [
  'projeto_tecnico', 'orcamento', 'parecer_tecnico', 'termo_de_parceria', 'relatorio_de_execucao', 'comprovante',
  'plano_de_execucao', 'autorizacao_ou_licenca', 'contrato', 'nota_fiscal', 'laudo', 'certificado', 'outro',
];
const DOCUMENT_TYPE_LABELS = {
  projeto_tecnico: 'Projeto técnico',
  orcamento: 'Orçamento',
  parecer_tecnico: 'Parecer técnico',
  termo_de_parceria: 'Termo de parceria',
  relatorio_de_execucao: 'Relatório de execução',
  comprovante: 'Comprovante',
  plano_de_execucao: 'Plano de execução',
  autorizacao_ou_licenca: 'Autorização ou licença',
  contrato: 'Contrato',
  nota_fiscal: 'Nota fiscal',
  laudo: 'Laudo',
  certificado: 'Certificado',
  outro: 'Outro',
};

const DOCUMENT_STATUSES = ['vigente', 'substituido', 'arquivado'];
const DOCUMENT_STATUS_LABELS = { vigente: 'Vigente', substituido: 'Substituído', arquivado: 'Arquivado' };

// §33: Público (qualquer sessão), Institucional (os envolvidos no processo,
// decisão 13; padrão) e Restrito (quem enviou, autor, delegados, operação e as
// contas/órgãos autorizados).
const ACCESS_LEVELS = ['publico', 'institucional', 'restrito'];
const ACCESS_LEVEL_LABELS = { publico: 'Público', institucional: 'Institucional', restrito: 'Restrito' };

const DOCUMENT_LIMITS = { name: 255, organizationName: 255, archiveReason: 1000, restrictedTo: 20 };
/** Validade da URL assinada do arquivo (segundos). */
const FILE_URL_SECONDS = 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

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

/**
 * Novo documento ou nova versão: `{ name, documentType, uploadId, accessLevel,
 * restrictedTo?, organizationName?, replacesGroupId? }`.
 */
function validateDocument(input) {
  const body = isObject(input) ? input : {};
  const errors = {};
  const name = optionalText(body.name, 'name', DOCUMENT_LIMITS.name, errors);
  if (!name && !errors.name) errors.name = 'Informe o nome do documento';
  const documentType = body.documentType;
  if (!DOCUMENT_TYPES.includes(documentType)) errors.documentType = 'Escolha o tipo do documento';
  const uploadId = parseUploadRef(body.uploadId ?? body.reference ?? null);
  if (!uploadId) errors.uploadId = 'Envie o arquivo do documento';
  const accessLevel = body.accessLevel === undefined || body.accessLevel === null || body.accessLevel === ''
    ? 'institucional' : body.accessLevel;
  if (!ACCESS_LEVELS.includes(accessLevel)) errors.accessLevel = 'Escolha o acesso: público, institucional ou restrito';

  let restrictedTo = [];
  const raw = body.restrictedTo ?? [];
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
    errors.restrictedTo = 'Autorizados: lista de contas ou órgãos';
  } else {
    restrictedTo = [...new Set(raw.map((id) => id.toLowerCase()))];
    if (restrictedTo.length > DOCUMENT_LIMITS.restrictedTo) {
      errors.restrictedTo = `No máximo ${DOCUMENT_LIMITS.restrictedTo} autorizados`;
    }
  }
  if (!errors.accessLevel && !errors.restrictedTo) {
    if (accessLevel === 'restrito' && !restrictedTo.length) errors.restrictedTo = 'Informe quem pode abrir o documento restrito';
    if (accessLevel !== 'restrito' && restrictedTo.length) errors.restrictedTo = 'Autorizados só no documento restrito';
  }

  const organizationName = optionalText(body.organizationName, 'organizationName', DOCUMENT_LIMITS.organizationName, errors);
  let replacesGroupId = null;
  if (body.replacesGroupId !== undefined && body.replacesGroupId !== null && body.replacesGroupId !== '') {
    if (typeof body.replacesGroupId !== 'string' || !UUID_RE.test(body.replacesGroupId)) {
      errors.replacesGroupId = 'Documento a substituir inválido';
    } else {
      replacesGroupId = body.replacesGroupId.toLowerCase();
    }
  }
  return {
    value: { name, documentType, uploadId, accessLevel, restrictedTo, organizationName, replacesGroupId },
    errors,
  };
}

/** Arquivamento: `{ reason }` (obrigatório). */
function validateArchive(input) {
  const body = isObject(input) ? input : {};
  const errors = {};
  const reason = optionalText(body.reason, 'reason', DOCUMENT_LIMITS.archiveReason, errors);
  if (!reason && !errors.reason) errors.reason = 'Informe o motivo do arquivamento';
  return { value: { reason }, errors };
}

/** Registro na visão das partes (sem URL: o arquivo sai por GET …/file). */
function serializeDocument(row, { viewerId = null, canOpen = false } = {}) {
  return {
    id: row.id,
    processId: row.process_id,
    groupId: row.document_group_id,
    version: Number(row.version),
    name: row.name,
    documentType: row.document_type,
    organizationName: row.organization_name ?? null,
    uploadedBy: { userId: row.uploaded_by, name: row.uploaded_by_name, side: row.uploaded_by_side },
    mine: Boolean(viewerId) && row.uploaded_by === viewerId,
    status: row.status,
    accessLevel: row.access_level,
    restrictedTo: row.access_level === 'restrito' && row.uploaded_by === viewerId
      ? (row.restricted_to ?? []) : [],
    upload: {
      ref: formatUploadRef(row.upload_id),
      fileName: row.original_name ?? null,
      contentType: row.content_type ?? null,
      size: row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes),
    },
    canOpen,
    archivedAt: toIso(row.archived_at),
    archiveReason: row.archive_reason ?? null,
    createdAt: toIso(row.created_at),
  };
}

/**
 * Agrupa por documento (`groupId`), a versão vigente primeiro e as demais da
 * mais nova para a mais antiga; grupos pelo envio mais recente.
 */
function groupDocuments(docs) {
  const groups = new Map();
  for (const doc of docs) {
    if (!groups.has(doc.groupId)) groups.set(doc.groupId, []);
    groups.get(doc.groupId).push(doc);
  }
  const rank = (d) => (d.status === 'vigente' ? 0 : 1);
  return [...groups.entries()].map(([groupId, versions]) => {
    versions.sort((a, b) => rank(a) - rank(b) || b.version - a.version);
    const current = versions[0];
    return {
      groupId,
      name: current.name,
      documentType: current.documentType,
      status: current.status,
      latestVersion: Math.max(...versions.map((v) => v.version)),
      updatedAt: versions.map((v) => v.createdAt).sort().at(-1) ?? null,
      versions,
    };
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

module.exports = {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  ACCESS_LEVELS,
  ACCESS_LEVEL_LABELS,
  DOCUMENT_LIMITS,
  FILE_URL_SECONDS,
  validateDocument,
  validateArchive,
  serializeDocument,
  groupDocuments,
};
