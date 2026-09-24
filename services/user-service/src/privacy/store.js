// Solicitações do titular, exportação e anonimização no `user_db` (T24).
//
// O protocolo segue o formato do dm-gestao (`LGPD-AAAA-NNNNNN`), com a faixa
// 900000+ reservada ao portal (sequência `data_subject_request_number`), e o
// prazo é o mesmo: recebimento + 15 dias corridos.
//
// A exportação leva só o que é do titular. Onde há terceiro (o outro lado de
// uma conexão, um recado recebido), sai apenas o que o titular já vê e escreveu
// — nunca o texto nem o contato de outra pessoa.

const { RESPONSE_DEADLINE_DAYS, ANONYMOUS_NAME } = require('./constants');

const iso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

const REQUEST_COLUMNS = `id, protocol, subject_user_id, request_type, channel, description,
  received_at, due_at, status, fulfilled_at, export_object_key, export_sha256, export_bytes,
  export_expires_at, gestao_request_id, imported_at, response, responded_at, closed_by, closed_at,
  created_at, updated_at`;

/** Projeção que o titular vê (sem chave de objeto nem id interno da gestão). */
function serializeRequest(row) {
  return {
    id: row.id,
    protocol: row.protocol,
    type: row.request_type,
    status: row.status,
    description: row.description ?? null,
    receivedAt: iso(row.received_at),
    dueAt: iso(row.due_at),
    fulfilledAt: iso(row.fulfilled_at),
    response: row.response ?? null,
    respondedAt: iso(row.responded_at),
    closedAt: iso(row.closed_at),
    inGestaoQueue: Boolean(row.imported_at),
    export: row.export_object_key
      ? {
        sha256: row.export_sha256 ?? null,
        bytes: row.export_bytes == null ? null : Number(row.export_bytes),
        expiresAt: iso(row.export_expires_at),
        expired: row.export_expires_at ? new Date(row.export_expires_at).getTime() <= Date.now() : true,
      }
      : null,
  };
}

/**
 * Insere a solicitação já com o protocolo definitivo, numa única ida ao banco
 * (o número vem da sequência dentro da própria instrução).
 */
async function openRequest(db, { userId, type, description = null }) {
  const { rows } = await db.query(
    `WITH numero AS (
       SELECT nextval('data_subject_request_number') AS n, NOW() AS agora
     )
     INSERT INTO data_subject_requests
       (number, protocol, subject_user_id, request_type, description, received_at, due_at)
     SELECT numero.n,
            'LGPD-' || to_char(numero.agora, 'YYYY') || '-' || lpad(numero.n::text, 6, '0'),
            $1, $2, $3, numero.agora, numero.agora + ($4 || ' days')::interval
       FROM numero
     RETURNING ${REQUEST_COLUMNS}`,
    [userId, type, description, String(RESPONSE_DEADLINE_DAYS)],
  );
  return rows[0];
}

async function listRequests(db, userId, limit = 50) {
  const { rows } = await db.query(
    `SELECT ${REQUEST_COLUMNS} FROM data_subject_requests
      WHERE subject_user_id = $1 ORDER BY received_at DESC LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

async function findRequest(db, userId, id) {
  const { rows } = await db.query(
    `SELECT ${REQUEST_COLUMNS} FROM data_subject_requests
      WHERE id = $1 AND subject_user_id = $2`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** Marca o atendimento automático do portal e guarda o arquivo gerado. */
async function recordFulfillment(db, id, { objectKey = null, sha256 = null, bytes = null, expiresAt = null }) {
  const { rows } = await db.query(
    `UPDATE data_subject_requests
        SET fulfilled_at = NOW(),
            status = CASE WHEN status = 'recebida' THEN 'em_andamento' ELSE status END,
            export_object_key = COALESCE($2, export_object_key),
            export_sha256 = COALESCE($3, export_sha256),
            export_bytes = COALESCE($4, export_bytes),
            export_expires_at = COALESCE($5, export_expires_at)
      WHERE id = $1
      RETURNING ${REQUEST_COLUMNS}`,
    [id, objectKey, sha256, bytes, expiresAt],
  );
  return rows[0] ?? null;
}

// ── Exportação ─────────────────────────────────────────────────────────────

/** O que o `user_db` guarda desta conta. Só o titular; nada de terceiros. */
async function exportUserData(db, userId) {
  const q = async (text, params = [userId]) => (await db.query(text, params)).rows;

  const [perfil, instituicao, representante, perfilDeApoio, conexoes, recadosEscritos,
    depoimentosEscritos, mensagensDeConexao, arquivos, solicitacoes, anonimizacoes] = await Promise.all([
    q(`SELECT user_id, name, bio, avatar_url, cover_url, status, neighborhood, phone, website,
              city, state, role, profile_type, member_since, friend_count, created_at, updated_at,
              anonymized_at
         FROM profiles WHERE user_id = $1`),
    q(`SELECT o.id, o.institution_kind, o.org_name, o.legal_name, o.trade_name, o.cnpj,
              o.cnae_primary, o.cnae_primary_description, o.cnae_secondary, o.government_sphere,
              o.department, o.competence_areas, o.territory, o.cep, o.street, o.address_number,
              o.address_complement, o.district, o.municipality, o.uf, o.institutional_email,
              o.institutional_phone, o.website, o.validation_status, o.submitted_at,
              o.validation_reviewed_at, o.created_at
         FROM organizations o JOIN profiles p ON p.id = o.profile_id
        WHERE p.user_id = $1`),
    q(`SELECT id, organization_id, full_name, position, institutional_email, institutional_phone,
              proof_description, created_at
         FROM organization_representatives WHERE user_id = $1`),
    q(`SELECT user_id, nationwide, ufs, municipalities, territories, interest_categories,
              offered_resources, created_at, updated_at
         FROM partner_profiles WHERE user_id = $1`),
    // Conexão: as datas, o estado e a mensagem **escrita pelo titular**; o que
    // a outra parte escreveu não entra no arquivo.
    q(`SELECT id, type, status, post_id, post_title, demand_id, created_at, updated_at,
              CASE WHEN from_user_id = $1 THEN 'enviada' ELSE 'recebida' END AS direcao,
              CASE WHEN from_user_id = $1 THEN message END AS minha_mensagem,
              CASE WHEN from_user_id = $1 THEN outcome END AS meu_desfecho
         FROM connections WHERE from_user_id = $1 OR to_user_id = $1 ORDER BY created_at`),
    q(`SELECT id, target_user_id, content, created_at FROM scraps WHERE author_id = $1 ORDER BY created_at`),
    q(`SELECT id, target_user_id, content, created_at FROM testimonials WHERE author_id = $1 ORDER BY created_at`),
    // Conversa da conexão (T27): só o que o titular escreveu.
    q(`SELECT id, connection_id, body, created_at FROM connection_messages WHERE author_id = $1 ORDER BY created_at`),
    q(`SELECT id, purpose, status, content_type, size_bytes, original_name, organization_id,
              created_at, confirmed_at
         FROM uploads WHERE owner_id = $1 ORDER BY created_at`),
    q(`SELECT protocol, request_type, status, received_at, due_at, responded_at
         FROM data_subject_requests WHERE subject_user_id = $1 ORDER BY received_at`),
    q(`SELECT protocol, scope, summary, executed_at
         FROM account_anonymizations WHERE user_id = $1 ORDER BY executed_at`),
  ]);

  return {
    perfil: perfil[0] ?? null,
    cadastroInstitucional: instituicao[0] ?? null,
    representanteInstitucional: representante,
    perfilDeApoio: perfilDeApoio[0] ?? null,
    conexoes,
    recadosEscritos,
    depoimentosEscritos,
    mensagensDeConexao,
    arquivos,
    solicitacoesLgpd: solicitacoes,
    anonimizacoes,
  };
}

// ── Anonimização ───────────────────────────────────────────────────────────

/**
 * Executa no `user_db` a regra de retenção da eliminação (constants.js,
 * `RETENTION_RULES`). Idempotente: rodar de novo não muda nada.
 */
async function anonymizeUserData(db, userId, { requestId = null, protocol = null } = {}) {
  const perfil = await db.query(
    `UPDATE profiles
        SET name = $2, bio = NULL, avatar_url = NULL, cover_url = NULL, status = NULL,
            neighborhood = NULL, phone = NULL, website = NULL, city = NULL, state = NULL,
            anonymized_at = COALESCE(anonymized_at, NOW()), updated_at = NOW()
      WHERE user_id = $1 AND anonymized_at IS NULL
      RETURNING id`,
    [userId, ANONYMOUS_NAME],
  );

  const perfilDeApoio = await db.query('DELETE FROM partner_profiles WHERE user_id = $1 RETURNING user_id', [userId]);
  const recados = await db.query('DELETE FROM scraps WHERE author_id = $1 RETURNING id', [userId]);
  const depoimentos = await db.query('DELETE FROM testimonials WHERE author_id = $1 RETURNING id', [userId]);

  const conexoes = await db.query(
    `UPDATE connections SET message = $2, updated_at = NOW()
      WHERE from_user_id = $1 AND message IS DISTINCT FROM $2
      RETURNING id`,
    [userId, '[removido a pedido do titular]'],
  );
  // Conversa da conexão (T27): as mensagens escritas pelo titular perdem o
  // corpo; a linha fica, porque a conversa também é registro da outra parte.
  const mensagens = await db.query(
    `UPDATE connection_messages SET body = $2
      WHERE author_id = $1 AND body IS DISTINCT FROM $2
      RETURNING id`,
    [userId, '[removido a pedido do titular]'],
  );

  // Representante: os contatos saem enquanto o cadastro não foi enviado nem
  // validado. Cadastro em análise, validado ou revogado guarda a prova de quem
  // representou a instituição (art. 16, I) — a troca é feita pela correção.
  const representante = await db.query(
    `UPDATE organization_representatives r
        SET full_name = $2, position = $2, institutional_email = $3,
            institutional_phone = NULL, updated_at = NOW()
       FROM organizations o
      WHERE r.user_id = $1 AND o.id = r.organization_id
        AND o.validation_status = 'pendente' AND o.submitted_at IS NULL
        AND r.full_name IS DISTINCT FROM $2
      RETURNING r.id`,
    [userId, ANONYMOUS_NAME, `anonimizado-${userId}@anonimizado.invalid`.slice(0, 255)],
  );

  const count = (r) => r.rowCount ?? r.rows.length;
  const summary = {
    perfil: count(perfil),
    perfilDeApoioRemovido: count(perfilDeApoio),
    recadosRemovidos: count(recados),
    depoimentosRemovidos: count(depoimentos),
    conexoesComMensagemRemovida: count(conexoes),
    mensagensDeConexaoRemovidas: count(mensagens),
    representanteAnonimizado: count(representante),
  };

  await recordAnonymization(db, userId, { requestId, protocol, scope: 'perfil', summary });

  return summary;
}

/** Registra na trilha o que os outros serviços anonimizaram. */
async function recordAnonymization(db, userId, { requestId = null, protocol = null, scope, summary }) {
  await db.query(
    `INSERT INTO account_anonymizations (user_id, request_id, protocol, scope, summary)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [userId, requestId, protocol, scope, JSON.stringify(summary ?? {})],
  );
}

async function isAnonymized(db, userId) {
  const { rows } = await db.query('SELECT anonymized_at FROM profiles WHERE user_id = $1', [userId]);
  return Boolean(rows[0]?.anonymized_at);
}

module.exports = {
  serializeRequest,
  openRequest,
  listRequests,
  findRequest,
  recordFulfillment,
  exportUserData,
  anonymizeUserData,
  recordAnonymization,
  isAnonymized,
};
