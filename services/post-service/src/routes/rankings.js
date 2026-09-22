// Engajamento, rankings e selos de impacto social (T21).
//
// Fonte: 01-apresentacao-institucional.html, slide 22 (engajamento e os sete
// rankings) e slide 13 (governança: o Poder Público e os políticos ficam fora
// do ranking competitivo; para eles valem indicadores de atuação).
//
// Todas as leituras vêm da agregação materializada (`ranking_snapshots`,
// `profile_badges`, `profile_engagement`): nenhuma requisição roda agregação.

const express = require('express');
const { isUuid } = require('../security');
const {
  BOARDS, BOARD_IDS, BADGES, PERIODS, PERIOD_LABELS, DEFAULT_PERIOD,
  GOVERNMENT_NOTICE, CONSENT_NOTICE, GOVERNMENT_INDICATORS, ACTOR_CATEGORY_LABELS,
  SHARE_CHANNELS, SHARE_TARGET_KINDS, EXCLUDED_CATEGORY,
} = require('../ranking/constants');
const { normalizePeriod } = require('../ranking/scoring');
const store = require('../ranking/store');

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 10;

function parseLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.trunc(n), MAX_LIMIT);
}

function parseBoards(value) {
  if (typeof value !== 'string' || !value.trim()) return BOARD_IDS;
  const wanted = value.split(',').map((item) => item.trim()).filter(Boolean);
  const valid = wanted.filter((item) => BOARD_IDS.includes(item));
  return valid.length ? valid : BOARD_IDS;
}

/** Vocabulário exibido na interface: rótulos, critérios e avisos. */
function vocabulary() {
  return {
    periods: PERIODS.map((id) => ({ id, label: PERIOD_LABELS[id] })),
    defaultPeriod: DEFAULT_PERIOD,
    boards: BOARDS.map((board) => ({
      id: board.id,
      label: board.label,
      subtitle: board.subtitle,
      criteria: board.criteria,
      subjectKind: board.subjectKind,
    })),
    badges: BADGES.map((badge) => ({ id: badge.id, label: badge.label, rule: badge.rule })),
    categoryLabels: ACTOR_CATEGORY_LABELS,
    governmentIndicators: GOVERNMENT_INDICATORS,
    notices: { government: GOVERNMENT_NOTICE, consent: CONSENT_NOTICE },
  };
}

module.exports = ({ pool, auth }) => {
  const router = express.Router();

  // GET /rankings/criteria — o que a interface precisa para explicar a conta.
  router.get('/rankings/criteria', (_req, res) => res.json(vocabulary()));

  // GET /rankings — os sete rankings da fonte, do período pedido.
  router.get('/rankings', async (req, res) => {
    const period = normalizePeriod(req.query.period);
    const boardIds = parseBoards(req.query.board);
    const limit = parseLimit(req.query.limit);
    try {
      const { grouped, computedAt } = await store.readBoards(pool, { period, boardIds, limit });
      const vocab = vocabulary();
      const boards = boardIds.map((id) => {
        const definition = vocab.boards.find((board) => board.id === id);
        return { ...definition, entries: grouped.get(id) ?? [] };
      });
      res.json({
        period,
        periods: vocab.periods,
        computedAt: computedAt ?? null,
        notices: vocab.notices,
        boards,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /profiles/:userId/impact — selos do perfil e, para o Poder Público, os
  // indicadores de atuação (slide 13). Público: só o que já é público.
  router.get('/profiles/:userId/impact', async (req, res) => {
    const { userId } = req.params;
    if (!isUuid(userId)) return res.status(404).json({ error: 'Perfil não encontrado' });
    try {
      const data = await store.readBadges(pool, userId);
      const government = data.category === EXCLUDED_CATEGORY;
      const indicators = data.metrics?.government ?? {};
      return res.json({
        userId,
        category: data.category,
        // Órgão e político não recebem selo nem ponto: recebem indicadores.
        ranked: !government,
        badges: government ? [] : data.badges.map((badge) => {
          const definition = BADGES.find((item) => item.id === badge.id);
          return {
            ...badge,
            label: definition?.label ?? badge.id,
            rule: definition?.rule ?? '',
          };
        }),
        indicators: government
          ? GOVERNMENT_INDICATORS.map((indicator) => ({
            ...indicator, value: Number(indicators[indicator.id]) || 0,
          }))
          : [],
        notice: government ? GOVERNMENT_NOTICE : null,
        computedAt: data.computedAt ?? null,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET/PUT /rankings/consent — aparecer com o nome nos rankings (LGPD).
  router.get('/rankings/consent', auth, async (req, res) => {
    try {
      const current = await store.readConsent(pool, req.user.userId);
      res.json({ ...current, notice: CONSENT_NOTICE });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.put('/rankings/consent', auth, async (req, res) => {
    const { consent } = req.body ?? {};
    if (typeof consent !== 'boolean') {
      return res.status(422).json({
        error: 'Informe consent como true ou false',
        code: 'validation_failed',
        fields: { consent: 'obrigatorio' },
      });
    }
    try {
      const saved = await store.writeConsent(pool, req.user.userId, consent);
      return res.json({ ...saved, notice: CONSENT_NOTICE });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /shares — compartilhamento registrado (slide 22). Só conta
  // autenticada, um registro por conteúdo e por dia: a contagem não infla.
  router.post('/shares', auth, async (req, res) => {
    const { targetKind, targetId, channel = 'outro' } = req.body ?? {};
    const fields = {};
    if (!SHARE_TARGET_KINDS.includes(targetKind)) fields.targetKind = 'invalido';
    if (!isUuid(targetId)) fields.targetId = 'invalido';
    if (!SHARE_CHANNELS.includes(channel)) fields.channel = 'invalido';
    if (Object.keys(fields).length) {
      return res.status(422).json({ error: 'Compartilhamento inválido', code: 'validation_failed', fields });
    }
    try {
      const result = await store.recordShare(pool, {
        targetKind, targetId, channel, user: req.user,
      });
      return res.status(result.counted ? 201 : 200).json(result);
    } catch (err) {
      if (err?.code === '23503') return res.status(404).json({ error: 'Conteúdo não encontrado' });
      if (err?.code === '23514') {
        return res.status(409).json({
          error: 'Conteúdo indisponível para compartilhamento',
          code: 'share_unavailable',
        });
      }
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
