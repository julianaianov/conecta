// Cadastro institucional (T04): o titular cria, edita, envia para validação e
// lê o próprio estado. Validar, devolver e revogar é do dm-gestao (decisão 2),
// que grava direto em user_db.organizations; ver o contrato em
// dm-docs/docs/gestao/04-modelagem-de-dados.md e a migração 008.
//
// Privacidade: contatos da organização, dados do representante, parecer e
// trilha só saem para o próprio titular. A rota pública devolve apenas o
// cadastro já validado, com projeção explícita.

const express = require('express');
const { ensureProfile } = require('../profile-provision');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const {
  INSTITUTION_KINDS, VALIDATION_STATUSES, EDITABLE_STATUSES, GOVERNMENT_SPHERES, UFS,
  LINKED_AGENT_PROFILES, CNAE_REFERENCE, COMPETENCE_AREA_SUGGESTIONS,
  kindForUser, validateInstitution, canActInstitutionally,
} = require('../institution');

const ORG_DATA_COLUMNS = [
  'cnpj', 'legal_name', 'trade_name', 'cnae_primary', 'cnae_primary_description', 'cnae_secondary',
  'government_sphere', 'department', 'competence_areas', 'territory', 'cep', 'street',
  'address_number', 'address_complement', 'district', 'municipality', 'municipality_ibge_code',
  'uf', 'institutional_email', 'institutional_phone', 'website',
];

/** Projeção do titular (sem quem validou: o nome da equipe fica na gestão). */
const OWNER_ORG_COLUMNS = [
  'id', 'institution_kind', ...ORG_DATA_COLUMNS, 'validation_status', 'validation_note',
  'validation_reviewed_at', 'submitted_at', 'created_at', 'updated_at',
];

/** Projeção pública: só instituição validada, sem contatos nem endereço completo. */
const PUBLIC_ORG_COLUMNS = [
  'institution_kind', 'cnpj', 'legal_name', 'trade_name', 'cnae_primary', 'cnae_primary_description',
  'cnae_secondary', 'government_sphere', 'department', 'competence_areas', 'territory',
  'municipality', 'uf', 'website', 'validation_status', 'validation_reviewed_at',
];

const REPRESENTATIVE_COLUMNS = [
  'full_name', 'position', 'institutional_email', 'institutional_phone',
  'proof_document_ref', 'proof_description', 'updated_at',
];

const cols = (list, alias = 'o') => list.map((c) => `${alias}.${c}`).join(', ');

const OWN_ORG_SQL = `SELECT ${cols(OWNER_ORG_COLUMNS)}
    FROM organizations o
    JOIN profiles p ON p.id = o.profile_id
   WHERE p.user_id = $1 AND o.institution_kind IS NOT NULL`;

const STATUS_SQL = `SELECT o.institution_kind, o.validation_status
    FROM organizations o
    JOIN profiles p ON p.id = o.profile_id
   WHERE p.user_id = $1 AND o.institution_kind IS NOT NULL`;

const NOT_FOUND = { error: 'Cadastro institucional não encontrado' };

function formatAddress(org) {
  const parts = [
    [org.street, org.address_number].filter(Boolean).join(', '),
    org.address_complement, org.district,
    [org.municipality, org.uf].filter(Boolean).join('/'),
    org.cep ? `CEP ${org.cep.slice(0, 5)}-${org.cep.slice(5)}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' — ') : null;
}

async function loadOwn(db, userId) {
  const { rows } = await db.query(OWN_ORG_SQL, [userId]);
  if (!rows.length) return null;
  const org = rows[0];
  const [{ rows: reps }, { rows: events }] = await Promise.all([
    db.query(`SELECT ${REPRESENTATIVE_COLUMNS.join(', ')} FROM organization_representatives WHERE organization_id = $1`, [org.id]),
    db.query(
      `SELECT from_status, to_status, note, actor_type, created_at
         FROM organization_validation_events
        WHERE organization_id = $1
        ORDER BY created_at ASC
        LIMIT 200`,
      [org.id],
    ),
  ]);
  return { ...org, representative: reps[0] ?? null, events };
}

/** Estado institucional da conta: usado pela interface e pelo gate dos serviços. */
async function institutionStatus(db, user) {
  const { rows } = await db.query(STATUS_SQL, [user.userId]);
  const kind = rows[0]?.institution_kind ?? null;
  const status = rows[0]?.validation_status ?? null;
  return {
    kind,
    status,
    requiredKind: kindForUser(user),
    canActInstitutionally: canActInstitutionally(kind, status),
  };
}

/**
 * Middleware (depois de `auth`): conta do Poder Público só executa ações
 * institucionais com cadastro validado (Fluxo 3, etapa 02). Demais categorias
 * passam; o requisito do Agente para publicar demanda é aplicado nas rotas de
 * demanda (T06a/T07).
 */
function requireInstitutionalAccess(pool) {
  return async (req, res, next) => {
    if (normalizeRole(req.user?.role, req.user?.profileType) !== 'government') return next();
    try {
      const access = await institutionStatus(pool, req.user);
      if (access.canActInstitutionally) return next();
      return res.status(403).json({
        error: 'O Poder Público atua na plataforma depois da validação do cadastro institucional',
        code: 'institution_not_validated',
        validationStatus: access.status,
      });
    } catch (err) {
      console.error(err);
      return res.status(503).json({ error: 'Não foi possível confirmar a validação institucional' });
    }
  };
}

async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

class HttpError extends Error {
  constructor(status, body) {
    super(body.error);
    this.status = status;
    this.body = body;
  }
}

function routes(pool, auth) {
  const router = express.Router();

  // GET /institutions/reference — listas para o formulário (público).
  router.get('/institutions/reference', (_req, res) => {
    res.json({
      kinds: INSTITUTION_KINDS,
      validationStatuses: VALIDATION_STATUSES,
      governmentSpheres: GOVERNMENT_SPHERES,
      ufs: UFS,
      linkedAgentProfiles: LINKED_AGENT_PROFILES,
      cnaeReference: CNAE_REFERENCE,
      competenceAreaSuggestions: COMPETENCE_AREA_SUGGESTIONS,
    });
  });

  // GET /me/institution — cadastro completo do titular, com parecer e trilha.
  router.get('/me/institution', auth, async (req, res) => {
    try {
      const institution = await loadOwn(pool, req.user.userId);
      if (!institution) return res.status(404).json(NOT_FOUND);
      res.json(institution);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /me/institution/status — estado resumido (interface e gate do post-service).
  router.get('/me/institution/status', auth, async (req, res) => {
    try {
      res.json(await institutionStatus(pool, req.user));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // PUT /me/institution — cria ou atualiza o cadastro (pendente, devolvida ou revogada).
  router.put('/me/institution', auth, async (req, res) => {
    const kind = kindForUser(req.user);
    if (!kind) {
      return res.status(403).json({ error: 'Cadastro institucional é do Agente de Transformação e do Poder Público' });
    }
    const { value, errors } = validateInstitution(kind, req.body);
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Cadastro institucional inválido', fields: errors });
    }
    const { organization: org, representative: rep } = value;

    try {
      await ensureProfile(pool, req.user);
      const created = await withTransaction(pool, async (db) => {
        const { rows: profiles } = await db.query('SELECT id FROM profiles WHERE user_id = $1', [req.user.userId]);
        if (!profiles.length) throw new HttpError(422, { error: 'Perfil não encontrado' });
        const profileId = profiles[0].id;

        const { rows: existing } = await db.query(
          `SELECT id, institution_kind, validation_status FROM organizations
            WHERE profile_id = $1 AND institution_kind IS NOT NULL
            FOR UPDATE`,
          [profileId],
        );

        const data = ORG_DATA_COLUMNS.map((c) => (c === 'cnae_secondary' ? JSON.stringify(org[c]) : org[c]));
        const orgName = org.trade_name || org.legal_name;
        const address = formatAddress(org);
        let organizationId;

        if (existing.length) {
          const current = existing[0];
          if (current.institution_kind !== kind) {
            throw new HttpError(409, { error: 'O cadastro existente é de outro tipo de instituição' });
          }
          if (!EDITABLE_STATUSES.includes(current.validation_status)) {
            throw new HttpError(409, {
              error: current.validation_status === 'validada'
                ? 'Cadastro validado não é editado aqui; peça a revisão à equipe da plataforma'
                : 'Cadastro em análise não pode ser editado',
              validationStatus: current.validation_status,
            });
          }
          organizationId = current.id;
          const sets = ORG_DATA_COLUMNS.map((c, i) => `${c} = $${i + 2}`).join(', ');
          const n = ORG_DATA_COLUMNS.length;
          await db.query(
            `UPDATE organizations
                SET ${sets}, org_name = $${n + 2}, address = $${n + 3}, category = $${n + 4}, updated_at = NOW()
              WHERE id = $1`,
            [organizationId, ...data, orgName, address, req.user.profileType ?? null],
          );
        } else {
          const n = ORG_DATA_COLUMNS.length;
          const placeholders = ORG_DATA_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
          const { rows } = await db.query(
            `INSERT INTO organizations
               (${ORG_DATA_COLUMNS.join(', ')}, profile_id, institution_kind, org_name, address, category,
                validation_status, updated_at)
             VALUES (${placeholders}, $${n + 1}, $${n + 2}, $${n + 3}, $${n + 4}, $${n + 5}, 'pendente', NOW())
             RETURNING id`,
            [...data, profileId, kind, orgName, address, req.user.profileType ?? null],
          );
          organizationId = rows[0].id;
        }

        await db.query(
          `INSERT INTO organization_representatives
             (organization_id, user_id, full_name, position, institutional_email, institutional_phone,
              proof_document_ref, proof_description)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (organization_id) DO UPDATE SET
             user_id = EXCLUDED.user_id, full_name = EXCLUDED.full_name, position = EXCLUDED.position,
             institutional_email = EXCLUDED.institutional_email,
             institutional_phone = EXCLUDED.institutional_phone,
             proof_document_ref = EXCLUDED.proof_document_ref,
             proof_description = EXCLUDED.proof_description,
             updated_at = NOW()`,
          [organizationId, req.user.userId, rep.full_name, rep.position, rep.institutional_email,
            rep.institutional_phone, rep.proof_document_ref, rep.proof_description],
        );
        return !existing.length;
      });

      res.status(created ? 201 : 200).json(await loadOwn(pool, req.user.userId));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body);
      if (err?.code === '23505') return res.status(409).json({ error: 'Cadastro institucional já existe para este perfil' });
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /me/institution/submit — envia para validação da equipe (→ em_analise).
  router.post('/me/institution/submit', auth, async (req, res) => {
    try {
      await withTransaction(pool, async (db) => {
        const { rows } = await db.query(
          `SELECT o.id, o.institution_kind, o.validation_status
             FROM organizations o
             JOIN profiles p ON p.id = o.profile_id
            WHERE p.user_id = $1 AND o.institution_kind IS NOT NULL
            FOR UPDATE OF o`,
          [req.user.userId],
        );
        if (!rows.length) throw new HttpError(404, NOT_FOUND);
        const org = rows[0];
        if (org.institution_kind !== kindForUser(req.user)) {
          throw new HttpError(409, { error: 'O cadastro existente é de outro tipo de instituição' });
        }
        if (!EDITABLE_STATUSES.includes(org.validation_status)) {
          throw new HttpError(409, {
            error: 'Cadastro já enviado para validação ou validado',
            validationStatus: org.validation_status,
          });
        }
        const { rows: reps } = await db.query(
          'SELECT 1 FROM organization_representatives WHERE organization_id = $1',
          [org.id],
        );
        if (!reps.length) throw new HttpError(422, { error: 'Informe o representante antes de enviar' });
        await db.query(
          "UPDATE organizations SET validation_status = 'em_analise' WHERE id = $1",
          [org.id],
        );
      });
      res.json(await loadOwn(pool, req.user.userId));
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json(err.body);
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:userId/institution — instituição validada vinculada ao perfil (público).
  router.get('/:userId/institution', async (req, res) => {
    if (!isUuid(req.params.userId)) return res.status(404).json(NOT_FOUND);
    try {
      const { rows } = await pool.query(
        `SELECT ${cols(PUBLIC_ORG_COLUMNS)}
           FROM organizations o
           JOIN profiles p ON p.id = o.profile_id
          WHERE p.user_id = $1 AND o.institution_kind IS NOT NULL AND o.validation_status = 'validada'`,
        [req.params.userId],
      );
      if (!rows.length) return res.status(404).json(NOT_FOUND);
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
}

module.exports = routes;
module.exports.requireInstitutionalAccess = requireInstitutionalAccess;
module.exports.institutionStatus = institutionStatus;
module.exports.OWNER_ORG_COLUMNS = OWNER_ORG_COLUMNS;
module.exports.PUBLIC_ORG_COLUMNS = PUBLIC_ORG_COLUMNS;
module.exports.REPRESENTATIVE_COLUMNS = REPRESENTATIVE_COLUMNS;
