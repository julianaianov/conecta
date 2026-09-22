// Perfil de apoio (T15). Privado: só a própria conta.
//   GET /me/partner-profile   perfil (ou `exists: false` com listas vazias);
//                             também lido pelo post-service com o token do
//                             usuário, para a compatibilidade com as demandas
//   PUT /me/partner-profile   grava (Parceiro e Poder Público; 403 para os demais)

const express = require('express');
const { ensureProfile } = require('../profile-provision');
const {
  canHavePartnerProfile, validatePartnerProfile, serializePartnerProfile,
} = require('../partner-profile');

const PROFILE_SQL = `SELECT user_id, nationwide, ufs, municipalities, territories, interest_categories,
                            offered_resources, updated_at
                       FROM partner_profiles WHERE user_id = $1`;

module.exports = (pool, auth) => {
  const router = express.Router();

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
