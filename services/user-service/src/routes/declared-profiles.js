// Perfis declarados (T-04-03; decisão 18; domínio em src/declared-profiles.js):
//   GET|PUT /me/business-profile   perfil empresarial (PUT só Parceiro)
//   GET|PUT /me/media-profile      perfil profissional/institucional (PUT só Comunicação)
//   GET /profiles/:userId/declared projeção pública (sem token), pela categoria
//                                  da conta; 404 sem perfil ou conta anonimizada
// Sem validação da gestão e sem selo: a resposta leva `declaration`
// ("informado pela própria conta").

const express = require('express');
const { ensureProfile } = require('../profile-provision');
const { isUuid } = require('../security');
const { normalizeRole } = require('../roles');
const {
  BUSINESS_COLUMNS, MEDIA_COLUMNS, DECLARED_KIND_BY_ROLE, declaredKindForUser,
  validateBusinessProfile, validateMediaProfile, serializeBusinessProfile, serializeMediaProfile,
  publicDeclaredProfile,
} = require('../declared-profiles');

const KINDS = {
  empresarial: {
    table: 'business_profiles',
    columns: BUSINESS_COLUMNS,
    validate: validateBusinessProfile,
    serialize: serializeBusinessProfile,
    forbidden: { error: 'O perfil empresarial é do Parceiro', code: 'business_profile_forbidden' },
  },
  comunicacao: {
    table: 'media_profiles',
    columns: MEDIA_COLUMNS,
    validate: validateMediaProfile,
    serialize: serializeMediaProfile,
    forbidden: { error: 'O perfil profissional ou institucional é da Comunicação', code: 'media_profile_forbidden' },
  },
};

const PUBLIC_SQL = `SELECT p.role, p.profile_type,
                           b.company_name, b.cnpj, b.segment, b.description AS business_description, b.website AS business_website,
                           m.outlet_name, m.coverage_area, m.description AS media_description, m.website AS media_website
                      FROM profiles p
                      LEFT JOIN business_profiles b ON b.user_id = p.user_id
                      LEFT JOIN media_profiles m ON m.user_id = p.user_id
                     WHERE p.user_id = $1 AND p.anonymized_at IS NULL`;

function routes(pool, auth) {
  const router = express.Router();

  for (const [kind, spec] of Object.entries(KINDS)) {
    const path = kind === 'empresarial' ? '/me/business-profile' : '/me/media-profile';
    const select = `SELECT ${spec.columns.join(', ')}, updated_at FROM ${spec.table} WHERE user_id = $1`;

    router.get(path, auth, async (req, res) => {
      try {
        const { rows } = await pool.query(select, [req.user.userId]);
        res.json({ exists: rows.length > 0, profile: rows[0] ? spec.serialize(rows[0]) : null });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno' });
      }
    });

    router.put(path, auth, async (req, res) => {
      if (declaredKindForUser(req.user) !== kind) return res.status(403).json(spec.forbidden);
      const { value, errors } = spec.validate(req.body);
      if (Object.keys(errors).length) {
        return res.status(422).json({ error: 'Perfil inválido', code: 'validation_failed', fields: errors });
      }
      try {
        await ensureProfile(pool, req.user);
        const cols = spec.columns;
        const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ');
        const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
        const { rows } = await pool.query(
          `INSERT INTO ${spec.table} (user_id, ${cols.join(', ')})
           VALUES ($1, ${placeholders})
           ON CONFLICT (user_id) DO UPDATE SET ${updates}, updated_at = NOW()
           RETURNING ${cols.join(', ')}, updated_at`,
          [req.user.userId, ...cols.map((c) => value[c])],
        );
        res.json({ exists: true, profile: spec.serialize(rows[0]) });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Erro interno' });
      }
    });
  }

  router.get('/profiles/:userId/declared', async (req, res) => {
    const notFound = () => res.status(404).json({ error: 'Perfil declarado não encontrado' });
    if (!isUuid(req.params.userId)) return notFound();
    try {
      const { rows } = await pool.query(PUBLIC_SQL, [req.params.userId]);
      const row = rows[0];
      if (!row) return notFound();
      const kind = DECLARED_KIND_BY_ROLE[normalizeRole(row.role, row.profile_type)];
      const data = kind === 'empresarial'
        ? row.company_name && {
          company_name: row.company_name, cnpj: row.cnpj, segment: row.segment,
          description: row.business_description, website: row.business_website,
        }
        : kind === 'comunicacao' && row.outlet_name && {
          outlet_name: row.outlet_name, coverage_area: row.coverage_area,
          description: row.media_description, website: row.media_website,
        };
      if (!data) return notFound();
      res.json(publicDeclaredProfile(kind, data));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
}

module.exports = routes;
module.exports.PUBLIC_SQL = PUBLIC_SQL;
