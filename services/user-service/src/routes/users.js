const express = require('express');
const { ensureProfile } = require('../profile-provision');
const { isUuid } = require('../security');
const { validateProfileUpdate, buildProfileUpdate } = require('../profile-edit');

// Projeção pública do perfil: nada de telefone, estado ou metadados internos.
// Qualquer campo novo em `profiles` fica privado até ser incluído aqui de propósito.
const PUBLIC_PROFILE_COLUMNS = [
  'user_id', 'name', 'bio', 'avatar_url', 'cover_url', 'status', 'neighborhood',
  'city', 'website', 'role', 'profile_type', 'member_since', 'friend_count',
];

// Projeção do próprio dono (inclui os dados de contato que ele mesmo informou).
const OWNER_PROFILE_COLUMNS = [
  ...PUBLIC_PROFILE_COLUMNS, 'phone', 'state', 'created_at', 'updated_at',
];

const PUBLIC_PROFILE_SQL = PUBLIC_PROFILE_COLUMNS.join(', ');
const OWNER_PROFILE_SQL = OWNER_PROFILE_COLUMNS.join(', ');

module.exports = (pool, auth) => {
  const router = express.Router();

  // GET /me
  router.get('/me', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${OWNER_PROFILE_SQL} FROM profiles WHERE user_id=$1`, [req.user.userId]);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /me/provision — garante o perfil da conta autenticada (idempotente).
  // Chamado pelo frontend após cadastro, login e restauração de sessão.
  router.post('/me/provision', auth, async (req, res) => {
    try {
      const created = await ensureProfile(pool, req.user);
      const { rows } = await pool.query(`SELECT ${OWNER_PROFILE_SQL} FROM profiles WHERE user_id=$1`, [req.user.userId]);
      if (!rows.length) return res.status(422).json({ error: 'Não foi possível criar o perfil: token sem nome' });
      res.status(created ? 201 : 200).json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /me: o titular edita o próprio perfil (W36; sempre do dono do token).
  // Só muda os campos enviados (nome, bio, foto, bairro, cidade, estado,
  // telefone e site; domínio em src/profile-edit.js). Categoria e subperfil
  // nascem no cadastro e não mudam aqui. Erros por campo: 422 `fields`.
  router.post('/me', auth, async (req, res) => {
    const { value, errors } = validateProfileUpdate(req.body);
    if (Object.keys(errors).length) {
      return res.status(422).json({ error: 'Perfil inválido', code: 'validation_failed', fields: errors });
    }
    if (!Object.keys(value).length) {
      return res.status(422).json({ error: 'Informe ao menos um campo do perfil', code: 'validation_failed', fields: {} });
    }
    try {
      // A conta que ainda não tem perfil ganha a linha das claims do token.
      await ensureProfile(pool, req.user);
      const update = buildProfileUpdate(req.user.userId, value, OWNER_PROFILE_SQL);
      const { rows } = await pool.query(update.text, update.params);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // GET /:id — public profile
  router.get('/:id', async (req, res, next) => {
    if (req.params.id === 'health') return next();
    if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Perfil não encontrado' });
    try {
      const { rows } = await pool.query(`SELECT ${PUBLIC_PROFILE_SQL} FROM profiles WHERE user_id=$1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Perfil não encontrado' });
      res.json(rows[0]);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  return router;
};

module.exports.PUBLIC_PROFILE_COLUMNS = PUBLIC_PROFILE_COLUMNS;
