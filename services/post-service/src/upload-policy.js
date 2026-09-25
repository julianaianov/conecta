// Política de uploads do post-service (T08): arquivos da demanda.
//
// - Só o Agente de Transformação envia, e só para a própria demanda.
// - Fotografia e documentos: a demanda precisa estar editável (rascunho ou
//   devolvida), como o resto do conteúdo (trigger demands_guard).
// - Fotos e vídeos do antes/depois: demanda da publicação em diante, fora
//   `arquivada` (a T17 vincula a evidência ao andamento).
// - Documentos da prestação de contas (T18): só com a demanda em
//   `prestacao_de_contas` (comprovantes, relatórios e registros das ações).
// - Documentos da execução (T-05-12: laudos, certificados, notas fiscais,
//   registros técnicos): da execução em diante (`em_execucao`, `concluida`,
//   `prestacao_de_contas`).
// - Público: foto e evidências de demanda publicada; documentos, nunca.
// - Foto do sinal do feed (`post_photo`): quem publica no feed envia antes de
//   criar o post (o vínculo `uploads.post_id` é gravado pelo POST /posts);
//   pública quando o post está visível.
// - Arquivos do Processo de Conexão (`process_attachment`, anexos da
//   comunicação, T-05-02; `process_document`, documentos do processo,
//   T-05-04): qualquer das partes (Agente autor ou parte conectada, com o
//   órgão por vínculo T29) envia para um processo em aberto (`processId`);
//   vínculo em `uploads.process_id` (a demanda do processo vai junto, pelo
//   trigger da migração 027). Nunca públicos por aqui: a leitura é pelas
//   rotas do processo.

const { normalizeRole, canPublishAny } = require('./roles');
const { isUuid } = require('./security');
const { PUBLIC_STATUSES } = require('./demand/constants');
const { UploadError, findUsableUpload, parseUploadRef, describeUploads, contentPath } = require('./uploads');

const PURPOSES = ['demand_photo', 'demand_evidence_photo', 'demand_evidence_video', 'demand_document',
  'demand_accountability_document', 'demand_execution_document', 'post_photo'];
const POST_PURPOSES = ['post_photo'];
const EDITABLE_PURPOSES = ['demand_photo', 'demand_document'];
// Prestação de contas (T18): a demanda precisa estar no último status canônico.
const ACCOUNTABILITY_PURPOSES = ['demand_accountability_document'];
// Documentos da execução (T-05-12): os mesmos estados do andamento.
const EXECUTION_DOCUMENT_PURPOSES = ['demand_execution_document'];
const EXECUTION_DOCUMENT_STATUSES = ['em_execucao', 'concluida', 'prestacao_de_contas'];
const PUBLIC_PREFIX = '/api/posts/uploads';
const TARGET_COLUMN = 'demand_id';
const POST_TARGET_COLUMN = 'post_id';
// Processo de Conexão (T-05-02, T-05-04).
const PROCESS_PURPOSES = ['process_attachment', 'process_document'];
const PROCESS_TARGET_COLUMN = 'process_id';
const ALL_PURPOSES = [...PURPOSES, ...PROCESS_PURPOSES];

const DEMAND_NOT_FOUND = { error: 'Demanda não encontrada' };
const PROCESS_NOT_FOUND = { error: 'Processo não encontrado' };

function targetColumnFor(purpose) {
  if (POST_PURPOSES.includes(purpose)) return POST_TARGET_COLUMN;
  if (PROCESS_PURPOSES.includes(purpose)) return PROCESS_TARGET_COLUMN;
  return TARGET_COLUMN;
}

/** Processo em aberto de que quem envia é parte (Agente autor ou parte conectada). */
async function resolveProcessTarget(db, req, body, institutionStatus) {
  // Carregado aqui para não criar ciclo na inicialização (process/store usa demand/store).
  const processStore = require('./process/store');
  const processId = body?.processId;
  if (!isUuid(processId)) {
    throw new UploadError(422, {
      error: 'Informe o processo do arquivo', code: 'validation_failed', fields: { processId: 'Processo inválido' },
    });
  }
  let row;
  let role = null;
  try {
    row = await processStore.findProcess(db, processId);
    role = row ? await processStore.viewerRoleFor(req, row, institutionStatus) : null;
  } catch (err) {
    if (err?.status && err?.body) throw new UploadError(err.status, err.body);
    throw err;
  }
  if (!row || !role) throw new UploadError(404, PROCESS_NOT_FOUND);
  if (row.closed_at) throw new UploadError(409, { error: 'O processo foi encerrado', code: 'process_closed' });
  return row.id;
}

function createPostUploadPolicy({ institutionStatus } = {}) {
  return {
    purposes: ALL_PURPOSES,
    targetColumn: TARGET_COLUMN,
    targetColumns: [TARGET_COLUMN, POST_TARGET_COLUMN, PROCESS_TARGET_COLUMN],
    targetColumnFor,
    publicPrefix: PUBLIC_PREFIX,

    canPresign(user, purpose) {
      // Qualquer conta envia; a confirmação confere se ela é parte do processo.
      if (PROCESS_PURPOSES.includes(purpose)) return null;
      if (POST_PURPOSES.includes(purpose)) {
        if (canPublishAny(user)) return null;
        return { status: 403, body: { error: 'Seu perfil não publica sinais no feed', code: 'cannot_publish' } };
      }
      if (normalizeRole(user?.role, user?.profileType) === 'agent') return null;
      return {
        status: 403,
        body: { error: 'Só Agentes de Transformação enviam arquivos de demanda', code: 'demand_author_not_agent' },
      };
    },

    async resolveTarget(db, user, purpose, body, req) {
      // A foto do sinal é confirmada antes do post existir; o vínculo vem no POST /posts.
      if (POST_PURPOSES.includes(purpose)) return null;
      if (PROCESS_PURPOSES.includes(purpose)) return resolveProcessTarget(db, req ?? { user, headers: {} }, body, institutionStatus);
      const demandId = body?.demandId;
      if (!isUuid(demandId)) {
        throw new UploadError(422, {
          error: 'Informe a demanda do arquivo', code: 'validation_failed', fields: { demandId: 'Demanda inválida' },
        });
      }
      const { rows } = await db.query(
        'SELECT id, author_id, status, review_state FROM demands WHERE id = $1',
        [demandId],
      );
      const demand = rows[0];
      if (!demand || demand.author_id !== user.userId) throw new UploadError(404, DEMAND_NOT_FOUND);
      if (EDITABLE_PURPOSES.includes(purpose)) {
        const editable = demand.status === 'em_analise' && ['rascunho', 'devolvida'].includes(demand.review_state);
        if (!editable) {
          throw new UploadError(409, {
            error: 'A demanda só recebe fotografia e documentos em rascunho ou devolvida para ajustes',
            code: 'demand_not_editable',
          });
        }
      } else if (ACCOUNTABILITY_PURPOSES.includes(purpose)) {
        if (demand.status !== 'prestacao_de_contas') {
          throw new UploadError(409, {
            error: 'Os documentos da prestação de contas entram com a demanda em prestação de contas',
            code: 'invalid_state',
          });
        }
      } else if (EXECUTION_DOCUMENT_PURPOSES.includes(purpose)) {
        if (!EXECUTION_DOCUMENT_STATUSES.includes(demand.status)) {
          throw new UploadError(409, {
            error: 'Os documentos da execução entram a partir do início da execução',
            code: 'invalid_state',
          });
        }
      } else if (!PUBLIC_STATUSES.includes(demand.status)) {
        throw new UploadError(409, {
          error: 'Fotos e vídeos do antes e depois entram depois da publicação da demanda',
          code: 'invalid_state',
        });
      }
      return demand.id;
    },

    async isPublic(db, row) {
      if (PROCESS_PURPOSES.includes(row.purpose)) return false;
      if (POST_PURPOSES.includes(row.purpose)) {
        if (!row.post_id) return false;
        const { rows } = await db.query("SELECT 1 FROM posts WHERE id = $1 AND visibility = 'visible'", [row.post_id]);
        return rows.length > 0;
      }
      if (!row.demand_id) return false;
      const { rows } = await db.query(
        'SELECT 1 FROM demands WHERE id = $1 AND status = ANY($2::demand_status[])',
        [row.demand_id, PUBLIC_STATUSES],
      );
      return rows.length > 0;
    },
  };
}

// ── Referências na demanda ──────────────────────────────────────────────────

/** Endereço estável de leitura pública de uma referência (`upload:<id>` ou link https). */
function publicMediaUrl(ref) {
  const id = parseUploadRef(ref);
  if (id) return contentPath(PUBLIC_PREFIX, id);
  return typeof ref === 'string' && ref ? ref : null;
}

/**
 * Expressão SQL de `posts.images` com `upload:<id>` trocado pelo endereço
 * público (o post-vitrine herda a foto da demanda).
 */
const POST_IMAGES_SQL = "ARRAY(SELECT CASE WHEN img LIKE 'upload:%' "
  + `THEN '${PUBLIC_PREFIX}/' || substr(img, 8) || '/content' ELSE img END FROM unnest(images) AS img) AS images`;

/**
 * Confere uma referência de upload antes de gravar: confirmada, do autor, da
 * finalidade e vinculada à demanda. Link https passa (compatibilidade).
 */
async function assertDemandUpload(db, { ref, ownerId, demandId, purpose, field }) {
  const id = parseUploadRef(ref);
  if (!id) return;
  const row = demandId
    ? await findUsableUpload(db, { id, ownerId, purpose, targetColumn: TARGET_COLUMN, targetId: demandId })
    : null;
  if (!row) {
    throw new UploadError(422, {
      error: 'Confira os campos destacados',
      code: 'validation_failed',
      fields: {
        [field]: demandId
          ? 'Arquivo não encontrado: envie e confirme o arquivo para esta demanda'
          : 'Crie o rascunho antes de anexar arquivos',
      },
    });
  }
}

/**
 * Visão do autor: acrescenta URL de leitura curta à fotografia e aos
 * documentos enviados por upload (`photoFile`, `documents[].file`).
 */
async function attachOwnerUploads(db, storage, demand) {
  const photoId = parseUploadRef(demand.photoRef);
  const docs = Array.isArray(demand.documents) ? demand.documents : [];
  const ids = [photoId, ...docs.map((d) => parseUploadRef(d.reference))].filter(Boolean);
  if (!ids.length) return demand;
  const files = await describeUploads(db, storage, ids, TARGET_COLUMN);
  if (photoId) {
    const file = files.get(photoId) ?? null;
    demand.photoFile = file;
    demand.photoUrl = file?.url ?? null;
  }
  for (const doc of docs) {
    const id = parseUploadRef(doc.reference);
    if (id) doc.file = files.get(id) ?? null;
  }
  return demand;
}

// ── Foto do sinal do feed ───────────────────────────────────────────────────

/**
 * Confere as imagens de um post antes de gravar: toda referência `upload:<id>`
 * precisa ser upload confirmado, do autor, da finalidade `post_photo` e ainda
 * sem post (ou já deste post, na edição). Link https passa (compatibilidade).
 * Devolve os ids de upload a vincular.
 */
async function assertPostPhotoUploads(db, { images, ownerId, postId = null }) {
  const ids = [...new Set(images.map(parseUploadRef).filter(Boolean))];
  if (!ids.length) return [];
  const { rows } = await db.query(
    `SELECT id FROM uploads
      WHERE id = ANY($1::uuid[]) AND owner_id = $2 AND purpose = 'post_photo' AND status = 'confirmado'
        AND (post_id IS NULL OR post_id = $3)`,
    [ids, ownerId, postId],
  );
  if (rows.length !== ids.length) {
    throw new UploadError(422, {
      error: 'Confira os campos destacados',
      code: 'validation_failed',
      fields: { images: 'Foto não encontrada: envie e confirme a foto antes de publicar' },
    });
  }
  return ids;
}

/** Grava o vínculo das fotos confirmadas com o post recém-criado. */
async function attachPostPhotoUploads(db, { ids, postId }) {
  if (!ids.length) return;
  await db.query('UPDATE uploads SET post_id = $1 WHERE id = ANY($2::uuid[]) AND post_id IS NULL', [postId, ids]);
}

module.exports = {
  createPostUploadPolicy,
  publicMediaUrl,
  assertDemandUpload,
  attachOwnerUploads,
  assertPostPhotoUploads,
  attachPostPhotoUploads,
  POST_IMAGES_SQL,
  UPLOAD_PURPOSES: ALL_PURPOSES,
  PROCESS_UPLOAD_PURPOSES: PROCESS_PURPOSES,
  PUBLIC_PREFIX,
};
