// Leitura e gravação da denúncia de conteúdo e de perfil (T6.3, migração post
// 018). O portal só cria denúncia `pendente` e lê as próprias; o desfecho é
// gravado pelo dm-gestao, direto no banco, pelo papel `gestao_app`.

const { HttpError } = require('../demand/store');
const { PUBLIC_STATUSES } = require('../demand/constants');
const { REPORTER_STATE_OF, RATE_LIMIT } = require('./constants');

const toIso = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

/** Trecho curto do conteúdo, para a fila da gestão não depender do alvo. */
const summarize = (value) => {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return text ? text.slice(0, 500) : null;
};

/**
 * Confere que o alvo existe e está visível, e devolve o retrato
 * `{ ownerId, summary }`. O perfil vive em outra base (auth_db/user_db): não
 * há como conferir aqui, então só a própria conta é recusada e a gestão
 * resolve a identidade ao abrir a denúncia.
 */
async function loadTarget(db, targetKind, targetId, reporterId) {
  if (targetKind === 'perfil') {
    if (targetId === reporterId) {
      throw new HttpError(422, {
        error: 'Não é possível denunciar o próprio perfil',
        code: 'validation_failed',
        fields: { targetId: 'Não é possível denunciar o próprio perfil' },
      });
    }
    return { ownerId: targetId, summary: null };
  }

  if (targetKind === 'publicacao') {
    const { rows } = await db.query(
      "SELECT author_id, title FROM posts WHERE id = $1 AND visibility = 'visible'", [targetId],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Publicação não encontrada' });
    return { ownerId: rows[0].author_id, summary: summarize(rows[0].title) };
  }

  if (targetKind === 'comentario') {
    const { rows } = await db.query(
      `SELECT c.author_id, c.content
         FROM comments c JOIN posts p ON p.id = c.post_id
        WHERE c.id = $1 AND p.visibility = 'visible'`, [targetId],
    );
    if (!rows.length) throw new HttpError(404, { error: 'Comentário não encontrado' });
    return { ownerId: rows[0].author_id, summary: summarize(rows[0].content) };
  }

  const { rows } = await db.query(
    'SELECT author_id, title FROM demands WHERE id = $1 AND status = ANY($2::demand_status[])',
    [targetId, PUBLIC_STATUSES],
  );
  if (!rows.length) throw new HttpError(404, { error: 'Demanda não encontrada' });
  return { ownerId: rows[0].author_id, summary: summarize(rows[0].title) };
}

/**
 * Denúncias da conta na última hora e no último dia, numa consulta só (índice
 * `idx_content_reports_reporter`). Também devolve quando a janela da hora
 * libera, para o 429 dizer quanto esperar.
 */
async function rateUsage(db, reporterId) {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS last_hour,
            count(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')  AS last_day,
            min(created_at) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') AS oldest_hour
       FROM content_reports
      WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 day'`,
    [reporterId],
  );
  const row = rows[0] ?? {};
  const lastHour = Number(row.last_hour ?? 0);
  const lastDay = Number(row.last_day ?? 0);
  const oldest = row.oldest_hour instanceof Date ? row.oldest_hour : null;
  const retryAfterSeconds = oldest
    ? Math.max(1, Math.ceil((oldest.getTime() + 3_600_000 - Date.now()) / 1000))
    : 3600;
  return {
    lastHour,
    lastDay,
    remainingHour: Math.max(0, RATE_LIMIT.perHour - lastHour),
    remainingDay: Math.max(0, RATE_LIMIT.perDay - lastDay),
    retryAfterSeconds,
  };
}

function assertWithinRate(usage) {
  if (usage.lastHour >= RATE_LIMIT.perHour || usage.lastDay >= RATE_LIMIT.perDay) {
    throw new HttpError(429, {
      error: 'Você enviou muitas denúncias em pouco tempo. Tente de novo mais tarde.',
      code: 'report_rate_limited',
      retryAfterSeconds: usage.retryAfterSeconds,
    });
  }
}

/** Denúncia em aberto desta conta para este alvo, ou `null`. */
async function findOpenReport(db, reporterId, targetKind, targetId) {
  const { rows } = await db.query(
    `SELECT id, created_at FROM content_reports
      WHERE reporter_id = $1 AND target_kind = $2::report_target_kind AND target_id = $3
        AND status IN ('pendente', 'em_analise')
      LIMIT 1`,
    [reporterId, targetKind, targetId],
  );
  return rows[0] ?? null;
}

/** Grava a denúncia. O índice único parcial é a garantia final do "uma por alvo". */
async function insertReport(db, input) {
  try {
    const { rows } = await db.query(
      `INSERT INTO content_reports
         (target_kind, target_id, target_owner_id, target_summary,
          reporter_id, reporter_category, reporter_profile_type, reason, description)
       VALUES ($1::report_target_kind, $2, $3, $4, $5, $6, $7, $8::report_reason, $9)
       RETURNING id, target_kind::text AS target_kind, target_id, reason::text AS reason,
                 status::text AS status, created_at`,
      [
        input.targetKind, input.targetId, input.targetOwnerId, input.targetSummary,
        input.reporterId, input.reporterCategory, input.reporterProfileType,
        input.reason, input.description,
      ],
    );
    return rows[0];
  } catch (err) {
    if (err?.code === '23505') {
      throw new HttpError(409, {
        error: 'Você já denunciou este conteúdo e a análise ainda está em andamento.',
        code: 'report_already_open',
      });
    }
    throw err;
  }
}

/** Minhas denúncias, sem o desfecho (só "em apuração" ou "analisada"). */
async function listMine(db, reporterId, limit) {
  const { rows } = await db.query(
    `SELECT id, target_kind::text AS target_kind, target_id, reason::text AS reason,
            description, status::text AS status, created_at
       FROM content_reports WHERE reporter_id = $1
      ORDER BY created_at DESC LIMIT $2`,
    [reporterId, limit],
  );
  return rows.map(serializeMine);
}

function serializeMine(row) {
  return {
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_id,
    reason: row.reason,
    description: row.description ?? null,
    state: REPORTER_STATE_OF(row.status),
    createdAt: toIso(row.created_at),
  };
}

module.exports = {
  summarize,
  loadTarget,
  rateUsage,
  assertWithinRate,
  findOpenReport,
  insertReport,
  listMine,
  serializeMine,
};
