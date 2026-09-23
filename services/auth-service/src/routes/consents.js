// Consentimento versionado e direitos do titular sobre a conta (T24).
// Montada em `/` no auth-service; pública em `/api/auth/*` (o Caddy tira
// `/api/auth`).
//
// Sem token:
//   GET  /consents                documentos vigentes (chave, versão, data, página)
// Com token da própria conta:
//   GET  /me/consents             aceites registrados + pendentes
//   POST /me/consents             aceita as versões vigentes (append-only)
//   POST /me/password-check       confere a senha (confirmação da eliminação)
//   GET  /me/account-data         o que o auth_db guarda da conta (exportação)
//   POST /me/anonymize            anonimiza a conta (eliminação, art. 18, VI)
//
// A conta **não é excluída**: ela é a chave estrangeira de toda a trilha
// imutável do portal (demandas, apoios, prestação de contas, denúncias). A
// eliminação substitui a identificação e invalida o acesso; a regra por tipo de
// dado está em dm-docs/gestao/05-lgpd.md §7.
//
// A orquestração da eliminação e da exportação é do user-service
// (`routes/privacy.js`), que chama estas rotas com o token do próprio titular.

const express = require('express');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const {
  CONSENT_DOCUMENTS, CONSENT_ORIGINS, normalizeConsentKeys, pendingConsents,
} = require('../consents');

/** Rótulo que substitui o nome da conta anonimizada, em todo o portal. */
const ANONYMOUS_NAME = 'Conta removida';
/** Domínio reservado (RFC 2606): nunca entrega e-mail nem colide com conta real. */
const ANONYMOUS_EMAIL_DOMAIN = 'anonimizado.invalid';

const serializeDocument = (doc) => ({
  key: doc.key, label: doc.label, version: doc.version, date: doc.date, path: doc.path,
});

const serializeConsent = (row) => ({
  document: row.document,
  version: row.version,
  documentDate: row.document_date instanceof Date
    ? row.document_date.toISOString().slice(0, 10)
    : String(row.document_date).slice(0, 10),
  origin: row.origin,
  acceptedAt: row.accepted_at instanceof Date ? row.accepted_at.toISOString() : row.accepted_at,
});

async function listConsents(pool, userId) {
  const { rows } = await pool.query(
    `SELECT document, version, document_date, origin, accepted_at
       FROM user_consents WHERE user_id = $1 ORDER BY accepted_at DESC, document`,
    [userId],
  );
  return rows.map(serializeConsent);
}

module.exports = (pool, { auth } = {}) => {
  if (typeof auth !== 'function') throw new Error('consents routes exigem auth');
  const router = express.Router();

  const fail = (res, err) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno' });
  };

  // Documentos vigentes (o cadastro e a tela de privacidade montam a lista daqui).
  router.get('/consents', (_req, res) => {
    res.json({ documents: CONSENT_DOCUMENTS.map(serializeDocument) });
  });

  router.get('/me/consents', auth, async (req, res) => {
    try {
      const accepted = await listConsents(pool, req.user.userId);
      res.json({
        documents: CONSENT_DOCUMENTS.map(serializeDocument),
        accepted,
        pending: pendingConsents(accepted).map(serializeDocument),
      });
    } catch (err) { fail(res, err); }
  });

  router.post('/me/consents', auth, async (req, res) => {
    const keys = normalizeConsentKeys(req.body?.documents);
    if (!keys?.length) {
      return res.status(422).json({
        error: 'Informe os documentos aceitos',
        code: 'validation_failed',
        fields: { documents: 'Escolha ao menos um documento vigente' },
      });
    }
    const origin = typeof req.body?.origin === 'string' ? req.body.origin : 'reaceite';
    if (!CONSENT_ORIGINS.includes(origin) || origin === 'cadastro') {
      return res.status(422).json({
        error: 'Origem do aceite inválida',
        code: 'validation_failed',
        fields: { origin: 'Use "nova_versao" ou "reaceite"' },
      });
    }
    const docs = keys.map((key) => CONSENT_DOCUMENTS.find((d) => d.key === key));
    try {
      await pool.query(
        `INSERT INTO user_consents (user_id, document, version, document_date, origin)
         SELECT $1, d.document, d.version, d.document_date, $5
           FROM unnest($2::text[], $3::text[], $4::date[]) AS d(document, version, document_date)
         ON CONFLICT (user_id, document, version) DO NOTHING`,
        [
          req.user.userId,
          docs.map((d) => d.key),
          docs.map((d) => d.version),
          docs.map((d) => d.date),
          origin,
        ],
      );
      const accepted = await listConsents(pool, req.user.userId);
      res.status(201).json({
        accepted,
        pending: pendingConsents(accepted).map(serializeDocument),
      });
    } catch (err) { fail(res, err); }
  });

  // Confirmação de identidade antes da eliminação (art. 18: o pedido é do titular).
  router.post('/me/password-check', auth, async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) return res.status(422).json({ error: 'Informe a senha', code: 'validation_failed' });
    try {
      const { rows } = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.userId]);
      if (!rows.length) return res.status(404).json({ error: 'Conta não encontrada' });
      const ok = await bcrypt.compare(password, rows[0].password_hash);
      if (!ok) return res.status(401).json({ error: 'Senha incorreta', code: 'invalid_password' });
      res.status(204).end();
    } catch (err) { fail(res, err); }
  });

  // Exportação: o que o auth_db guarda desta conta (art. 18, II e V).
  router.get('/me/account-data', auth, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id,email,name,role,profile_type,avatar_url,created_at,updated_at,anonymized_at FROM users WHERE id=$1',
        [req.user.userId],
      );
      if (!rows.length) return res.status(404).json({ error: 'Conta não encontrada' });
      const u = rows[0];
      res.json({
        conta: {
          id: u.id,
          email: u.email,
          nome: u.name,
          categoria: u.role,
          perfil: u.profile_type,
          avatar: u.avatar_url,
          criadaEm: u.created_at,
          atualizadaEm: u.updated_at,
          anonimizadaEm: u.anonymized_at ?? null,
        },
        consentimentos: await listConsents(pool, req.user.userId),
      });
    } catch (err) { fail(res, err); }
  });

  // Eliminação (art. 18, VI): a conta é anonimizada, não excluída.
  router.post('/me/anonymize', auth, async (req, res) => {
    try {
      const suffix = crypto.randomBytes(8).toString('hex');
      const { rows } = await pool.query(
        `UPDATE users
            SET email = $2,
                name = $3,
                password_hash = $4,
                avatar_url = NULL,
                anonymized_at = COALESCE(anonymized_at, NOW()),
                updated_at = NOW()
          WHERE id = $1 AND anonymized_at IS NULL
          RETURNING id, anonymized_at`,
        [
          req.user.userId,
          `anonimizado-${suffix}@${ANONYMOUS_EMAIL_DOMAIN}`,
          ANONYMOUS_NAME,
          // Hash de um segredo descartado: nenhuma senha volta a valer.
          bcrypt.hashSync(crypto.randomBytes(32).toString('hex'), 10),
        ],
      );
      if (!rows.length) {
        const already = await pool.query('SELECT anonymized_at FROM users WHERE id=$1', [req.user.userId]);
        if (!already.rows.length) return res.status(404).json({ error: 'Conta não encontrada' });
        return res.json({ anonymized: true, anonymizedAt: already.rows[0].anonymized_at, alreadyAnonymized: true });
      }
      res.json({ anonymized: true, anonymizedAt: rows[0].anonymized_at, alreadyAnonymized: false });
    } catch (err) { fail(res, err); }
  });

  return router;
};

module.exports.ANONYMOUS_NAME = ANONYMOUS_NAME;
module.exports.ANONYMOUS_EMAIL_DOMAIN = ANONYMOUS_EMAIL_DOMAIN;
