// Permissões por categoria de perfil (espelha src/lib/app/types.ts e
// docs/perfis-e-permissoes.md). O cliente esconde o que o perfil não pode
// fazer; este módulo é a checagem que vale no servidor.

const PROFILE_ROLE = {
  associacao: 'agent', ong: 'agent', instituto: 'agent', projeto_social: 'agent',
  coletivo: 'agent', lider_comunitario: 'agent', representante_bairro: 'agent',
  morador: 'member', voluntario: 'member', jovem: 'member', participante: 'member',
  empresa: 'partner', marca: 'partner', comercio_local: 'partner', patrocinador: 'partner',
  prefeitura: 'government', secretaria: 'government', orgao_publico: 'government',
  representante_poder_publico: 'government', politico: 'government',
  imprensa: 'media', veiculo_comunicacao: 'media', jornalista: 'media',
};

const ROLES = ['agent', 'member', 'partner', 'government', 'media'];

// Tokens emitidos antes da mudança de perfis ainda carregam as categorias antigas.
const LEGACY_ROLE_MAP = {
  community: 'agent', citizen: 'member', institutional: 'government',
  organization: 'agent', association: 'agent', business: 'partner',
};

const POST_TYPES_BY_ROLE = {
  agent: ['problem', 'project', 'need', 'event', 'action', 'message'],
  member: [],
  partner: [],
  government: ['message'],
  media: [],
};

// Quem apoia pode oferecer qualquer forma de apoio; Agentes e Comunicação
// contribuem só com divulgação.
const SUPPORTERS = ['member', 'partner', 'government'];

function normalizeRole(role, profileType) {
  if (profileType && PROFILE_ROLE[profileType]) return PROFILE_ROLE[profileType];
  if (ROLES.includes(role)) return role;
  return LEGACY_ROLE_MAP[role] || 'member';
}

function canPublish(user, type) {
  return POST_TYPES_BY_ROLE[normalizeRole(user.role, user.profileType)].includes(type);
}

/** O perfil publica algum tipo de sinal no feed (ex.: pode enviar a foto do sinal). */
function canPublishAny(user) {
  return POST_TYPES_BY_ROLE[normalizeRole(user?.role, user?.profileType)].length > 0;
}

function canSupport(user, type) {
  return SUPPORTERS.includes(normalizeRole(user.role, user.profileType)) || type === 'sharing';
}

module.exports = { normalizeRole, canPublish, canPublishAny, canSupport };
