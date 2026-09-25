// Acesso ao banco do Processo de Conexão (T-05-01, migração post 026):
// projeções (Agente autor e parte conectada; pública), quem está vendo,
// formalização a partir do interesse aceito, da oferta do órgão ou do
// acompanhamento, e tradução dos erros do trigger para HTTP. As regras de
// estado e imutabilidade são do trigger `connection_processes_guard`.

const { HttpError, mapDbError, transitionDemand } = require('../demand/store');
const { CONNECTABLE_STATUSES } = require('../interest/constants');
const { effectiveRole } = require('../delegation');
const {
  PROFILE_PARTY_KIND, INTEREST_OFFER_CONTRIBUTION, SUPPORT_TYPE_CONTRIBUTION, INITIAL_STATUSES,
  PROCESS_EVENT_TYPES, PROTOCOL_RE,
} = require('./constants');
const { statusesFor } = require('./state-machine');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);
const unique = (list) => [...new Set(list)];

const isProcessRef = (ref) => typeof ref === 'string' && (UUID_RE.test(ref) || PROTOCOL_RE.test(ref));

const PROCESS_SQL = `
  p.id, p.protocol, p.demand_id, p.sequence_in_demand, p.party_kind::text AS party_kind, p.party_user_id,
  p.party_organization_id, p.party_name, p.party_profile_type, p.fee_applies, p.origin_kind::text AS origin_kind,
  p.origin_interest_id, p.origin_track_id, p.origin_offer_id, p.origin_connection_id,
  p.contribution_kinds::text[] AS contribution_kinds, p.contribution_description,
  p.contribution_amount_cents::text AS contribution_amount_cents,
  p.agent_fee_cents::text AS agent_fee_cents, p.platform_fee_cents::text AS platform_fee_cents,
  p.total_with_fees_cents::text AS total_with_fees_cents,
  p.status::text AS status, p.previous_status::text AS previous_status, p.status_note, p.status_changed_by_kind,
  p.status_changed_at, p.responsible_organization_name, p.responsible_organ, p.responsible_department,
  p.responsible_sector, p.responsible_name, p.responsible_role, p.responsible_since,
  to_char(p.responsible_due_on, 'YYYY-MM-DD') AS responsible_due_on, p.formalized_by_kind, p.formalized_at,
  p.closed_at, p.created_at, p.updated_at,
  d.title AS demand_title, d.status::text AS demand_status, d.author_id AS demand_author_id`;

const PROCESS_FROM = 'connection_processes p JOIN demands d ON d.id = p.demand_id';

const amount = (value) => (value === null || value === undefined ? null : Number(value));

/**
 * Taxas do processo (T-05-06, decisão 14; colunas geradas da migração 040):
 * 4% + 6% sobre a contribuição financeira só quando a parte não é o Poder
 * Público. `null` sem contribuição financeira.
 */
function serializeFees(row) {
  const contributionAmountCents = amount(row.contribution_amount_cents);
  if (contributionAmountCents === null) return null;
  return {
    applies: row.fee_applies === true,
    contributionAmountCents,
    agentFeeCents: amount(row.agent_fee_cents) ?? 0,
    platformFeeCents: amount(row.platform_fee_cents) ?? 0,
    totalWithFeesCents: amount(row.total_with_fees_cents) ?? contributionAmountCents,
  };
}

/** Resumo comum (listas). */
function serializeSummary(row) {
  return {
    id: row.id,
    protocol: row.protocol,
    demandId: row.demand_id,
    demandTitle: row.demand_title ?? null,
    sequenceInDemand: row.sequence_in_demand,
    partyKind: row.party_kind,
    partyName: row.party_name,
    status: row.status,
    statusChangedAt: toIso(row.status_changed_at),
    responsibleDueOn: row.responsible_due_on ?? null,
    formalizedAt: toIso(row.formalized_at),
    closedAt: toIso(row.closed_at),
  };
}

/** Visão do Agente autor e da parte conectada. `viewerRole`: `agente` | `parte`. */
function serializeProcess(row, { viewerRole = null } = {}) {
  const process = {
    ...serializeSummary(row),
    demand: { id: row.demand_id, title: row.demand_title ?? null, status: row.demand_status ?? null },
    partyUserId: row.party_kind === 'poder_publico' ? null : row.party_user_id ?? null,
    partyOrganizationId: row.party_organization_id ?? null,
    partyProfileType: row.party_profile_type ?? null,
    feeApplies: row.fee_applies === true,
    originKind: row.origin_kind,
    originInterestId: row.origin_interest_id ?? null,
    originTrackId: row.origin_track_id ?? null,
    originOfferId: row.origin_offer_id ?? null,
    originConnectionId: row.origin_connection_id ?? null,
    contributionKinds: Array.isArray(row.contribution_kinds) ? row.contribution_kinds : [],
    contributionDescription: row.contribution_description ?? null,
    contributionAmountCents: amount(row.contribution_amount_cents),
    fees: serializeFees(row),
    previousStatus: row.previous_status ?? null,
    statusNote: row.status_note ?? null,
    statusChangedByKind: row.status_changed_by_kind ?? null,
    responsible: {
      organizationName: row.responsible_organization_name ?? null,
      organ: row.responsible_organ ?? null,
      department: row.responsible_department ?? null,
      sector: row.responsible_sector ?? null,
      name: row.responsible_name ?? null,
      role: row.responsible_role ?? null,
      since: toIso(row.responsible_since),
      dueOn: row.responsible_due_on ?? null,
    },
    formalizedByKind: row.formalized_by_kind,
    updatedAt: toIso(row.updated_at),
    viewerRole,
  };
  process.availableStatuses = viewerRole && !row.closed_at
    ? statusesFor(viewerRole, { status: row.status, previousStatus: row.previous_status, partyKind: row.party_kind })
    : [];
  return process;
}

/** Visão pública (§31–§33): protocolo, tipo de parte, contribuição e status; nunca nome de pessoa. */
function serializePublicProcess(row) {
  return {
    id: row.id,
    protocol: row.protocol,
    demandId: row.demand_id,
    sequenceInDemand: row.sequence_in_demand,
    partyKind: row.party_kind,
    // O órgão público é identificado (como no acompanhamento institucional);
    // Parceiros aparecem só pelo tipo.
    organizationName: row.party_kind === 'poder_publico' ? row.party_name : null,
    contributionKinds: Array.isArray(row.contribution_kinds) ? row.contribution_kinds : [],
    // Contribuição financeira e, com Parceiros/Empresas, "R$ X + 4% + 6% = R$ Y"
    // (decisão 14); com o Poder Público, só a contribuição.
    feeApplies: row.fee_applies === true,
    fees: serializeFees(row),
    status: row.status,
    statusChangedAt: toIso(row.status_changed_at),
    formalizedAt: toIso(row.formalized_at),
    closedAt: toIso(row.closed_at),
  };
}

/** Processo por id ou protocolo (com a demanda). `null` se não existe. */
async function findProcess(db, ref, { forUpdate = false } = {}) {
  if (!isProcessRef(ref)) return null;
  const column = UUID_RE.test(ref) ? 'p.id' : 'p.protocol';
  const { rows } = await db.query(
    `SELECT ${PROCESS_SQL} FROM ${PROCESS_FROM} WHERE ${column} = $1${forUpdate ? ' FOR UPDATE OF p' : ''}`,
    [ref],
  );
  return rows[0] ?? null;
}

/**
 * Órgão do Poder Público em nome do qual a conta atua (cadastro próprio ou
 * delegação T29), ou `null`. Lança HttpError 503 quando a consulta falha.
 */
async function governmentOrganizationOf(req, institutionStatus) {
  if (req._processGovernmentOrg !== undefined) return req._processGovernmentOrg;
  let organizationId = null;
  if (typeof institutionStatus === 'function') {
    let access;
    try {
      access = await institutionStatus(req);
    } catch (err) {
      console.error(`[processes] ${err.message}`);
      throw new HttpError(503, { error: 'Não foi possível confirmar a instituição', code: 'institution_unavailable' });
    }
    if (effectiveRole(req.user, access) === 'government' && access?.kind === 'poder_publico'
        && access?.status === 'validada' && access?.canActInstitutionally === true
        && typeof access.organizationId === 'string') {
      organizationId = access.organizationId;
    }
  }
  req._processGovernmentOrg = organizationId;
  return organizationId;
}

const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/** Papel de quem vê: `agente` (autor da demanda), `parte` (conta ou órgão conectado) ou `null`. */
async function viewerRoleFor(req, row, institutionStatus) {
  const userId = req.user?.userId;
  if (sameId(row.demand_author_id, userId)) return 'agente';
  if (row.party_kind !== 'poder_publico') return sameId(row.party_user_id, userId) ? 'parte' : null;
  const organizationId = await governmentOrganizationOf(req, institutionStatus);
  return sameId(row.party_organization_id, organizationId) ? 'parte' : null;
}

/** Processo visível para quem pede (404 para terceiros, sem revelar a existência). */
async function loadVisibleProcess(db, req, ref, institutionStatus, { forUpdate = false } = {}) {
  const row = await findProcess(db, ref, { forUpdate });
  const role = row ? await viewerRoleFor(req, row, institutionStatus) : null;
  if (!row || !role) throw new HttpError(404, { error: 'Processo não encontrado' });
  return { row, role };
}

/** Linha do tempo do processo (§35). `full`: com eventos privados e nota, para as partes. */
async function processTimeline(db, processId, { full = false } = {}) {
  const { rows } = await db.query(
    `SELECT id, event_type, actor_type, note, is_public, created_at, payload->'public' AS details
       FROM demand_events
      WHERE process_id = $1${full ? '' : ' AND is_public'}
      ORDER BY created_at, id`,
    [processId],
  );
  return rows.map((e) => ({
    id: e.id,
    type: e.event_type,
    ...(full ? { actorType: e.actor_type, note: e.note ?? null, isPublic: e.is_public } : {}),
    createdAt: toIso(e.created_at),
    ...(e.details && typeof e.details === 'object' ? { details: e.details } : {}),
  }));
}

// ── Formalização ────────────────────────────────────────────────────────────

/** Parte e contribuição a partir do interesse de apoio aceito (T15). */
function fromInterest(interest) {
  const isGovernment = interest.user_category === 'poder_publico';
  if (isGovernment && !interest.organization_id) return null;
  return {
    party: {
      kind: isGovernment ? 'poder_publico' : PROFILE_PARTY_KIND[interest.profile_type] ?? 'parceiro_outro',
      userId: interest.user_id,
      organizationId: isGovernment ? interest.organization_id : null,
      name: interest.user_name || (isGovernment ? 'Poder Público' : 'Parceiro'),
      profileType: interest.profile_type ?? null,
    },
    contribution: {
      contributionKinds: unique((interest.offer_types ?? []).map((o) => INTEREST_OFFER_CONTRIBUTION[o]).filter(Boolean)),
      contributionDescription: interest.message ?? null,
      contributionAmountCents: null,
    },
    origin: { kind: 'interesse', interestId: interest.id },
    status: 'recebida',
  };
}

/** Status inicial do processo do órgão: herda o do acompanhamento quando é do fluxo. */
function initialStatusFromTrack(trackStatus) {
  return INITIAL_STATUSES.includes(trackStatus) ? trackStatus : 'recebida';
}

// Acompanhamento encerrado não formaliza.
const TRACK_CLOSED = ['concluida', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel', 'nao_aprovada', 'cancelada'];

/** Parte e contribuição a partir do acompanhamento (e da oferta, quando houver) do órgão (T13). */
function fromTrack(track, offer, representative) {
  return {
    party: {
      kind: 'poder_publico',
      userId: offer?.author_id ?? representative ?? null,
      organizationId: track.organization_id,
      name: track.organization_name,
      profileType: null,
    },
    contribution: offer ? {
      contributionKinds: unique((offer.support_types ?? []).map((s) => SUPPORT_TYPE_CONTRIBUTION[s]).filter(Boolean)),
      contributionDescription: offer.description ?? null,
      contributionAmountCents: null,
    } : { contributionKinds: [], contributionDescription: null, contributionAmountCents: null },
    origin: offer ? { kind: 'oferta_institucional', offerId: offer.id, trackId: track.id }
      : { kind: 'acompanhamento_institucional', trackId: track.id },
    status: initialStatusFromTrack(track.status),
  };
}

/**
 * Cria o processo (ou devolve o que já está aberto para a mesma parte) dentro
 * da transação `db`, com a demanda já travada. A demanda vai a `conectada` no
 * primeiro processo (decisão 13), pelo ator `sistema`.
 */
async function formalize(db, { demandId, source, contribution = {}, formalizedBy, formalizedByKind }) {
  const partyKey = source.party.organizationId ?? source.party.userId;
  const { rows: open } = await db.query(
    'SELECT id FROM connection_processes WHERE demand_id = $1 AND party_key = $2 AND closed_at IS NULL',
    [demandId, partyKey],
  );
  if (open.length) return { row: await findProcess(db, open[0].id), created: false };

  const merged = { ...source.contribution };
  for (const [key, value] of Object.entries(contribution)) if (value !== undefined) merged[key] = value;
  const { rows } = await db.query(
    `INSERT INTO connection_processes
       (demand_id, party_kind, party_user_id, party_organization_id, party_name, party_profile_type, origin_kind,
        origin_interest_id, origin_track_id, origin_offer_id, contribution_kinds, contribution_description,
        contribution_amount_cents, status, formalized_by, formalized_by_kind)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::connection_contribution_kind[], $12, $13, $14, $15, $16)
     RETURNING id`,
    [
      demandId, source.party.kind, source.party.userId, source.party.organizationId,
      String(source.party.name).slice(0, 255), source.party.profileType, source.origin.kind,
      source.origin.interestId ?? null, source.origin.trackId ?? null, source.origin.offerId ?? null,
      merged.contributionKinds ?? [], merged.contributionDescription ?? null, merged.contributionAmountCents ?? null,
      source.status, formalizedBy, formalizedByKind,
    ],
  );
  const row = await findProcess(db, rows[0].id);
  const { rows: [demand] } = await db.query(
    'SELECT id, status::text AS status, review_state::text AS review_state FROM demands WHERE id = $1',
    [demandId],
  );
  if (CONNECTABLE_STATUSES.includes(demand.status)) {
    await transitionDemand(db, demand, 'conectar', { actor: 'sistema', actorRef: `processo:${row.protocol}` });
  }
  return { row, created: true };
}

/**
 * Formalização automática no aceite da conexão (routes/interests.js): o
 * interesse de apoio com esta conexão ou a oferta do órgão que a pediu. `null`
 * quando a conexão não é de apoio (participação e voluntariado da comunidade
 * continuam na Camada 2).
 */
async function formalizeFromConnection(db, { demandId, connectionId, formalizedBy }) {
  const { rows: interests } = await db.query(
    `SELECT id, user_id, user_name, user_category, profile_type, organization_id, kind::text AS kind,
            offer_types::text[] AS offer_types, message
       FROM demand_interests
      WHERE demand_id = $1 AND connection_id = $2 AND connection_status = 'aceita' AND withdrawn_at IS NULL`,
    [demandId, connectionId],
  );
  const interest = interests.find((i) => i.kind === 'apoio');
  if (interest) {
    const source = fromInterest(interest);
    if (!source) return null;
    return formalize(db, { demandId, source, formalizedBy, formalizedByKind: 'agente' });
  }
  const { rows: offers } = await db.query(
    `SELECT o.id, o.author_id, o.description, o.support_types::text[] AS support_types,
            t.id AS track_id, t.organization_id, t.organization_name, t.status::text AS track_status
       FROM demand_institutional_offers o JOIN demand_institutional_tracks t ON t.id = o.track_id
      WHERE o.demand_id = $1 AND o.connection_id = $2
      ORDER BY o.created_at DESC LIMIT 1`,
    [demandId, connectionId],
  );
  if (!offers.length) return null;
  const o = offers[0];
  const track = { id: o.track_id, organization_id: o.organization_id, organization_name: o.organization_name, status: o.track_status };
  if (TRACK_CLOSED.includes(track.status)) return null;
  return formalize(db, { demandId, source: fromTrack(track, o), formalizedBy, formalizedByKind: 'agente' });
}

/** Erros do trigger da migração 026 → HTTP; `null` quando o erro não é do processo. */
function mapProcessSpecific(err) {
  if (err instanceof HttpError) return err;
  const message = typeof err?.message === 'string' ? err.message : '';
  if (err?.code === '23514') {
    if (/transição do processo não permitida/.test(message)) {
      return new HttpError(409, { error: 'Mudança de status não permitida a partir do status atual', code: 'invalid_transition' });
    }
    if (/justificativa/.test(message)) {
      return new HttpError(422, { error: 'Informe o motivo', code: 'validation_failed', fields: { note: 'Informe o motivo' } });
    }
    if (/processo encerrado não muda/.test(message)) {
      return new HttpError(409, { error: 'O processo foi encerrado', code: 'process_closed' });
    }
    if (/só com a demanda publicada|demanda arquivada/.test(message)) {
      return new HttpError(409, { error: 'A demanda não está aberta a processos de conexão', code: 'demand_not_open' });
    }
    if (/contribuição repetida/.test(message)) {
      return new HttpError(422, { error: 'Forma de contribuição repetida', code: 'validation_failed', fields: { contributionKinds: 'Forma de contribuição repetida' } });
    }
    if (/o processo nasce|a parte do processo|processo do órgão nasce|oferta institucional de outra/.test(message)) {
      return new HttpError(409, { error: message, code: 'process_origin_invalid' });
    }
  }
  if (err?.code === '23505' && /open_party/.test(err?.constraint ?? message)) {
    return new HttpError(409, { error: 'Já existe um processo em aberto com esta parte', code: 'process_exists' });
  }
  return null;
}

/** Erros do processo → HTTP; o resto segue a tradução da demanda. */
function mapProcessError(err) {
  return mapProcessSpecific(err) ?? mapDbError(err);
}

module.exports = {
  PROCESS_SQL,
  PROCESS_FROM,
  PROCESS_EVENT_TYPES,
  TRACK_CLOSED,
  isProcessRef,
  serializeSummary,
  serializeFees,
  serializeProcess,
  serializePublicProcess,
  findProcess,
  governmentOrganizationOf,
  viewerRoleFor,
  loadVisibleProcess,
  processTimeline,
  fromInterest,
  fromTrack,
  initialStatusFromTrack,
  formalize,
  formalizeFromConnection,
  mapProcessSpecific,
  mapProcessError,
};
