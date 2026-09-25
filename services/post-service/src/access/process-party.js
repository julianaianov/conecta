// Nível de visibilidade Institucional (T-05-18; Modelo de Conexão §33, §09 e
// §31; decisão 13): quem é "usuário envolvido no processo" de uma demanda.
//
//   autor        o Agente que publicou;
//   operacao     contas de DM_OPERATION_USER_IDS;
//   delegado     conta vinculada (T29) à instituição do Agente autor;
//   parte        parte de um Processo de Conexão da demanda (conta, ou órgão
//                por cadastro próprio ou vínculo), fora dos processos
//                cancelados, não aprovados ou fora da competência;
//   orgao        órgão do Poder Público com acompanhamento aberto (T13);
//   interessado  conta com interesse de conexão aceita (T15).
//
// Partes, órgãos e interessados só existem com a demanda publicada em diante.
// A consulta ao user-service (instituição e vínculo) só acontece quando as
// consultas locais não bastam; se ela falha, o acesso é negado (fecha, não abre).

const { PUBLIC_STATUSES } = require('../demand/constants');
const { effectiveRole } = require('../delegation');
const { normalizeRole } = require('../roles');

// Processo que terminou sem a parte seguir envolvida.
const PROCESS_EXCLUDED = ['cancelada', 'nao_aprovada', 'nao_e_de_competencia'];
// Acompanhamento encerrado (espelho de TRACK_CLOSED em src/process/store.js).
const TRACK_CLOSED = ['concluida', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel', 'nao_aprovada', 'cancelada'];

/** Papéis que veem tudo o que é da demanda (inclusive o restrito). */
const MANAGING_ROLES = ['autor', 'delegado', 'operacao'];

const sameId = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/** Instituição e vínculo da conta (cache na requisição); `null` se a consulta falha. */
async function accessOf(req, institutionStatus) {
  if (req._partyAccess !== undefined) return req._partyAccess;
  let access = null;
  if (typeof institutionStatus === 'function') {
    try {
      access = await institutionStatus(req);
    } catch (err) {
      console.error(`[access] ${err.message}`);
      access = null;
    }
  }
  req._partyAccess = access;
  return access;
}

/** Órgão validado em nome do qual a conta atua (cadastro próprio ou vínculo), ou `null`. */
function governmentOrganization(user, access) {
  if (effectiveRole(user, access) !== 'government') return null;
  if (access?.kind !== 'poder_publico' || access?.status !== 'validada' || access?.canActInstitutionally !== true) return null;
  return typeof access.organizationId === 'string' ? access.organizationId : null;
}

/**
 * Papel da conta na demanda (`autor`, `operacao`, `delegado`, `parte`, `orgao`,
 * `interessado`) ou `null`. `demand`: `{ id, author_id, organization_id, status }`.
 */
async function demandPartyRole(db, req, demand, { institutionStatus = null, operationUserIds = new Set() } = {}) {
  const userId = req.user?.userId;
  if (!userId || !demand) return null;
  if (sameId(demand.author_id, userId)) return 'autor';
  if (operationUserIds.has(userId)) return 'operacao';
  const published = PUBLIC_STATUSES.includes(demand.status);

  if (published) {
    const { rows: [local] } = await db.query(
      `SELECT EXISTS (SELECT 1 FROM connection_processes p
                       WHERE p.demand_id = $1 AND p.party_kind <> 'poder_publico' AND p.party_user_id = $2
                         AND NOT (p.status::text = ANY($3::text[]))) AS party,
              EXISTS (SELECT 1 FROM demand_interests i
                       WHERE i.demand_id = $1 AND i.user_id = $2
                         AND i.connection_status = 'aceita' AND i.withdrawn_at IS NULL) AS interested`,
      [demand.id, userId, PROCESS_EXCLUDED],
    );
    if (local?.party) return 'parte';
    if (local?.interested) return 'interessado';
  }

  const access = await accessOf(req, institutionStatus);
  if (access && access.kind === 'agente_transformacao' && demand.organization_id
      && sameId(access.organizationId, demand.organization_id)) {
    return 'delegado';
  }
  const organizationId = published ? governmentOrganization(req.user, access) : null;
  if (!organizationId) return null;
  const { rows: [org] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM connection_processes p
                     WHERE p.demand_id = $1 AND p.party_organization_id = $2
                       AND NOT (p.status::text = ANY($3::text[]))) AS party,
            EXISTS (SELECT 1 FROM demand_institutional_tracks t
                     WHERE t.demand_id = $1 AND t.organization_id = $2
                       AND NOT (t.status::text = ANY($4::text[]))) AS tracking`,
    [demand.id, organizationId, PROCESS_EXCLUDED, TRACK_CLOSED],
  );
  if (org?.party) return 'parte';
  if (org?.tracking) return 'orgao';
  return null;
}

/** Demanda mínima para a decisão de acesso, ou `null`. */
async function loadAccessDemand(db, demandId) {
  const { rows } = await db.query(
    'SELECT id, author_id, organization_id, status FROM demands WHERE id = $1',
    [demandId],
  );
  return rows[0] ?? null;
}

/** `actor_type` de `demand_events` para quem consultou. */
function consultationActorType(req, role, access = req._partyAccess) {
  if (role === 'orgao') return 'poder_publico';
  if (role === 'delegado') return 'agente';
  const own = effectiveRole(req.user, access ?? null) ?? normalizeRole(req.user?.role, req.user?.profileType);
  return {
    agent: 'agente', government: 'poder_publico', partner: 'parceiro', member: 'comunidade', media: 'comunicacao',
  }[own] ?? 'sistema';
}

/**
 * Registro privado da consulta na linha do tempo (decisão 13): quem não é o
 * autor nem a operação abriu um documento ou o dossiê integral. Nunca derruba
 * a leitura: falha só é registrada no log.
 */
async function recordConsultation(db, req, { demandId, role, eventType, payload }) {
  if (!role || role === 'autor' || role === 'operacao') return;
  try {
    const access = req._partyAccess ?? null;
    const organizationId = ['orgao', 'parte'].includes(role) ? governmentOrganization(req.user, access) : null;
    await db.query(
      `INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public)
       VALUES ($1, $2, $3, $4, $5::jsonb, false)`,
      [
        demandId, eventType, consultationActorType(req, role, access), req.user.userId,
        JSON.stringify({ ...payload, accessRole: role, organization_id: organizationId }),
      ],
    );
  } catch (err) {
    console.error(`[access] consulta não registrada: ${err.message}`);
  }
}

module.exports = {
  MANAGING_ROLES,
  PROCESS_EXCLUDED,
  TRACK_CLOSED,
  demandPartyRole,
  loadAccessDemand,
  consultationActorType,
  recordConsultation,
};
