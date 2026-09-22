// Política de uploads do post-service (T08): arquivos da demanda.
//
// - Só o Agente de Transformação envia, e só para a própria demanda.
// - Fotografia e documentos: a demanda precisa estar editável (rascunho ou
//   devolvida), como o resto do conteúdo (trigger demands_guard).
// - Fotos e vídeos do antes/depois: demanda da publicação em diante, fora
//   `arquivada` (a T17 vincula a evidência ao andamento).
// - Documentos da prestação de contas (T18): só com a demanda em
//   `prestacao_de_contas` (comprovantes, relatórios e registros das ações).
// - Público: foto e evidências de demanda publicada; documentos, nunca.

const { normalizeRole } = require('./roles');
const { isUuid } = require('./security');
const { PUBLIC_STATUSES } = require('./demand/constants');
const { UploadError, findUsableUpload, parseUploadRef, describeUploads, contentPath } = require('./uploads');

const PURPOSES = ['demand_photo', 'demand_evidence_photo', 'demand_evidence_video', 'demand_document',
  'demand_accountability_document'];
const EDITABLE_PURPOSES = ['demand_photo', 'demand_document'];
// Prestação de contas (T18): a demanda precisa estar no último status canônico.
const ACCOUNTABILITY_PURPOSES = ['demand_accountability_document'];
const PUBLIC_PREFIX = '/api/posts/uploads';
const TARGET_COLUMN = 'demand_id';

const DEMAND_NOT_FOUND = { error: 'Demanda não encontrada' };

function createPostUploadPolicy() {
  return {
    purposes: PURPOSES,
    targetColumn: TARGET_COLUMN,
    publicPrefix: PUBLIC_PREFIX,

    canPresign(user) {
      if (normalizeRole(user?.role, user?.profileType) === 'agent') return null;
      return {
        status: 403,
        body: { error: 'Só Agentes de Transformação enviam arquivos de demanda', code: 'demand_author_not_agent' },
      };
    },

    async resolveTarget(db, user, purpose, body) {
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
      } else if (!PUBLIC_STATUSES.includes(demand.status)) {
        throw new UploadError(409, {
          error: 'Fotos e vídeos do antes e depois entram depois da publicação da demanda',
          code: 'invalid_state',
        });
      }
      return demand.id;
    },

    async isPublic(db, row) {
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

module.exports = {
  createPostUploadPolicy,
  publicMediaUrl,
  assertDemandUpload,
  attachOwnerUploads,
  POST_IMAGES_SQL,
  UPLOAD_PURPOSES: PURPOSES,
  PUBLIC_PREFIX,
};
