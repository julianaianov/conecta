// Provisionamento idempotente da linha em `profiles` (user_db).
//
// A conta nasce no auth-service (auth_db.users). O perfil é criado aqui a partir
// das claims do token de acesso (userId, name, avatarUrl, role, profileType) no
// primeiro acesso autenticado e antes de qualquer escrita que dependa da FK
// `profiles(user_id)` (conexões, recados, depoimentos). Nunca sobrescreve um
// perfil existente. Contas anteriores a este fluxo são cobertas pela migração
// `migrations/007-profiles-backfill.sql`.

const PROVISION_SQL = `INSERT INTO profiles (user_id, name, avatar_url, role, profile_type, member_since)
     VALUES ($1, $2, $3, $4, $5, NOW())
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id`;

function provisionParams(user) {
  if (!user || typeof user.userId !== 'string' || !user.userId) return null;
  const name = typeof user.name === 'string' ? user.name.trim().slice(0, 255) : '';
  if (!name) return null;
  return [
    user.userId,
    name,
    typeof user.avatarUrl === 'string' && user.avatarUrl ? user.avatarUrl.slice(0, 500) : null,
    typeof user.role === 'string' && user.role ? user.role : 'member',
    typeof user.profileType === 'string' && user.profileType ? user.profileType : null,
  ];
}

/**
 * Garante que o usuário autenticado tenha perfil. Retorna `true` quando criou a
 * linha agora e `false` quando ela já existia (ou o token não traz nome, caso do
 * refresh token, que nunca chega a rotas de perfil).
 */
async function ensureProfile(pool, user) {
  const params = provisionParams(user);
  if (!params) return false;
  const { rowCount } = await pool.query(PROVISION_SQL, params);
  return rowCount > 0;
}

/** Violação de chave estrangeira do PostgreSQL (perfil de destino inexistente). */
function isForeignKeyViolation(err) {
  return Boolean(err && err.code === '23503');
}

module.exports = { ensureProfile, isForeignKeyViolation, PROVISION_SQL };
