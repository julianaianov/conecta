// Interesse, conexão e oportunidades (T15): o espelho do frontend precisa ser
// igual ao domínio do post-service e ao perfil de apoio do user-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  COMPATIBILITY_WEIGHTS,
  INTEREST_CONNECTION_STATUSES,
  INTEREST_EVENT_TYPES,
  INTEREST_KINDS,
  INTEREST_KINDS_BY_ROLE,
  INTEREST_KIND_LABELS,
  INTEREST_OPEN_STATUSES,
  COMPATIBILITY_LEVEL_LABELS,
  OFFER_TYPES,
  OFFER_TYPE_LABELS,
  OPPORTUNITY_ROLES,
  POTENTIAL_PARTNERS_MAX,
  POTENTIAL_PARTNERS_STATUSES,
  SCHEDULE_ITEM_OFFER,
  UFS,
  buildOpportunityQuery,
  canFilterOpportunities,
  interestErrorMessage,
  interestKindsFor,
  interestTimelineDetail,
  interestTimelineLabel,
  reaisToCents,
  splitList,
} from "./interest.ts";
import { timelineEventLabel } from "./demand.ts";
import { ROLE_PERMISSIONS } from "./types.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/interest");
const partnerProfile = require("../../../services/user-service/src/partner-profile.js");

test("listas e rótulos iguais aos do post-service", () => {
  assert.deepEqual(INTEREST_KINDS, server.INTEREST_KINDS);
  assert.deepEqual(INTEREST_KIND_LABELS, server.INTEREST_KIND_LABELS);
  assert.deepEqual(OFFER_TYPES, server.OFFER_TYPES);
  assert.deepEqual(OFFER_TYPE_LABELS, server.OFFER_TYPE_LABELS);
  assert.equal(SCHEDULE_ITEM_OFFER, server.SCHEDULE_ITEM_OFFER);
  assert.deepEqual(INTEREST_CONNECTION_STATUSES, server.CONNECTION_STATUSES);
  assert.deepEqual(INTEREST_OPEN_STATUSES, server.INTEREST_OPEN_STATUSES);
  assert.deepEqual(INTEREST_EVENT_TYPES, server.INTEREST_EVENT_TYPES);
  assert.deepEqual(OPPORTUNITY_ROLES, server.OPPORTUNITY_ROLES);
  assert.deepEqual(POTENTIAL_PARTNERS_STATUSES, server.POTENTIAL_PARTNERS_STATUSES);
  assert.equal(POTENTIAL_PARTNERS_MAX, server.POTENTIAL_PARTNERS_MAX);
  assert.deepEqual(COMPATIBILITY_LEVEL_LABELS, server.COMPATIBILITY_LEVEL_LABELS);
  assert.deepEqual({ ...COMPATIBILITY_WEIGHTS }, server.COMPATIBILITY_WEIGHTS);
  for (const role of Object.keys(INTEREST_KINDS_BY_ROLE)) {
    assert.deepEqual(INTEREST_KINDS_BY_ROLE[role], server.KINDS_BY_ROLE[role], role);
  }
  assert.deepEqual(UFS, partnerProfile.UFS);
  assert.deepEqual(OPPORTUNITY_ROLES, partnerProfile.PARTNER_PROFILE_ROLES);
});

test("manifestações por categoria concordam com as permissões do cliente", () => {
  // "express_interest" (Parceiro, Poder Público, Membro) e "volunteer" (Membro).
  for (const [role, kinds] of Object.entries(INTEREST_KINDS_BY_ROLE)) {
    assert.equal(kinds.length > 0, ROLE_PERMISSIONS[role].includes("express_interest"), role);
    assert.equal(kinds.includes("voluntariado"), ROLE_PERMISSIONS[role].includes("volunteer"), role);
  }
  assert.deepEqual(interestKindsFor("partner", "empresa"), ["apoio"]);
  assert.deepEqual(interestKindsFor(null, "voluntario"), ["participacao", "voluntariado"]);
  assert.equal(canFilterOpportunities("government", "prefeitura"), true);
  assert.equal(canFilterOpportunities("member", "morador"), false);
  assert.equal(canFilterOpportunities("media", "jornalista"), false);
});

test("buildOpportunityQuery monta os filtros do post-service", () => {
  const q = new URLSearchParams(buildOpportunityQuery({
    category: ["projeto_social"], resourceType: ["materiais", "servicos"], uf: "RJ", minTotalCents: 0,
    maxTotalCents: 500000, sort: "recentes", offset: 20, limit: 20,
  }));
  assert.equal(q.get("category"), "projeto_social");
  assert.equal(q.get("resourceType"), "materiais,servicos");
  assert.equal(q.get("minTotalCents"), "0");
  assert.equal(q.get("maxTotalCents"), "500000");
  assert.equal(q.get("sort"), "recentes");
  assert.equal(q.get("offset"), "20");
  assert.equal(buildOpportunityQuery({}), "");
  const parsed = server.validateInterest({ kind: "apoio", offerTypes: ["recursos"] }, "partner");
  assert.deepEqual(parsed.errors, {});
});

test("valores em reais e listas do perfil de apoio", () => {
  assert.equal(reaisToCents(""), null);
  assert.equal(reaisToCents("5000"), 500000);
  assert.equal(reaisToCents("5.000,50"), 500050);
  assert.equal(reaisToCents("R$ 1.200"), 120000);
  assert.equal(reaisToCents("12.5"), 1250);
  assert.ok(Number.isNaN(reaisToCents("abc")));
  assert.deepEqual(splitList("Rio de Janeiro/RJ\n Niterói/RJ ;; Maricá/RJ"), ["Rio de Janeiro/RJ", "Niterói/RJ", "Maricá/RJ"]);
});

test("linha do tempo: categoria da conta e ofertas, nunca nome", () => {
  const details = { interestKind: "apoio", userCategory: "parceiro", offerTypes: ["recursos", "servicos"] };
  assert.equal(interestTimelineLabel({ type: "interesse_registrado", details }), "Parceiro demonstrou interesse em apoiar");
  assert.equal(interestTimelineDetail({ type: "interesse_registrado", details }), "Pode oferecer: Recursos, Serviços");
  // "Executar determinada etapa" mostra a etapa do cronograma (T-05-15).
  assert.equal(
    interestTimelineDetail({ type: "interesse_registrado", details: { ...details, offerTypes: ["equipe", "execucao_de_etapa"], scheduleStage: "Fundação" } }),
    "Pode oferecer: Disponibilizar equipe, Executar determinada etapa — etapa: Fundação",
  );
  assert.equal(interestTimelineLabel({ type: "interesse_registrado", details: { interestKind: "voluntariado", userCategory: "comunidade" } }),
    "Membro da Comunidade ofereceu voluntariado");
  assert.equal(interestTimelineLabel({ type: "conexao_aceita", details: { userCategory: "poder_publico" } }), "Conexão aceita pelo Agente (Poder Público)");
  assert.equal(interestTimelineLabel({ type: "status_alterado", details: {} }), null);
  // Integrado ao rótulo geral da demanda, inclusive na visão do autor (payload.public).
  assert.equal(timelineEventLabel({ type: "conexao_solicitada", toStatus: null, details: details }), "Parceiro solicitou conexão com o Agente");
  assert.equal(timelineEventLabel({ type: "interesse_retirado", toStatus: null, payload: { public: details } }), "Parceiro retirou a manifestação");
  assert.equal(timelineEventLabel({ type: "conexao_recusada", toStatus: null, payload: {} }), "Pedido de conexão recusado");
});

test("mensagens de erro por código", () => {
  const err = (code, message = "x") => Object.assign(new Error(message), { code });
  assert.match(interestErrorMessage(err("interest_exists")), /já registrou/);
  assert.match(interestErrorMessage(err("demand_not_open")), /não recebe/);
  assert.match(interestErrorMessage(new Error("network")), /Sem conexão/);
  assert.equal(interestErrorMessage(null, "padrão"), "padrão");
});
