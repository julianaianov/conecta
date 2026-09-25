// Acesso ao banco das respostas à análise (T-05-05, migração post 030):
// projeções (quem pediu e Agente autor), gravação da solicitação, do espelho
// da resposta institucional e da resposta do Agente, e avisos pela central
// de notificações (T-05-16). As regras de estado são do trigger
// `demand_analysis_requests_guard`.

const { HttpError } = require('../demand/store');
const { notify } = require('../notifications');
const { REQUEST_KIND_LABELS } = require('./index');

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

const REQUEST_SQL = `
  r.id, r.demand_id, r.process_id, r.institutional_response_id, r.requester_user_id, r.requester_name,
  r.requester_category, r.requester_profile_type, r.requester_organization_id, r.requester_organization_name,
  r.kind::text AS kind, r.body, r.requested_document_types::text[] AS requested_document_types,
  r.meeting_proposed_at, r.meeting_mode, r.status::text AS status, r.answer_body, r.answer_document_ids,
  r.answered_at, r.created_at, p.protocol AS process_protocol`;

const REQUEST_FROM = 'demand_analysis_requests r LEFT JOIN connection_processes p ON p.id = r.process_id';

/** Documentos citados na resposta (tipo e título; da demanda ou do processo). */
async function answerDocuments(db, rows) {
  const ids = [...new Set(rows.flatMap((r) => r.answer_document_ids ?? []))];
  if (!ids.length) return new Map();
  const { rows: docs } = await db.query(
    `SELECT id, document_type::text AS document_type, title FROM demand_documents WHERE id = ANY($1::uuid[])`,
    [ids],
  );
  const found = new Map(docs.map((d) => [d.id, { id: d.id, documentType: d.document_type, title: d.title, source: 'demanda' }]));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    const { rows: [reg] } = await db.query("SELECT to_regclass('public.connection_process_documents') IS NOT NULL AS ok");
    if (reg?.ok) {
      const { rows: processDocs } = await db.query(
        `SELECT id, document_type::text AS document_type, name AS title FROM connection_process_documents WHERE id = ANY($1::uuid[])`,
        [missing],
      );
      for (const d of processDocs) found.set(d.id, { id: d.id, documentType: d.document_type, title: d.title, source: 'processo' });
    }
  }
  return found;
}

/** Solicitação na visão de quem pediu (`requester`) ou do Agente autor (`agent`). */
function serializeRequest(row, docs = new Map(), { view = 'requester' } = {}) {
  const base = {
    id: row.id,
    demandId: row.demand_id,
    processId: row.process_id ?? null,
    processProtocol: row.process_protocol ?? null,
    fromInstitutionalResponse: Boolean(row.institutional_response_id),
    requesterCategory: row.requester_category,
    kind: row.kind,
    kindLabel: REQUEST_KIND_LABELS[row.kind] ?? row.kind,
    body: row.body,
    requestedDocumentTypes: Array.isArray(row.requested_document_types) ? row.requested_document_types : [],
    meetingProposedAt: toIso(row.meeting_proposed_at),
    meetingMode: row.meeting_mode ?? null,
    status: row.status,
    answerBody: row.answer_body ?? null,
    answerDocuments: (row.answer_document_ids ?? []).map((id) => docs.get(id) ?? { id, documentType: null, title: null, source: null }),
    answeredAt: toIso(row.answered_at),
    createdAt: toIso(row.created_at),
  };
  if (view !== 'agent') return base;
  // O Agente sabe quem pediu (conta ou órgão); o público nunca.
  return {
    ...base,
    requesterName: row.requester_organization_name || row.requester_name || null,
    requesterProfileType: row.requester_profile_type ?? null,
  };
}

async function listRequests(db, where, params, view) {
  const { rows } = await db.query(
    `SELECT ${REQUEST_SQL} FROM ${REQUEST_FROM} WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT 200`,
    params,
  );
  const docs = await answerDocuments(db, rows);
  return rows.map((row) => serializeRequest(row, docs, { view }));
}

/** Processo em aberto da parte com a demanda (conta do Parceiro ou órgão). */
async function openProcessFor(db, demandId, { userId, organizationId }) {
  const { rows } = await db.query(
    `SELECT id, protocol, status::text AS status, previous_status::text AS previous_status, party_kind::text AS party_kind
       FROM connection_processes
      WHERE demand_id = $1 AND closed_at IS NULL
        AND (($3::uuid IS NOT NULL AND party_organization_id = $3::uuid)
             OR ($3::uuid IS NULL AND party_kind <> 'poder_publico' AND party_user_id = $2))
      LIMIT 1`,
    [demandId, userId, organizationId ?? null],
  );
  return rows[0] ?? null;
}

/** Grava a solicitação (a transação é de quem chama). Devolve o id. */
async function insertRequest(db, { demandId, processId, requester, value, institutionalResponseId = null }) {
  const { rows } = await db.query(
    `INSERT INTO demand_analysis_requests
       (demand_id, process_id, institutional_response_id, requester_user_id, requester_name, requester_category,
        requester_profile_type, requester_organization_id, requester_organization_name, kind, body,
        requested_document_types, meeting_proposed_at, meeting_mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::analysis_request_kind, $11, $12::demand_document_type[], $13, $14)
     RETURNING id`,
    [
      demandId, processId ?? null, institutionalResponseId, requester.userId, requester.name ?? null, requester.category,
      requester.profileType ?? null, requester.organizationId ?? null, requester.organizationName ?? null,
      value.kind, value.body, value.requestedDocumentTypes ?? [], value.meetingProposedAt ?? null, value.meetingMode ?? null,
    ],
  );
  return rows[0].id;
}

/** Aviso ao Agente autor: "Solicitação de análise" (§08) ou recusa. */
async function notifyAuthor(db, { demand, kind, requesterCategory, processId }) {
  const who = requesterCategory === 'poder_publico' ? 'o Poder Público' : 'um Parceiro';
  return notify(db, {
    userId: demand.author_id,
    kind: kind === 'recusa' ? 'atualizacao_de_processo' : 'solicitacao_de_analise',
    title: kind === 'recusa' ? `Demanda recusada por ${who}, com o motivo` : `${REQUEST_KIND_LABELS[kind]} de ${who}`,
    body: demand.title ? `«${demand.title}»` : null,
    href: `/minhas-demandas#demanda-${demand.id}`,
    demandId: demand.id,
    processId: processId ?? undefined,
  });
}

/** Aviso a quem pediu: a solicitação foi respondida. */
async function notifyRequester(db, row, demand) {
  const message = {
    kind: 'atualizacao_de_processo',
    title: `${REQUEST_KIND_LABELS[row.kind] ?? 'Solicitação'} respondida`,
    body: demand.title ? `«${demand.title}»` : null,
    demandId: row.demand_id,
    processId: row.process_id ?? undefined,
  };
  if (row.requester_category === 'poder_publico' && row.requester_organization_id) {
    return notify(db, { ...message, organizationId: row.requester_organization_id, href: `/governo/demandas/${row.demand_id}` });
  }
  return notify(db, { ...message, userId: row.requester_user_id, href: `/demandas/${row.demand_id}` });
}

/** Responde uma solicitação em aberto da demanda. 404/409/422 conforme o caso. */
async function answerRequest(db, { demandId, requestId, userId, value }) {
  const { rows } = await db.query(
    `SELECT ${REQUEST_SQL} FROM ${REQUEST_FROM} WHERE r.id = $1 AND r.demand_id = $2 FOR UPDATE OF r`,
    [requestId, demandId],
  );
  const row = rows[0];
  if (!row) throw new HttpError(404, { error: 'Solicitação não encontrada' });
  if (row.status !== 'aberta') {
    throw new HttpError(409, { error: 'Esta solicitação já foi respondida ou encerrada', code: 'request_closed' });
  }
  if (value.documentIds.length) {
    const docs = await answerDocuments(db, [{ answer_document_ids: value.documentIds }]);
    const { rows: own } = await db.query(
      'SELECT id FROM demand_documents WHERE demand_id = $1 AND id = ANY($2::uuid[])', [demandId, value.documentIds],
    );
    const ownIds = new Set(own.map((d) => d.id));
    const invalid = value.documentIds.filter((id) => !ownIds.has(id) && docs.get(id)?.source !== 'processo');
    if (invalid.length) {
      throw new HttpError(422, {
        error: 'Anexe documentos desta demanda ou do processo dela', code: 'validation_failed',
        fields: { documentIds: 'Documento não pertence à demanda' },
      });
    }
  }
  await db.query(
    `UPDATE demand_analysis_requests
        SET status = 'respondida', answer_body = $2, answer_document_ids = $3::uuid[], answered_by = $4, answered_at = NOW()
      WHERE id = $1`,
    [row.id, value.body, value.documentIds, userId],
  );
  return row;
}

/** Erros do trigger da migração 030 → HTTP; `null` quando não é deste domínio. */
function mapAnalysisError(err) {
  if (err instanceof HttpError) return err;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514') {
    if (/só com a demanda aberta/.test(message)) {
      return new HttpError(409, { error: 'A demanda não recebe solicitações neste estado', code: 'demand_not_open' });
    }
    if (/autor não solicita/.test(message)) {
      return new HttpError(403, { error: 'O autor não solicita análise da própria demanda', code: 'own_demand' });
    }
    if (/já respondida ou encerrada/.test(message)) {
      return new HttpError(409, { error: 'Esta solicitação já foi respondida ou encerrada', code: 'request_closed' });
    }
    if (/documento da resposta/.test(message)) {
      return new HttpError(422, { error: message, code: 'validation_failed', fields: { documentIds: message } });
    }
  }
  if (err?.code === '23505' && /one_refusal/.test(err?.constraint ?? message)) {
    return new HttpError(409, { error: 'Você já recusou esta demanda', code: 'refusal_exists' });
  }
  return null;
}

module.exports = {
  REQUEST_SQL,
  REQUEST_FROM,
  serializeRequest,
  listRequests,
  answerDocuments,
  openProcessFor,
  insertRequest,
  notifyAuthor,
  notifyRequester,
  answerRequest,
  mapAnalysisError,
};
