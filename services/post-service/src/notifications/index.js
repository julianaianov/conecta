// Central de notificações (T-05-16; Modelo de Conexão §08 e §34; decisão 19).
// CÓPIA IDÊNTICA em post-service e user-service (há teste que confere): cada
// serviço guarda as notificações dos eventos que nascem nele (post_db:
// migração 039; user_db: migração 016) e o portal junta as duas listas.
//
// Para gerar um aviso a partir de outra funcionalidade, use `notify` dentro da
// mesma transação da ação (passe o `client` da transação):
//
//   const { notify } = require('../notifications');
//   await notify(client, {
//     userId,                       // destinatário (conta)
//     kind: 'prazo_proximo',        // um de NOTIFICATION_KINDS
//     title: 'Prazo próximo',       // curto, sem dado privado
//     body: '«Título da demanda»',  // resumo opcional
//     href: `/minhas-demandas#demanda-${demandId}`, // caminho relativo do portal
//     demandId, processId, dedupeKey,               // opcionais
//   });
//
// `organizationId` no lugar de `userId` avisa o órgão inteiro (só no
// post-service). `dedupeKey` junta avisos repetidos enquanto não lidos. A
// preferência da conta (aplicativo/e-mail) e a caixa de saída de e-mail são
// resolvidas no banco (`notification_create`); nada aqui envia e-mail.

/** Tipos da fonte (§08) mais os da análise da demanda e do vínculo. Espelho:
 * notification_kinds nas migrações e src/lib/app/notifications.ts. */
const NOTIFICATION_KINDS = [
  'nova_demanda_compativel',
  'prazo_proximo',
  'prazo_vencido',
  'solicitacao_de_analise',
  'atualizacao_de_processo',
  'nova_mensagem',
  'novo_documento',
  'encaminhamento_recebido',
  'interesse_recebido',
  'conexao',
  'apoio',
  'resultado_registrado',
  'demanda_devolvida',
  'demanda_publicada',
  'convite_de_vinculo',
];

const OUTBOX_STATUSES = ['pendente', 'enviado', 'falhou', 'desligado'];
const LIST_LIMIT_DEFAULT = 30;
const LIST_LIMIT_MAX = 100;
const READ_IDS_MAX = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);
const isKind = (v) => NOTIFICATION_KINDS.includes(v);

/** Campo opcional do `notify` → parâmetro nomeado de `notification_create`. */
const OPTIONAL_PARAMS = [
  ['actorUserId', 'p_actor_user_id', 'uuid'],
  ['connectionId', 'p_connection_id', 'uuid'],
  ['demandId', 'p_demand_id', 'uuid'],
  ['processId', 'p_process_id', 'uuid'],
  ['eventId', 'p_event_id', 'uuid'],
  ['dedupeKey', 'p_dedupe_key', 'text'],
];

/** Monta a chamada SQL de `notify` (exportada para teste). */
function buildNotifyCall(input = {}) {
  const { userId, organizationId, kind, title } = input;
  const body = input.body ?? input.summary ?? null;
  const href = input.href ?? null;
  const toOrganization = organizationId != null;
  if (toOrganization ? !isUuid(organizationId) : !isUuid(userId)) {
    throw new TypeError('notify: userId ou organizationId (UUID) é obrigatório');
  }
  if (!isKind(kind)) throw new TypeError(`notify: tipo desconhecido "${kind}"`);
  if (typeof title !== 'string' || !title.trim()) throw new TypeError('notify: title é obrigatório');
  if (href != null && (typeof href !== 'string' || !/^\/([^/]|$)/.test(href))) {
    throw new TypeError('notify: href deve ser um caminho do portal ("/...")');
  }
  const params = [toOrganization ? organizationId : userId, kind, title.trim().slice(0, 200),
    body == null ? null : String(body).slice(0, 500), href];
  const args = [
    `${toOrganization ? 'p_organization_id' : 'p_user_id'} => $1::uuid`,
    'p_kind => $2', 'p_title => $3', 'p_summary => $4', 'p_href => $5',
  ];
  for (const [field, name, type] of OPTIONAL_PARAMS) {
    const value = input[field];
    if (value == null) continue;
    if (type === 'uuid' && !isUuid(value)) throw new TypeError(`notify: ${field} deve ser UUID`);
    params.push(type === 'text' ? String(value).slice(0, 200) : value);
    args.push(`${name} => $${params.length}::${type}`);
  }
  const fn = toOrganization ? 'notification_create_for_organization' : 'notification_create';
  return { text: `SELECT ${fn}(${args.join(', ')}) AS id`, values: params };
}

/**
 * Gera um aviso. `db` é o pool ou o client da transação da ação. Devolve o id
 * (ou `null` quando a conta desligou o tipo no aplicativo e no e-mail).
 */
async function notify(db, input) {
  const { text, values } = buildNotifyCall(input);
  const { rows } = await db.query(text, values);
  return rows[0]?.id ?? null;
}

/** Filtros de `GET /notifications`: `{ value }` ou `{ errors }`. */
function parseListQuery(query = {}) {
  const errors = {};
  const value = { unreadOnly: false, limit: LIST_LIMIT_DEFAULT, kinds: null, before: null };
  const unread = query.unread;
  if (unread !== undefined && unread !== '') {
    if (!['1', 'true', '0', 'false'].includes(String(unread))) errors.unread = 'Use 1 ou 0';
    else value.unreadOnly = ['1', 'true'].includes(String(unread));
  }
  if (query.limit !== undefined && query.limit !== '') {
    const n = Number(query.limit);
    if (!Number.isInteger(n) || n < 1 || n > LIST_LIMIT_MAX) errors.limit = `Entre 1 e ${LIST_LIMIT_MAX}`;
    else value.limit = n;
  }
  if (query.kind !== undefined && query.kind !== '') {
    const kinds = String(query.kind).split(',').map((k) => k.trim()).filter(Boolean);
    const unknown = kinds.filter((k) => !isKind(k));
    if (unknown.length) errors.kind = `Tipos desconhecidos: ${unknown.join(', ')}`;
    else value.kinds = kinds;
  }
  if (query.before !== undefined && query.before !== '') {
    const d = new Date(String(query.before));
    if (Number.isNaN(d.getTime())) errors.before = 'Data inválida';
    else value.before = d.toISOString();
  }
  return Object.keys(errors).length ? { errors } : { value };
}

/** Corpo de `POST /notifications/read`: `{ ids }` ou `{ all: true }`. */
function parseReadBody(body = {}) {
  if (body && body.all === true) return { value: { all: true, ids: null } };
  const ids = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return { errors: { ids: 'Informe ids ou all: true' } };
  if (ids.length > READ_IDS_MAX) return { errors: { ids: `No máximo ${READ_IDS_MAX} por vez` } };
  if (!ids.every(isUuid)) return { errors: { ids: 'Ids inválidos' } };
  return { value: { all: false, ids: [...new Set(ids.map((id) => id.toLowerCase()))] } };
}

/** Corpo de `PUT /notifications/preferences`: `{ preferences: [{ kind, inApp, email }] }`. */
function parsePreferencesBody(body = {}) {
  const list = body?.preferences;
  if (!Array.isArray(list) || list.length === 0) return { errors: { preferences: 'Informe as preferências' } };
  const errors = {};
  const byKind = new Map();
  list.forEach((p, i) => {
    if (!p || !isKind(p.kind)) errors[`preferences.${i}.kind`] = 'Tipo desconhecido';
    else if (typeof p.inApp !== 'boolean' || typeof p.email !== 'boolean') {
      errors[`preferences.${i}`] = 'inApp e email são verdadeiro ou falso';
    } else byKind.set(p.kind, { kind: p.kind, inApp: p.inApp, email: p.email });
  });
  return Object.keys(errors).length ? { errors } : { value: [...byKind.values()] };
}

/** Preferências completas (todos os tipos; sem linha = os dois ligados). */
function preferencesFromRows(rows = []) {
  const saved = new Map(rows.map((r) => [r.kind, r]));
  return NOTIFICATION_KINDS.map((kind) => ({
    kind,
    inApp: saved.has(kind) ? Boolean(saved.get(kind).in_app) : true,
    email: saved.has(kind) ? Boolean(saved.get(kind).email) : true,
  }));
}

const iso = (v) => (v == null ? null : new Date(v).toISOString());

function serializeNotification(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    summary: row.summary ?? null,
    href: row.href ?? null,
    actorName: row.actor_name ?? null,
    demandId: row.demand_id ?? null,
    processId: row.process_id ?? null,
    connectionId: row.connection_id ?? null,
    scope: row.organization_id ? 'organization' : 'user',
    createdAt: iso(row.created_at),
    readAt: iso(row.read_at),
  };
}

module.exports = {
  NOTIFICATION_KINDS,
  OUTBOX_STATUSES,
  LIST_LIMIT_DEFAULT,
  LIST_LIMIT_MAX,
  READ_IDS_MAX,
  isKind,
  buildNotifyCall,
  notify,
  parseListQuery,
  parseReadBody,
  parsePreferencesBody,
  preferencesFromRows,
  serializeNotification,
};
