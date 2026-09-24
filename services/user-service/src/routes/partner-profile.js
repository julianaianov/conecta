// Perfil de apoio (T15). Privado: só a própria conta.
//   GET /me/partner-profile   perfil (ou `exists: false` com listas vazias);
//                             também lido pelo post-service com o token do
//                             usuário, para a compatibilidade com as demandas
//   PUT /me/partner-profile   grava (Parceiro e Poder Público; 403 para os demais)

const express = require('express');
const { ensureProfile } = require('../profile-provision');
const {
  canHavePartnerProfile, validatePartnerProfile, serializePartnerProfile,
  INTEREST_CATEGORIES, OFFERED_RESOURCES, UFS,
} = require('../partner-profile');

const PROFILE_SQL = `SELECT user_id, nationwide, ufs, municipalities, territories, interest_categories,
                            offered_resources, updated_at
                       FROM partner_profiles WHERE user_id = $1`;

// Potenciais parceiros e instituições (T30): perfis de apoio que cruzam os
// critérios de uma demanda. Chamada pelo post-service com o token do Agente
// (GET /demands/mine/:id/potential-partners). Devolve só a identificação
// pública do perfil e o próprio perfil de apoio, nunca contato.
const MATCH_LIMIT_DEFAULT = 50;
const MATCH_LIMIT_MAX = 50;

const csv = (value) => (typeof value === 'string' ? value.split(',').map((v) => v.trim()).filter(Boolean) : []);
const text = (value, max) => {
  const raw = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return raw.length > max ? null : raw;
};

/** Query da correspondência → SQL parametrizado ou erros por campo. */
function matchQuery(query = {}, requesterId) {
  const errors = {};
  const uf = text(query.uf, 2);
  if (uf === null || (uf && !UFS.includes(uf.toUpperCase()))) errors.uf = 'UF inválida';
  const municipality = text(query.municipality, 120);
  if (municipality === null) errors.municipality = 'Use no máximo 120 caracteres';
  const places = [text(query.territory, 120), text(query.district, 120)];
  if (places.includes(null)) errors.territory = 'Use no máximo 120 caracteres';
  const category = text(query.category, 60);
  if (category && !INTEREST_CATEGORIES.includes(category)) errors.category = 'Categoria inválida';
  const resources = csv(query.resources);
  if (resources.some((r) => !OFFERED_RESOURCES.includes(r))) errors.resources = 'Recurso inválido';
  let limit = MATCH_LIMIT_DEFAULT;
  if (query.limit !== undefined && query.limit !== '') {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MATCH_LIMIT_MAX) errors.limit = `Entre 1 e ${MATCH_LIMIT_MAX}`;
    else limit = parsed;
  }
  if (Object.keys(errors).length) return { errors };

  const params = [requesterId];
  const any = ['pp.nationwide = true'];
  if (uf) {
    params.push(uf.toUpperCase());
    any.push(`$${params.length} = ANY(pp.ufs)`);
  }
  if (municipality && uf) {
    params.push(`${municipality}/${uf.toUpperCase()}`.toLowerCase());
    any.push(`EXISTS (SELECT 1 FROM unnest(pp.municipalities) m WHERE lower(m) = $${params.length})`);
  }
  const territories = places.filter(Boolean).map((p) => p.toLowerCase());
  if (territories.length) {
    params.push(territories);
    any.push(`EXISTS (SELECT 1 FROM unnest(pp.territories) t WHERE lower(t) = ANY($${params.length}::text[]))`);
  }
  if (category) {
    params.push(category);
    any.push(`$${params.length} = ANY(pp.interest_categories)`);
  }
  if (resources.length) {
    params.push(resources);
    any.push(`pp.offered_resources && $${params.length}::text[]`);
  }
  params.push(limit);
  const sql = `SELECT p.user_id, p.name, p.avatar_url, p.role, p.profile_type, p.city, p.state,
                      pp.nationwide, pp.ufs, pp.municipalities, pp.territories, pp.interest_categories,
                      pp.offered_resources, pp.updated_at
                 FROM partner_profiles pp
                 JOIN profiles p ON p.user_id = pp.user_id
                WHERE pp.user_id <> $1 AND p.anonymized_at IS NULL
                  AND (${any.join(' OR ')})
                ORDER BY pp.updated_at DESC, p.name ASC
                LIMIT $${params.length}`;
  return { sql, params };
}

module.exports = (pool, auth) => {
  const router = express.Router();

  // GET /partner-profiles/match — candidatos a parceiro para uma demanda (T30).
  router.get('/partner-profiles/match', auth, async (req, res) => {
    const built = matchQuery(req.query, String(req.user.userId).toLowerCase());
    if (built.errors) {
      return res.status(422).json({ error: 'Confira os filtros', code: 'validation_failed', fields: built.errors });
    }
    try {
      const { rows } = await pool.query(built.sql, built.params);
      res.json({
        candidates: rows.map((r) => {
          const profile = serializePartnerProfile(r);
          delete profile.exists;
          return {
            userId: r.user_id,
            name: r.name,
            avatarUrl: r.avatar_url || null,
            role: r.role,
            profileType: r.profile_type || null,
            city: r.city || null,
            state: r.state || null,
            profile,
          };
        }),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.get('/me/partner-profile', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(PROFILE_SQL, [req.user.userId]);
      res.json({ ...serializePartnerProfile(rows[0]), editable: canHavePartnerProfile(req.user) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  router.put('/me/partner-profile', auth, async (req, res) => {
    if (!canHavePartnerProfile(req.user)) {
      return res.status(403).json({
        error: 'O perfil de apoio é de Parceiros e do Poder Público',
        code: 'partner_profile_forbidden',
      });
    }
    const { value, errors } = validatePartnerProfile(req.body ?? {});
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Confira os campos destacados', code: 'validation_failed', fields: errors });
    }
    try {
      await ensureProfile(pool, req.user);
      await pool.query(
        `INSERT INTO partner_profiles
           (user_id, nationwide, ufs, municipalities, territories, interest_categories, offered_resources, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET nationwide = EXCLUDED.nationwide, ufs = EXCLUDED.ufs, municipalities = EXCLUDED.municipalities,
               territories = EXCLUDED.territories, interest_categories = EXCLUDED.interest_categories,
               offered_resources = EXCLUDED.offered_resources, updated_at = NOW()`,
        [req.user.userId, value.nationwide, value.ufs, value.municipalities, value.territories,
          value.interestCategories, value.offeredResources],
      );
      const { rows } = await pool.query(PROFILE_SQL, [req.user.userId]);
      res.json({ ...serializePartnerProfile(rows[0]), editable: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};

module.exports.matchQuery = matchQuery;
