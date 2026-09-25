// Documentos e dossiê integral no nível Institucional (T-05-18; Modelo de
// Conexão §33, §09 e §31; Fluxo 3, slide 8 "Documentação"; decisão 13).
// Montadas em `/demands`, antes das rotas da demanda (público em
// /api/posts/demands/...). Quem é envolvido no processo: src/access/process-party.js.
//
// Token; autor, delegado (T29), operação, parte de Processo de Conexão, órgão
// com acompanhamento aberto ou interessado com conexão aceita (404 para os demais):
//   GET /:id/documents                        documentos com o nível de acesso
//                                             (`publico` | `institucional` | `restrito`)
//                                             e o dossiê integral disponível
//   GET /:id/documents/:documentId/open       { url, expiresAt, fileName } (URL assinada de 5 min)
//   GET /:id/dossie-integral                  { url, expiresAt, fileName, number, version }
//                                             (última versão integral gerada; URL de 60 s)
// Autor ou delegado:
//   PUT /:id/documents/:documentId/access     { accessLevel, restrictedTo? }
//
// `restrito`: só o autor, seus delegados, a operação e as contas de
// `restrictedTo`. Cada abertura por quem não é autor nem operação grava
// `documento_consultado` / `dossie_integral_consultado` (privados) em
// `demand_events`. O dossiê não é regenerado por aqui.

const express = require('express');
const { isUuid } = require('../security');
const { parseUploadRef, describeUploads, GET_EXPIRES_SECONDS } = require('../uploads');
const {
  MANAGING_ROLES, demandPartyRole, loadAccessDemand, recordConsultation,
} = require('../access/process-party');
const {
  DOCUMENT_SQL, DOCUMENT_FROM, canSeeDocument, serializeDocument, validateAccess,
} = require('../access/documents');

const DOSSIER_EXPIRES_SECONDS = 60;

const NOT_FOUND = { error: 'Demanda não encontrada' };
const DOCUMENT_NOT_FOUND = { error: 'Documento não encontrado' };
const UNAVAILABLE = {
  error: 'O armazenamento de arquivos não está configurado neste ambiente',
  code: 'uploads_unavailable',
};

module.exports = ({ pool, auth, institutionStatus = null, uploadStorage = null, dossiers = null, operationUserIds = new Set() }) => {
  if (typeof auth !== 'function') throw new Error('document access routes exigem auth');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error('[documentos]', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  };
  router.param('id', (_req, res, next, id) => (isUuid(id) ? next() : res.status(404).json(NOT_FOUND)));
  router.param('documentId', (_req, res, next, id) => (isUuid(id) ? next() : res.status(404).json(DOCUMENT_NOT_FOUND)));

  /** Demanda e papel da conta; responde 404 (sem revelar a existência) quando não há papel. */
  async function party(req, res) {
    const demand = await loadAccessDemand(pool, req.params.id);
    const role = demand ? await demandPartyRole(pool, req, demand, { institutionStatus, operationUserIds }) : null;
    if (!role) {
      res.status(404).json(NOT_FOUND);
      return null;
    }
    return { demand, role };
  }

  async function loadDocument(demandId, documentId) {
    const { rows } = await pool.query(
      `SELECT ${DOCUMENT_SQL} FROM ${DOCUMENT_FROM} WHERE d.id = $1 AND d.demand_id = $2`,
      [documentId, demandId],
    );
    return rows[0] ?? null;
  }

  async function latestIntegral(demandId) {
    if (!dossiers) return null;
    const rows = await dossiers.listForDemand(demandId);
    return rows
      .filter((r) => r.variant === 'integral' && r.status === 'gerado')
      .sort((a, b) => Number(b.version) - Number(a.version))[0] ?? null;
  }

  router.get('/:id/documents', auth, handle(async (req, res) => {
    const found = await party(req, res);
    if (!found) return;
    const manage = MANAGING_ROLES.includes(found.role);
    const { rows } = await pool.query(
      `SELECT ${DOCUMENT_SQL} FROM ${DOCUMENT_FROM} WHERE d.demand_id = $1 ORDER BY d.position, d.created_at, d.id`,
      [req.params.id],
    );
    const integral = await latestIntegral(req.params.id);
    res.set('Cache-Control', 'no-store');
    res.json({
      role: found.role,
      canManage: found.role === 'autor' || found.role === 'delegado',
      documents: rows.filter((doc) => canSeeDocument(found.role, doc, req.user.userId))
        .map((doc) => serializeDocument(doc, { manage })),
      dossier: integral && dossiers?.storageConfigured ? {
        number: integral.dossier_number,
        version: Number(integral.version),
        generatedAt: integral.generated_at instanceof Date ? integral.generated_at.toISOString() : integral.generated_at ?? null,
      } : null,
    });
  }));

  router.get('/:id/documents/:documentId/open', auth, handle(async (req, res) => {
    const found = await party(req, res);
    if (!found) return;
    const doc = await loadDocument(req.params.id, req.params.documentId);
    if (!doc || !canSeeDocument(found.role, doc, req.user.userId)) return res.status(404).json(DOCUMENT_NOT_FOUND);
    const uploadId = parseUploadRef(doc.reference);
    let body;
    if (uploadId) {
      if (!uploadStorage) return res.status(503).json(UNAVAILABLE);
      const file = (await describeUploads(pool, uploadStorage, [uploadId], 'demand_id')).get(uploadId);
      if (!file || file.purpose !== 'demand_document' || file.demandId !== req.params.id || !file.url) return res.status(404).json(DOCUMENT_NOT_FOUND);
      body = {
        url: file.url,
        expiresAt: new Date(Date.now() + GET_EXPIRES_SECONDS * 1000).toISOString(),
        fileName: file.fileName ?? null,
      };
    } else if (/^https:\/\//i.test(doc.reference ?? '')) {
      body = { url: doc.reference, expiresAt: null, fileName: null };
    } else {
      return res.status(404).json(DOCUMENT_NOT_FOUND);
    }
    await recordConsultation(pool, req, {
      demandId: req.params.id,
      role: found.role,
      eventType: 'documento_consultado',
      payload: { document_id: doc.id, upload_id: uploadId, document_type: doc.document_type, access_level: doc.access_level },
    });
    res.set('Cache-Control', 'no-store');
    res.json(body);
  }));

  router.get('/:id/dossie-integral', auth, handle(async (req, res) => {
    const found = await party(req, res);
    if (!found) return;
    if (!dossiers || !dossiers.storageConfigured) return res.status(503).json(UNAVAILABLE);
    const row = await latestIntegral(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'O dossiê integral desta demanda ainda não foi gerado', code: 'dossier_not_available' });
    }
    const url = await dossiers.downloadUrl(row, { expiresIn: DOSSIER_EXPIRES_SECONDS });
    await recordConsultation(pool, req, {
      demandId: req.params.id,
      role: found.role,
      eventType: 'dossie_integral_consultado',
      payload: { dossier_id: row.id, version: Number(row.version), dossier_number: row.dossier_number },
    });
    res.set('Cache-Control', 'no-store');
    res.json({
      url,
      expiresAt: new Date(Date.now() + DOSSIER_EXPIRES_SECONDS * 1000).toISOString(),
      fileName: `dossie-${row.dossier_number}-v${row.version}.pdf`,
      number: row.dossier_number,
      version: Number(row.version),
    });
  }));

  router.put('/:id/documents/:documentId/access', auth, handle(async (req, res) => {
    const { value, errors } = validateAccess(req.body ?? {});
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Dados inválidos', code: 'validation_failed', fields: errors });
    }
    const found = await party(req, res);
    if (!found) return;
    if (found.role !== 'autor' && found.role !== 'delegado') {
      return res.status(403).json({ error: 'Só o Agente autor define o acesso aos documentos', code: 'forbidden' });
    }
    const doc = await loadDocument(req.params.id, req.params.documentId);
    if (!doc) return res.status(404).json(DOCUMENT_NOT_FOUND);
    await pool.query(
      `INSERT INTO demand_document_access (document_id, demand_id, access_level, restricted_to, updated_by)
       VALUES ($1, $2, $3::document_access_level, $4::uuid[], $5)
       ON CONFLICT (document_id) DO UPDATE
         SET access_level = EXCLUDED.access_level, restricted_to = EXCLUDED.restricted_to, updated_by = EXCLUDED.updated_by`,
      [doc.id, req.params.id, value.accessLevel, value.restrictedTo, req.user.userId],
    );
    res.json({ document: serializeDocument(await loadDocument(req.params.id, doc.id), { manage: true }) });
  }));

  return router;
};

