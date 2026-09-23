// Rotas do Dossiê da Demanda (T10). Montadas em `/demands` antes das rotas da
// demanda (público em /api/posts/demands/...).
//
// Público (sem login):
//   GET  /dossiers/verify/:hash          verificação por SHA-256 (conteúdo ou arquivo)
//   GET  /:id/dossie-publico             302 para o PDF público da publicação
//                                        (URL assinada de 5 min); só demanda publicada
//   GET  /:id/dossie-publico/info        metadados da versão pública (ou por que falta)
//
// Autor da demanda ou operação (token; 404 para os demais):
//   GET  /:id/dossiers                   versões (integral e pública), com estado
//   GET  /:id/dossiers/:dossierId/download   { url, expiresAt, fileName } (60 s)
//   POST /:id/dossiers/regenerate        cria o que falta e gera agora (pendente,
//                                        falhou ou indisponível)

const express = require('express');
const { isUuid } = require('../security');
const { PUBLIC_STATUSES, CATEGORY_LABELS } = require('../demand/constants');
const { HASH_RE } = require('../dossier/content');
const {
  serializeDossier, DOWNLOAD_EXPIRES_SECONDS, PUBLIC_DOWNLOAD_EXPIRES_SECONDS, UNAVAILABLE_REASON,
} = require('../dossier/service');

const NOT_FOUND = { error: 'Demanda não encontrada' };
const STORAGE_UNAVAILABLE = {
  error: UNAVAILABLE_REASON,
  code: 'uploads_unavailable',
};

module.exports = ({ pool, auth, dossiers, operationUserIds = new Set() }) => {
  if (typeof auth !== 'function' || !dossiers) throw new Error('dossier routes exigem auth e o serviço de dossiê');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error('[dossie]', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  };
  router.param('id', (_req, res, next, id) => (isUuid(id) ? next() : res.status(404).json(NOT_FOUND)));
  router.param('dossierId', (_req, res, next, id) => (isUuid(id) ? next() : res.status(404).json({ error: 'Dossiê não encontrado' })));

  async function publicDemand(id) {
    const { rows } = await pool.query(
      'SELECT id, title FROM demands WHERE id = $1 AND status = ANY($2::demand_status[])',
      [id, PUBLIC_STATUSES],
    );
    return rows[0] ?? null;
  }

  /** Autor ou operação; lança 404 (não revela a existência) para os demais. */
  // TODO(fonte-da-verdade): Modelo de Conexão §09/§33 — partes conectadas (nível Institucional) não acessam o dossiê integral.
  async function authorizedDemand(req, res) {
    const { rows } = await pool.query('SELECT id, author_id FROM demands WHERE id = $1', [req.params.id]);
    const row = rows[0];
    if (!row || (row.author_id !== req.user.userId && !operationUserIds.has(req.user.userId))) {
      res.status(404).json(NOT_FOUND);
      return null;
    }
    return row;
  }

  // ── Público ───────────────────────────────────────────────────────────────
  router.get('/dossiers/verify/:hash', handle(async (req, res) => {
    const hash = String(req.params.hash).toLowerCase();
    if (!HASH_RE.test(hash)) {
      return res.status(422).json({ valid: false, error: 'Informe o SHA-256 (64 caracteres hexadecimais)', code: 'invalid_hash' });
    }
    const row = await dossiers.findByHash(hash);
    res.set('Cache-Control', 'no-store');
    if (!row) {
      return res.status(404).json({ valid: false, error: 'Nenhum dossiê emitido pela plataforma tem este SHA-256', code: 'dossier_not_found' });
    }
    const isPublicDemand = PUBLIC_STATUSES.includes(row.demand_status);
    res.json({
      valid: true,
      matchedBy: row.content_sha256 === hash ? 'content' : 'file',
      dossier: {
        number: row.dossier_number,
        version: Number(row.version),
        variant: row.variant,
        trigger: row.trigger_kind,
        generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
        contentSha256: row.content_sha256,
        fileSha256: row.file_sha256,
        sizeBytes: Number(row.size_bytes),
        isLatest: Number(row.latest_version) === Number(row.version),
      },
      // Demanda ainda não publicada: confirma o documento sem expor o conteúdo.
      demand: isPublicDemand
        ? { id: row.demand_id, title: row.title, category: row.category, categoryLabel: CATEGORY_LABELS[row.category] ?? null, status: row.demand_status }
        : null,
    });
  }));

  async function publicInfo(req) {
    const demand = await publicDemand(req.params.id);
    if (!demand) return { demand: null };
    const row = await dossiers.publicDossier(req.params.id);
    // Publicada sem versão pública ainda (ex.: publicação recente pelo dm-gestao):
    // pede a geração sem esperar.
    if (!row || row.status !== 'gerado') void dossiers.request(req.params.id);
    return { demand, row };
  }

  router.get('/:id/dossie-publico/info', handle(async (req, res) => {
    const { demand, row } = await publicInfo(req);
    if (!demand) return res.status(404).json(NOT_FOUND);
    const available = Boolean(row && row.status === 'gerado' && dossiers.storageConfigured);
    res.set('Cache-Control', 'no-store');
    res.json({
      available,
      status: row?.status ?? (dossiers.storageConfigured ? 'pendente' : 'indisponivel'),
      statusReason: available ? null : row?.status_reason ?? (dossiers.storageConfigured ? null : UNAVAILABLE_REASON),
      dossier: available ? {
        number: row.dossier_number,
        version: Number(row.version),
        generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at,
        contentSha256: row.content_sha256,
        fileSha256: row.file_sha256,
        sizeBytes: Number(row.size_bytes),
        verifyPath: `/dossie/verificar/${row.content_sha256}`,
      } : null,
    });
  }));

  router.get('/:id/dossie-publico', handle(async (req, res) => {
    const { demand, row } = await publicInfo(req);
    if (!demand) return res.status(404).json(NOT_FOUND);
    if (!dossiers.storageConfigured) return res.status(503).json(STORAGE_UNAVAILABLE);
    if (!row || row.status !== 'gerado') {
      return res.status(404).json({
        error: 'O dossiê público desta demanda ainda está sendo gerado. Tente de novo em alguns minutos',
        code: 'dossier_not_available',
        status: row?.status ?? 'pendente',
      });
    }
    const url = await dossiers.downloadUrl(row, { expiresIn: PUBLIC_DOWNLOAD_EXPIRES_SECONDS });
    res.set('Cache-Control', 'no-store');
    res.redirect(302, url);
  }));

  // ── Autor e operação ──────────────────────────────────────────────────────
  router.get('/:id/dossiers', auth, handle(async (req, res) => {
    if (!(await authorizedDemand(req, res))) return;
    const rows = await dossiers.listForDemand(req.params.id);
    res.json({ storageConfigured: dossiers.storageConfigured, dossiers: rows.map(serializeDossier) });
  }));

  router.get('/:id/dossiers/:dossierId/download', auth, handle(async (req, res) => {
    if (!(await authorizedDemand(req, res))) return;
    const row = await dossiers.findById(req.params.id, req.params.dossierId);
    if (!row) return res.status(404).json({ error: 'Dossiê não encontrado' });
    if (!dossiers.storageConfigured) return res.status(503).json(STORAGE_UNAVAILABLE);
    if (row.status !== 'gerado') {
      return res.status(409).json({
        error: row.status_reason || 'Esta versão do dossiê ainda não foi gerada',
        code: 'dossier_not_generated',
        status: row.status,
      });
    }
    const url = await dossiers.downloadUrl(row, { expiresIn: DOWNLOAD_EXPIRES_SECONDS });
    res.set('Cache-Control', 'no-store');
    res.json({
      url,
      expiresAt: new Date(Date.now() + DOWNLOAD_EXPIRES_SECONDS * 1000).toISOString(),
      fileName: serializeDossier(row).fileName,
    });
  }));

  router.post('/:id/dossiers/regenerate', auth, handle(async (req, res) => {
    if (!(await authorizedDemand(req, res))) return;
    await dossiers.ensureRequests(req.params.id);
    if (!dossiers.storageConfigured) {
      const rows = await dossiers.listForDemand(req.params.id);
      return res.status(503).json({ ...STORAGE_UNAVAILABLE, dossiers: rows.map(serializeDossier) });
    }
    const result = await dossiers.processPending({ demandId: req.params.id, force: true });
    const rows = await dossiers.listForDemand(req.params.id);
    res.json({ ...result, storageConfigured: true, dossiers: rows.map(serializeDossier) });
  }));

  return router;
};
