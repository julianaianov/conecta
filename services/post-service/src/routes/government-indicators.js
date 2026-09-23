// Área de governo e gestão pública (T22). Montada na raiz do post-service,
// antes das rotas de posts (cujo `/:id` é UUID); público em /api/posts/... (o
// Caddy tira /api/posts). Fonte: 01-apresentacao-institucional.html slide 24 e
// 03-fluxo-cadastro-poder-publico.html slide 14.
//
// Poder Público com cadastro validado (token + requireGovernmentActor; 403
// `not_government` / `institution_not_validated`, 503 sem confirmação):
//   GET  /government/indicators          os 10 indicadores do slide 14 no recorte do órgão
//                                        (scope=competencia|jurisdicao|todas, period=7d|30d|90d|12m|tudo
//                                        ou from/to, category, priority, territory)
//   GET  /government/priority-areas      priorização de áreas: território e categoria com volume,
//                                        urgência e tempo sem resposta institucional do órgão
//   GET  /government/impact              medição de impacto das demandas em que o órgão atuou
//   GET  /government/indicators/export   os mesmos números em CSV (`format=csv`) ou PDF (`format=pdf`)
//   GET  /government/actions             ações divulgadas pelo órgão
//   POST /government/actions             publica ação/programa ligado a uma demanda ou ao território
//
// Público (sem login):
//   GET  /demands/:id/government-actions ações divulgadas para a demanda
//
// Monitoramento em tempo real: cada leitura consulta o banco (uma consulta
// agregada por visão, servida pelos índices da migração 019) e o resultado
// fica 60 s no cache do processo. Não há laço de pré-agregação, nem varredura
// por requisição. O painel informa `generatedAt`, para o representante saber
// de quando é o número.
//
// Neutralidade (slide 13 da apresentação): estes indicadores são de atuação e
// resultado do próprio órgão. Não há ranking nem comparação entre órgãos, e
// nenhuma resposta traz dado pessoal — só números agregados, rótulos públicos
// e o retrato institucional do próprio órgão.

const express = require('express');
const { isUuid } = require('../security');
const demandStore = require('../demand/store');
const { listHelpers } = require('./demands');
const institutionalStore = require('../institutional/store');
const {
  INDICATOR_SOURCES, LIMITS, SCOPE_LABELS,
  cacheKey, createIndicatorCache, impactCsv, indicatorsCsv, priorityCsv, rankAreas,
  validateAction, validateIndicatorQuery,
} = require('../government');
const store = require('../government/store');
const { renderIndicatorsPdf } = require('../government/pdf');

const { HttpError } = demandStore;
const { validationError } = listHelpers;

/** Identificação institucional pública do órgão, exposta no painel e no relatório. */
const publicOrganization = (profile) => ({
  name: profile?.name ?? null,
  department: profile?.department ?? null,
  governmentSphere: profile?.governmentSphere ?? null,
  municipality: profile?.municipality ?? null,
  uf: profile?.uf ?? null,
  competenceAreas: profile?.competenceAreas ?? [],
});

const contentDisposition = (name) => `attachment; filename="${name}"`;

module.exports = ({ pool, auth, governmentActor, governmentProfile, cache = createIndicatorCache() }) => {
  if (typeof auth !== 'function' || typeof governmentActor !== 'function' || typeof governmentProfile !== 'function') {
    throw new Error('government routes exigem auth, requireGovernmentActor e governmentProfile');
  }
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = err instanceof HttpError ? err : store.mapActionError(err);
      if (mapped instanceof HttpError) return res.status(mapped.status).json(mapped.body);
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  async function profileOf(req) {
    let profile;
    try {
      profile = await governmentProfile(req.user.userId);
    } catch (err) {
      console.error(`[government] ${err.message}`);
      throw new HttpError(503, { error: 'Não foi possível confirmar o órgão do Poder Público', code: 'institution_unavailable' });
    }
    if (!profile) {
      throw new HttpError(403, {
        error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
        code: 'institution_not_validated',
      });
    }
    return profile;
  }

  /** Filtros validados + órgão. Erros de filtro viram 422 com `fields`. */
  async function context(req) {
    const profile = await profileOf(req);
    const { value, errors } = validateIndicatorQuery(req.query);
    if (Object.keys(errors).length) throw validationError(errors, 'Filtro inválido');
    return { profile, filters: value, organizationId: req.government.organizationId };
  }

  /** Leitura com cache curto por (órgão × visão × recorte). */
  async function cached(view, ctx, load) {
    const key = cacheKey(ctx.organizationId, view, ctx.filters);
    const hit = cache.get(key);
    if (hit) return { ...hit, cached: true };
    const value = { ...(await load()), generatedAt: new Date().toISOString() };
    cache.set(key, value);
    return { ...value, cached: false };
  }

  const envelope = (ctx, extra) => ({
    organizationId: ctx.organizationId,
    organization: publicOrganization(ctx.profile),
    scope: ctx.filters.scope,
    scopeLabel: SCOPE_LABELS[ctx.filters.scope],
    period: ctx.filters.period,
    filters: {
      category: ctx.filters.categories,
      priority: ctx.filters.priorities,
      theme: ctx.filters.themes,
      territory: ctx.filters.territory,
    },
    sources: INDICATOR_SOURCES,
    ...extra,
  });

  const indicatorsReport = async (ctx) => envelope(ctx, await cached('indicators', ctx, () => store.loadIndicators(pool, ctx)));

  const priorityReport = async (ctx) => {
    const data = await cached('priority', ctx, () => store.loadPriorityAreas(pool, ctx));
    return envelope(ctx, {
      generatedAt: data.generatedAt,
      cached: data.cached,
      territories: rankAreas(data.territories, { limit: LIMITS.areas }),
      categories: rankAreas(data.categories, { limit: LIMITS.areas }),
      // Priorização por eixo temático (T26, slide 26).
      themes: rankAreas(data.themes ?? [], { limit: LIMITS.areas }),
    });
  };

  const impactReport = async (ctx) => {
    const data = await cached('impact', ctx, async () => ({ impact: await store.loadImpact(pool, ctx) }));
    return envelope(ctx, { generatedAt: data.generatedAt, cached: data.cached, impact: data.impact });
  };

  const gov = [auth, governmentActor];

  // ── Painel ────────────────────────────────────────────────────────────────
  router.get('/government/indicators', ...gov, handle(async (req, res) => {
    const body = await indicatorsReport(await context(req));
    res.set('Cache-Control', 'private, max-age=30');
    res.json(body);
  }));

  router.get('/government/priority-areas', ...gov, handle(async (req, res) => {
    const body = await priorityReport(await context(req));
    res.set('Cache-Control', 'private, max-age=30');
    res.json(body);
  }));

  router.get('/government/impact', ...gov, handle(async (req, res) => {
    const body = await impactReport(await context(req));
    res.set('Cache-Control', 'private, max-age=30');
    res.json(body);
  }));

  // ── Exportação (CSV e PDF), sem dado pessoal ──────────────────────────────
  router.get('/government/indicators/export', ...gov, handle(async (req, res) => {
    const format = req.query.format === undefined || req.query.format === '' ? 'csv' : String(req.query.format);
    if (!['csv', 'pdf'].includes(format)) throw validationError({ format: 'Valores aceitos: csv, pdf' }, 'Formato inválido');
    const ctx = await context(req);
    const report = await indicatorsReport(ctx);
    const priority = await priorityReport(ctx);
    const impact = await impactReport(ctx);
    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Cache-Control', 'no-store');
    if (format === 'csv') {
      const csv = [indicatorsCsv(report), '', priorityCsv(priority), '', impactCsv(impact)].join('\n');
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', contentDisposition(`dmconecta-indicadores-${stamp}.csv`));
      // BOM: o Excel em português só lê acentuação em UTF-8 com marca.
      return res.send(`﻿${csv}`);
    }
    const pdf = await renderIndicatorsPdf({ report, priority, impact: impact.impact });
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', contentDisposition(`dmconecta-indicadores-${stamp}.pdf`));
    return res.send(pdf);
  }));

  // ── Divulgação de ações ───────────────────────────────────────────────────
  router.get('/government/actions', ...gov, handle(async (req, res) => {
    const actions = await store.listActions(pool, req.government.organizationId, { limit: req.query.limit });
    res.set('Cache-Control', 'no-store');
    res.json({ actions });
  }));

  router.post('/government/actions', ...gov, handle(async (req, res) => {
    const { value, errors } = validateAction(req.body);
    if (Object.keys(errors).length) throw validationError(errors);
    const profile = await profileOf(req);
    const action = await store.createAction(pool, {
      value, organizationId: req.government.organizationId, profile, user: req.user,
    });
    // O número do painel muda com a publicação: o recorte do órgão sai do cache.
    cache.invalidate(`${req.government.organizationId}::`);
    res.status(201).json(action);
  }));

  // ── Público ───────────────────────────────────────────────────────────────
  router.get('/demands/:id/government-actions', handle(async (req, res) => {
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Demanda não encontrada' });
    await institutionalStore.loadOpenDemand(pool, req.params.id);
    const actions = await store.listDemandActions(pool, req.params.id);
    res.set('Cache-Control', 'public, max-age=60');
    return res.json({ actions });
  }));

  return router;
};
