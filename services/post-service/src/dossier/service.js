// Geração e versionamento do Dossiê da Demanda (T10), fora do caminho crítico.
//
// - `request(demandId)`: chamado depois do envio (sem esperar); cria as
//   versões que faltam e tenta gerar. Nunca lança.
// - `tick()`: o laço em processo (start/stop) reconcilia demandas que precisam
//   de dossiê (inclusive a publicação, feita pelo dm-gestao direto no banco) e
//   gera as pendentes, com retentativa exponencial (1, 2, 4, 8, 16 min; 6
//   tentativas). Depois disso, a regeneração é manual (autor ou operação).
// - Sem bucket (DM_UPLOADS_BUCKET), a versão é registrada `indisponivel` com o
//   motivo; quando o bucket existir, o laço gera.
//
// Versões: envio (v1), cada reenvio (v2, v3…) e a publicação (vN integral +
// vN pública). A linha nasce com a demanda congelada (`snapshot`); o PDF é
// gerado a partir dela, então atrasar a geração não muda o conteúdo.

const crypto = require('node:crypto');
const store = require('../demand/store');
const accountabilityStore = require('../accountability/store');
const { PUBLIC_STATUSES } = require('../demand/constants');
const { parseUploadRef } = require('../uploads');
const {
  demandSnapshot, buildDossierContent, contentHash, sha256Hex, verifyUrl, formatDossierNumber,
} = require('./content');
const { renderDossierPdf, EMBEDDABLE_IMAGE_TYPES } = require('./pdf');

const MAX_ATTEMPTS = 6;
const BACKOFF_BASE_SECONDS = 60;
const DEFAULT_INTERVAL_MS = 60_000;
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_EXPIRES_SECONDS = 60;
const PUBLIC_DOWNLOAD_EXPIRES_SECONDS = 5 * 60;
const ACTOR_REF = 'post-service:dossie';

const UNAVAILABLE_REASON = 'Armazenamento de arquivos não configurado neste ambiente (DM_UPLOADS_BUCKET ausente); '
  + 'o dossiê será gerado quando o armazenamento existir.';

const DOSSIER_SQL = `x.id, x.demand_id, x.dossier_number, x.version, x.variant, x.trigger_kind, x.status,
  x.status_reason, x.attempts, x.last_attempt_at, x.content_sha256, x.file_sha256, x.size_bytes,
  x.upload_id, x.object_key, x.generated_at, x.requested_at`;

// Chave do envio: o submitted_at com microssegundos, em UTC (texto estável).
const SUBMISSION_KEY_SQL = `'envio:' || to_char(d.submitted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

const toIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);

/** `demands/<id>/dossie/v<n>.pdf` (variante pública: `v<n>-publica.pdf`). */
function dossierKey(demandId, version, variant) {
  return `demands/${demandId}/dossie/v${version}${variant === 'publica' ? '-publica' : ''}.pdf`;
}

function dossierFileName(row) {
  return `dossie-${row.dossier_number}-v${row.version}${row.variant === 'publica' ? '-publica' : ''}.pdf`;
}

function serializeDossier(row) {
  return {
    id: row.id,
    demandId: row.demand_id,
    number: row.dossier_number,
    version: Number(row.version),
    variant: row.variant,
    trigger: row.trigger_kind,
    status: row.status,
    statusReason: row.status === 'gerado' ? null : row.status_reason ?? null,
    attempts: Number(row.attempts ?? 0),
    contentSha256: row.content_sha256 ?? null,
    fileSha256: row.file_sha256 ?? null,
    sizeBytes: row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes),
    fileName: dossierFileName(row),
    generatedAt: toIso(row.generated_at),
    requestedAt: toIso(row.requested_at),
    verifyPath: row.content_sha256 ? `/dossie/verificar/${row.content_sha256}` : null,
  };
}

function createDossierService({
  pool,
  storage = null,
  fetchInstitution,
  siteUrl = 'https://dmconecta.org',
  now = () => new Date(),
  logger = console,
  maxAttempts = MAX_ATTEMPTS,
  backoffSeconds = BACKOFF_BASE_SECONDS,
} = {}) {
  if (!pool || typeof fetchInstitution !== 'function') throw new Error('dossiê exige pool e fetchInstitution');
  let chain = Promise.resolve();
  let timer = null;

  /** Serializa o trabalho do processo (uma geração por vez). */
  const serial = (fn) => {
    const next = chain.then(fn, fn);
    chain = next.catch(() => {});
    return next;
  };

  /** Cria as versões que faltam para o estado atual da demanda. */
  async function ensureRequests(demandId) {
    return store.withTransaction(pool, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`dossie:${demandId}`]);
      const { rows: [row] } = await client.query(
        `SELECT ${store.OWNER_DEMAND_SQL}, ${SUBMISSION_KEY_SQL} AS submission_key
           FROM demands d WHERE d.id = $1`,
        [demandId],
      );
      if (!row) return 0;

      const origins = [];
      if (row.status === 'em_analise' && row.review_state === 'aguardando_analise' && row.submitted_at) {
        const { rows: [last] } = await client.query(
          `SELECT payload->>'reenvio' AS reenvio FROM demand_events
            WHERE demand_id = $1 AND event_type = 'enviada_para_analise'
            ORDER BY created_at DESC, id DESC LIMIT 1`,
          [demandId],
        );
        origins.push({ key: row.submission_key, trigger: last?.reenvio === 'true' ? 'reenvio' : 'envio', variants: ['integral'] });
      }
      if (row.published_at && PUBLIC_STATUSES.includes(row.status)) {
        origins.push({ key: 'publicacao', trigger: 'publicacao', variants: ['integral', 'publica'] });
      }
      // Conclusão da execução (T17): versão nova, integral e pública, com o
      // retrato da demanda no fim da execução.
      if (['concluida', 'prestacao_de_contas'].includes(row.status)) {
        origins.push({ key: 'conclusao', trigger: 'conclusao', variants: ['integral', 'publica'] });
      }
      // Prestação de contas concluída (T18): a última versão, com o relatório
      // de execução, os resultados por meta e os indicadores de impacto.
      if (row.status === 'prestacao_de_contas') {
        const { rows: [done] } = await client.query(
          "SELECT id FROM demand_accountability WHERE demand_id = $1 AND status = 'concluida'",
          [demandId],
        );
        if (done) {
          origins.push({ key: 'prestacao_de_contas', trigger: 'prestacao_de_contas', variants: ['integral', 'publica'] });
        }
      }
      if (!origins.length) return 0;

      const { rows: existing } = await client.query(
        'SELECT origin_key, variant, version, dossier_number FROM demand_dossiers WHERE demand_id = $1',
        [demandId],
      );
      const missing = origins
        .map((o) => ({ ...o, variants: o.variants.filter((v) => !existing.some((e) => e.origin_key === o.key && e.variant === v)) }))
        .filter((o) => o.variants.length);
      if (!missing.length) return 0;

      let number = existing[0]?.dossier_number;
      if (!number) {
        const { rows: [seq] } = await client.query("SELECT nextval('demand_dossier_number_seq') AS n");
        number = formatDossierNumber(now().getUTCFullYear(), seq.n);
      }
      let maxVersion = existing.reduce((m, e) => Math.max(m, Number(e.version)), 0);
      const items = await store.loadItems(client, demandId);
      // Prestação de contas concluída (T18) entra no retrato: o dossiê da
      // prestação traz relatório, resultados por meta e impacto.
      const accountability = await accountabilityStore.loadConcludedView(client, demandId);
      // Processos de Conexão com contribuição e taxas (T-05-06, decisão 14).
      const { rows: processes } = await client.query(
        `SELECT protocol, sequence_in_demand, party_kind::text AS party_kind, party_name, status::text AS status,
                contribution_kinds::text[] AS contribution_kinds,
                contribution_amount_cents::text AS contribution_amount_cents, fee_applies,
                agent_fee_cents::text AS agent_fee_cents, platform_fee_cents::text AS platform_fee_cents,
                total_with_fees_cents::text AS total_with_fees_cents, formalized_at
           FROM connection_processes WHERE demand_id = $1 ORDER BY sequence_in_demand`,
        [demandId],
      );
      const snapshot = demandSnapshot(row, items, { accountability, processes });
      const status = storage ? 'pendente' : 'indisponivel';
      const reason = storage ? null : UNAVAILABLE_REASON;
      let created = 0;
      for (const origin of missing) {
        const sibling = existing.find((e) => e.origin_key === origin.key);
        const version = sibling ? Number(sibling.version) : (maxVersion += 1);
        for (const variant of origin.variants) {
          const { rowCount } = await client.query(
            `INSERT INTO demand_dossiers (demand_id, dossier_number, version, variant, trigger_kind, origin_key,
                                          snapshot, status, status_reason)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT (demand_id, origin_key, variant) DO NOTHING`,
            [demandId, number, version, variant, origin.trigger, origin.key, JSON.stringify(snapshot), status, reason],
          );
          created += rowCount;
        }
      }
      return created;
    });
  }

  /** Foto da demanda para o PDF: bytes (JPEG/PNG) e SHA-256; metadados nos demais casos. */
  async function loadPhoto(photoRef) {
    const id = parseUploadRef(photoRef);
    if (!id) return null;
    const { rows: [up] } = await pool.query(
      "SELECT object_key, content_type, size_bytes, sha256 FROM uploads WHERE id = $1 AND status = 'confirmado'",
      [id],
    );
    if (!up) return null;
    if (!EMBEDDABLE_IMAGE_TYPES.has(up.content_type) || Number(up.size_bytes) > MAX_PHOTO_BYTES) {
      return { bytes: null, sha256: up.sha256 ?? null, contentType: up.content_type, embedded: false };
    }
    const bytes = await storage.get(up.object_key);
    return { bytes, sha256: sha256Hex(bytes), contentType: up.content_type, embedded: true };
  }

  /** Gera uma versão (a linha já foi reivindicada). */
  async function generate(row) {
    const snapshot = row.snapshot;
    const institution = await fetchInstitution(snapshot.demand.authorId);
    const photo = await loadPhoto(snapshot.demand.photoRef);
    const content = buildDossierContent({
      snapshot,
      institution,
      photo,
      meta: {
        number: row.dossier_number,
        version: Number(row.version),
        variant: row.variant,
        trigger: row.trigger_kind,
        issuedAt: now().toISOString(),
      },
    });
    const hash = contentHash(content);
    const pdf = await renderDossierPdf(content, { verifyUrl: verifyUrl(siteUrl, hash), contentSha256: hash, photo });
    const fileSha = sha256Hex(pdf);
    const key = dossierKey(row.demand_id, row.version, row.variant);
    await storage.put({ key, body: pdf, contentType: 'application/pdf', sha256: fileSha });

    await store.withTransaction(pool, async (client) => {
      const uploadId = crypto.randomUUID();
      await client.query(
        `INSERT INTO uploads (id, owner_id, purpose, status, tmp_key, object_key, content_type, declared_size_bytes,
                              size_bytes, sha256, original_name, demand_id, confirmed_at)
         VALUES ($1, $2, 'demand_dossier', 'confirmado', $3, $4, 'application/pdf', $5, $5, $6, $7, $8, NOW())`,
        [uploadId, snapshot.demand.authorId, `tmp/${uploadId}`, key, pdf.length, fileSha, dossierFileName(row), row.demand_id],
      );
      await client.query(
        `UPDATE demand_dossiers
            SET status = 'gerado', status_reason = NULL, content = $2, content_sha256 = $3, file_sha256 = $4,
                size_bytes = $5, upload_id = $6, object_key = $7, generated_at = $8
          WHERE id = $1 AND status <> 'gerado'`,
        [row.id, JSON.stringify(content), hash, fileSha, pdf.length, uploadId, key, content.issuedAt],
      );
      if (row.variant === 'integral') {
        await client.query(
          `INSERT INTO demand_events (demand_id, event_type, actor_type, actor, payload, is_public)
           VALUES ($1, 'dossie_gerado', 'sistema', $2, $3, $4)`,
          [row.demand_id, ACTOR_REF, JSON.stringify({
            dossierId: row.id,
            number: row.dossier_number,
            version: Number(row.version),
            trigger: row.trigger_kind,
            contentSha256: hash,
          }), row.trigger_kind === 'publicacao'],
        );
      }
    });
    return hash;
  }

  /**
   * Gera as versões pendentes (de uma demanda ou de todas). `force` ignora o
   * intervalo entre tentativas e o limite (regeneração manual).
   */
  function processPending({ demandId = null, force = false, limit = 10 } = {}) {
    return serial(async () => {
      if (!storage) return { generated: 0, failed: 0 };
      const { rows } = await pool.query(
        `SELECT id FROM demand_dossiers
          WHERE status IN ('pendente', 'falhou', 'indisponivel')
            AND ($1::uuid IS NULL OR demand_id = $1)
            AND ($2 OR (attempts < $3 AND (last_attempt_at IS NULL
                 OR last_attempt_at < NOW() - make_interval(secs => $4 * power(2, greatest(attempts - 1, 0))))))
          ORDER BY requested_at, version, variant
          LIMIT $5`,
        [demandId, force, maxAttempts, backoffSeconds, limit],
      );
      let generated = 0;
      let failed = 0;
      for (const { id } of rows) {
        const { rows: [claimed] } = await pool.query(
          `UPDATE demand_dossiers SET attempts = attempts + 1, last_attempt_at = NOW()
            WHERE id = $1 AND status <> 'gerado'
            RETURNING id, demand_id, dossier_number, version, variant, trigger_kind, snapshot`,
          [id],
        );
        if (!claimed) continue;
        try {
          await generate(claimed);
          generated += 1;
        } catch (err) {
          failed += 1;
          const reason = `Falha ao gerar o dossiê: ${String(err?.message ?? err).slice(0, 400)}`;
          logger.error(`[dossie] ${claimed.demand_id} v${claimed.version} ${claimed.variant}: ${err?.message ?? err}`);
          await pool.query(
            "UPDATE demand_dossiers SET status = 'falhou', status_reason = $2 WHERE id = $1 AND status <> 'gerado'",
            [id, reason],
          ).catch((e) => logger.error('[dossie] falha ao registrar erro', e?.message ?? e));
        }
      }
      return { generated, failed };
    });
  }

  /** Demandas em análise ou publicadas sem a versão do momento. */
  async function reconcile(limit = 50) {
    const { rows } = await pool.query(
      `SELECT d.id FROM demands d
        WHERE (d.status = 'em_analise' AND d.review_state = 'aguardando_analise' AND d.submitted_at IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM demand_dossiers x WHERE x.demand_id = d.id AND x.origin_key = ${SUBMISSION_KEY_SQL}))
           OR (d.published_at IS NOT NULL AND d.status = ANY($1::demand_status[])
               AND (SELECT count(*) FROM demand_dossiers x WHERE x.demand_id = d.id AND x.origin_key = 'publicacao') < 2)
           OR (d.status IN ('concluida', 'prestacao_de_contas')
               AND (SELECT count(*) FROM demand_dossiers x WHERE x.demand_id = d.id AND x.origin_key = 'conclusao') < 2)
        ORDER BY d.updated_at
        LIMIT $2`,
      [PUBLIC_STATUSES, limit],
    );
    let created = 0;
    for (const { id } of rows) created += await ensureRequests(id);
    return created;
  }

  /** Depois do envio (e sob demanda): registra e tenta gerar, sem lançar. */
  async function request(demandId) {
    try {
      await ensureRequests(demandId);
      return await processPending({ demandId });
    } catch (err) {
      logger.error(`[dossie] pedido ${demandId}: ${err?.message ?? err}`);
      return { generated: 0, failed: 0, error: err };
    }
  }

  async function tick() {
    try {
      await reconcile();
      await processPending({ limit: 20 });
    } catch (err) {
      logger.error(`[dossie] laço: ${err?.message ?? err}`);
    }
  }

  function start(intervalMs = DEFAULT_INTERVAL_MS) {
    if (timer || !(intervalMs > 0)) return;
    timer = setInterval(() => { void tick(); }, intervalMs);
    timer.unref?.();
    setTimeout(() => { void tick(); }, 5_000).unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  async function listForDemand(demandId) {
    const { rows } = await pool.query(
      `SELECT ${DOSSIER_SQL} FROM demand_dossiers x WHERE x.demand_id = $1 ORDER BY x.version DESC, x.variant`,
      [demandId],
    );
    return rows;
  }

  async function findById(demandId, dossierId) {
    const { rows } = await pool.query(
      `SELECT ${DOSSIER_SQL} FROM demand_dossiers x WHERE x.id = $1 AND x.demand_id = $2`,
      [dossierId, demandId],
    );
    return rows[0] ?? null;
  }

  /** Versão pública mais recente (e a última tentativa, para explicar a ausência). */
  async function publicDossier(demandId) {
    const { rows } = await pool.query(
      `SELECT ${DOSSIER_SQL} FROM demand_dossiers x
        WHERE x.demand_id = $1 AND x.variant = 'publica'
        ORDER BY (x.status = 'gerado') DESC, x.version DESC LIMIT 1`,
      [demandId],
    );
    return rows[0] ?? null;
  }

  /** Verificação pública por SHA-256 do conteúdo ou do arquivo. */
  async function findByHash(hash) {
    const { rows } = await pool.query(
      `SELECT ${DOSSIER_SQL}, d.title, d.category, d.status AS demand_status,
              (SELECT max(y.version) FROM demand_dossiers y
                WHERE y.demand_id = x.demand_id AND y.variant = x.variant AND y.status = 'gerado') AS latest_version
         FROM demand_dossiers x JOIN demands d ON d.id = x.demand_id
        WHERE x.status = 'gerado' AND (x.content_sha256 = $1 OR x.file_sha256 = $1)
        LIMIT 1`,
      [hash],
    );
    return rows[0] ?? null;
  }

  function downloadUrl(row, { expiresIn = DOWNLOAD_EXPIRES_SECONDS } = {}) {
    return storage.presignGet({
      key: row.object_key,
      contentType: 'application/pdf',
      fileName: dossierFileName(row),
      disposition: 'attachment',
      expiresIn,
    });
  }

  return {
    storageConfigured: Boolean(storage),
    ensureRequests,
    processPending,
    reconcile,
    request,
    tick,
    start,
    stop,
    listForDemand,
    findById,
    publicDossier,
    findByHash,
    downloadUrl,
    idle: () => chain,
  };
}

module.exports = {
  createDossierService,
  serializeDossier,
  dossierKey,
  dossierFileName,
  MAX_ATTEMPTS,
  DOWNLOAD_EXPIRES_SECONDS,
  PUBLIC_DOWNLOAD_EXPIRES_SECONDS,
  UNAVAILABLE_REASON,
};
