// Política de uploads do user-service (T08): comprovação da representação
// institucional (`institution_proof`) e documentação institucional
// (`institution_document`, T-05-19: estatuto, ata, cartão CNPJ...), privadas
// (titular e gestão).
//
// - Só Agente de Transformação e Poder Público (quem tem cadastro institucional).
// - A confirmação vincula o arquivo ao cadastro do próprio titular, que precisa
//   existir (salvar o rascunho antes) e estar editável (pendente, devolvida ou
//   revogada), como o resto da ficha.
// - O PUT /me/institution aceita `upload:<id>` em
//   representative.proofDocumentRef só de upload confirmado, do titular e
//   vinculado ao cadastro. O POST /me/institution/documents faz o mesmo com a
//   finalidade `institution_document`.

const { EDITABLE_STATUSES, kindForUser } = require('./institution');
const { UploadError, findUsableUpload, parseUploadRef, describeUploads } = require('./uploads');

const PURPOSES = ['institution_proof', 'institution_document'];
const PUBLIC_PREFIX = '/api/users/uploads';
const TARGET_COLUMN = 'organization_id';

function createUserUploadPolicy() {
  return {
    purposes: PURPOSES,
    targetColumn: TARGET_COLUMN,
    publicPrefix: PUBLIC_PREFIX,

    canPresign(user) {
      if (kindForUser(user)) return null;
      return {
        status: 403,
        body: { error: 'Comprovação e documentação institucional são do Agente de Transformação e do Poder Público' },
      };
    },

    async resolveTarget(db, user) {
      const { rows } = await db.query(
        `SELECT o.id, o.validation_status
           FROM organizations o
           JOIN profiles p ON p.id = o.profile_id
          WHERE p.user_id = $1 AND o.institution_kind IS NOT NULL`,
        [user.userId],
      );
      const org = rows[0];
      if (!org) {
        throw new UploadError(409, {
          error: 'Salve o rascunho do cadastro institucional antes de anexar documentos',
          code: 'institution_required',
        });
      }
      if (!EDITABLE_STATUSES.includes(org.validation_status)) {
        throw new UploadError(409, {
          error: 'Cadastro em análise ou validado não recebe novos arquivos',
          code: 'institution_not_editable',
          validationStatus: org.validation_status,
        });
      }
      return org.id;
    },

    // Nada daqui é público.
    async isPublic() {
      return false;
    },
  };
}

/** Confere a referência de upload da comprovação antes de gravar. */
async function assertProofUpload(db, { ref, ownerId, organizationId }) {
  const id = parseUploadRef(ref);
  if (!id) return;
  const row = organizationId
    ? await findUsableUpload(db, {
      id, ownerId, purpose: 'institution_proof', targetColumn: TARGET_COLUMN, targetId: organizationId,
    })
    : null;
  if (!row) {
    throw new UploadError(422, {
      error: 'Cadastro institucional inválido',
      fields: {
        'representative.proofDocumentRef': organizationId
          ? 'Arquivo não encontrado: envie e confirme o documento de comprovação'
          : 'Salve o rascunho antes de anexar a comprovação',
      },
    });
  }
}

/** Upload confirmado, do titular, da documentação institucional e desta organização (ou `null`). */
function findDocumentUpload(db, { uploadId, ownerId, organizationId }) {
  return findUsableUpload(db, {
    id: uploadId, ownerId, purpose: 'institution_document', targetColumn: TARGET_COLUMN, targetId: organizationId,
  });
}

/** Metadados e URL de leitura curta dos documentos institucionais (visão do titular). */
function describeDocumentUploads(db, storage, uploadIds) {
  return describeUploads(db, storage, uploadIds, TARGET_COLUMN);
}

/** Metadados e URL de leitura curta da comprovação (visão do titular). */
async function describeProof(db, storage, ref) {
  const id = parseUploadRef(ref);
  if (!id) return null;
  const files = await describeUploads(db, storage, [id], TARGET_COLUMN);
  return files.get(id) ?? null;
}

module.exports = {
  createUserUploadPolicy,
  assertProofUpload,
  describeProof,
  findDocumentUpload,
  describeDocumentUploads,
  UPLOAD_PURPOSES: PURPOSES,
  PUBLIC_PREFIX,
};
