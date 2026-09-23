// Direitos do titular sobre o que o `post_db` guarda (T24). Montada em `/` no
// post-service, antes das rotas de posts (cujo `/:id` só aceita UUID);
// pública em `/api/posts/me/privacy/*` (o Caddy tira `/api/posts`).
//
// Com token da própria conta, e só dela:
//   GET  /me/privacy/data       o que este banco guarda desta conta (exportação)
//   POST /me/privacy/anonymize  anonimiza o retrato de identidade e revoga os
//                               consentimentos opcionais de exibição do nome
//
// Quem orquestra a exportação e a eliminação é o user-service
// (`routes/privacy.js`), que chama estas rotas com o token do próprio titular.
// Nenhuma rota daqui aceita id de outra conta: o titular é sempre `req.user`.

const express = require('express');
const store = require('./../privacy/store');

module.exports = ({ pool, auth }) => {
  if (typeof auth !== 'function') throw new Error('privacy routes exigem auth');
  const router = express.Router();

  const handle = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      console.error('[privacy]', err);
      res.status(500).json({ error: 'Erro interno' });
    }
  };

  router.get('/me/privacy/data', auth, handle(async (req, res) => {
    const data = await store.exportUserData(pool, req.user.userId);
    res.json({
      fonte: 'post_db',
      anonimizacao: await store.anonymizationRecord(pool, req.user.userId),
      dados: data,
    });
  }));

  router.post('/me/privacy/anonymize', auth, handle(async (req, res) => {
    const protocol = typeof req.body?.protocol === 'string' && req.body.protocol.trim()
      ? req.body.protocol.trim().slice(0, 32)
      : null;
    const result = await store.anonymizeUser(pool, req.user.userId, { protocol });
    res.json(result);
  }));

  return router;
};
