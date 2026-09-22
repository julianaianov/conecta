// Apoio à demanda (T16): o espelho do frontend precisa ser igual ao domínio do
// post-service (services/post-service/src/support/constants.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DEMAND_SUPPORT_TYPES,
  GESTAO_STATUS_LABELS,
  LEGACY_TYPE_MODALITY,
  RECEIPT_STATUSES,
  RECEIPT_STATUS_LABELS,
  SUPPORTER_CATEGORY_LABELS,
  SUPPORT_EVENT_TYPES,
  SUPPORT_MODALITIES,
  SUPPORT_MODALITY_HINTS,
  SUPPORT_MODALITY_ICONS,
  SUPPORT_MODALITY_LABELS,
  SUPPORT_OPEN_STATUSES,
  SUPPORT_ROLES,
  SUPPORT_TYPE_LABELS,
  canRegisterSupport,
  countsForRanking,
  formatCents,
  supportErrorMessage,
  supportReaisToCents,
  supportTimelineDetail,
  supportTimelineLabel,
  supporterDisplayName,
} from "./support.ts";
import { timelineEventLabel } from "./demand.ts";
import { SUPPORT_TYPES } from "./types.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/support/constants.js");

test("modalidades, tipos, estados e mapeamento seguem o post-service", () => {
  assert.deepEqual(SUPPORT_MODALITIES, server.SUPPORT_MODALITIES);
  assert.deepEqual(SUPPORT_MODALITY_LABELS, server.SUPPORT_MODALITY_LABELS);
  assert.deepEqual(DEMAND_SUPPORT_TYPES, server.DEMAND_SUPPORT_TYPES);
  assert.deepEqual(SUPPORT_TYPE_LABELS, server.SUPPORT_TYPE_LABELS);
  assert.deepEqual(RECEIPT_STATUSES, server.RECEIPT_STATUSES);
  assert.deepEqual(RECEIPT_STATUS_LABELS, server.RECEIPT_STATUS_LABELS);
  assert.deepEqual(GESTAO_STATUS_LABELS, server.GESTAO_STATUS_LABELS);
  assert.deepEqual(LEGACY_TYPE_MODALITY, server.LEGACY_TYPE_MODALITY);
  assert.deepEqual(SUPPORT_OPEN_STATUSES, server.SUPPORT_OPEN_STATUSES);
  assert.deepEqual(SUPPORT_ROLES, server.SUPPORT_ROLES);
  assert.deepEqual(SUPPORT_EVENT_TYPES, server.SUPPORT_EVENT_TYPES);
  assert.deepEqual(Object.keys(SUPPORTER_CATEGORY_LABELS), server.SUPPORTER_CATEGORIES);
  // Todo tipo do modelo antigo tem rótulo, dica e ícone.
  assert.deepEqual(Object.keys(SUPPORT_TYPE_LABELS).sort(), SUPPORT_TYPES.map((t) => t.type).sort());
  assert.deepEqual(Object.keys(SUPPORT_MODALITY_HINTS), SUPPORT_MODALITIES);
  assert.deepEqual(Object.keys(SUPPORT_MODALITY_ICONS), SUPPORT_MODALITIES);
});

test("registrar apoio realizado é de Parceiros e do Poder Público; ranking só de Parceiros", () => {
  assert.equal(canRegisterSupport("partner", "empresa"), true);
  assert.equal(canRegisterSupport("government", "prefeitura"), true);
  assert.equal(canRegisterSupport("member", "morador"), false);
  assert.equal(canRegisterSupport("agent", "ong"), false);
  assert.equal(canRegisterSupport("media", "jornalista"), false);
  assert.equal(countsForRanking("parceiro"), true);
  assert.equal(countsForRanking("poder_publico"), false);
});

test("valores declarados: centavos ↔ reais", () => {
  assert.match(formatCents(150000), /^R\$\s?1\.500,00$/);
  assert.equal(formatCents(null), null);
  assert.equal(supportReaisToCents("1.500,50"), 150050);
  assert.equal(supportReaisToCents(""), null);
  assert.ok(Number.isNaN(supportReaisToCents("abc")));
});

test("histórico público: nome só com consentimento", () => {
  assert.equal(supporterDisplayName({ supporterName: "Construtora Horizonte", supporterCategory: "parceiro" }), "Construtora Horizonte");
  assert.equal(supporterDisplayName({ supporterName: null, supporterCategory: "parceiro" }), "Parceiro apoiador");
  assert.equal(supporterDisplayName({ supporterName: null, supporterCategory: "poder_publico" }), "Órgão do Poder Público");
});

test("linha do tempo do apoio", () => {
  const declared = {
    type: "apoio_declarado",
    details: { modality: "doar_recursos", supportType: "materials", supporterCategory: "parceiro", supporterName: null, amount: null },
  };
  assert.equal(supportTimelineLabel(declared), "Parceiro registrou apoio: doar recursos");
  assert.equal(supportTimelineDetail(declared), "Materiais");
  assert.equal(
    supportTimelineLabel({ ...declared, details: { ...declared.details, supporterName: "Construtora Horizonte", amount: "1500.00" } }),
    "Construtora Horizonte registrou apoio: doar recursos",
  );
  assert.match(supportTimelineDetail({ ...declared, details: { ...declared.details, amount: "1500.00" } }), /R\$\s?1\.500,00/);
  assert.equal(supportTimelineLabel({ type: "apoio_confirmado", details: {} }), "Apoio confirmado pelo Agente de Transformação");
  assert.equal(supportTimelineLabel({ type: "publicada", details: {} }), null);
  assert.equal(supportTimelineDetail({ type: "publicada", details: {} }), null);
  // A linha do tempo da demanda usa esses rótulos (nada de código cru).
  assert.equal(timelineEventLabel(declared), "Parceiro registrou apoio: doar recursos");
  assert.equal(timelineEventLabel({ type: "apoio_contestado", details: {} }), "Apoio contestado pelo Agente de Transformação");
});

test("mensagens de erro do apoio", () => {
  const err = (code) => Object.assign(new Error("erro"), { code });
  assert.match(supportErrorMessage(err("support_not_allowed")), /Parceiros e do Poder Público/);
  assert.match(supportErrorMessage(err("own_demand")), /própria demanda/);
  assert.match(supportErrorMessage(err("support_confirmed")), /não é cancelado/);
  assert.match(supportErrorMessage(err("payment_not_supported")), /não processa pagamento/);
  assert.match(supportErrorMessage(new Error("network")), /Sem conexão/);
  assert.equal(supportErrorMessage({}, "padrão"), "padrão");
});
