// Edição do perfil pelo titular (W36): Arquitetura de Perfis §3.1 ("Criar e
// gerenciar perfil") e §3.2 a §3.5 ("Criar perfil"); Apresentação Institucional,
// slides 7 e 8.
//
// Módulo puro: validação e montagem do UPDATE. Não acessa banco nem rede.
// Espelho da interface: src/lib/app/profile-edit.ts (há teste que compara as
// chaves de erro). O titular só muda a lista fechada abaixo: categoria,
// subperfil, e-mail e vínculos nunca passam por aqui, e chave desconhecida no
// corpo é ignorada.
//
// LGPD: `phone` e `state` são do próprio titular e nunca entram na projeção
// pública (PUBLIC_PROFILE_COLUMNS em routes/users.js).

const { UFS, isValidPhone, normalizePhone } = require('./institution');

/**
 * Campos editáveis: chave do corpo (camelCase) → coluna de `profiles`.
 * `alias` é a chave em snake_case que a rota `POST /me` já aceitava (cliente
 * Android), mantida por compatibilidade.
 */
const PROFILE_FIELDS = {
  name: { column: 'name', max: 255, label: 'Nome', required: true },
  bio: { column: 'bio', max: 500, label: 'Apresentação' },
  avatarUrl: { column: 'avatar_url', max: 500, label: 'Link da foto', alias: 'avatar_url' },
  neighborhood: { column: 'neighborhood', max: 255, label: 'Bairro' },
  city: { column: 'city', max: 100, label: 'Cidade' },
  state: { column: 'state', max: 2, label: 'Estado' },
  phone: { column: 'phone', max: 50, label: 'Telefone' },
  website: { column: 'website', max: 500, label: 'Site' },
};

const UPDATABLE_COLUMNS = Object.values(PROFILE_FIELDS).map((spec) => spec.column);

// Mesma regra do site no perfil declarado (declared-profiles.js).
const WEBSITE_RE = /^https?:\/\/\S+\.\S+/;

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const has = (body, key) => Object.prototype.hasOwnProperty.call(body, key);

/** A foto é um link `https` (como a foto do evento), sem usuário e senha embutidos. */
function isHttpsUrl(text) {
  let url;
  try {
    url = new URL(text);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
}

/** `{ value }` de um campo já aparado e não vazio (normalizado), ou `{ error }`. */
function checkField(key, spec, text) {
  if (text.includes('\u0000')) return { error: `${spec.label}: caracteres inválidos` };
  if (key === 'state') {
    const uf = text.toUpperCase();
    return UFS.includes(uf) ? { value: uf } : { error: 'Estado: informe a sigla da UF (ex.: RJ)' };
  }
  if (text.length > spec.max) return { error: `${spec.label}: até ${spec.max} caracteres` };
  if (key === 'avatarUrl' && !isHttpsUrl(text)) return { error: 'Link da foto deve começar com https://' };
  if (key === 'website' && !WEBSITE_RE.test(text)) return { error: 'Site deve começar com http:// ou https://' };
  if (key === 'phone') {
    return isValidPhone(text)
      ? { value: normalizePhone(text) }
      : { error: 'Telefone: informe o DDD e o número (10 ou 11 dígitos)' };
  }
  return { value: text };
}

/**
 * Valida o corpo do `POST /me`. Só os campos enviados entram em `value`
 * (nome de coluna → valor a gravar); texto vazio ou `null` limpa o campo, menos
 * o nome, que é obrigatório. `errors` usa as chaves camelCase da interface.
 */
function validateProfileUpdate(input) {
  const body = isPlainObject(input) ? input : {};
  const value = {};
  const errors = {};
  for (const [key, spec] of Object.entries(PROFILE_FIELDS)) {
    const sent = [key, spec.alias].find((candidate) => candidate && has(body, candidate));
    if (!sent) continue;
    const raw = body[sent];
    if (raw !== null && typeof raw !== 'string') {
      errors[key] = `${spec.label}: informe um texto`;
      continue;
    }
    const text = raw === null ? '' : raw.trim();
    if (!text) {
      if (spec.required) errors[key] = `${spec.label} é obrigatório`;
      else value[spec.column] = null;
      continue;
    }
    const checked = checkField(key, spec, text);
    if (checked.error) errors[key] = checked.error;
    else value[spec.column] = checked.value;
  }
  return { value, errors };
}

/**
 * UPDATE só das colunas de `value` (sempre da lista fechada, nunca de chave do
 * corpo), na conta do titular e fora das contas anonimizadas: uma conta
 * anonimizada não volta a ter dado de identificação.
 */
function buildProfileUpdate(userId, value, returning) {
  const columns = Object.keys(value).filter((column) => UPDATABLE_COLUMNS.includes(column));
  if (!columns.length) throw new Error('buildProfileUpdate exige ao menos um campo');
  const sets = columns.map((column, index) => `${column} = $${index + 1}`);
  return {
    text: `UPDATE profiles SET ${sets.join(', ')}, updated_at = NOW()
            WHERE user_id = $${columns.length + 1} AND anonymized_at IS NULL
        RETURNING ${returning}`,
    params: [...columns.map((column) => value[column]), userId],
  };
}

module.exports = {
  PROFILE_FIELDS,
  UPDATABLE_COLUMNS,
  validateProfileUpdate,
  buildProfileUpdate,
};
