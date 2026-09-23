// Atuação territorial pública do perfil ("Meu sinal"; identidade visual,
// "O que muda na experiência", item 4: histórico de participação e resultados
// acompanhados no lugar de métricas sociais).
//
// Fonte: Apresentação Institucional, slide 21 (transparência: resultados e
// histórico de apoio) e slides 7–13 (o que cada categoria faz no território).
//
// Público, somente leitura:
//   GET /profiles/:userId/activity
//     demands           demandas do perfil da publicação em diante (fora
//                       `arquivada`), com status e território; mesma projeção
//                       pública da lista de demandas, sem endereço fino
//     supportsReceived  totais de apoio às demandas do perfil (os mesmos que o
//                       histórico público de cada demanda já mostra)
//     supportsGiven     apoios realizados pelo perfil, **só** os que o apoiador
//                       consentiu exibir com o nome (display_consent); valor só
//                       quando ele o tornou público
//
// Nada daqui é agregação pesada: três leituras por índice
// (`idx_demands_author`, `idx_supports_demand_user`) com limite.

const express = require('express');
const { isUuid } = require('../security');
const { PUBLIC_STATUSES } = require('../demand/constants');
const { VISIBLE_SUPPORT, amountToCents } = require('../support/store');

const LIST_LIMIT = 50;

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

function serializeDemand(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    status: row.status,
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    territory: row.territory ?? null,
    publishedAt: toIso(row.published_at),
  };
}

function serializeGiven(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    demandTitle: row.demand_title,
    demandStatus: row.demand_status,
    district: row.district ?? null,
    municipality: row.municipality ?? null,
    uf: row.uf ?? null,
    modality: row.modality ?? null,
    receiptStatus: row.receipt_status,
    amountCents: row.amount_public === true ? amountToCents(row.amount) : null,
    createdAt: toIso(row.created_at),
  };
}

module.exports = ({ pool }) => {
  const router = express.Router();

  router.get('/profiles/:userId/activity', async (req, res) => {
    const { userId } = req.params;
    if (!isUuid(userId)) return res.status(404).json({ error: 'Perfil não encontrado' });
    try {
      const [demands, received, byModality, given] = await Promise.all([
        pool.query(
          `SELECT d.id, d.title, d.category::text AS category, d.status::text AS status,
                  d.district, d.municipality, d.uf, d.territory, d.published_at
             FROM demands d
            WHERE d.author_id = $1 AND d.status = ANY($2::demand_status[])
            ORDER BY d.published_at DESC NULLS LAST, d.id DESC
            LIMIT $3`,
          [userId, PUBLIC_STATUSES, LIST_LIMIT + 1],
        ),
        pool.query(
          `SELECT count(*)::int AS total,
                  count(*) FILTER (WHERE s.receipt_status = 'confirmado')::int AS confirmed
             FROM supports s JOIN demands d ON d.id = s.demand_id
            WHERE d.author_id = $1 AND d.status = ANY($2::demand_status[]) AND ${VISIBLE_SUPPORT}`,
          [userId, PUBLIC_STATUSES],
        ),
        pool.query(
          `SELECT s.modality::text AS modality, count(*)::int AS count
             FROM supports s JOIN demands d ON d.id = s.demand_id
            WHERE d.author_id = $1 AND d.status = ANY($2::demand_status[]) AND ${VISIBLE_SUPPORT}
              AND s.modality IS NOT NULL
            GROUP BY s.modality ORDER BY count DESC, modality`,
          [userId, PUBLIC_STATUSES],
        ),
        pool.query(
          `SELECT s.id, s.demand_id, s.modality::text AS modality,
                  s.receipt_status::text AS receipt_status, s.amount, s.amount_public, s.created_at,
                  d.title AS demand_title, d.status::text AS demand_status,
                  d.district, d.municipality, d.uf
             FROM supports s JOIN demands d ON d.id = s.demand_id
            WHERE s.user_id = $1 AND s.display_consent = true AND ${VISIBLE_SUPPORT}
              AND d.status = ANY($2::demand_status[])
            ORDER BY s.created_at DESC, s.id DESC
            LIMIT $3`,
          [userId, PUBLIC_STATUSES, LIST_LIMIT + 1],
        ),
      ]);
      const totals = received.rows[0] ?? {};
      return res.json({
        userId,
        demands: demands.rows.slice(0, LIST_LIMIT).map(serializeDemand),
        demandsTruncated: demands.rows.length > LIST_LIMIT,
        supportsReceived: {
          total: totals.total ?? 0,
          confirmed: totals.confirmed ?? 0,
          byModality: byModality.rows.map((row) => ({ modality: row.modality, count: row.count })),
        },
        supportsGiven: given.rows.slice(0, LIST_LIMIT).map(serializeGiven),
        supportsGivenTruncated: given.rows.length > LIST_LIMIT,
      });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};
