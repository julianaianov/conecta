// Privacidade, consentimento e direitos do titular (T24): o espelho do
// frontend precisa ser igual aos módulos dos serviços.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  ANONYMOUS_NAME,
  CONSENT_DOCUMENTS,
  CONSENT_KEYS,
  CONSENT_ORIGIN_LABELS,
  DATA_INVENTORY,
  DATA_SHARING,
  DESCRIPTION_MAX,
  ERASURE_CONFIRMATION,
  EXPORT_RETENTION_DAYS,
  NOT_COLLECTED,
  REQUEST_STATUS_LABELS,
  REQUEST_TYPES,
  REQUEST_TYPE_DESCRIPTIONS,
  REQUEST_TYPE_LABELS,
  RESPONSE_DEADLINE_DAYS,
  RETENTION_ACTION_LABELS,
  RETENTION_RULES,
  SELF_SERVICE_TYPES,
  pendingConsents,
} from "./privacy.ts";

const require = createRequire(import.meta.url);
const consents = require("../../../services/auth-service/src/consents.js");
const privacy = require("../../../services/user-service/src/privacy/constants.js");
const postStore = require("../../../services/post-service/src/privacy/store.js");
const userPrivacyRoutes = require("../../../services/user-service/src/routes/privacy.js");

test("os documentos e as versões vigentes são os do auth-service", () => {
  assert.deepEqual(CONSENT_DOCUMENTS, consents.CONSENT_DOCUMENTS);
  assert.deepEqual(CONSENT_KEYS, consents.CONSENT_KEYS);
  assert.deepEqual(CONSENT_ORIGIN_LABELS, consents.CONSENT_ORIGIN_LABELS);
});

test("todo documento vigente tem versão, data e uma página pública no portal", () => {
  for (const doc of CONSENT_DOCUMENTS) {
    assert.match(doc.version, /^\d+\.\d+$/, doc.key);
    assert.match(doc.date, /^\d{4}-\d{2}-\d{2}$/, doc.key);
    assert.match(doc.path, /^\/[a-z-]+$/, doc.key);
    assert.ok(doc.label, doc.key);
  }
});

test("pendência de aceite acompanha a versão, não só o documento", () => {
  const atual = CONSENT_DOCUMENTS.map((d) => ({
    document: d.key, version: d.version, documentDate: d.date, origin: "cadastro", acceptedAt: "2026-09-22T00:00:00Z",
  }));
  assert.deepEqual(pendingConsents(atual), []);
  const antigo = atual.map((row) => ({ ...row, version: "0.9" }));
  assert.deepEqual(pendingConsents(antigo).map((d) => d.key), CONSENT_KEYS);
  assert.deepEqual(pendingConsents([]).map((d) => d.key), CONSENT_KEYS);
  // O espelho concorda com o servidor.
  assert.deepEqual(
    consents.pendingConsents(antigo.map((r) => ({ document: r.document, version: r.version }))).map((d) => d.key),
    pendingConsents(antigo).map((d) => d.key),
  );
});

test("os direitos do art. 18, o prazo e a regra de retenção seguem o user-service", () => {
  assert.deepEqual(REQUEST_TYPES, privacy.REQUEST_TYPES);
  assert.deepEqual(REQUEST_TYPE_LABELS, privacy.REQUEST_TYPE_LABELS);
  assert.deepEqual(REQUEST_TYPE_DESCRIPTIONS, privacy.REQUEST_TYPE_DESCRIPTIONS);
  assert.deepEqual(SELF_SERVICE_TYPES, privacy.SELF_SERVICE_TYPES);
  assert.deepEqual(REQUEST_STATUS_LABELS, privacy.REQUEST_STATUS_LABELS);
  assert.equal(RESPONSE_DEADLINE_DAYS, privacy.RESPONSE_DEADLINE_DAYS);
  assert.equal(EXPORT_RETENTION_DAYS, privacy.EXPORT_RETENTION_DAYS);
  assert.equal(DESCRIPTION_MAX, privacy.DESCRIPTION_MAX);
  assert.deepEqual(RETENTION_RULES, privacy.RETENTION_RULES);
  assert.deepEqual(RETENTION_ACTION_LABELS, privacy.RETENTION_ACTION_LABELS);
  assert.equal(ERASURE_CONFIRMATION, userPrivacyRoutes.CONFIRMATION);
});

test("o prazo do portal é o mesmo prazo legal que a gestão usa (15 dias)", () => {
  assert.equal(RESPONSE_DEADLINE_DAYS, 15);
});

test("o rótulo da conta anonimizada é o mesmo nos três serviços", () => {
  assert.equal(ANONYMOUS_NAME, privacy.ANONYMOUS_NAME);
  assert.equal(ANONYMOUS_NAME, postStore.ANONYMOUS_NAME);
});

test("toda regra de retenção diz o dado, a ação, a regra e a base legal", () => {
  const acoes = Object.keys(RETENTION_ACTION_LABELS);
  const chaves = new Set();
  for (const rule of RETENTION_RULES) {
    assert.ok(!chaves.has(rule.key), `regra repetida: ${rule.key}`);
    chaves.add(rule.key);
    assert.ok(acoes.includes(rule.action), rule.key);
    assert.ok(rule.data && rule.rule, rule.key);
    assert.match(rule.basis, /LGPD art\./, rule.key);
  }
  // O que sustenta a transparência da demanda nunca é apagado.
  for (const key of ["demandas", "trilha", "consentimentos", "apoios", "denuncias"]) {
    assert.equal(RETENTION_RULES.find((r) => r.key === key).action, "retem", key);
  }
});

test("todo direito do art. 18 tem rótulo e explicação na tela", () => {
  for (const type of REQUEST_TYPES) {
    assert.ok(REQUEST_TYPE_LABELS[type], type);
    assert.ok(REQUEST_TYPE_DESCRIPTIONS[type], type);
  }
});

test("o inventário do que é coletado aponta a origem no schema e a finalidade", () => {
  assert.ok(DATA_INVENTORY.length >= 10);
  for (const entry of DATA_INVENTORY) {
    assert.match(entry.source, /^(auth_db|user_db|post_db)\./, entry.group);
    assert.ok(entry.fields.length > 0, entry.group);
    assert.ok(entry.purpose, entry.group);
    assert.ok(["público", "privado", "equipe"].includes(entry.visibility), entry.group);
  }
  // Afirmações conferíveis: o schema não tem CPF nem dado bancário.
  assert.ok(NOT_COLLECTED.includes("CPF"));
  assert.ok(!JSON.stringify(DATA_INVENTORY).toLowerCase().includes("cpf"));
  assert.ok(DATA_SHARING.some((s) => /Amazon Web Services/.test(s.who)));
});
