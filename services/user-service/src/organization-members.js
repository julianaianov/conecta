// Vínculo de usuários a organizações com níveis de permissão delegada (T29).
// Domínio puro, espelhado em src/lib/app/organization.ts (organization.test.mjs
// compara). Fonte: Arquitetura de Perfis §4 e §5 ("permissões delegadas");
// Modelo de Conexão §32. Migração user 013.

/** Níveis, do maior ao menor. */
const LEVELS = ['gestor', 'publicador', 'colaborador'];
const LEVEL_LABELS = { gestor: 'Gestor', publicador: 'Publicador', colaborador: 'Colaborador' };

/** O que cada nível pode fazer em nome da instituição. */
const PERMISSIONS = [
  'gerir_vinculos', 'publicar_demandas', 'publicar_eventos', 'atuar_institucionalmente',
  'atualizar_resultados', 'ver_documentos',
];
const PERMISSION_LABELS = {
  gerir_vinculos: 'Convidar, mudar o nível e remover pessoas da equipe',
  publicar_demandas: 'Publicar e gerir demandas em nome da instituição',
  publicar_eventos: 'Publicar eventos e ações em nome da instituição',
  atuar_institucionalmente: 'Responder, encaminhar e apoiar como o órgão (Poder Público)',
  atualizar_resultados: 'Atualizar andamento, resultados e prestação de contas',
  ver_documentos: 'Ver documentos, dossiês e o andamento interno',
};
const LEVEL_PERMISSIONS = {
  gestor: ['gerir_vinculos', 'publicar_demandas', 'publicar_eventos', 'atuar_institucionalmente', 'atualizar_resultados', 'ver_documentos'],
  publicador: ['publicar_demandas', 'publicar_eventos', 'atuar_institucionalmente', 'atualizar_resultados', 'ver_documentos'],
  colaborador: ['ver_documentos'],
};

/** convidado → ativo | recusado; ativo → removido | saiu. */
const STATUSES = ['convidado', 'ativo', 'recusado', 'removido', 'saiu'];
const STATUS_LABELS = {
  convidado: 'Convite enviado',
  ativo: 'Vínculo ativo',
  recusado: 'Convite recusado',
  removido: 'Removido da equipe',
  saiu: 'Saiu da equipe',
};
const TRANSITIONS = {
  convidado: ['ativo', 'recusado'],
  ativo: ['removido', 'saiu'],
  recusado: [],
  removido: [],
  saiu: [],
};

/** Níveis que agem publicamente em nome da instituição (selo do perfil, órgão do post-service). */
const PUBLIC_ACTING_LEVELS = ['gestor', 'publicador'];

function permissionsFor(level) {
  return LEVEL_PERMISSIONS[level] ? [...LEVEL_PERMISSIONS[level]] : [];
}

function hasPermission(level, permission) {
  return permissionsFor(level).includes(permission);
}

function transitionAllowed(from, to) {
  return Boolean(TRANSITIONS[from]) && TRANSITIONS[from].includes(to);
}

function isLevel(value) {
  return LEVELS.includes(value);
}

module.exports = {
  LEVELS,
  LEVEL_LABELS,
  PERMISSIONS,
  PERMISSION_LABELS,
  LEVEL_PERMISSIONS,
  STATUSES,
  STATUS_LABELS,
  TRANSITIONS,
  PUBLIC_ACTING_LEVELS,
  permissionsFor,
  hasPermission,
  transitionAllowed,
  isLevel,
};
