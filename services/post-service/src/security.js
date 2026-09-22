// Segurança compartilhada dos serviços Node (cópia idêntica em auth-service,
// user-service e post-service: cada serviço é empacotado sozinho na imagem).
//
// - `resolveJwtSecret`: o serviço não sobe sem `JWT_SECRET` forte. Não existe
//   segredo padrão; só a suíte de testes (`NODE_ENV=test`) recebe um segredo
//   aleatório por processo quando a variável falta.
// - `createAuth`: valida o token de acesso (HS256) e recusa refresh tokens.
// - `parseOperationUserIds` / `requireOperation`: rotas administrativas
//   (leitura/integração da operação da plataforma) só para as contas listadas
//   em `DM_OPERATION_USER_IDS` (UUIDs de auth_db.users, separados por vírgula).
//   Sem a variável, ninguém acessa: falha fechado.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const MIN_JWT_SECRET_LENGTH = 32;
const MIN_JWT_SECRET_DISTINCT_CHARS = 10;

// Valores que já circularam em código, exemplos ou CI e nunca podem assinar tokens.
const KNOWN_WEAK_SECRETS = new Set([
  'dev_secret',
  'conecta_jwt_secret_local_dev',
  'replace-with-a-long-random-jwt-secret',
  'ci-jwt-secret',
  'secret',
  'changeme',
  'change-me',
  'test-secret',
  'test_jwt_secret',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** Motivo pelo qual o segredo é inaceitável, ou `null` quando ele é forte. */
function jwtSecretProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return 'JWT_SECRET ausente';
  if (KNOWN_WEAK_SECRETS.has(value.trim().toLowerCase())) return 'JWT_SECRET usa um valor conhecido/de exemplo';
  if (value.length < MIN_JWT_SECRET_LENGTH) return `JWT_SECRET precisa ter pelo menos ${MIN_JWT_SECRET_LENGTH} caracteres`;
  if (new Set(value).size < MIN_JWT_SECRET_DISTINCT_CHARS) return 'JWT_SECRET tem pouca variedade de caracteres';
  return null;
}

/**
 * Segredo de assinatura dos tokens. Lança erro (o processo não sobe) quando a
 * variável falta ou é fraca, em qualquer ambiente fora de teste.
 */
function resolveJwtSecret(env = process.env) {
  const value = env.JWT_SECRET;
  if (env.NODE_ENV === 'test') {
    return typeof value === 'string' && value ? value : crypto.randomBytes(32).toString('hex');
  }
  const problem = jwtSecretProblem(value);
  if (problem) {
    throw new Error(`${problem}. Defina um segredo aleatório (ex.: \`openssl rand -hex 32\`); não há valor padrão.`);
  }
  return value;
}

/** Refresh tokens (novos com `typ`, antigos só com `userId`) não valem como acesso. */
function isAccessPayload(payload) {
  return Boolean(payload && typeof payload === 'object'
    && payload.typ !== 'refresh'
    && typeof payload.userId === 'string' && payload.userId
    && typeof payload.role === 'string' && payload.role);
}

function createAuth(secret) {
  if (!secret) throw new Error('createAuth exige o segredo JWT');
  return (req, res, next) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Sem token' });
    try {
      const payload = jwt.verify(h.slice(7), secret, { algorithms: ['HS256'] });
      if (!isAccessPayload(payload)) return res.status(401).json({ error: 'Token inválido' });
      req.user = payload;
      next();
    } catch {
      res.status(401).json({ error: 'Token inválido' });
    }
  };
}

function parseOperationUserIds(env = process.env) {
  return new Set(String(env.DM_OPERATION_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim().toLowerCase())
    .filter(isUuid));
}

/** Middleware (depois de `auth`): só contas da operação da plataforma. */
function requireOperation(operationUserIds) {
  const allowed = operationUserIds instanceof Set ? operationUserIds : new Set();
  return (req, res, next) => {
    const userId = String(req.user?.userId ?? '').toLowerCase();
    if (!userId || !allowed.has(userId)) {
      return res.status(403).json({ error: 'Acesso restrito à operação da plataforma' });
    }
    next();
  };
}

module.exports = {
  MIN_JWT_SECRET_LENGTH,
  isUuid,
  jwtSecretProblem,
  resolveJwtSecret,
  isAccessPayload,
  createAuth,
  parseOperationUserIds,
  requireOperation,
};
