const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const { isAccessPayload } = require('../security');
const { CONSENT_DOCUMENTS, CONSENT_KEYS, normalizeConsentKeys } = require('../consents');

// Perfis de conta atuais e compatibilidade para contas legadas.
const ROLE_PROFILES = {
  agent:      ['associacao', 'ong', 'instituto', 'projeto_social', 'coletivo', 'lider_comunitario', 'representante_bairro'],
  member:     ['morador', 'voluntario', 'jovem', 'participante'],
  partner:    ['empresa', 'marca', 'comercio_local', 'patrocinador'],
  government: ['prefeitura', 'secretaria', 'orgao_publico', 'representante_poder_publico', 'politico'],
  media:      ['imprensa', 'veiculo_comunicacao', 'jornalista'],
};
// Comunicação não cria contas novas; `media` continua válido para autenticar
// e atender contas existentes até a migração de seus dados.
const PUBLIC_REGISTRATION_ROLES = ['agent', 'member', 'partner', 'government'];
const PROFILE_TYPES = Object.values(ROLE_PROFILES).flat();

// Colunas devolvidas ao próprio usuário (nunca password_hash).
const USER_COLUMNS = 'id,email,name,role,profile_type,avatar_url,created_at';

module.exports = (pool, { secret } = {}) => {
  if (!secret) throw new Error('auth-service exige o segredo JWT');
  const router = express.Router();
  const verify = (token) => jwt.verify(token, secret, { algorithms: ['HS256'] });
  const signAccess = (u) => jwt.sign(
    { userId: u.id, email: u.email, name: u.name, role: u.role, profileType: u.profile_type, avatarUrl: u.avatar_url },
    secret,
    { expiresIn: '7d', algorithm: 'HS256' },
  );
  const signRefresh = (u) => jwt.sign({ userId: u.id, typ: 'refresh' }, secret, { expiresIn: '30d', algorithm: 'HS256' });
  // Refresh token válido: os novos têm `typ: 'refresh'`; os antigos só `userId`.
  const isRefreshPayload = (p) => Boolean(p && typeof p.userId === 'string'
    && (p.typ === 'refresh' || (p.typ === undefined && p.role === undefined)));

  // POST /register
  router.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    body('role').isIn(PUBLIC_REGISTRATION_ROLES),
    body('profile_type').isIn(PROFILE_TYPES),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password, name, role, profile_type: profileType } = req.body;
    // O subperfil precisa pertencer à categoria enviada — senão daria para
    // registrar um "member" com o subperfil "prefeitura".
    if (!ROLE_PROFILES[role].includes(profileType)) {
      return res.status(400).json({ error: `Subperfil "${profileType}" não pertence à categoria "${role}"` });
    }
    // Consentimento versionado (T24, LGPD art. 8º): o cadastro só existe com o
    // aceite dos documentos vigentes, gravado com versão, data e origem na
    // mesma transação da conta.
    const consents = normalizeConsentKeys(req.body?.consents);
    if (!consents || CONSENT_KEYS.some((key) => !consents.includes(key))) {
      return res.status(422).json({
        error: 'É preciso aceitar os Termos de Uso e a Política de Privacidade',
        code: 'consent_required',
        fields: { consents: 'Aceite os documentos vigentes para criar a conta' },
        documents: CONSENT_DOCUMENTS,
      });
    }
    try {
      const dup = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
      if (dup.rows.length) return res.status(409).json({ error: 'Email já cadastrado' });

      const hash = await bcrypt.hash(password, 10);
      const { rows } = await pool.query(
        `WITH nova_conta AS (
           INSERT INTO users (email,password_hash,name,role,profile_type) VALUES ($1,$2,$3,$4,$5)
           RETURNING ${USER_COLUMNS}
         ), aceites AS (
           INSERT INTO user_consents (user_id, document, version, document_date, origin)
           SELECT nova_conta.id, d.document, d.version, d.document_date, 'cadastro'
             FROM nova_conta, unnest($6::text[], $7::text[], $8::date[])
                    AS d(document, version, document_date)
         )
         SELECT ${USER_COLUMNS} FROM nova_conta`,
        [
          email, hash, name, role, profileType,
          CONSENT_DOCUMENTS.map((d) => d.key),
          CONSENT_DOCUMENTS.map((d) => d.version),
          CONSENT_DOCUMENTS.map((d) => d.date),
        ]
      );
      const user = rows[0];
      res.status(201).json({
        user,
        token:        signAccess(user),
        refreshToken: signRefresh(user),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /login
  router.post('/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS},password_hash FROM users WHERE email=$1`, [email]);
      if (!rows.length) return res.status(401).json({ error: 'Credenciais inválidas' });

      const { password_hash: passwordHash, ...user } = rows[0];
      const ok = await bcrypt.compare(password, passwordHash);
      if (!ok) return res.status(401).json({ error: 'Credenciais inválidas' });

      res.json({
        user,
        token:        signAccess(user),
        refreshToken: signRefresh(user),
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Erro interno' });
    }
  });

  // POST /refresh
  router.post('/refresh', async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) return res.status(401).json({ error: 'Token ausente' });
    try {
      const decoded = verify(refreshToken);
      if (!isRefreshPayload(decoded)) return res.status(401).json({ error: 'Token inválido' });
      const { rows } = await pool.query('SELECT id,email,name,role,profile_type,avatar_url,anonymized_at FROM users WHERE id=$1', [decoded.userId]);
      if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });
      // Conta anonimizada a pedido do titular (T24) não renova sessão.
      if (rows[0].anonymized_at) return res.status(401).json({ error: 'Conta encerrada', code: 'account_anonymized' });
      res.json({ token: signAccess(rows[0]) });
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  });

  // GET /verify
  router.get('/verify', async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sem token' });
    try {
      const decoded = verify(header.slice(7));
      if (!isAccessPayload(decoded)) return res.status(401).json({ error: 'Token inválido' });
      const { rows } = await pool.query('SELECT id,email,name,role,profile_type,avatar_url,anonymized_at FROM users WHERE id=$1', [decoded.userId]);
      if (!rows.length) return res.status(401).json({ error: 'Usuário não encontrado' });
      if (rows[0].anonymized_at) return res.status(401).json({ error: 'Conta encerrada', code: 'account_anonymized' });
      const user = { ...rows[0] };
      delete user.anonymized_at;
      res.json({ user });
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  });

  return router;
};
