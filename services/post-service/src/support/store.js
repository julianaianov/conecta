// Projeções e leitura do apoio à demanda (T16, migração post 013 sobre a
// tabela `supports`).
//
// Três visões: a de quem apoiou, a do Agente autor (com quem apoiou, mensagem
// e evidências) e a pública do histórico de apoio (slide 21), que mostra o
// nome só com consentimento e o valor só quando o apoiador o torna público.
// O Poder Público aparece no histórico, mas fora do ranking de apoiadores.

const { HttpError } = require('../demand/store');
const { publicMediaUrl } = require('../upload-policy');

// Colunas do apoio de demanda (visão do apoiador e do Agente).
const SUPPORT_SQL = `
  s.id, s.demand_id, s.post_id, s.user_id, s.user_name, s.supporter_category, s.profile_type,
  s.organization_id, s.modality::text AS modality, s.type::text AS support_type, s.description,
  s.amount, s.occurred_on, s.message, s.receipt_status::text AS receipt_status, s.receipt_note,
  s.receipt_evidence, s.receipt_answered_at, s.display_consent, s.public_name, s.amount_public,
  s.status, s.canceled_at, s.created_at, s.updated_at`;

// Histórico público: nada de conta, mensagem ou nota do Agente.
const PUBLIC_SUPPORT_SQL = `
  s.id, s.modality::text AS modality, s.type::text AS support_type, s.description,
  s.amount, s.amount_public, s.display_consent, s.public_name, s.user_name,
  s.supporter_category, s.receipt_status::text AS receipt_status, s.receipt_answered_at,
  s.occurred_on, s.created_at, cardinality(s.receipt_evidence) AS evidence_count`;

// Apoio de demanda que conta para o público e para os totais.
const VISIBLE_SUPPORT = "s.canceled_at IS NULL AND s.status <> 'rejected'";

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const toDate = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value ?? null);

/** `supports.amount` (DECIMAL) → centavos inteiros; `null` quando não há valor. */
function amountToCents(value) {
  if (value === null || value === undefined || value === '') return null;
  const reais = Number(value);
  return Number.isFinite(reais) ? Math.round(reais * 100) : null;
}

/** Centavos → texto decimal para gravar em `supports.amount`. */
function centsToAmount(cents) {
  if (cents === null || cents === undefined) return null;
  return (cents / 100).toFixed(2);
}

/** Apoio visto por quem o registrou. */
function serializeOwnSupport(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    postId: row.post_id ?? null,
    modality: row.modality,
    supportType: row.support_type,
    description: row.description,
    amountCents: amountToCents(row.amount),
    amountPublic: row.amount_public === true,
    occurredOn: toDate(row.occurred_on),
    message: row.message ?? null,
    receiptStatus: row.receipt_status,
    receiptNote: row.receipt_note ?? null,
    receiptAnsweredAt: toIso(row.receipt_answered_at),
    evidence: (Array.isArray(row.receipt_evidence) ? row.receipt_evidence : []).map((ref) => ({
      reference: ref,
      url: publicMediaUrl(ref),
    })),
    displayConsent: row.display_consent === true,
    publicName: row.public_name ?? null,
    status: row.status,
    canceledAt: toIso(row.canceled_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** Apoio visto pelo Agente autor da demanda. */
function serializeAgentSupport(row) {
  return {
    ...serializeOwnSupport(row),
    supporter: {
      userId: row.user_id,
      name: row.user_name ?? null,
      category: row.supporter_category,
      profileType: row.profile_type ?? null,
      organizationId: row.organization_id ?? null,
    },
  };
}

/** Linha do histórico público de apoio (transparência, slide 21). */
function serializePublicSupport(row) {
  const consented = row.display_consent === true;
  return {
    id: row.id,
    modality: row.modality,
    supportType: row.support_type,
    description: row.description,
    supporterName: consented ? (row.public_name ?? row.user_name ?? null) : null,
    supporterCategory: row.supporter_category,
    amountCents: row.amount_public === true ? amountToCents(row.amount) : null,
    amountPublic: row.amount_public === true,
    receiptStatus: row.receipt_status,
    confirmedAt: row.receipt_status === 'confirmado' ? toIso(row.receipt_answered_at) : null,
    hasEvidence: Number(row.evidence_count ?? 0) > 0,
    occurredOn: toDate(row.occurred_on),
    createdAt: toIso(row.created_at),
  };
}

/** Histórico público de uma demanda, do mais recente para o mais antigo. */
async function publicHistory(db, demandId, { limit = 100 } = {}) {
  const { rows } = await db.query(
    `SELECT ${PUBLIC_SUPPORT_SQL} FROM supports s
      WHERE s.demand_id = $1 AND ${VISIBLE_SUPPORT}
      ORDER BY s.created_at DESC, s.id DESC LIMIT $2`,
    [demandId, limit],
  );
  return rows.map(serializePublicSupport);
}

/**
 * Totais do apoio: quantos apoios por modalidade, quantos confirmados pelo
 * Agente e a soma dos valores declarados públicos (total e já confirmados).
 */
async function supportTotals(db, demandId) {
  const { rows: [row] } = await db.query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE s.receipt_status = 'confirmado')::int AS confirmed,
            count(*) FILTER (WHERE s.receipt_status = 'declarado')::int AS declared,
            count(*) FILTER (WHERE s.receipt_status = 'contestado')::int AS contested,
            count(*) FILTER (WHERE s.supporter_category = 'poder_publico')::int AS government,
            COALESCE(SUM(s.amount) FILTER (WHERE s.amount_public), 0)::numeric AS public_amount,
            COALESCE(SUM(s.amount) FILTER (WHERE s.amount_public AND s.receipt_status = 'confirmado'), 0)::numeric
              AS confirmed_public_amount
       FROM supports s WHERE s.demand_id = $1 AND ${VISIBLE_SUPPORT}`,
    [demandId],
  );
  const { rows: byModality } = await db.query(
    `SELECT s.modality::text AS modality, count(*)::int AS count
       FROM supports s WHERE s.demand_id = $1 AND ${VISIBLE_SUPPORT} AND s.modality IS NOT NULL
      GROUP BY s.modality ORDER BY count DESC, modality`,
    [demandId],
  );
  return {
    total: row?.total ?? 0,
    confirmed: row?.confirmed ?? 0,
    declared: row?.declared ?? 0,
    contested: row?.contested ?? 0,
    government: row?.government ?? 0,
    publicAmountCents: amountToCents(row?.public_amount) ?? 0,
    confirmedPublicAmountCents: amountToCents(row?.confirmed_public_amount) ?? 0,
    byModality: byModality.map((m) => ({ modality: m.modality, count: m.count })),
  };
}

/** Apoio da conta, 404 quando é de outra conta. */
async function loadOwnSupport(db, demandId, supportId, userId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${SUPPORT_SQL} FROM supports s
      WHERE s.id = $1 AND s.demand_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [supportId, demandId],
  );
  const row = rows[0];
  if (!row || row.user_id !== userId) throw new HttpError(404, { error: 'Apoio não encontrado' });
  return row;
}

/** Apoio declarado na demanda do Agente; 404 quando não é desta demanda. */
async function loadDemandSupport(db, demandId, supportId, { forUpdate = false } = {}) {
  const { rows } = await db.query(
    `SELECT ${SUPPORT_SQL} FROM supports s
      WHERE s.id = $1 AND s.demand_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
    [supportId, demandId],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Apoio não encontrado' });
  return rows[0];
}

module.exports = {
  SUPPORT_SQL,
  PUBLIC_SUPPORT_SQL,
  VISIBLE_SUPPORT,
  amountToCents,
  centsToAmount,
  serializeOwnSupport,
  serializeAgentSupport,
  serializePublicSupport,
  publicHistory,
  supportTotals,
  loadOwnSupport,
  loadDemandSupport,
};
