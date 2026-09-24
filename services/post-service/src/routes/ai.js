// Inteligência artificial (T23). Montada na raiz do post-service, antes das
// rotas de demanda e de posts; pública em /api/posts/... (o Caddy tira
// /api/posts). Fonte: 01-apresentacao-institucional.html, slide 23
// ("Organização automática de demandas", "Detecção de urgência", "Sugestão de
// editais", "Conexão com patrocinadores ideais", "Geração de relatórios para
// governo"). Decisão 6 de decisoes-de-implementacao.md.
//
// Toda rota daqui produz **sugestão revisável por uma pessoa**. Nenhuma altera
// demanda, post, apoio, dossiê ou prestação de contas; nenhuma entra no dossiê
// (T10) nem na prestação de contas (T18). Aceitar uma sugestão grava só o
// desfecho: quem muda a demanda é o Agente, pela rota da demanda.
//
//   GET  /ai/status                              o que está ligado, por quê e com que modelo
//
// Agente de Transformação autor da demanda (404 para quem não é o autor):
//   POST /demands/:id/ai/organization            sugere categoria, território e eixos (T26)
//   POST /demands/:id/ai/urgency                 sugere prioridade, com justificativa
//   POST /demands/:id/ai/editais                 aponta editais divulgados com aderência
//   POST /demands/:id/ai/partners                ordena os interessados já registrados
//   GET  /demands/:id/ai/suggestions             sugestões da demanda
//   POST /demands/:id/ai/suggestions/:sid/review { status: aceita|ignorada, note }
//
// Poder Público com cadastro validado (mesmo gate da T13/T22):
//   POST /government/ai/report                   rascunho de relatório dos indicadores da T22
//   GET  /government/ai/suggestions              rascunhos do próprio órgão
//
// **Sem IA o fluxo segue**: flag desligada, chave ausente, limite de custo,
// disjuntor aberto ou falha do provedor respondem **200** com
// `{ available: false, reason, message }`. A interface mostra a frase e o
// trabalho continua sem sugestão. Nada é inventado no lugar.
//
// O que sai daqui para o modelo está em src/ai/redaction.js (e fica gravado em
// `ai_suggestions.prompt_fields`): sem nome, e-mail, telefone, documento,
// endereço fino, coordenada, URL de arquivo nem id de conta.

const express = require('express');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const { requireEffectiveRole } = require('../delegation');
const demandStore = require('../demand/store');
const { listHelpers } = require('./demands');
const interestStore = require('../interest/store');
const governmentStore = require('../government/store');
const { validateIndicatorQuery, INDICATOR_SOURCES, SCOPE_LABELS } = require('../government');
const {
  KIND_STAGE, STAGE_NOTES, SUGGESTION_DISCLAIMER, SUGGESTION_LABEL, STATUSES,
} = require('../ai/constants');
const {
  demandBrief, demandContext, editalContext, governmentContext, interestContext,
} = require('../ai/redaction');
const aiStore = require('../ai/store');

const { HttpError, withTransaction } = demandStore;
const { validationError } = listHelpers;

// Editais divulgados (T22, `government_actions.kind = 'edital'`) considerados
// para a demanda: os mais recentes do mesmo município/UF ou sem recorte.
const EDITAL_LIMIT = 20;

/** Recorte de recursos da compatibilidade transparente da T15 (não a substitui). */
function resourceMatch(neededResources, offerTypes) {
  const needed = [...new Set(neededResources ?? [])];
  const offered = new Set(offerTypes ?? []);
  const matched = needed.filter((type) => offered.has(type));
  const score = needed.length ? Math.round((100 * matched.length) / needed.length) : null;
  const level = score === null ? null : (score >= 70 ? 'alta' : (score >= 40 ? 'media' : 'baixa'));
  return {
    matched,
    score,
    level,
    reasons: needed.length
      ? [`Oferece ${matched.length} de ${needed.length} recursos necessários da demanda.`]
      : ['A demanda não lista recursos necessários.'],
  };
}

module.exports = ({ pool, auth, ai, governmentActor, governmentProfile, institutionStatus = null }) => {
  if (typeof auth !== 'function') throw new Error('as rotas de IA exigem auth');
  if (!ai || typeof ai.suggest !== 'function') throw new Error('as rotas de IA exigem o serviço de IA');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const mapped = err instanceof HttpError ? err : demandStore.mapDbError(err);
      if (mapped instanceof HttpError) return res.status(mapped.status).json(mapped.body);
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };

  // Agente, ou conta que age como Agente por delegação (T29).
  const requireAgent = requireEffectiveRole(institutionStatus, 'agent', {
    error: 'As sugestões de IA da demanda são do Agente de Transformação autor',
    code: 'demand_author_not_agent',
  });

  /** Envelope comum: a marca de sugestão de IA acompanha toda resposta. */
  const envelope = (kind, extra) => ({
    kind,
    label: SUGGESTION_LABEL,
    disclaimer: SUGGESTION_DISCLAIMER,
    stage: KIND_STAGE[kind],
    stageNote: STAGE_NOTES[kind] ?? null,
    aiGenerated: true,
    ...extra,
  });

  /** Demanda do próprio Agente + itens. 404 para quem não é o autor. */
  async function ownDemand(req) {
    if (!isUuid(req.params.id)) throw new HttpError(404, { error: 'Demanda não encontrada' });
    const row = await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const items = await demandStore.loadItems(pool, req.params.id);
    return { row, items };
  }

  // ── Estado do recurso ─────────────────────────────────────────────────────
  router.get('/ai/status', auth, handle(async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(ai.status());
  }));

  // ── Organização automática de demandas (categoria e território) ───────────
  router.post('/demands/:id/ai/organization', auth, requireAgent, handle(async (req, res) => {
    const { row, items } = await ownDemand(req);
    const context = demandContext(row, items.resources ?? []);
    const result = await ai.suggest({
      kind: 'organizacao_da_demanda',
      context,
      subject: { demandId: row.id },
      user: req.user,
      // Números verificáveis exibidos ao lado do texto da IA.
      evidence: {
        categoria_atual: row.category ?? null,
        territorio_atual: row.territory ?? null,
        eixos_atuais: Array.isArray(row.themes) ? row.themes : [],
        municipio: row.municipality ?? null,
        uf: row.uf ?? null,
      },
    });
    res.set('Cache-Control', 'no-store');
    res.json(envelope('organizacao_da_demanda', result));
  }));

  // ── Detecção de urgência (prioridade, com justificativa) ──────────────────
  router.post('/demands/:id/ai/urgency', auth, requireAgent, handle(async (req, res) => {
    const { row, items } = await ownDemand(req);
    const result = await ai.suggest({
      kind: 'deteccao_de_urgencia',
      context: demandContext(row, items.resources ?? []),
      subject: { demandId: row.id },
      user: req.user,
      evidence: {
        prioridade_atual: row.priority ?? null,
        categoria_atual: row.category ?? null,
        beneficiarios_estimados: row.beneficiaries_estimate ?? null,
      },
    });
    res.set('Cache-Control', 'no-store');
    res.json(envelope('deteccao_de_urgencia', result));
  }));

  // ── Sugestão de editais (em desenvolvimento: depende de cadastro) ─────────
  router.post('/demands/:id/ai/editais', auth, requireAgent, handle(async (req, res) => {
    const { row, items } = await ownDemand(req);
    const { rows: actions } = await pool.query(
      `SELECT id, title, summary, program_name, territory, municipality, uf, starts_on, ends_on
         FROM government_actions
        WHERE kind = 'edital'
          AND (ends_on IS NULL OR ends_on >= CURRENT_DATE)
          AND ($2::text IS NULL OR municipality IS NULL OR municipality = $2)
          AND ($3::text IS NULL OR uf IS NULL OR uf = $3)
        ORDER BY published_at DESC
        LIMIT $1`,
      [EDITAL_LIMIT, row.municipality ?? null, row.uf ?? null],
    );
    res.set('Cache-Control', 'no-store');
    if (!actions.length) {
      // A fonte manda identificar o que está em desenvolvimento e publicar só
      // dado verificável: sem edital cadastrado, não há o que sugerir.
      return res.json(envelope('sugestao_de_editais', {
        available: false,
        reason: 'sem_base',
        message: 'Ainda não há editais cadastrados para este território. '
          + 'A sugestão de editais depende de os órgãos públicos divulgarem editais na plataforma.',
        editais: [],
      }));
    }
    const catalog = actions.map((action) => ({
      id: action.id,
      title: action.title,
      summary: action.summary,
      programName: action.program_name,
      territory: action.territory,
      municipality: action.municipality,
      uf: action.uf,
      startsOn: action.starts_on instanceof Date ? action.starts_on.toISOString().slice(0, 10) : action.starts_on,
      endsOn: action.ends_on instanceof Date ? action.ends_on.toISOString().slice(0, 10) : action.ends_on,
    }));
    const result = await ai.suggest({
      kind: 'sugestao_de_editais',
      context: { demanda: demandBrief(row, items.resources ?? []), editais: editalContext(catalog) },
      subject: { demandId: row.id },
      user: req.user,
      references: catalog.length,
      evidence: { editais_considerados: catalog.length },
    });
    // A referência numérica volta a ser o edital real aqui dentro; o modelo
    // nunca recebeu o id.
    const editais = result.available
      ? (result.suggestion.payload.editais ?? []).map((item) => ({
        ...item, edital: catalog[item.referencia - 1] ?? null,
      })).filter((item) => item.edital)
      : [];
    return res.json(envelope('sugestao_de_editais', { ...result, editais, catalog }));
  }));

  // ── Conexão com patrocinadores ideais (complementa a T15) ─────────────────
  router.post('/demands/:id/ai/partners', auth, requireAgent, handle(async (req, res) => {
    const { row, items } = await ownDemand(req);
    const needed = (items.resources ?? [])
      .filter((r) => r.kind === 'necessario')
      .map((r) => r.resource_type ?? r.type)
      .filter((type) => typeof type === 'string');
    const { rows } = await pool.query(
      `SELECT ${interestStore.INTEREST_SQL} FROM demand_interests i
        WHERE i.demand_id = $1 AND i.withdrawn_at IS NULL
        ORDER BY i.created_at DESC, i.id DESC LIMIT 20`,
      [row.id],
    );
    const interests = rows.map(interestStore.serializeAgentInterest);
    res.set('Cache-Control', 'no-store');
    if (!interests.length) {
      return res.json(envelope('conexao_com_patrocinadores', {
        available: false,
        reason: 'sem_base',
        message: 'Ainda não há interessados registrados nesta demanda. '
          + 'A sugestão ordena quem já se manifestou; ela não procura contatos fora da plataforma.',
        partners: [],
      }));
    }
    // Compatibilidade transparente (recorte de recursos da T15): é o número que
    // a interface mostra ao lado do texto da IA, e continua valendo sozinho.
    const scored = interests.map((interest) => ({
      interest,
      compatibility: resourceMatch(needed, interest.offerTypes),
    }));
    const result = await ai.suggest({
      kind: 'conexao_com_patrocinadores',
      context: {
        demanda: demandBrief(row, items.resources ?? []),
        interessados: interestContext(scored.map(({ interest, compatibility }) => ({
          accountCategory: interest.user.category,
          kind: interest.kind,
          offerTypes: interest.offerTypes,
          compatibilityScore: compatibility.score,
          compatibilityLevel: compatibility.level,
          compatibilityReasons: compatibility.reasons,
        }))),
      },
      subject: { demandId: row.id },
      user: req.user,
      references: scored.length,
      evidence: {
        interessados_considerados: scored.length,
        recursos_necessarios: needed.length,
      },
    });
    const partners = result.available
      ? (result.suggestion.payload.patrocinadores ?? []).map((item) => {
        const target = scored[item.referencia - 1];
        return target ? {
          ...item,
          interestId: target.interest.id,
          compatibility: target.compatibility,
        } : null;
      }).filter(Boolean)
      : [];
    return res.json(envelope('conexao_com_patrocinadores', {
      ...result,
      partners,
      compatibility: scored.map(({ interest, compatibility }) => ({
        interestId: interest.id, ...compatibility,
      })),
    }));
  }));

  // ── Sugestões gravadas e desfecho humano ──────────────────────────────────
  router.get('/demands/:id/ai/suggestions', auth, requireAgent, handle(async (req, res) => {
    if (!isUuid(req.params.id)) throw new HttpError(404, { error: 'Demanda não encontrada' });
    await demandStore.loadOwnDemand(pool, req.params.id, req.user.userId);
    const suggestions = await aiStore.listByDemand(pool, req.params.id, {
      kind: typeof req.query.kind === 'string' && req.query.kind ? req.query.kind : null,
      limit: req.query.limit,
    });
    res.set('Cache-Control', 'no-store');
    res.json({ suggestions, label: SUGGESTION_LABEL, disclaimer: SUGGESTION_DISCLAIMER });
  }));

  router.post('/demands/:id/ai/suggestions/:suggestionId/review', auth, requireAgent, handle(async (req, res) => {
    if (!isUuid(req.params.id) || !isUuid(req.params.suggestionId)) {
      throw new HttpError(404, { error: 'Sugestão não encontrada' });
    }
    const status = typeof req.body?.status === 'string' ? req.body.status : '';
    if (!['aceita', 'ignorada'].includes(status)) {
      throw validationError({ status: 'Valores aceitos: aceita, ignorada' });
    }
    const note = typeof req.body?.note === 'string' && req.body.note.trim() ? req.body.note.trim() : null;
    const reviewed = await withTransaction(pool, async (client) => {
      // Só o autor da demanda revisa. A demanda não é alterada aqui: aceitar
      // registra a decisão, e o valor sugerido é aplicado pela rota da demanda.
      await demandStore.loadOwnDemand(client, req.params.id, req.user.userId);
      const suggestion = await aiStore.loadSuggestion(client, req.params.suggestionId);
      if (!suggestion || suggestion.demandId !== req.params.id) {
        throw new HttpError(404, { error: 'Sugestão não encontrada' });
      }
      if (suggestion.status !== 'sugerida') {
        throw new HttpError(409, { error: 'Esta sugestão já foi revisada', code: 'invalid_state' });
      }
      return aiStore.reviewSuggestion(client, {
        id: suggestion.id, status, reviewedBy: req.user.userId, reviewNote: note,
      });
    });
    res.json({
      suggestion: reviewed,
      // Aceitar não muda a demanda: a alteração continua sendo ação da pessoa.
      applied: false,
      message: status === 'aceita'
        ? 'Sugestão marcada como aceita. Aplique o valor na demanda quando quiser: a IA não altera nada sozinha.'
        : 'Sugestão marcada como ignorada.',
    });
  }));

  // ── Relatórios para governo ───────────────────────────────────────────────
  if (typeof governmentActor === 'function' && typeof governmentProfile === 'function') {
    const gov = [auth, governmentActor];

    async function profileOf(req) {
      let profile;
      try {
        profile = await governmentProfile(req.user.userId);
      } catch (err) {
        console.error(`[ai] ${err.message}`);
        throw new HttpError(503, {
          error: 'Não foi possível confirmar o órgão do Poder Público', code: 'institution_unavailable',
        });
      }
      if (!profile) {
        throw new HttpError(403, {
          error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
          code: 'institution_not_validated',
        });
      }
      return profile;
    }

    router.post('/government/ai/report', ...gov, handle(async (req, res) => {
      const profile = await profileOf(req);
      const { value: filters, errors } = validateIndicatorQuery(req.body ?? {});
      if (Object.keys(errors).length) throw validationError(errors, 'Filtro inválido');
      const ctx = { profile, filters, organizationId: req.government.organizationId };
      const data = await governmentStore.loadIndicators(pool, ctx);
      // Os mesmos números que o painel da T22 mostra: é o que vai ao modelo e
      // é o que a interface exibe ao lado do texto, para conferência.
      const report = {
        organization: {
          name: profile.name ?? null,
          department: profile.department ?? null,
          governmentSphere: profile.governmentSphere ?? null,
          municipality: profile.municipality ?? null,
          uf: profile.uf ?? null,
        },
        scope: filters.scope,
        scopeLabel: SCOPE_LABELS[filters.scope],
        period: filters.period,
        indicators: data.indicators,
        territories: data.byTerritory,
        categories: data.byCategory,
        sources: INDICATOR_SOURCES,
      };
      const result = await ai.suggest({
        kind: 'relatorio_para_governo',
        context: governmentContext(report),
        subject: { organizationId: req.government.organizationId },
        user: req.user,
        evidence: {
          indicadores: data.indicators,
          por_territorio: data.byTerritory,
          por_categoria: data.byCategory,
        },
      });
      res.set('Cache-Control', 'no-store');
      res.json(envelope('relatorio_para_governo', { ...result, report }));
    }));

    router.get('/government/ai/suggestions', ...gov, handle(async (req, res) => {
      const suggestions = await aiStore.listByOrganization(pool, req.government.organizationId, {
        kind: 'relatorio_para_governo', limit: req.query.limit,
      });
      res.set('Cache-Control', 'no-store');
      res.json({ suggestions, label: SUGGESTION_LABEL, disclaimer: SUGGESTION_DISCLAIMER });
    }));
  }

  return router;
};

module.exports.resourceMatch = resourceMatch;
module.exports.REVIEW_STATUSES = STATUSES.filter((status) => status !== 'sugerida');
