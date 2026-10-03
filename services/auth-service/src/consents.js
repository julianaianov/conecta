// Consentimento versionado dos documentos do portal (T24, LGPD art. 8º).
//
// As versões vigentes moram aqui, no código, porque o texto mora no
// repositório: a página é a versão. Quando um documento muda, a versão sobe
// nesta tabela e todo titular passa a ter um aceite pendente — o portal pede o
// aceite da versão nova e grava outra linha em `auth_db.user_consents`
// (append-only). Nada é atualizado: a trilha guarda qual texto foi aceito e
// quando.
//
// Espelhado em `src/lib/app/privacy.ts` (há teste que compara os dois).

/** Documentos com aceite obrigatório, na ordem em que aparecem no cadastro. */
const CONSENT_DOCUMENTS = [
  {
    key: 'termos_de_uso',
    label: 'Termos de Uso',
    version: '1.1',
    date: '2026-10-01',
    path: '/termos-de-uso',
  },
  {
    key: 'politica_de_privacidade',
    label: 'Política de Privacidade',
    version: '1.1',
    date: '2026-09-22',
    path: '/politica-de-privacidade',
  },
];

const CONSENT_KEYS = CONSENT_DOCUMENTS.map((d) => d.key);

/** Origem do aceite (coluna `origin` de `user_consents`). */
const CONSENT_ORIGINS = ['cadastro', 'nova_versao', 'reaceite'];

const CONSENT_ORIGIN_LABELS = {
  cadastro: 'Aceite no cadastro',
  nova_versao: 'Aceite de versão nova',
  reaceite: 'Reaceite pelo titular',
};

const documentByKey = (key) => CONSENT_DOCUMENTS.find((d) => d.key === key) ?? null;

/**
 * Chaves válidas dentro da lista recebida do cliente. Devolve `null` quando
 * algo não é documento conhecido.
 */
function normalizeConsentKeys(value) {
  if (!Array.isArray(value)) return null;
  const keys = [];
  for (const raw of value) {
    if (typeof raw !== 'string') return null;
    const key = raw.trim();
    if (!CONSENT_KEYS.includes(key)) return null;
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Documentos vigentes que a conta ainda não aceitou, dada a lista de aceites. */
function pendingConsents(accepted = []) {
  const current = new Map();
  for (const row of accepted) {
    const key = row.document ?? row.key;
    if (!current.has(key)) current.set(key, new Set());
    current.get(key).add(String(row.version));
  }
  return CONSENT_DOCUMENTS.filter((doc) => !current.get(doc.key)?.has(doc.version));
}

module.exports = {
  CONSENT_DOCUMENTS,
  CONSENT_KEYS,
  CONSENT_ORIGINS,
  CONSENT_ORIGIN_LABELS,
  documentByKey,
  normalizeConsentKeys,
  pendingConsents,
};
