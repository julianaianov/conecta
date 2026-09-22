// Denúncia de publicação, comentário, demanda e perfil (T6.3). Montada em `/`
// no post-service ANTES das rotas de posts (cujo `/:id` só aceita UUID);
// público em `/api/posts/reports` (o Caddy tira `/api/posts`).
//
// Fonte: Apresentação Institucional, slide 26 (Governança: LGPD, neutralidade
// e publicação apenas de dados verificáveis). A fila de moderação do dm-gestao
// passa a ler estas denúncias (contrato em
// dm-docs/docs/gestao/04-modelagem-de-dados.md §3.14).
//
// Conta autenticada:
//   POST /reports            registra a denúncia (motivo + descrição opcional)
//   GET  /reports/mine       minhas denúncias, sem o desfecho
//   GET  /reports/context    posso denunciar este alvo? já denunciei?
//
// Regras: limite de taxa por conta (5/hora, 20/dia), uma denúncia em aberto
// por (denunciante, alvo), nada é exposto ao denunciado e nem o denunciante
// recebe o resultado — só "em apuração" ou "analisada". A gestão despacha no
// banco; o portal nunca lê nem grava o desfecho.

const express = require('express');
const { normalizeRole } = require('../roles');
const demandStore = require('../demand/store');
const {
  REASONS, REASON_LABELS, TARGET_KINDS, TARGET_LABELS,
  REASON_REQUIRING_DESCRIPTION, DESCRIPTION_MAX, RATE_LIMIT, CONFIRMATION_NOTICE,
} = require('../report/constants');
const { validateReport, validateTargetQuery } = require('../report/validation');
const store = require('../report/store');

const { HttpError, sendError } = demandStore;

const MINE_LIMIT = 100;

const validationError = (fields) => new HttpError(422, {
  error: 'Revise os campos destacados',
  code: 'validation_failed',
  fields,
});

/** Vocabulário que a tela usa para montar o formulário. */
const VOCABULARY = {
  reasons: REASONS.map((value) => ({
    value,
    label: REASON_LABELS[value],
    requiresDescription: value === REASON_REQUIRING_DESCRIPTION,
  })),
  targetKinds: TARGET_KINDS.map((value) => ({ value, label: TARGET_LABELS[value] })),
  descriptionMax: DESCRIPTION_MAX,
  rateLimit: RATE_LIMIT,
  notice: CONFIRMATION_NOTICE,
};

module.exports = ({ pool, auth }) => {
  if (typeof auth !== 'function') throw new Error('reports routes exigem auth');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      sendError(res, err);
    }
  };

  const reporterOf = (req) => ({
    reporterId: String(req.user.userId).toLowerCase(),
    reporterCategory: normalizeRole(req.user.role, req.user.profileType),
    reporterProfileType: typeof req.user.profileType === 'string' ? req.user.profileType : null,
  });

  router.post('/reports', auth, handle(async (req, res) => {
    const { errors, value } = validateReport(req.body);
    if (Object.keys(errors).length) throw validationError(errors);

    const reporter = reporterOf(req);
    const usage = await store.rateUsage(pool, reporter.reporterId);
    store.assertWithinRate(usage);

    const target = await store.loadTarget(pool, value.targetKind, value.targetId, reporter.reporterId);
    if (target.ownerId && String(target.ownerId).toLowerCase() === reporter.reporterId) {
      throw new HttpError(422, {
        error: 'Não é possível denunciar o próprio conteúdo',
        code: 'validation_failed',
        fields: { targetId: 'Não é possível denunciar o próprio conteúdo' },
      });
    }

    const open = await store.findOpenReport(pool, reporter.reporterId, value.targetKind, value.targetId);
    if (open) {
      throw new HttpError(409, {
        error: 'Você já denunciou este conteúdo e a análise ainda está em andamento.',
        code: 'report_already_open',
      });
    }

    const row = await store.insertReport(pool, {
      ...reporter,
      targetKind: value.targetKind,
      targetId: value.targetId,
      targetOwnerId: target.ownerId ?? null,
      targetSummary: target.summary,
      reason: value.reason,
      description: value.description,
    });

    // Só o recebimento: o desfecho nunca volta para quem denunciou.
    res.status(201).json({ ...store.serializeMine(row), notice: CONFIRMATION_NOTICE });
  }));

  router.get('/reports/mine', auth, handle(async (req, res) => {
    const { reporterId } = reporterOf(req);
    const [reports, usage] = await Promise.all([
      store.listMine(pool, reporterId, MINE_LIMIT),
      store.rateUsage(pool, reporterId),
    ]);
    res.json({
      reports,
      remaining: { hour: usage.remainingHour, day: usage.remainingDay },
      ...VOCABULARY,
    });
  }));

  router.get('/reports/context', auth, handle(async (req, res) => {
    const { errors, value } = validateTargetQuery(req.query);
    if (Object.keys(errors).length) throw validationError(errors);
    const { reporterId } = reporterOf(req);
    const [open, usage] = await Promise.all([
      store.findOpenReport(pool, reporterId, value.targetKind, value.targetId),
      store.rateUsage(pool, reporterId),
    ]);
    res.json({
      targetKind: value.targetKind,
      targetId: value.targetId,
      alreadyReported: Boolean(open),
      canReport: !open && usage.remainingHour > 0 && usage.remainingDay > 0,
      remaining: { hour: usage.remainingHour, day: usage.remainingDay },
      ...VOCABULARY,
    });
  }));

  return router;
};
