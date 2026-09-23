// Acesso ao banco das sugestões de IA (T23, migração 022).
//
// Duas tabelas e nenhuma escrita fora delas: a IA não toca em `demands`,
// `posts`, `supports`, `demand_dossiers` nem `demand_accountability`. Aceitar
// uma sugestão grava o desfecho aqui; alterar a demanda continua sendo a rota
// da demanda, chamada pela pessoa.
//
// Projeções explícitas (nada de `SELECT *`) e camelCase na saída, como nas
// demais rotas do serviço.

const { SUGGESTION_LABEL } = require('./constants');

const iso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

/** Linha → corpo da API. `aiGenerated`/`label` marcam a origem em toda resposta. */
function toSuggestion(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    demandId: row.demand_id ?? null,
    organizationId: row.organization_id ?? null,
    model: row.model,
    promptFields: row.prompt_fields ?? [],
    payload: row.payload ?? {},
    rationale: row.rationale ?? null,
    evidence: row.evidence ?? {},
    status: row.status,
    reviewedAt: iso(row.reviewed_at),
    reviewNote: row.review_note ?? null,
    createdAt: iso(row.created_at),
    aiGenerated: true,
    label: SUGGESTION_LABEL,
  };
}

const COLUMNS = `id, kind, demand_id, organization_id, model, prompt_fields, payload,
                 rationale, evidence, status, reviewed_at, review_note, created_at`;

async function insertSuggestion(db, {
  kind, demandId = null, organizationId = null, requestedBy, requesterRole,
  model, promptFields = [], payload = {}, rationale = null, evidence = {},
}) {
  const { rows } = await db.query(
    `INSERT INTO ai_suggestions
       (kind, demand_id, organization_id, requested_by, requester_role, model,
        prompt_fields, payload, rationale, evidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb)
     RETURNING ${COLUMNS}`,
    [kind, demandId, organizationId, requestedBy, requesterRole, model,
      promptFields, JSON.stringify(payload), rationale, JSON.stringify(evidence)],
  );
  return toSuggestion(rows[0]);
}

/** Sugestões de uma demanda, da mais recente para a mais antiga. */
async function listByDemand(db, demandId, { kind = null, limit = 20 } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM ai_suggestions
      WHERE demand_id = $1 AND ($2::ai_suggestion_kind IS NULL OR kind = $2)
      ORDER BY created_at DESC LIMIT $3`,
    [demandId, kind, Math.min(Math.max(Number(limit) || 20, 1), 50)],
  );
  return rows.map(toSuggestion);
}

async function listByOrganization(db, organizationId, { kind = null, limit = 20 } = {}) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS} FROM ai_suggestions
      WHERE organization_id = $1 AND ($2::ai_suggestion_kind IS NULL OR kind = $2)
      ORDER BY created_at DESC LIMIT $3`,
    [organizationId, kind, Math.min(Math.max(Number(limit) || 20, 1), 50)],
  );
  return rows.map(toSuggestion);
}

async function loadSuggestion(db, id) {
  const { rows } = await db.query(
    `SELECT ${COLUMNS}, requested_by FROM ai_suggestions WHERE id = $1`, [id],
  );
  if (!rows.length) return null;
  return { ...toSuggestion(rows[0]), requestedBy: rows[0].requested_by };
}

/**
 * Desfecho humano: `aceita` ou `ignorada`. O trigger da migração 022 impede
 * mudar o conteúdo e revisar duas vezes.
 */
async function reviewSuggestion(db, { id, status, reviewedBy, reviewNote = null }) {
  const { rows } = await db.query(
    `UPDATE ai_suggestions
        SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_note = $4
      WHERE id = $1
      RETURNING ${COLUMNS}`,
    [id, status, reviewedBy, reviewNote],
  );
  return toSuggestion(rows[0]);
}

/** Registro de uso, append-only. Falha ao gravar nunca derruba a requisição. */
async function logUsage(db, {
  kind, demandId = null, organizationId = null, requestedBy = null, model = null,
  outcome, errorCode = null, latencyMs = null, inputTokens = null, outputTokens = null,
  suggestionId = null,
}) {
  try {
    await db.query(
      `INSERT INTO ai_usage_log
         (kind, demand_id, organization_id, requested_by, model, outcome, error_code,
          latency_ms, input_tokens, output_tokens, suggestion_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [kind, demandId, organizationId, requestedBy, model, outcome, errorCode,
        latencyMs, inputTokens, outputTokens, suggestionId],
    );
  } catch (err) {
    console.error(`[ai] não foi possível registrar o uso: ${err.message}`);
  }
}

/**
 * Chamadas que chegaram ao modelo na janela (segunda contenção de custo, que
 * atravessa réplicas; a primeira é o teto no processo, src/ai/budget.js).
 */
async function countCallsInWindow(db, { windowMs, requestedBy = null }) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE requested_by = $2)::int AS mine
       FROM ai_usage_log
      WHERE created_at > NOW() - ($1::bigint * INTERVAL '1 millisecond')
        AND outcome IN ('sucesso', 'erro', 'resposta_invalida')`,
    [String(windowMs), requestedBy],
  );
  return { total: rows[0]?.total ?? 0, mine: rows[0]?.mine ?? 0 };
}

module.exports = {
  toSuggestion,
  insertSuggestion,
  listByDemand,
  listByOrganization,
  loadSuggestion,
  reviewSuggestion,
  logUsage,
  countCallsInWindow,
};
