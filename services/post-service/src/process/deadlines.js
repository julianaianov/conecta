// Controle de prazos (T-05-03; Modelo de Conexão §13–§15, migração post 028):
// prazos por etapa do Processo de Conexão, pendências de quem vê e o laço de
// alertas.
//
// O laço (`createDeadlineMonitor`) roda no próprio post-service a cada
// `DM_DEADLINE_INTERVAL_MS` (padrão 1 h; 0 desliga), sem fila nem Redis: uma
// passada marca `vencido` os prazos de etapa cuja data passou e avisa, pela
// central de notificações (T-05-16, `notify`), uma vez por alvo × tipo × data
// (`deadline_alerts`): `prazo_proximo` até 3 dias antes e `prazo_vencido`
// depois. Alvos: prazo de etapa do processo e data limite do responsável atual
// (Agente autor e parte), prazo do encaminhamento (órgão que responde e, no
// vencimento, o que encaminhou) e data limite do responsável no acompanhamento
// do órgão ainda sem processo. A leitura nunca espera o laço: as pendências
// calculam `overdue` pela data.

const { notify } = require('../notifications');
const {
  DEADLINE_STAGE_LABELS, DEADLINE_WARNING_DAYS, PROCESS_STATUS_LABELS,
} = require('./constants');

const DEFAULT_INTERVAL_MS = 3_600_000;
const PASS_LIMIT = 500;
const PENDING_LIMIT = 200;
// Acompanhamento encerrado não tem próxima ação.
const TRACK_FINAL = ['concluida', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel', 'nao_aprovada', 'cancelada'];
const FORWARDING_PENDING = ['enviado', 'recebido'];

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

/** Dia (AAAA-MM-DD) no horário de Brasília. */
function saoPauloDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Dias corridos de `from` até `to` (negativo quando `to` já passou). */
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const brDate = (day) => (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
  ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : day);

const stageLabel = (stage, label) => (stage === 'outra' ? label || DEADLINE_STAGE_LABELS.outra : DEADLINE_STAGE_LABELS[stage] ?? label ?? stage);

// ── Prazos de etapa ─────────────────────────────────────────────────────────

const DEADLINE_SQL = `
  dl.id, dl.process_id, dl.demand_id, dl.stage::text AS stage, dl.stage_label, dl.responsible_side,
  dl.default_days, to_char(dl.due_on, 'YYYY-MM-DD') AS due_on, dl.note, dl.set_by_kind, dl.status::text AS status,
  dl.fulfilled_at, dl.fulfilled_by_kind, dl.fulfilled_note, dl.overdue_at, dl.superseded_by, dl.superseded_at,
  dl.created_at`;

/** Prazo na visão das partes. `today`: AAAA-MM-DD (Brasília). */
function serializeDeadline(row, today = saoPauloDay()) {
  const open = !row.superseded_by && row.status !== 'cumprido';
  const daysLeft = open ? daysBetween(today, row.due_on) : null;
  return {
    id: row.id,
    processId: row.process_id,
    stage: row.stage,
    stageLabel: stageLabel(row.stage, row.stage_label),
    responsibleSide: row.responsible_side,
    defaultDays: row.default_days ?? null,
    dueOn: row.due_on,
    note: row.note ?? null,
    setByKind: row.set_by_kind,
    status: row.status,
    // Vencido pela data mesmo antes da passada do laço.
    overdue: open && (daysLeft < 0 || row.status === 'vencido'),
    daysLeft,
    open,
    fulfilledAt: toIso(row.fulfilled_at),
    fulfilledByKind: row.fulfilled_by_kind ?? null,
    fulfilledNote: row.fulfilled_note ?? null,
    overdueAt: toIso(row.overdue_at),
    supersededBy: row.superseded_by ?? null,
    supersededAt: toIso(row.superseded_at),
    createdAt: toIso(row.created_at),
  };
}

/** Prazos do processo (vigentes primeiro, depois o histórico). */
async function listDeadlines(db, processId, today = saoPauloDay()) {
  const { rows } = await db.query(
    `SELECT ${DEADLINE_SQL} FROM connection_process_deadlines dl
      WHERE dl.process_id = $1
      ORDER BY (dl.superseded_by IS NULL AND dl.status <> 'cumprido') DESC, dl.due_on, dl.created_at`,
    [processId],
  );
  return rows.map((row) => serializeDeadline(row, today));
}

/**
 * Define (ou redefine) o prazo de uma etapa, dentro da transação com o
 * processo travado: o prazo em aberto da mesma etapa fica como histórico
 * (`superseded_by`). Devolve o id do prazo novo.
 */
async function setDeadline(client, { processId, value, userId, actor }) {
  const { rows: [{ id }] } = await client.query('SELECT gen_random_uuid() AS id');
  await client.query(
    `UPDATE connection_process_deadlines SET superseded_by = $3
      WHERE process_id = $1 AND stage = $2::connection_deadline_stage
        AND coalesce(stage_label, '') = coalesce($4, '')
        AND superseded_by IS NULL AND status <> 'cumprido'`,
    [processId, value.stage, id, value.stageLabel],
  );
  await client.query(
    `INSERT INTO connection_process_deadlines
       (id, process_id, demand_id, stage, stage_label, responsible_side, default_days, due_on, note, set_by, set_by_kind)
     SELECT $1, p.id, p.demand_id, $3::connection_deadline_stage, $4, $5, $6,
            coalesce($7::date, dm_today() + $6::int), $8, $9, $10
       FROM connection_processes p WHERE p.id = $2`,
    [id, processId, value.stage, value.stageLabel, value.responsibleSide, value.days, value.dueOn, value.note, userId, actor],
  );
  return id;
}

/** Marca o prazo como cumprido; `null` quando não há prazo em aberto com esse id no processo. */
async function fulfillDeadline(client, { processId, deadlineId, userId, actor, note }) {
  const { rows } = await client.query(
    `UPDATE connection_process_deadlines
        SET status = 'cumprido', fulfilled_at = NOW(), fulfilled_by = $3, fulfilled_by_kind = $4, fulfilled_note = $5
      WHERE id = $2 AND process_id = $1 AND superseded_by IS NULL AND status IN ('aberto', 'vencido')
      RETURNING id`,
    [processId, deadlineId, userId, actor, note],
  );
  return rows[0]?.id ?? null;
}

// ── Pendências de quem vê ───────────────────────────────────────────────────

/**
 * Prazos em aberto e vencidos de quem pede: dos processos em que a conta é
 * autora ou parte (conta ou órgão), e, para o órgão do Poder Público, os
 * encaminhamentos que ele responde ou enviou e os acompanhamentos com data
 * limite ainda sem processo.
 */
async function pendingFor(db, { userId, organizationId = null, today = saoPauloDay() }) {
  const { rows } = await db.query(
    `SELECT * FROM (
       SELECT 'prazo_do_processo' AS kind, dl.id, to_char(dl.due_on, 'YYYY-MM-DD') AS due_on, dl.due_on AS due_date,
              dl.stage::text AS stage, dl.stage_label, dl.responsible_side, dl.status::text AS status,
              p.id AS process_id, p.protocol, p.status::text AS process_status, d.id AS demand_id, d.title AS demand_title,
              CASE WHEN d.author_id = $1 THEN 'agente' ELSE 'parte' END AS viewer_side,
              NULL::text AS destination, NULL::uuid AS responsible_organization_id
         FROM connection_process_deadlines dl
         JOIN connection_processes p ON p.id = dl.process_id
         JOIN demands d ON d.id = p.demand_id
        WHERE dl.superseded_by IS NULL AND dl.status IN ('aberto', 'vencido') AND p.closed_at IS NULL
          AND d.status <> 'arquivada'
          AND (d.author_id = $1 OR (p.party_kind <> 'poder_publico' AND p.party_user_id = $1)
               OR ($2::uuid IS NOT NULL AND p.party_organization_id = $2::uuid))
       UNION ALL
       SELECT 'responsavel_do_processo', p.id, to_char(p.responsible_due_on, 'YYYY-MM-DD'), p.responsible_due_on,
              NULL, coalesce(p.responsible_sector, p.responsible_department, p.responsible_organ,
                             p.responsible_organization_name), NULL, p.status::text,
              p.id, p.protocol, p.status::text, d.id, d.title,
              CASE WHEN d.author_id = $1 THEN 'agente' ELSE 'parte' END, p.responsible_name, NULL
         FROM connection_processes p
         JOIN demands d ON d.id = p.demand_id
        WHERE p.closed_at IS NULL AND p.responsible_due_on IS NOT NULL AND d.status <> 'arquivada'
          AND (d.author_id = $1 OR (p.party_kind <> 'poder_publico' AND p.party_user_id = $1)
               OR ($2::uuid IS NOT NULL AND p.party_organization_id = $2::uuid))
       UNION ALL
       SELECT 'encaminhamento', f.id, to_char(f.due_on, 'YYYY-MM-DD'), f.due_on,
              NULL, NULL, NULL, f.status::text,
              f.process_id, NULL, NULL, d.id, d.title,
              CASE WHEN f.organization_id = $2::uuid THEN 'origem' ELSE 'destino' END,
              coalesce(f.destination_sector, f.destination_organization_name),
              CASE WHEN f.destination_kind = 'orgao_plataforma' THEN f.destination_organization_id ELSE f.organization_id END
         FROM demand_forwardings f
         JOIN demands d ON d.id = f.demand_id
        WHERE $2::uuid IS NOT NULL AND f.due_on IS NOT NULL AND f.status = ANY($3::forwarding_status[])
          AND d.status <> 'arquivada'
          AND (f.organization_id = $2::uuid OR f.destination_organization_id = $2::uuid)
       UNION ALL
       SELECT 'acompanhamento', t.id, to_char(t.responsible_due_on, 'YYYY-MM-DD'), t.responsible_due_on,
              NULL, t.responsible_sector, NULL, t.status::text,
              NULL, NULL, NULL, d.id, d.title, 'parte', t.responsible_name, t.organization_id
         FROM demand_institutional_tracks t
         JOIN demands d ON d.id = t.demand_id
        WHERE $2::uuid IS NOT NULL AND t.organization_id = $2::uuid AND t.process_id IS NULL
          AND t.responsible_due_on IS NOT NULL AND NOT (t.status::text = ANY($4::text[]))
          AND d.status <> 'arquivada'
     ) pending
     ORDER BY due_date, id
     LIMIT ${PENDING_LIMIT}`,
    [userId, organizationId, FORWARDING_PENDING, TRACK_FINAL],
  );
  return rows.map((row) => serializePending(row, today, organizationId));
}

function serializePending(row, today, organizationId) {
  const daysLeft = daysBetween(today, row.due_on);
  let label;
  let mustAct;
  let href;
  switch (row.kind) {
    case 'prazo_do_processo':
      label = stageLabel(row.stage, row.stage_label);
      mustAct = row.responsible_side === row.viewer_side;
      href = `/processos/${row.protocol}`;
      break;
    case 'responsavel_do_processo':
      label = row.stage_label ? `Próxima ação — ${row.stage_label}` : 'Próxima ação do responsável';
      mustAct = row.viewer_side === 'parte';
      href = `/processos/${row.protocol}`;
      break;
    case 'encaminhamento':
      label = row.destination ? `Encaminhamento — ${row.destination}` : 'Encaminhamento';
      mustAct = row.responsible_organization_id === organizationId;
      href = `/governo/demandas/${row.demand_id}`;
      break;
    default:
      label = row.stage_label ? `Acompanhamento — ${row.stage_label}` : 'Acompanhamento institucional';
      mustAct = true;
      href = `/governo/demandas/${row.demand_id}`;
  }
  return {
    kind: row.kind,
    id: row.id,
    label,
    stage: row.stage ?? null,
    responsibleSide: row.responsible_side ?? null,
    viewerSide: row.viewer_side,
    mustAct,
    dueOn: row.due_on,
    daysLeft,
    overdue: daysLeft < 0 || (row.kind === 'prazo_do_processo' && row.status === 'vencido'),
    status: row.status,
    processId: row.process_id ?? null,
    protocol: row.protocol ?? null,
    processStatusLabel: row.process_status ? PROCESS_STATUS_LABELS[row.process_status] ?? row.process_status : null,
    demandId: row.demand_id,
    demandTitle: row.demand_title,
    href,
  };
}

// ── Laço de alertas ─────────────────────────────────────────────────────────

/** Candidatos a alerta até `horizon`, sem o alerta daquele tipo já enviado. */
const CANDIDATES_SQL = `
  SELECT c.* FROM (
    SELECT 'prazo_do_processo' AS target_kind, dl.id AS target_id, to_char(dl.due_on, 'YYYY-MM-DD') AS due_on,
           dl.due_on AS due_date, dl.stage::text AS stage, dl.stage_label, p.id AS process_id, p.protocol,
           d.id AS demand_id, d.title AS demand_title, d.author_id, p.party_kind::text AS party_kind,
           p.party_user_id, p.party_organization_id, NULL::uuid AS organization_id, NULL::uuid AS origin_organization_id
      FROM connection_process_deadlines dl
      JOIN connection_processes p ON p.id = dl.process_id
      JOIN demands d ON d.id = p.demand_id
     WHERE dl.superseded_by IS NULL AND dl.status IN ('aberto', 'vencido') AND dl.due_on <= $2::date
       AND p.closed_at IS NULL AND d.status <> 'arquivada'
    UNION ALL
    SELECT 'responsavel_do_processo', p.id, to_char(p.responsible_due_on, 'YYYY-MM-DD'), p.responsible_due_on,
           NULL, NULL, p.id, p.protocol, d.id, d.title, d.author_id, p.party_kind::text, p.party_user_id,
           p.party_organization_id, NULL, NULL
      FROM connection_processes p
      JOIN demands d ON d.id = p.demand_id
     WHERE p.closed_at IS NULL AND p.responsible_due_on <= $2::date AND d.status <> 'arquivada'
    UNION ALL
    SELECT 'encaminhamento', f.id, to_char(f.due_on, 'YYYY-MM-DD'), f.due_on,
           NULL, coalesce(f.destination_sector, f.destination_organization_name), NULL, NULL, d.id, d.title, NULL,
           NULL, NULL, NULL,
           CASE WHEN f.destination_kind = 'orgao_plataforma' THEN f.destination_organization_id ELSE f.organization_id END,
           CASE WHEN f.destination_kind = 'orgao_plataforma' THEN f.organization_id END
      FROM demand_forwardings f
      JOIN demands d ON d.id = f.demand_id
     WHERE f.due_on <= $2::date AND f.status = ANY($3::forwarding_status[]) AND d.status <> 'arquivada'
    UNION ALL
    SELECT 'acompanhamento', t.id, to_char(t.responsible_due_on, 'YYYY-MM-DD'), t.responsible_due_on,
           NULL, t.responsible_sector, NULL, NULL, d.id, d.title, NULL, NULL, NULL, NULL, t.organization_id, NULL
      FROM demand_institutional_tracks t
      JOIN demands d ON d.id = t.demand_id
     WHERE t.process_id IS NULL AND t.responsible_due_on <= $2::date AND NOT (t.status::text = ANY($4::text[]))
       AND d.status <> 'arquivada'
  ) c
  WHERE NOT EXISTS (
    SELECT 1 FROM deadline_alerts a
     WHERE a.target_kind = c.target_kind AND a.target_id = c.target_id AND a.due_on = c.due_date
       AND a.alert_kind = CASE WHEN c.due_date < $1::date THEN 'prazo_vencido' ELSE 'prazo_proximo' END)
  ORDER BY c.due_date, c.target_id
  LIMIT ${PASS_LIMIT}`;

/** Destinatários e texto do alerta de um candidato (puro; exportado para teste). */
function alertMessages(candidate, today) {
  const overdue = candidate.due_on < today;
  const kind = overdue ? 'prazo_vencido' : 'prazo_proximo';
  const title = overdue ? 'Prazo vencido' : 'Prazo próximo';
  const when = overdue ? `venceu em ${brDate(candidate.due_on)}` : `até ${brDate(candidate.due_on)}`;
  const demand = candidate.demand_title ? ` — «${candidate.demand_title}»` : '';
  const base = { kind, title, demandId: candidate.demand_id, processId: candidate.process_id ?? undefined };
  const dedupeKey = `${kind}:${candidate.target_kind}:${candidate.target_id}:${candidate.due_on}`;
  const out = [];
  if (candidate.target_kind === 'prazo_do_processo' || candidate.target_kind === 'responsavel_do_processo') {
    const label = candidate.target_kind === 'prazo_do_processo'
      ? stageLabel(candidate.stage, candidate.stage_label) : 'Próxima ação do responsável';
    const body = `${candidate.protocol} · ${label}${demand} · ${when}`;
    const href = `/processos/${candidate.protocol}`;
    out.push({ ...base, userId: candidate.author_id, body, href, dedupeKey });
    if (candidate.party_kind === 'poder_publico') {
      out.push({ ...base, organizationId: candidate.party_organization_id, body, href, dedupeKey });
    } else if (candidate.party_user_id) {
      out.push({ ...base, userId: candidate.party_user_id, body, href, dedupeKey });
    }
  } else {
    const label = candidate.target_kind === 'encaminhamento'
      ? `Encaminhamento${candidate.stage_label ? ` — ${candidate.stage_label}` : ''}`
      : `Acompanhamento institucional${candidate.stage_label ? ` — ${candidate.stage_label}` : ''}`;
    const body = `${label}${demand} · ${when}`;
    const href = `/governo/demandas/${candidate.demand_id}`;
    if (candidate.organization_id) out.push({ ...base, organizationId: candidate.organization_id, body, href, dedupeKey });
    if (overdue && candidate.origin_organization_id) {
      out.push({ ...base, organizationId: candidate.origin_organization_id, body, href, dedupeKey });
    }
  }
  return out.filter((m) => m.userId || m.organizationId);
}

function createDeadlineMonitor({ pool, now = () => new Date() } = {}) {
  if (!pool) throw new Error('createDeadlineMonitor exige o pool');
  let timer = null;
  let running = false;
  const state = { lastRun: null, lastOverdue: null, lastAlerts: null, lastError: null, runs: 0 };

  async function inTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
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
   * Uma passada no dia `today` (AAAA-MM-DD, Brasília; padrão: hoje). Devolve
   * `{ overdue, alerts }` ou `null` se já havia uma passada em curso.
   */
  async function runNow(today = saoPauloDay(now())) {
    if (running) return null;
    running = true;
    try {
      const day = typeof today === 'string' ? today.slice(0, 10) : saoPauloDay(today);
      const overdue = await inTransaction(async (client) => {
        await client.query("SELECT set_config('dm.deadline_today', $1, true)", [day]);
        const { rowCount } = await client.query(
          `UPDATE connection_process_deadlines dl SET status = 'vencido'
             FROM connection_processes p
            WHERE p.id = dl.process_id AND p.closed_at IS NULL
              AND dl.status = 'aberto' AND dl.superseded_by IS NULL AND dl.due_on < $1::date`,
          [day],
        );
        return rowCount ?? 0;
      });
      const { rows } = await pool.query(CANDIDATES_SQL, [day, addDays(day, DEADLINE_WARNING_DAYS), FORWARDING_PENDING, TRACK_FINAL]);
      let alerts = 0;
      for (const candidate of rows) {
        const messages = alertMessages(candidate, day);
        const alertKind = candidate.due_on < day ? 'prazo_vencido' : 'prazo_proximo';
        // Um alerta por alvo × tipo × data: a inserção decide, e o aviso vai na mesma transação.
        await inTransaction(async (client) => {
          const { rows: inserted } = await client.query(
            `INSERT INTO deadline_alerts (target_kind, target_id, alert_kind, due_on)
             VALUES ($1, $2, $3, $4::date) ON CONFLICT DO NOTHING RETURNING target_id`,
            [candidate.target_kind, candidate.target_id, alertKind, candidate.due_on],
          );
          if (!inserted.length) return;
          for (const message of messages) await notify(client, message);
          alerts += messages.length;
        });
      }
      Object.assign(state, {
        lastRun: new Date().toISOString(), lastOverdue: overdue, lastAlerts: alerts, lastError: null, runs: state.runs + 1,
      });
      return { overdue, alerts };
    } catch (err) {
      state.lastError = err;
      throw err;
    } finally {
      running = false;
    }
  }

  /** Nunca lança: a falha fica em `state` e a próxima passada tenta de novo. */
  function tick() {
    runNow().catch((err) => console.error('[prazos] passada dos alertas falhou:', err.message));
  }

  function start(intervalMs = DEFAULT_INTERVAL_MS) {
    const interval = Number(intervalMs);
    if (!Number.isFinite(interval) || interval <= 0) return null;
    stop();
    tick();
    timer = setInterval(tick, interval);
    timer.unref?.();
    return timer;
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { runNow, start, stop, state };
}

module.exports = {
  DEFAULT_INTERVAL_MS,
  DEADLINE_SQL,
  TRACK_FINAL,
  FORWARDING_PENDING,
  saoPauloDay,
  addDays,
  daysBetween,
  serializeDeadline,
  listDeadlines,
  setDeadline,
  fulfillDeadline,
  pendingFor,
  serializePending,
  alertMessages,
  createDeadlineMonitor,
};
