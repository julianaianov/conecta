// Laço da caixa de saída de e-mail (T-05-16; decisão 19: "o e-mail avisa").
// CÓPIA IDÊNTICA em post-service e user-service (há teste que confere).
//
// Sem provedor (`DM_MAIL_PROVIDER` vazio, o caso de hoje), cada volta marca as
// linhas `pendente` como `desligado`: nada é enviado, nada falha e nada
// bloqueia. O envio real depende de ação humana (SES ou provedor externo, com
// DNS na zona da Cloudflare) e de um provedor registrado em `PROVIDERS`, com
// `send({ toUserId, subject, text, href, from })`. Não invente provedor.

const BATCH_SIZE = 200;
const SEND_BATCH_SIZE = 20;
const MAX_ATTEMPTS = 5;

/** Provedores implementados (nenhum até a decisão humana). */
const PROVIDERS = {};

function mailConfig(env = process.env) {
  const provider = typeof env.DM_MAIL_PROVIDER === 'string' ? env.DM_MAIL_PROVIDER.trim() : '';
  const from = typeof env.DM_MAIL_FROM === 'string' ? env.DM_MAIL_FROM.trim() : '';
  return { provider, from };
}

/** Sem provedor: `pendente` → `desligado`, em lotes. Devolve quantas linhas. */
async function disablePending(pool, batchSize = BATCH_SIZE) {
  const { rowCount } = await pool.query(
    `UPDATE email_outbox SET status = 'desligado', updated_at = NOW()
      WHERE id IN (SELECT id FROM email_outbox WHERE status = 'pendente'
                    ORDER BY created_at LIMIT $1)`,
    [batchSize],
  );
  return rowCount ?? 0;
}

/** Com provedor: envia um lote. Falha conta tentativa; na última, `falhou`. */
async function sendPending(pool, provider, { from = '', batchSize = SEND_BATCH_SIZE } = {}) {
  const { rows } = await pool.query(
    `UPDATE email_outbox o SET attempts = o.attempts + 1, updated_at = NOW()
       FROM notifications n
      WHERE n.id = o.notification_id
        AND o.id IN (SELECT id FROM email_outbox WHERE status = 'pendente'
                      ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING o.id, o.to_user_id, o.attempts, n.id AS notification_id, n.title, n.summary, n.href`,
    [batchSize],
  );
  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await provider.send({
        toUserId: row.to_user_id, subject: row.title, text: row.summary ?? '', href: row.href, from,
      });
      await pool.query(
        `UPDATE email_outbox SET status = 'enviado', sent_at = NOW(), last_error = NULL, updated_at = NOW()
          WHERE id = $1`,
        [row.id],
      );
      await pool.query('UPDATE notifications SET emailed_at = NOW() WHERE id = $1', [row.notification_id]);
      sent += 1;
    } catch (err) {
      failed += 1;
      await pool.query(
        `UPDATE email_outbox SET status = CASE WHEN attempts >= $2 THEN 'falhou' ELSE 'pendente' END,
                last_error = $3, updated_at = NOW()
          WHERE id = $1`,
        [row.id, MAX_ATTEMPTS, String(err?.message ?? err).slice(0, 500)],
      );
    }
  }
  return { sent, failed };
}

/**
 * `{ tick, start, stop }`. `provider` injeta um provedor (testes); sem ele,
 * vale `PROVIDERS[DM_MAIL_PROVIDER]`.
 */
function createMailer({ pool, env = process.env, provider, logger = console } = {}) {
  const config = mailConfig(env);
  const active = provider ?? (config.provider ? PROVIDERS[config.provider] : null);
  let timer = null;
  let warned = false;

  async function tick() {
    if (!config.provider && !provider) return { disabled: await disablePending(pool) };
    if (!active) {
      if (!warned) {
        logger.warn?.(`[mailer] DM_MAIL_PROVIDER="${config.provider}" não tem implementação; e-mails ficam pendentes`);
        warned = true;
      }
      return { skipped: true };
    }
    return sendPending(pool, active, { from: config.from });
  }

  function start(intervalMs = 60_000) {
    if (!Number.isFinite(intervalMs) || intervalMs <= 0 || timer) return;
    const run = () => tick().catch((err) => logger.error?.(`[mailer] ${err.message}`));
    run();
    timer = setInterval(run, intervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { tick, start, stop, config };
}

module.exports = {
  BATCH_SIZE, SEND_BATCH_SIZE, MAX_ATTEMPTS, PROVIDERS, mailConfig, disablePending, sendPending, createMailer,
};
