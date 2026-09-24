// Direitos do titular no `post_db` (T24): o que a exportação leva e o que a
// anonimização faz. Consultas com projeção explícita de colunas e **só do
// próprio titular** — nada de terceiros entra no arquivo (comentário de outra
// conta na publicação dele, mensagem do outro lado de uma conexão, apoio de
// outra pessoa à demanda dele).
//
// Regra da eliminação, por tipo de dado, em dm-docs/gestao/05-lgpd.md §7.

/** Rótulo que substitui o nome nas publicações e comentários do feed. */
const ANONYMOUS_NAME = 'Conta removida';

const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

/**
 * Tudo o que o `post_db` guarda desta conta, em blocos por assunto.
 * Cada bloco é uma consulta com colunas explícitas.
 */
async function exportUserData(db, userId) {
  const q = async (text, params = [userId]) => (await db.query(text, params)).rows;

  const [
    publicacoes, comentarios, reacoes, demandas, apoios, interesses,
    compartilhamentos, denuncias, consentimentoRanking, selos, arquivos, pautas,
  ] = await Promise.all([
    q(`SELECT id, type, title, description, status, visibility, neighborhood, city, state,
              zipcode, latitude, longitude, tags, images, videos, demand_id, created_at
         FROM posts WHERE author_id = $1 ORDER BY created_at`),
    q(`SELECT id, post_id, content, created_at
         FROM comments WHERE author_id = $1 ORDER BY created_at`),
    q(`SELECT post_id, created_at FROM reactions WHERE user_id = $1 ORDER BY created_at`),
    q(`SELECT id, category, title, description, objective, justification, priority, status,
              review_state, territory, district, municipality, uf, cep, street, address_number,
              address_complement, latitude, longitude, beneficiaries_estimate, beneficiaries_profile,
              has_physical_execution, budget_amount_cents, agent_fee_cents,
              platform_fee_cents, total_amount_cents, created_at, submitted_at, published_at
         FROM demands WHERE author_id = $1 ORDER BY created_at`),
    q(`SELECT id, post_id, demand_id, modality, type, description, message, amount,
              amount_public, display_consent, public_name, status, receipt_status, receipt_note,
              occurred_on, canceled_at, created_at
         FROM supports WHERE user_id = $1 ORDER BY created_at`),
    q(`SELECT id, demand_id, kind, offer_types, message, connection_id, connection_status,
              withdrawn_at, created_at
         FROM demand_interests WHERE user_id = $1 ORDER BY created_at`),
    q(`SELECT target_kind, target_id, channel, shared_on, created_at
         FROM content_shares WHERE user_id = $1 ORDER BY created_at`),
    // Só o que o denunciante já vê em `GET /reports/mine`: nunca o desfecho.
    q(`SELECT id, target_kind, target_id, reason, description, created_at
         FROM content_reports WHERE reporter_id = $1 ORDER BY created_at`),
    q('SELECT consent, updated_at FROM ranking_consents WHERE user_id = $1'),
    q('SELECT badge, awarded_at, evidence_count FROM profile_badges WHERE user_id = $1 ORDER BY awarded_at'),
    q(`SELECT id, purpose, status, content_type, size_bytes, original_name, demand_id, created_at, confirmed_at
         FROM uploads WHERE owner_id = $1 ORDER BY created_at`),
    // Pautas da Comunicação (T28).
    q(`SELECT id, target_kind, target_id, target_title, angle, status, outlet_name, published_url,
              published_on, created_at, updated_at
         FROM media_agenda_items WHERE user_id = $1 ORDER BY created_at`),
  ]);

  return {
    publicacoes,
    comentarios,
    reacoes,
    demandas,
    apoios,
    interesses,
    compartilhamentos,
    denunciasFeitas: denuncias,
    consentimentoDeRanking: consentimentoRanking[0] ?? { consent: false, updated_at: null },
    selosDeImpacto: selos,
    arquivos,
    pautas,
  };
}

/** A conta já foi anonimizada no `post_db`? */
async function anonymizationRecord(db, userId) {
  const { rows } = await db.query(
    'SELECT user_id, protocol, summary, anonymized_at FROM anonymized_users WHERE user_id = $1',
    [userId],
  );
  if (!rows.length) return null;
  return {
    anonymizedAt: iso(rows[0].anonymized_at),
    protocol: rows[0].protocol ?? null,
    summary: rows[0].summary ?? {},
  };
}

/**
 * Anonimiza o que o `post_db` pode anonimizar sem tocar a trilha imutável:
 *   - retrato de identidade das publicações e comentários do feed;
 *   - consentimentos opcionais de exibição do nome (ranking e apoios).
 * Demandas, dossiês, evidências, prestação de contas, interesses,
 * compartilhamentos, denúncias e a linha do tempo **permanecem** — registro de
 * interesse público, prestação de contas e auditoria (LGPD art. 16, I e II;
 * art. 7º, VI). Idempotente.
 */
async function anonymizeUser(db, userId, { protocol = null } = {}) {
  const existing = await anonymizationRecord(db, userId);
  if (existing) return { ...existing, alreadyAnonymized: true };

  const posts = await db.query(
    `UPDATE posts SET author_name = $2, author_avatar = NULL, updated_at = NOW()
      WHERE author_id = $1 AND author_name IS DISTINCT FROM $2
      RETURNING id`,
    [userId, ANONYMOUS_NAME],
  );
  const comments = await db.query(
    `UPDATE comments SET author_name = $2
      WHERE author_id = $1 AND author_name IS DISTINCT FROM $2
      RETURNING id`,
    [userId, ANONYMOUS_NAME],
  );
  const supports = await db.query(
    `UPDATE supports SET display_consent = false, updated_at = NOW()
      WHERE user_id = $1 AND display_consent = true
      RETURNING id`,
    [userId],
  );
  const ranking = await db.query(
    `INSERT INTO ranking_consents (user_id, consent) VALUES ($1, false)
     ON CONFLICT (user_id) DO UPDATE SET consent = false
     RETURNING user_id`,
    [userId],
  );
  // Pautas da Comunicação (T28): o retrato do nome sai; a pauta fica, porque é
  // registro de divulgação (a cobertura pública nunca mostrou o nome).
  const agenda = await db.query(
    `UPDATE media_agenda_items SET user_name = $2
      WHERE user_id = $1 AND user_name IS DISTINCT FROM $2
      RETURNING id`,
    [userId, ANONYMOUS_NAME],
  );

  const summary = {
    publicacoes: posts.rowCount ?? posts.rows.length,
    comentarios: comments.rowCount ?? comments.rows.length,
    pautas: agenda.rowCount ?? agenda.rows.length,
    apoiosComExibicaoRevogada: supports.rowCount ?? supports.rows.length,
    consentimentoDeRankingRevogado: (ranking.rowCount ?? ranking.rows.length) > 0,
  };

  const { rows } = await db.query(
    `INSERT INTO anonymized_users (user_id, protocol, summary) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id) DO NOTHING
     RETURNING anonymized_at`,
    [userId, protocol, JSON.stringify(summary)],
  );

  return {
    anonymizedAt: iso(rows[0]?.anonymized_at) ?? new Date().toISOString(),
    protocol,
    summary,
    alreadyAnonymized: false,
  };
}

module.exports = { ANONYMOUS_NAME, exportUserData, anonymizationRecord, anonymizeUser };
