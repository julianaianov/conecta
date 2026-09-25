// Upload de arquivos (T08): fotografia da demanda, documentos comprobatórios,
// fotos e vídeos do antes/depois e comprovação da representação institucional.
//
// ESTE ARQUIVO É O MESMO em services/post-service/src/uploads.js e
// services/user-service/src/uploads.js (há teste que confere). Cada serviço
// entra com a sua política (finalidades aceitas, alvo, visibilidade) em
// src/upload-policy.js e com a própria tabela `uploads` (post_db migração 008,
// user_db migração 009).
//
// Fluxo (o arquivo nunca passa pelos serviços):
//   1. POST /uploads/presign    { purpose, contentType, size, fileName?, sha256? }
//      → grava `uploads` pendente e devolve URL pré-assinada de PUT para
//        `tmp/<uuid>` (o navegador envia direto ao S3 com os `headers` dados).
//   2. POST /uploads/:id/confirm { demandId? }
//      → HeadObject, confere tamanho, tipo, assinatura dos primeiros bytes e
//        sha256 (quando informado), copia para a chave definitiva
//        (`demands/<id>/...`, `institutions/<id>/...`), apaga o tmp e marca
//        `confirmado` com o vínculo.
//   3. GET /uploads/:id          (token) metadados + URL de leitura curta, para
//      o dono, a operação (DM_OPERATION_USER_IDS) ou, se público, qualquer conta.
//      GET /uploads/:id/content  (sem token) redireciona para a URL de leitura,
//      só quando a finalidade é pública e o alvo está publicado (ex.: foto de
//      demanda publicada). É o endereço estável usado no feed.
//
// Sem DM_UPLOADS_BUCKET as rotas respondem 503 `uploads_unavailable`: não há
// armazenamento falso. Credenciais: cadeia padrão do SDK (na EC2, o instance
// profile por IMDSv2; nada de chave estática). O IAM do bucket só permite
// Put/Get/DeleteObject: HeadObject de chave inexistente responde 403, tratado
// como arquivo ausente.

const crypto = require('node:crypto');

const MB = 1024 * 1024;

const IMAGE_TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic'],
  'image/heif': ['heif'],
};

const VIDEO_TYPES = {
  'video/mp4': ['mp4'],
  'video/quicktime': ['mov'],
};

const DOCUMENT_TYPES = {
  'application/pdf': ['pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
  'application/vnd.oasis.opendocument.text': ['odt'],
  'application/vnd.oasis.opendocument.spreadsheet': ['ods'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
};

/**
 * Finalidades. `target`: a que o arquivo se vincula na confirmação.
 * `visibility`: `public` só vale quando o alvo está publicado (política do
 * serviço); `private` fica com o dono e a gestão; `institutional` (Modelo de
 * Conexão §33, T-05-18) vale também para quem o serviço reconhece como
 * envolvido no processo (`institutionalAccess` das rotas).
 * Vídeo: um PUT único aceita até 5 GB no S3; o limite da plataforma é 500 MB
 * sem multipart (conexões ruins podem precisar de reenvio).
 */
const PURPOSES = {
  demand_photo: {
    label: 'Fotografia da demanda', target: 'demand', folder: 'photo',
    types: IMAGE_TYPES, maxBytes: 15 * MB, visibility: 'public',
  },
  demand_evidence_photo: {
    label: 'Foto do antes/depois', target: 'demand', folder: 'evidence',
    types: IMAGE_TYPES, maxBytes: 15 * MB, visibility: 'public',
  },
  demand_evidence_video: {
    label: 'Vídeo do antes/depois', target: 'demand', folder: 'evidence',
    types: VIDEO_TYPES, maxBytes: 500 * MB, visibility: 'public',
  },
  demand_document: {
    label: 'Documento comprobatório da demanda', target: 'demand', folder: 'documents',
    types: DOCUMENT_TYPES, maxBytes: 25 * MB, visibility: 'institutional',
  },
  demand_accountability_document: {
    label: 'Documento da prestação de contas', target: 'demand', folder: 'accountability',
    types: DOCUMENT_TYPES, maxBytes: 25 * MB, visibility: 'private',
  },
  // Laudos, certificados, notas fiscais e registros técnicos anexados durante
  // a execução (T-05-12, Modelo de Conexão §20).
  demand_execution_document: {
    label: 'Documento da execução', target: 'demand', folder: 'execution',
    types: DOCUMENT_TYPES, maxBytes: 25 * MB, visibility: 'private',
  },
  institution_proof: {
    label: 'Comprovação da representação', target: 'institution', folder: 'proof',
    types: DOCUMENT_TYPES, maxBytes: 25 * MB, visibility: 'private',
  },
  // Documentação institucional (estatuto, ata, cartão CNPJ...; Modelo de
  // Conexão §02): titular e gestão.
  institution_document: {
    label: 'Documentação institucional', target: 'institution', folder: 'documents',
    types: DOCUMENT_TYPES, maxBytes: 25 * MB, visibility: 'private',
  },
  // Foto do sinal do feed: obrigatória para a publicação entrar no mapa. O
  // post ainda não existe na confirmação (`deferredTarget`): o arquivo fica em
  // `posts/<owner_id>/photo/<id>.<ext>` e o POST /posts grava o vínculo
  // (`uploads.post_id`) ao publicar.
  post_photo: {
    label: 'Foto do sinal', target: 'post', folder: 'photo',
    types: IMAGE_TYPES, maxBytes: 15 * MB, visibility: 'public', deferredTarget: true,
  },
};

const TARGET_PREFIX = { demand: 'demands', institution: 'institutions', post: 'posts' };

const PUT_EXPIRES_SECONDS = 15 * 60;
const GET_EXPIRES_SECONDS = 5 * 60;
const PUBLIC_GET_EXPIRES_SECONDS = 15 * 60;
const PUBLIC_CACHE_SECONDS = 10 * 60;
/** Envios pendentes por conta na última hora (abuso e lixo em tmp/). */
const MAX_PENDING_PER_HOUR = 30;
const MAX_FILE_NAME = 255;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REF_PREFIX = 'upload:';

// ── Configuração ────────────────────────────────────────────────────────────

/** `{ bucket, region }` ou `null` quando o ambiente não tem bucket de uploads. */
function uploadsConfig(env = process.env) {
  const bucket = typeof env.DM_UPLOADS_BUCKET === 'string' ? env.DM_UPLOADS_BUCKET.trim() : '';
  if (!bucket) return null;
  const region = (env.DM_UPLOADS_REGION || env.AWS_REGION || 'us-east-2').trim();
  return { bucket, region };
}

// ── Referências ─────────────────────────────────────────────────────────────

/** Id do upload em `upload:<uuid>` ou num UUID puro; `null` para o resto. */
function parseUploadRef(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  const id = raw.toLowerCase().startsWith(REF_PREFIX) ? raw.slice(REF_PREFIX.length) : raw;
  return UUID_RE.test(id) ? id.toLowerCase() : null;
}

const formatUploadRef = (id) => `${REF_PREFIX}${id}`;

/** Endereço público estável (redireciona para a URL de leitura). */
const contentPath = (publicPrefix, id) => `${publicPrefix}/${id}/content`;

// ── Validação do pedido ─────────────────────────────────────────────────────

function normalizeContentType(value) {
  if (typeof value !== 'string') return '';
  const type = value.split(';')[0].trim().toLowerCase();
  return type === 'image/jpg' ? 'image/jpeg' : type;
}

function extensionOf(fileName) {
  const match = /\.([a-z0-9]{1,8})$/i.exec(fileName || '');
  return match ? match[1].toLowerCase() : null;
}

function cleanFileName(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string') return undefined;
  // Só o nome (sem caminho), sem caracteres de controle.
  const name = raw.split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!name) return null;
  return name.length > MAX_FILE_NAME ? undefined : name;
}

function formatBytes(bytes) {
  return bytes >= MB ? `${Math.round(bytes / MB)} MB` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Confere o pedido de envio para a finalidade. Devolve
 * `{ value: { purpose, contentType, size, fileName, sha256 }, fields }`.
 */
function validateUploadRequest(body, allowedPurposes = Object.keys(PURPOSES)) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const fields = {};
  const purpose = typeof input.purpose === 'string' ? input.purpose : '';
  const def = allowedPurposes.includes(purpose) ? PURPOSES[purpose] : null;
  if (!def) {
    fields.purpose = `Finalidade aceita: ${allowedPurposes.join(', ')}`;
    return { value: null, fields };
  }

  const contentType = normalizeContentType(input.contentType);
  const allowed = Object.keys(def.types);
  if (!allowed.includes(contentType)) {
    const exts = [...new Set(Object.values(def.types).flat())].map((e) => e.toUpperCase());
    fields.contentType = `Tipo de arquivo não aceito. Envie ${exts.join(', ')}`;
  }

  const size = input.size;
  if (!Number.isSafeInteger(size) || size <= 0) {
    fields.size = 'Tamanho do arquivo inválido';
  } else if (size > def.maxBytes) {
    fields.size = `O arquivo passa do limite de ${formatBytes(def.maxBytes)}`;
  }

  const fileName = cleanFileName(input.fileName);
  if (fileName === undefined) fields.fileName = `Nome do arquivo inválido (até ${MAX_FILE_NAME} caracteres)`;
  if (fileName && !fields.contentType) {
    const ext = extensionOf(fileName);
    if (ext && !def.types[contentType].includes(ext)) {
      fields.fileName = 'A extensão do arquivo não corresponde ao tipo informado';
    }
  }

  let sha256 = null;
  if (input.sha256 !== undefined && input.sha256 !== null && input.sha256 !== '') {
    if (typeof input.sha256 === 'string' && /^[0-9a-f]{64}$/i.test(input.sha256)) {
      sha256 = input.sha256.toLowerCase();
    } else {
      fields.sha256 = 'sha256 em hexadecimal (64 caracteres)';
    }
  }

  return { value: { purpose, contentType, size, fileName: fileName || null, sha256 }, fields };
}

// ── Assinatura dos primeiros bytes ──────────────────────────────────────────

const ascii = (bytes, start, end) => Buffer.from(bytes.slice(start, end)).toString('latin1');

/** Confere se o começo do arquivo combina com o tipo declarado. */
function matchesSignature(contentType, bytes) {
  if (!bytes || bytes.length < 12) return false;
  const b = bytes;
  switch (contentType) {
    case 'image/jpeg':
      return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    case 'image/png':
      return b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a;
    case 'image/webp':
      return ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP';
    case 'image/heic':
    case 'image/heif':
      return ascii(b, 4, 8) === 'ftyp';
    case 'video/mp4':
    case 'video/quicktime':
      return ['ftyp', 'moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(b, 4, 8));
    case 'application/pdf':
      return ascii(b, 0, 5) === '%PDF-';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    case 'application/vnd.oasis.opendocument.text':
    case 'application/vnd.oasis.opendocument.spreadsheet':
      return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
    default:
      return false;
  }
}

// ── Chaves ──────────────────────────────────────────────────────────────────

const tmpKey = (id) => `tmp/${id}`;

function finalKey(purpose, targetId, id, contentType) {
  const def = PURPOSES[purpose];
  const ext = def.types[contentType][0];
  return `${TARGET_PREFIX[def.target]}/${targetId}/${def.folder}/${id}.${ext}`;
}

/** Content-Disposition com nome em ASCII e em UTF-8 (RFC 6266/5987). */
function contentDisposition(kind, fileName) {
  if (!fileName) return kind;
  const fallback = fileName.normalize('NFD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '').trim() || 'arquivo';
  return `${kind}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

// ── Armazenamento (S3) ──────────────────────────────────────────────────────

/**
 * Operações no bucket. `client` (com `send`) e `presign` podem ser injetados
 * nos testes; sem eles, usa o SDK v3 com a cadeia padrão de credenciais.
 */
function createUploadStorage({ bucket, region, client, presign } = {}) {
  if (!bucket) return null;
  const sdk = require('@aws-sdk/client-s3');
  const s3 = client ?? new sdk.S3Client({
    region,
    // Sem checksum automático: URLs pré-assinadas para o navegador não podem
    // carregar o CRC32 de um corpo vazio.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const sign = presign ?? require('@aws-sdk/s3-request-presigner').getSignedUrl;

  const missing = (err) => {
    const status = err?.$metadata?.httpStatusCode;
    // Sem s3:ListBucket, chave inexistente responde 403 em vez de 404.
    return status === 404 || status === 403 || ['NotFound', 'NoSuchKey', 'Forbidden', 'AccessDenied'].includes(err?.name);
  };

  return {
    bucket,

    /** URL de PUT; `Content-Type` (e o checksum, quando há) vão assinados. */
    async presignPut({ key, contentType, sha256 }) {
      const input = { Bucket: bucket, Key: key, ContentType: contentType };
      const headers = { 'Content-Type': contentType };
      const unhoistable = new Set();
      if (sha256) {
        input.ChecksumSHA256 = Buffer.from(sha256, 'hex').toString('base64');
        headers['x-amz-checksum-sha256'] = input.ChecksumSHA256;
        unhoistable.add('x-amz-checksum-sha256');
      }
      const url = await sign(s3, new sdk.PutObjectCommand(input), {
        expiresIn: PUT_EXPIRES_SECONDS,
        signableHeaders: new Set(['content-type']),
        unhoistableHeaders: unhoistable,
      });
      return { url, headers, expiresIn: PUT_EXPIRES_SECONDS };
    },

    /** URL de GET curta, com tipo e disposição definidos pela plataforma. */
    presignGet({ key, contentType, fileName, disposition = 'inline', expiresIn = GET_EXPIRES_SECONDS }) {
      return sign(s3, new sdk.GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(disposition, fileName),
      }), { expiresIn });
    },

    /** `{ size, contentType, checksumSha256 }` ou `null` se o objeto não existe. */
    async head(key) {
      try {
        const out = await s3.send(new sdk.HeadObjectCommand({ Bucket: bucket, Key: key, ChecksumMode: 'ENABLED' }));
        return {
          size: Number(out.ContentLength),
          contentType: normalizeContentType(out.ContentType),
          checksumSha256: out.ChecksumSHA256 ?? null,
        };
      } catch (err) {
        if (missing(err)) return null;
        throw err;
      }
    },

    /** Primeiros `length` bytes do objeto (assinatura do tipo). */
    async readPrefix(key, length = 16) {
      const out = await s3.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${length - 1}` }));
      const bytes = await out.Body.transformToByteArray();
      return bytes.slice(0, length);
    },

    /** Objeto inteiro (arquivos pequenos gerados ou lidos pelo servidor, ex.: dossiê). */
    async get(key) {
      const out = await s3.send(new sdk.GetObjectCommand({ Bucket: bucket, Key: key }));
      return Buffer.from(await out.Body.transformToByteArray());
    },

    /** Grava um arquivo gerado pelo servidor (ex.: PDF do dossiê), com SHA-256 conferido pelo S3. */
    put({ key, body, contentType, sha256 }) {
      const input = { Bucket: bucket, Key: key, Body: body, ContentType: contentType };
      if (sha256) input.ChecksumSHA256 = Buffer.from(sha256, 'hex').toString('base64');
      return s3.send(new sdk.PutObjectCommand(input));
    },

    copy(fromKey, toKey) {
      return s3.send(new sdk.CopyObjectCommand({
        Bucket: bucket,
        Key: toKey,
        CopySource: `${bucket}/${fromKey.split('/').map(encodeURIComponent).join('/')}`,
        MetadataDirective: 'COPY',
      }));
    },

    async remove(key) {
      try {
        await s3.send(new sdk.DeleteObjectCommand({ Bucket: bucket, Key: key }));
      } catch (err) {
        // tmp/ expira em 1 dia; falha ao apagar não impede o fluxo.
        console.error('[uploads] falha ao apagar', key, err?.name ?? err);
      }
    },
  };
}

// ── Banco ───────────────────────────────────────────────────────────────────

const UPLOAD_COLUMNS = [
  'id', 'owner_id', 'purpose', 'status', 'tmp_key', 'object_key', 'content_type',
  'declared_size_bytes', 'size_bytes', 'sha256', 'original_name', 'created_at', 'confirmed_at',
];

/** Uma coluna de vínculo ou várias (`['demand_id', 'post_id']` no post-service). */
const targetList = (targetColumns) => (Array.isArray(targetColumns) ? targetColumns : [targetColumns]);
const uploadSelect = (targetColumns) => [...UPLOAD_COLUMNS, ...targetList(targetColumns)].join(', ');

const toIso = (v) => (v instanceof Date ? v.toISOString() : v ?? null);
const camel = (column) => column.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function serializeUpload(row, targetColumns) {
  const out = {
    id: row.id,
    ref: formatUploadRef(row.id),
    purpose: row.purpose,
    status: row.status,
    contentType: row.content_type,
    size: Number(row.size_bytes ?? row.declared_size_bytes),
    fileName: row.original_name ?? null,
    sha256: row.sha256 ?? null,
  };
  for (const column of targetList(targetColumns)) out[camel(column)] = row[column] ?? null;
  out.createdAt = toIso(row.created_at);
  out.confirmedAt = toIso(row.confirmed_at);
  return out;
}

/**
 * Upload confirmado que pode ser usado como referência: do dono, da
 * finalidade e vinculado ao alvo. `null` se não servir.
 */
async function findUsableUpload(db, { id, ownerId, purpose, targetColumn, targetId }) {
  if (!id) return null;
  const { rows } = await db.query(
    `SELECT ${uploadSelect(targetColumn)} FROM uploads
      WHERE id = $1 AND owner_id = $2 AND purpose = $3 AND status = 'confirmado' AND ${targetColumn} = $4`,
    [id, ownerId, purpose, targetId],
  );
  return rows[0] ?? null;
}

/** Metadados + URL de leitura curta de uploads confirmados (visões privadas). */
async function describeUploads(db, storage, ids, targetColumn) {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map();
  if (!unique.length) return out;
  const { rows } = await db.query(
    `SELECT ${uploadSelect(targetColumn)} FROM uploads WHERE id = ANY($1::uuid[]) AND status = 'confirmado'`,
    [unique],
  );
  for (const row of rows) {
    out.set(row.id, {
      ...serializeUpload(row, targetColumn),
      url: storage ? await readUrl(storage, row) : null,
    });
  }
  return out;
}

function readUrl(storage, row, expiresIn = GET_EXPIRES_SECONDS) {
  const def = PURPOSES[row.purpose];
  return storage.presignGet({
    key: row.object_key,
    contentType: row.content_type,
    fileName: row.original_name,
    // Documentos baixam; imagens e vídeos abrem no navegador.
    disposition: def?.visibility === 'public' ? 'inline' : 'attachment',
    expiresIn,
  });
}

// ── Rotas ───────────────────────────────────────────────────────────────────

class UploadError extends Error {
  constructor(status, body) {
    super(body?.error ?? `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

const UNAVAILABLE = {
  error: 'O envio de arquivos não está configurado neste ambiente (DM_UPLOADS_BUCKET ausente)',
  code: 'uploads_unavailable',
};

/**
 * Rotas `/uploads`. `policy` (por serviço):
 *   purposes: finalidades aceitas;
 *   targetColumn: 'demand_id' | 'organization_id' (coluna de vínculo padrão);
 *   targetColumns (opcional): todas as colunas de vínculo do serviço;
 *   targetColumnFor(purpose) (opcional): a coluna de vínculo da finalidade;
 *   publicPrefix: prefixo público das rotas (ex.: '/api/posts/uploads');
 *   canPresign(user, purpose) → null | { status, body };
 *   resolveTarget(db, user, purpose, body) → id do alvo (lança UploadError);
 *     `null` nas finalidades com `deferredTarget` (o vínculo vem depois);
 *   isPublic(db, row) → o alvo está publicado?
 * `institutionalAccess(db, row, req)` (opcional; `req` nulo na leitura sem
 * token): decide as finalidades `institutional` além do dono e da operação.
 */
function createUploadRoutes({ pool, auth, storage, policy, operationUserIds = new Set(), institutionalAccess = null }) {
  const express = require('express');
  if (typeof auth !== 'function' || !policy) throw new Error('upload routes exigem auth e política');
  const router = express.Router();
  const { targetColumn } = policy;
  const targetColumns = policy.targetColumns ?? [targetColumn];
  const columnFor = (purpose) => policy.targetColumnFor?.(purpose) ?? targetColumn;
  const select = uploadSelect(targetColumns);

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof UploadError) return res.status(err.status).json(err.body);
      console.error('[uploads]', err);
      return res.status(500).json({ error: 'Erro interno' });
    }
  };
  const requireStorage = (_req, res, next) => (storage ? next() : res.status(503).json(UNAVAILABLE));
  const notFound = (res) => res.status(404).json({ error: 'Arquivo não encontrado' });
  router.param('id', (_req, res, next, id) => (UUID_RE.test(id) ? next() : notFound(res)));

  async function canRead(row, user, req = null) {
    if (user && (row.owner_id === user.userId || operationUserIds.has(user.userId))) return true;
    if (row.status !== 'confirmado') return false;
    const visibility = PURPOSES[row.purpose]?.visibility;
    if (visibility === 'institutional') {
      return typeof institutionalAccess === 'function' && Boolean(await institutionalAccess(pool, row, req));
    }
    if (visibility !== 'public') return false;
    return policy.isPublic(pool, row);
  }

  router.post('/presign', requireStorage, auth, handle(async (req, res) => {
    const { value, fields } = validateUploadRequest(req.body, policy.purposes);
    if (Object.keys(fields).length) {
      return res.status(422).json({ error: 'Arquivo não aceito', code: 'validation_failed', fields });
    }
    const denied = policy.canPresign(req.user, value.purpose);
    if (denied) return res.status(denied.status).json(denied.body);

    // Pendentes antigos: o objeto em tmp/ já expirou no bucket.
    await pool.query(
      "DELETE FROM uploads WHERE owner_id = $1 AND status = 'pendente' AND created_at < NOW() - INTERVAL '2 days'",
      [req.user.userId],
    );
    const { rows: [recent] } = await pool.query(
      "SELECT count(*)::int AS n FROM uploads WHERE owner_id = $1 AND status = 'pendente' AND created_at > NOW() - INTERVAL '1 hour'",
      [req.user.userId],
    );
    if (recent && recent.n >= MAX_PENDING_PER_HOUR) {
      return res.status(429).json({ error: 'Muitos envios em andamento. Aguarde alguns minutos e tente de novo', code: 'too_many_uploads' });
    }

    const id = crypto.randomUUID();
    const key = tmpKey(id);
    await pool.query(
      `INSERT INTO uploads (id, owner_id, purpose, status, tmp_key, content_type, declared_size_bytes, sha256, original_name)
       VALUES ($1, $2, $3, 'pendente', $4, $5, $6, $7, $8)`,
      [id, req.user.userId, value.purpose, key, value.contentType, value.size, value.sha256, value.fileName],
    );
    const put = await storage.presignPut({ key, contentType: value.contentType, sha256: value.sha256 });
    res.status(201).json({
      uploadId: id,
      ref: formatUploadRef(id),
      method: 'PUT',
      url: put.url,
      headers: put.headers,
      expiresAt: new Date(Date.now() + put.expiresIn * 1000).toISOString(),
      maxBytes: PURPOSES[value.purpose].maxBytes,
    });
  }));

  router.post('/:id/confirm', requireStorage, auth, handle(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT ${select} FROM uploads WHERE id = $1 AND owner_id = $2`,
      [req.params.id, req.user.userId],
    );
    const row = rows[0];
    if (!row || !policy.purposes.includes(row.purpose)) return notFound(res);
    if (row.status === 'confirmado') {
      return res.json({ ...serializeUpload(row, targetColumns), url: await readUrl(storage, row) });
    }

    const targetId = await policy.resolveTarget(pool, req.user, row.purpose, req.body ?? {});
    if (targetId === null && !PURPOSES[row.purpose]?.deferredTarget) {
      throw new UploadError(422, { error: 'Informe a que o arquivo se vincula', code: 'validation_failed' });
    }

    const head = await storage.head(row.tmp_key);
    if (!head) {
      return res.status(409).json({
        error: 'O arquivo não chegou ao armazenamento (ou o prazo expirou). Envie de novo',
        code: 'upload_missing',
      });
    }
    const def = PURPOSES[row.purpose];
    const reject = async (error) => {
      await storage.remove(row.tmp_key);
      await pool.query("DELETE FROM uploads WHERE id = $1 AND status = 'pendente'", [row.id]);
      return res.status(422).json({ error, code: 'upload_rejected' });
    };
    if (!(head.size > 0) || head.size > def.maxBytes) {
      return reject(`O arquivo passa do limite de ${formatBytes(def.maxBytes)}`);
    }
    if (head.size !== Number(row.declared_size_bytes)) {
      return reject('O tamanho do arquivo enviado não confere com o informado');
    }
    if (head.contentType !== row.content_type) {
      return reject('O tipo do arquivo enviado não confere com o informado');
    }
    if (row.sha256 && head.checksumSha256
      && head.checksumSha256 !== Buffer.from(row.sha256, 'hex').toString('base64')) {
      return reject('O conteúdo do arquivo não confere com o sha256 informado');
    }
    if (!matchesSignature(row.content_type, await storage.readPrefix(row.tmp_key, 16))) {
      return reject('O conteúdo do arquivo não corresponde ao tipo informado');
    }

    // Vínculo adiado (ex.: foto do sinal antes do post existir): a chave fica
    // sob o dono do arquivo.
    const key = finalKey(row.purpose, targetId ?? row.owner_id, row.id, row.content_type);
    await storage.copy(row.tmp_key, key);
    await storage.remove(row.tmp_key);
    const { rows: updated } = await pool.query(
      `UPDATE uploads
          SET status = 'confirmado', object_key = $2, size_bytes = $3, ${columnFor(row.purpose)} = $4, confirmed_at = NOW()
        WHERE id = $1 AND status = 'pendente'
        RETURNING ${select}`,
      [row.id, key, head.size, targetId],
    );
    const confirmed = updated[0]
      ?? (await pool.query(`SELECT ${select} FROM uploads WHERE id = $1`, [row.id])).rows[0];
    res.json({ ...serializeUpload(confirmed, targetColumns), url: await readUrl(storage, confirmed) });
  }));

  router.get('/:id', auth, handle(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${select} FROM uploads WHERE id = $1`, [req.params.id]);
    const row = rows[0];
    if (!row || !(await canRead(row, req.user, req))) return notFound(res);
    const url = storage && row.status === 'confirmado' ? await readUrl(storage, row) : null;
    res.json({ ...serializeUpload(row, targetColumns), url });
  }));

  router.get('/:id/content', requireStorage, handle(async (req, res) => {
    const { rows } = await pool.query(`SELECT ${select} FROM uploads WHERE id = $1`, [req.params.id]);
    const row = rows[0];
    if (!row || !(await canRead(row, null))) return notFound(res);
    const url = await readUrl(storage, row, PUBLIC_GET_EXPIRES_SECONDS);
    res.set('Cache-Control', `public, max-age=${PUBLIC_CACHE_SECONDS}`);
    res.redirect(302, url);
  }));

  return router;
}

module.exports = {
  PURPOSES,
  IMAGE_TYPES,
  VIDEO_TYPES,
  DOCUMENT_TYPES,
  MAX_PENDING_PER_HOUR,
  PUT_EXPIRES_SECONDS,
  GET_EXPIRES_SECONDS,
  UploadError,
  uploadsConfig,
  parseUploadRef,
  formatUploadRef,
  contentPath,
  normalizeContentType,
  validateUploadRequest,
  matchesSignature,
  tmpKey,
  finalKey,
  contentDisposition,
  createUploadStorage,
  serializeUpload,
  findUsableUpload,
  describeUploads,
  createUploadRoutes,
};
