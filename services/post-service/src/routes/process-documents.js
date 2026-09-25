// Documentos do Processo de Conexão (T-05-04). Montada na raiz do
// post-service junto das rotas do processo; público em /api/posts/... .
// Fonte: Modelo de Conexão §17 (área de documentos do processo com nome,
// tipo, instituição responsável, quem enviou, data e hora, versão, status e
// permissão de acesso; controle de versões) e §33; decisão 13.
//
// Partes do processo (Agente autor e parte conectada; demais recebem 404):
//   GET  /processes/:ref/documents               documentos agrupados por documento (groupId),
//                                                versão vigente primeiro; os restritos só para
//                                                quem pode abrir
//   POST /processes/:ref/documents               { name, documentType, uploadId, accessLevel,
//                                                restrictedTo?, organizationName?, replacesGroupId? }
//                                                (arquivo: upload `process_document` confirmado
//                                                pelo remetente para este processo)
//   POST /processes/:ref/documents/:did/archive  { reason } — só quem enviou
// Qualquer sessão, conforme o acesso do documento (§33, decisão 13):
//   GET  /processes/:ref/documents/:did/file     { url } assinada por 60 s: público → qualquer
//                                                sessão; institucional → envolvidos no processo
//                                                (src/access/process-party.js, T-05-18);
//                                                restrito → quem enviou, autor, delegados,
//                                                operação e `restrictedTo`. 404 para quem não
//                                                pode; 503 sem bucket. A consulta por terceiro
//                                                envolvido vira evento privado.
//
// Cada documento entra na linha do tempo (`documento_registrado`, público só
// quando o documento é público) e avisa o outro lado (`novo_documento`).

const express = require('express');
const { isUuid } = require('../security');
const {
  FILE_URL_SECONDS, validateDocument, validateArchive, serializeDocument, groupDocuments,
} = require('../process/documents');
const {
  processAccessRole, canOpenProcessDocument, recordProcessDocumentConsultation,
} = require('../process/upload-access');
const { sideOfRole, messageRecipients } = require('../process/communication');
const store = require('../process/store');
const demandStore = require('../demand/store');
const { evaluateDemandAuthor } = require('../demand/gate');
const { notify } = require('../notifications');
const { listHelpers } = require('./demands');

const { HttpError, withTransaction } = demandStore;
const { validationError } = listHelpers;

const DOCUMENT_SQL = `SELECT d.id, d.process_id, d.demand_id, d.document_group_id, d.version, d.name,
                             d.document_type::text AS document_type, d.organization_name, d.uploaded_by,
                             d.uploaded_by_name, d.uploaded_by_side, d.upload_id, d.status::text AS status,
                             d.access_level::text AS access_level, d.restricted_to::text[] AS restricted_to,
                             d.archived_at, d.archived_by, d.archive_reason, d.created_at,
                             u.original_name, u.content_type, u.size_bytes, u.object_key
                        FROM connection_process_documents d JOIN uploads u ON u.id = d.upload_id`;

const NOT_FOUND = { error: 'Documento não encontrado' };

async function safeNotify(client, input) {
  await client.query('SAVEPOINT process_document_notify');
  try {
    await notify(client, input);
    await client.query('RELEASE SAVEPOINT process_document_notify');
  } catch (err) {
    await client.query('ROLLBACK TO SAVEPOINT process_document_notify');
    console.warn(`[processes] aviso não gerado: ${err.message}`);
  }
}

module.exports = ({ pool, auth, institutionStatus, uploadStorage = null, operationUserIds = new Set() }) => {
  if (typeof auth !== 'function') throw new Error('process document routes exigem auth');
  const router = express.Router();
  router.param('ref', (req, res, next, ref) => (store.isProcessRef(ref) ? next() : res.status(404).json({ error: 'Processo não encontrado' })));
  router.param('documentId', (req, res, next, id) => (isUuid(id) ? next() : res.status(404).json(NOT_FOUND)));

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = store.mapProcessError(err);
      if (mapped) return res.status(mapped.status).json(mapped.body);
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  async function accessOf(req) {
    try {
      return await institutionStatus(req);
    } catch (err) {
      console.error(`[processes] ${err.message}`);
      return null;
    }
  }

  /** Quem vê: papel na demanda do processo (§33, T-05-18) e órgão (para `restrictedTo`). */
  async function viewerOf(db, req, row) {
    const role = await processAccessRole(db, req, row, { institutionStatus, operationUserIds });
    const organizationId = await store.governmentOrganizationOf(req, institutionStatus).catch(() => null);
    return { userId: req.user.userId, role, organizationId };
  }

  async function listDocuments(db, req, row, viewer) {
    const { rows } = await db.query(`${DOCUMENT_SQL} WHERE d.process_id = $1 ORDER BY d.created_at, d.version`, [row.id]);
    const visible = rows
      .map((doc) => ({ doc, canOpen: canOpenProcessDocument(doc, viewer) }))
      // Restrito: quem não pode abrir não vê o registro.
      .filter(({ doc, canOpen }) => doc.access_level !== 'restrito' || canOpen)
      .map(({ doc, canOpen }) => serializeDocument(doc, { viewerId: req.user.userId, canOpen }));
    return groupDocuments(visible);
  }

  router.get('/processes/:ref/documents', auth, handle(async (req, res) => {
    const { row } = await store.loadVisibleProcess(pool, req, req.params.ref, institutionStatus);
    const viewer = await viewerOf(pool, req, row);
    res.json({ groups: await listDocuments(pool, req, row, viewer), open: !row.closed_at });
  }));

  router.post('/processes/:ref/documents', auth, handle(async (req, res) => {
    const { value, errors } = validateDocument(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const created = await withTransaction(pool, async (client) => {
      const { row, role } = await store.loadVisibleProcess(client, req, req.params.ref, institutionStatus, { forUpdate: true });
      const access = await accessOf(req);
      if (role === 'agente') {
        if (!access) throw new HttpError(503, { error: 'Não foi possível confirmar a validação institucional' });
        const gate = evaluateDemandAuthor(req.user, access);
        if (!gate.allowed) throw new HttpError(gate.httpStatus, { error: gate.error, code: gate.code });
      }
      if (row.closed_at) throw new HttpError(409, { error: 'O processo foi encerrado', code: 'process_closed' });
      const { rows: [upload] } = await client.query(
        `SELECT id FROM uploads
          WHERE id = $1 AND owner_id = $2 AND purpose = 'process_document' AND status = 'confirmado' AND process_id = $3`,
        [value.uploadId, req.user.userId, row.id],
      );
      if (!upload) throw validationError({ uploadId: 'Arquivo não encontrado: envie e confirme o arquivo neste processo' });
      const { rows: [dup] } = await client.query('SELECT 1 FROM connection_process_documents WHERE upload_id = $1', [value.uploadId]);
      if (dup) throw validationError({ uploadId: 'Este arquivo já é um documento do processo' });
      if (value.replacesGroupId) {
        const { rows: [group] } = await client.query(
          'SELECT 1 FROM connection_process_documents WHERE document_group_id = $1 AND process_id = $2 LIMIT 1',
          [value.replacesGroupId, row.id],
        );
        if (!group) throw validationError({ replacesGroupId: 'Documento a substituir não encontrado neste processo' });
      }
      const side = sideOfRole(role);
      const name = typeof req.user?.name === 'string' && req.user.name.trim() ? req.user.name.trim() : null;
      const organizationName = value.organizationName
        ?? access?.organizationName
        ?? (side === 'conectado' && row.party_kind === 'poder_publico' ? row.party_name : null);
      const { rows: [inserted] } = await client.query(
        `INSERT INTO connection_process_documents
           (process_id, demand_id, document_group_id, version, name, document_type, organization_name, uploaded_by,
            uploaded_by_name, uploaded_by_side, upload_id, access_level, restricted_to)
         VALUES ($1, $2, $3, 1, $4, $5::connection_process_document_type, $6, $7, $8, $9, $10,
                 $11::connection_process_document_access, $12::uuid[])
         RETURNING id`,
        [row.id, row.demand_id, value.replacesGroupId, value.name, value.documentType,
          organizationName ? String(organizationName).slice(0, 255) : null, req.user.userId,
          (name ?? (side === 'agente' ? 'Agente de Transformação' : row.party_name)).slice(0, 255), side,
          value.uploadId, value.accessLevel, value.restrictedTo],
      );
      // Aviso ao outro lado, se ele pode abrir o documento.
      const restricted = value.accessLevel === 'restrito' ? new Set(value.restrictedTo) : null;
      for (const target of messageRecipients(row, side, 'todos')) {
        const id = (target.userId ?? target.organizationId).toLowerCase();
        if (restricted && !restricted.has(id)) continue;
        await safeNotify(client, {
          ...target,
          kind: 'novo_documento',
          title: `Novo documento no processo ${row.protocol}`,
          body: value.name,
          href: `/processos/${row.protocol}`,
          demandId: row.demand_id,
          processId: row.id,
          dedupeKey: `processo-documento:${row.id}`,
        });
      }
      const { rows: [doc] } = await client.query(`${DOCUMENT_SQL} WHERE d.id = $1`, [inserted.id]);
      return doc;
    });
    res.status(201).json({ document: serializeDocument(created, { viewerId: req.user.userId, canOpen: true }) });
  }));

  router.post('/processes/:ref/documents/:documentId/archive', auth, handle(async (req, res) => {
    const { value, errors } = validateArchive(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const archived = await withTransaction(pool, async (client) => {
      const { row } = await store.loadVisibleProcess(client, req, req.params.ref, institutionStatus, { forUpdate: true });
      const { rows: [doc] } = await client.query(
        `${DOCUMENT_SQL} WHERE d.id = $1 AND d.process_id = $2 FOR UPDATE OF d`, [req.params.documentId, row.id],
      );
      if (!doc) throw new HttpError(404, NOT_FOUND);
      if (doc.uploaded_by !== req.user.userId) {
        throw new HttpError(403, { error: 'Só quem enviou arquiva o documento', code: 'forbidden_archive' });
      }
      if (doc.status === 'arquivado') throw new HttpError(409, { error: 'O documento já está arquivado', code: 'document_archived' });
      await client.query(
        `UPDATE connection_process_documents SET status = 'arquivado', archived_by = $2, archive_reason = $3, archived_at = NOW()
          WHERE id = $1`,
        [doc.id, req.user.userId, value.reason],
      );
      const { rows: [updated] } = await client.query(`${DOCUMENT_SQL} WHERE d.id = $1`, [doc.id]);
      return updated;
    });
    res.json({ document: serializeDocument(archived, { viewerId: req.user.userId, canOpen: true }) });
  }));

  router.get('/processes/:ref/documents/:documentId/file', auth, handle(async (req, res) => {
    const row = await store.findProcess(pool, req.params.ref);
    if (!row) throw new HttpError(404, NOT_FOUND);
    const { rows: [doc] } = await pool.query(
      `${DOCUMENT_SQL} WHERE d.id = $1 AND d.process_id = $2 AND u.status = 'confirmado'`, [req.params.documentId, row.id],
    );
    if (!doc) throw new HttpError(404, NOT_FOUND);
    const viewer = await viewerOf(pool, req, row);
    if (!canOpenProcessDocument(doc, viewer)) throw new HttpError(404, NOT_FOUND);
    if (!uploadStorage) {
      return res.status(503).json({
        error: 'O envio de arquivos não está configurado neste ambiente (DM_UPLOADS_BUCKET ausente)',
        code: 'uploads_unavailable',
      });
    }
    // Consulta por quem não enviou nem administra a demanda: evento privado (decisão 13).
    if (doc.uploaded_by !== req.user.userId) await recordProcessDocumentConsultation(pool, req, { role: viewer.role, doc });
    const url = await uploadStorage.presignGet({
      key: doc.object_key,
      contentType: doc.content_type,
      fileName: doc.original_name,
      disposition: 'attachment',
      expiresIn: FILE_URL_SECONDS,
    });
    res.set('Cache-Control', 'no-store');
    return res.json({ url, expiresIn: FILE_URL_SECONDS, fileName: doc.original_name ?? null, contentType: doc.content_type });
  }));

  return router;
};

module.exports.DOCUMENT_SQL = DOCUMENT_SQL;
