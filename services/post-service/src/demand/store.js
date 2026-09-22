// Acesso ao banco da demanda (T07): transação, projeções, leitura completa,
// recálculo da composição e transição de estado com o ator certo.
//
// Fica fora de src/demand/index.js, que é só o domínio puro. As regras de
// estado e edição são do trigger demands_guard (migração 007): aqui só se
// escolhe o ator e se traduz o erro do banco para HTTP.

const { computeComposition, MAX_BUDGET_CENTS } = require('./finance');
const { applyAction, isEditable, availableActions } = require('./state-machine');
const { UploadError } = require('../uploads');
const { publicMediaUrl } = require('../upload-policy');

/** Erro com status e corpo HTTP, lançado de dentro da transação. */
class HttpError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Traduz erros do PostgreSQL vindos dos triggers e constraints da migração 007.
 * `check_violation` de estado vira 409; o resto dos erros de dado, 422.
 */
function mapDbError(err) {
  if (err instanceof HttpError) return err;
  if (err instanceof UploadError) return new HttpError(err.status, err.body);
  const message = typeof err?.message === 'string' ? err.message : '';
  switch (err?.code) {
    case '23514': // check_violation (demands_guard, demand_items_guard e CHECKs)
      if (/só (é editada|muda) com a demanda|só é editada|transição não permitida|conteúdo vem da demanda|não é excluído|fica oculto/.test(message)) {
        return new HttpError(409, { error: message, code: 'invalid_state' });
      }
      if (/incompleta para envio|não confere com a soma/.test(message)) {
        return new HttpError(422, { error: message, code: 'demand_incomplete', fields: {} });
      }
      return new HttpError(422, { error: 'Dados recusados pelo banco', code: 'validation_failed', fields: {}, detail: message });
    case '42501': // insufficient_privilege (demandas não são excluídas etc.)
      return new HttpError(409, { error: message, code: 'invalid_state' });
    case '23505':
      return new HttpError(409, { error: 'Registro repetido', code: 'duplicate' });
    case '23503':
      return new HttpError(422, { error: 'Referência inválida', code: 'validation_failed', fields: {} });
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
      return new HttpError(422, { error: 'Valor inválido', code: 'validation_failed', fields: {} });
    default:
      return null;
  }
}

/** Resposta de erro padronizada para as rotas. */
function sendError(res, err) {
  const mapped = mapDbError(err);
  if (mapped) return res.status(mapped.status).json(mapped.body);
  console.error(err);
  return res.status(500).json({ error: 'Erro interno' });
}

// ── Campos escalares: camelCase (API e validation.js) ↔ coluna ──────────────
const SCALAR_COLUMNS = {
  category: 'category',
  title: 'title',
  description: 'description',
  objective: 'objective',
  justification: 'justification',
  beneficiariesEstimate: 'beneficiaries_estimate',
  beneficiariesProfile: 'beneficiaries_profile',
  priority: 'priority',
  photoRef: 'photo_ref',
  cep: 'cep',
  street: 'street',
  addressNumber: 'address_number',
  addressComplement: 'address_complement',
  district: 'district',
  municipality: 'municipality',
  uf: 'uf',
  latitude: 'latitude',
  longitude: 'longitude',
  territory: 'territory',
  hasPhysicalExecution: 'has_physical_execution',
};

// Projeção do autor: tudo menos `reviewed_by` e `archived_by` (nomes da equipe).
const OWNER_DEMAND_SQL = `
  d.id, d.author_id, d.organization_id, d.author_name, d.author_avatar,
  d.category, d.title, d.description, d.objective, d.justification,
  d.beneficiaries_estimate, d.beneficiaries_profile, d.priority, d.photo_ref,
  d.cep, d.street, d.address_number, d.address_complement, d.district,
  d.municipality, d.uf, d.latitude, d.longitude, d.territory, d.has_physical_execution,
  d.budget_amount_cents, d.agent_fee_bps, d.platform_fee_bps, d.agent_fee_cents,
  d.platform_fee_cents, d.total_amount_cents, d.status, d.review_state, d.review_note,
  d.reviewed_at, d.submitted_at, d.published_at, d.archive_reason, d.archived_at,
  d.created_at, d.updated_at,
  (SELECT p.id FROM posts p WHERE p.demand_id = d.id AND p.visibility = 'visible') AS post_id`;

// Projeção pública: sem endereço fino (CEP, rua, número, complemento), sem
// instituição interna, sem dados da análise.
const PUBLIC_DEMAND_SQL = `
  d.id, d.author_id, d.author_name, d.author_avatar, d.category, d.title,
  d.description, d.objective, d.justification, d.beneficiaries_estimate,
  d.beneficiaries_profile, d.priority, d.photo_ref, d.district, d.municipality,
  d.uf, d.latitude, d.longitude, d.territory, d.has_physical_execution,
  d.budget_amount_cents, d.agent_fee_bps, d.platform_fee_bps, d.agent_fee_cents,
  d.platform_fee_cents, d.total_amount_cents, d.status, d.published_at, d.updated_at,
  (SELECT p.id FROM posts p WHERE p.demand_id = d.id AND p.visibility = 'visible') AS post_id`;

const PUBLIC_SUMMARY_SQL = `
  d.id, d.author_id, d.author_name, d.author_avatar, d.category, d.title,
  left(d.description, 280) AS description, d.priority, d.photo_ref, d.district,
  d.municipality, d.uf, d.latitude, d.longitude, d.territory, d.beneficiaries_estimate,
  d.budget_amount_cents, d.total_amount_cents, d.status, d.published_at,
  d.published_at::text AS cursor_ts,
  (SELECT p.id FROM posts p WHERE p.demand_id = d.id AND p.visibility = 'visible') AS post_id`;

const ITEM_SQL = {
  budgetItems: `SELECT id, position, description, quantity::text AS quantity, unit, unit_price_cents,
                       total_cents, is_audiovisual_record, schedule_item_id
                  FROM demand_budget_items WHERE demand_id = $1 ORDER BY position, created_at, id`,
  scheduleItems: `SELECT id, position, stage, activities, to_char(starts_on, 'YYYY-MM-DD') AS starts_on,
                         to_char(ends_on, 'YYYY-MM-DD') AS ends_on, responsible,
                         record_milestones::text[] AS record_milestones
                    FROM demand_schedule_items WHERE demand_id = $1 ORDER BY position, starts_on, id`,
  goals: `SELECT id, position, goal, expected_result, indicator, measurement_method
            FROM demand_goals WHERE demand_id = $1 ORDER BY position, created_at, id`,
  resources: `SELECT id, position, kind::text AS kind, resource_type::text AS resource_type, description
                FROM demand_resources WHERE demand_id = $1 ORDER BY kind, position, created_at, id`,
  documents: `SELECT id, position, document_type::text AS document_type, title, reference, description
                FROM demand_documents WHERE demand_id = $1 ORDER BY position, created_at, id`,
};

const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

function serializeComposition(row) {
  return {
    budgetAmountCents: toNumber(row.budget_amount_cents),
    agentFeeBps: toNumber(row.agent_fee_bps),
    platformFeeBps: toNumber(row.platform_fee_bps),
    agentFeeCents: toNumber(row.agent_fee_cents),
    platformFeeCents: toNumber(row.platform_fee_cents),
    totalAmountCents: toNumber(row.total_amount_cents),
  };
}

const ITEM_SERIALIZERS = {
  budgetItems: (r) => ({
    id: r.id,
    position: r.position,
    description: r.description,
    quantity: toNumber(r.quantity),
    unit: r.unit,
    unitPriceCents: toNumber(r.unit_price_cents),
    totalCents: toNumber(r.total_cents),
    isAudiovisualRecord: r.is_audiovisual_record,
    scheduleItemId: r.schedule_item_id ?? null,
  }),
  scheduleItems: (r, { isPublic }) => ({
    id: r.id,
    position: r.position,
    stage: r.stage,
    activities: r.activities,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    // Responsável é nome de pessoa: fica fora da rota pública.
    ...(isPublic ? {} : { responsible: r.responsible ?? null }),
    recordMilestones: Array.isArray(r.record_milestones) ? r.record_milestones : [],
  }),
  goals: (r) => ({
    id: r.id,
    position: r.position,
    goal: r.goal,
    expectedResult: r.expected_result,
    indicator: r.indicator,
    measurementMethod: r.measurement_method,
  }),
  resources: (r) => ({
    id: r.id,
    position: r.position,
    kind: r.kind,
    type: r.resource_type,
    description: r.description ?? null,
  }),
  // Documentos comprobatórios: o público vê tipo e nome; o link fica com o
  // autor e a análise.
  documents: (r, { isPublic }) => (isPublic
    ? { id: r.id, position: r.position, type: r.document_type, title: r.title }
    : {
      id: r.id,
      position: r.position,
      type: r.document_type,
      title: r.title,
      reference: r.reference,
      description: r.description ?? null,
    }),
};

function serializeScalars(row) {
  return {
    category: row.category ?? null,
    title: row.title ?? null,
    description: row.description ?? null,
    objective: row.objective ?? null,
    justification: row.justification ?? null,
    beneficiariesEstimate: toNumber(row.beneficiaries_estimate),
    beneficiariesProfile: row.beneficiaries_profile ?? null,
    priority: row.priority ?? null,
    photoRef: row.photo_ref ?? null,
    // Endereço de leitura: público e estável; a visão do autor troca por URL
    // assinada (upload-policy.attachOwnerUploads), porque rascunho não é público.
    photoUrl: publicMediaUrl(row.photo_ref),
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    territory: row.territory ?? null,
    hasPhysicalExecution: row.has_physical_execution,
  };
}

/** Visão do autor: todos os campos, estado da análise e ações disponíveis. */
function serializeOwnerDemand(row, items = null) {
  const demand = {
    id: row.id,
    authorId: row.author_id,
    organizationId: row.organization_id ?? null,
    authorName: row.author_name ?? null,
    authorAvatar: row.author_avatar ?? null,
    ...serializeScalars(row),
    cep: row.cep ?? null,
    street: row.street ?? null,
    addressNumber: row.address_number ?? null,
    addressComplement: row.address_complement ?? null,
    composition: serializeComposition(row),
    status: row.status,
    reviewState: row.review_state,
    reviewNote: row.review_note ?? null,
    reviewedAt: toIso(row.reviewed_at),
    submittedAt: toIso(row.submitted_at),
    publishedAt: toIso(row.published_at),
    archiveReason: row.archive_reason ?? null,
    archivedAt: toIso(row.archived_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    postId: row.post_id ?? null,
    editable: isEditable({ status: row.status, reviewState: row.review_state }),
    availableActions: availableActions({ status: row.status, reviewState: row.review_state }, 'agente'),
  };
  if (items) Object.assign(demand, serializeItems(items, { isPublic: false }));
  return demand;
}

/** Visão pública (demanda publicada em diante). */
function serializePublicDemand(row, items = null) {
  const demand = {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    authorAvatar: row.author_avatar ?? null,
    ...serializeScalars(row),
    composition: serializeComposition(row),
    status: row.status,
    publishedAt: toIso(row.published_at),
    updatedAt: toIso(row.updated_at),
    postId: row.post_id ?? null,
  };
  if (items) Object.assign(demand, serializeItems(items, { isPublic: true }));
  return demand;
}

function serializePublicSummary(row) {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: row.author_name ?? null,
    authorAvatar: row.author_avatar ?? null,
    category: row.category,
    title: row.title,
    description: row.description,
    priority: row.priority,
    photoRef: row.photo_ref ?? null,
    photoUrl: publicMediaUrl(row.photo_ref),
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    territory: row.territory ?? null,
    beneficiariesEstimate: toNumber(row.beneficiaries_estimate),
    budgetAmountCents: toNumber(row.budget_amount_cents),
    totalAmountCents: toNumber(row.total_amount_cents),
    status: row.status,
    publishedAt: toIso(row.published_at),
    postId: row.post_id ?? null,
  };
}

function serializeItems(items, options) {
  const out = {};
  for (const [key, rows] of Object.entries(items)) {
    out[key] = rows.map((r) => ITEM_SERIALIZERS[key](r, options));
  }
  return out;
}

/** Itens da demanda, em sequência (um client de transação não aceita consultas simultâneas). */
async function loadItems(db, demandId) {
  const items = {};
  for (const [key, sql] of Object.entries(ITEM_SQL)) {
    items[key] = (await db.query(sql, [demandId])).rows;
  }
  return items;
}

/**
 * Demanda do autor, travada para escrita quando `forUpdate`. Lança 404 quando
 * não existe ou é de outra conta (recurso privado: não revela a existência).
 */
async function loadOwnDemand(db, demandId, userId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${OWNER_DEMAND_SQL} FROM demands d WHERE d.id = $1${forUpdate ? ' FOR UPDATE OF d' : ''}`,
    [demandId],
  );
  const row = rows[0];
  if (!row || row.author_id !== userId) throw new HttpError(404, { error: 'Demanda não encontrada' });
  return row;
}

function assertEditable(row) {
  if (!isEditable({ status: row.status, reviewState: row.review_state })) {
    throw new HttpError(409, {
      error: row.review_state === 'aguardando_analise'
        ? 'A demanda está aguardando análise e não pode ser alterada'
        : 'A demanda só é editada em rascunho ou quando devolvida para ajustes',
      code: 'demand_not_editable',
      status: row.status,
      reviewState: row.review_state,
    });
  }
}

/** Entrada de `validateDemand` (camelCase) a partir da demanda gravada. */
function toValidationInput(row, items) {
  const owner = serializeOwnerDemand(row, items);
  return {
    ...owner,
    budgetItems: owner.budgetItems.map((item) => ({ ...item, quantity: String(item.quantity) })),
  };
}

/** Recalcula e grava a composição a partir dos itens do orçamento. */
async function recomputeComposition(db, demandId) {
  const { rows } = await db.query(
    'SELECT coalesce(sum(total_cents), 0)::text AS base FROM demand_budget_items WHERE demand_id = $1',
    [demandId],
  );
  const base = Number(rows[0]?.base ?? 0);
  if (!Number.isSafeInteger(base) || base > MAX_BUDGET_CENTS) {
    throw new HttpError(422, {
      error: 'Orçamento acima do limite da plataforma',
      code: 'validation_failed',
      fields: { budgetItems: 'Orçamento acima do limite da plataforma' },
    });
  }
  const c = computeComposition(base);
  await db.query(
    `UPDATE demands
        SET budget_amount_cents = $2, agent_fee_cents = $3, platform_fee_cents = $4, total_amount_cents = $5
      WHERE id = $1`,
    [demandId, c.budgetAmountCents, c.agentFeeCents, c.platformFeeCents, c.totalAmountCents],
  );
  return c;
}

/**
 * Aplica uma ação da máquina de estados fora da análise (buscar_parceiro,
 * conectar, iniciar_execucao, concluir, prestar_contas) dentro da transação
 * de `db`. `actor`: `agente` (o autor; padrão do banco) ou `sistema` (o portal,
 * declarado com SET LOCAL dm.actor_type; `actorRef` vai para dm.actor). O
 * trigger demands_guard confere de novo e grava o evento.
 */
async function transitionDemand(db, row, action, { actor = 'agente', actorRef = null } = {}) {
  const result = applyAction({ status: row.status, reviewState: row.review_state }, action, { actor });
  if (!result.ok) {
    const status = result.code === 'forbidden_actor' ? 403
      : result.code === 'invalid_transition' ? 409 : 422;
    throw new HttpError(status, {
      error: result.error,
      code: result.code,
      ...(status === 422 ? { fields: { action: result.error } } : {}),
    });
  }
  if (result.next.reviewState !== row.review_state) {
    // Envio, devolução e publicação têm rotas próprias (ou são da gestão).
    throw new HttpError(409, { error: 'Ação de análise: use o envio para análise', code: 'invalid_transition' });
  }
  if (actor === 'sistema') {
    await db.query("SELECT set_config('dm.actor_type', 'sistema', true), set_config('dm.actor', $1, true)",
      [actorRef ?? 'sistema']);
  }
  await db.query('UPDATE demands SET status = $2 WHERE id = $1', [row.id, result.next.status]);
  return result;
}

module.exports = {
  HttpError,
  withTransaction,
  mapDbError,
  sendError,
  SCALAR_COLUMNS,
  OWNER_DEMAND_SQL,
  PUBLIC_DEMAND_SQL,
  PUBLIC_SUMMARY_SQL,
  ITEM_SQL,
  ITEM_SERIALIZERS,
  serializeComposition,
  serializeOwnerDemand,
  serializePublicDemand,
  serializePublicSummary,
  serializeItems,
  loadItems,
  loadOwnDemand,
  assertEditable,
  toValidationInput,
  recomputeComposition,
  transitionDemand,
};
