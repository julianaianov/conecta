// Atuação institucional do Poder Público (T13): o espelho do frontend precisa
// ser igual ao domínio do post-service. Nenhuma tela usa dados de exemplo.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  DEFAULT_ORIGIN_TRACK_STATUS,
  FORWARDING_DESTINATION_KINDS,
  FORWARDING_DESTINATION_KIND_LABELS,
  FORWARDING_EVENT_TYPES,
  FORWARDING_STATUSES,
  FORWARDING_STATUS_LABELS,
  FORWARDING_TRANSITIONS,
  FORWARDING_UPDATE_KINDS,
  FORWARDING_UPDATE_KIND_LABELS,
  canForwardFrom,
  forwardingDestinationLabel,
  INSTITUTIONAL_STATUSES,
  INSTITUTIONAL_STATUS_LABELS,
  INSTITUTIONAL_TRANSITIONS,
  RESPONSE_SUGGESTED_STATUS,
  RESPONSE_TYPES,
  RESPONSE_TYPE_LABELS,
  STATUSES_REQUIRING_NOTE,
  SUPPORT_TYPES,
  SUPPORT_TYPE_LABELS,
  WITHOUT_TRACK,
  buildInstitutionalQuery,
  institutionalDemandPath,
  institutionalErrorMessage,
  institutionalTimelineDetail,
  institutionalTimelineLabel,
  nextInstitutionalStatuses,
  statusRequiresNote,
} from "./institutional.ts";
import { timelineEventLabel } from "./demand.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/institutional");

test("listas e rótulos iguais aos do post-service", () => {
  assert.deepEqual(INSTITUTIONAL_STATUSES, server.INSTITUTIONAL_STATUSES);
  assert.deepEqual(INSTITUTIONAL_STATUS_LABELS, server.INSTITUTIONAL_STATUS_LABELS);
  assert.deepEqual(RESPONSE_TYPES, server.RESPONSE_TYPES);
  assert.deepEqual(RESPONSE_TYPE_LABELS, server.RESPONSE_TYPE_LABELS);
  assert.deepEqual(SUPPORT_TYPES, server.SUPPORT_TYPES);
  assert.deepEqual(SUPPORT_TYPE_LABELS, server.SUPPORT_TYPE_LABELS);
  assert.deepEqual(STATUSES_REQUIRING_NOTE, server.STATUSES_REQUIRING_NOTE);
  assert.equal(WITHOUT_TRACK, server.WITHOUT_TRACK);
});

test("máquina de estados igual à do post-service", () => {
  assert.deepEqual(INSTITUTIONAL_TRANSITIONS, server.TRANSITIONS);
  for (const status of INSTITUTIONAL_STATUSES) assert.deepEqual(nextInstitutionalStatuses(status), server.nextStatuses(status));
  assert.equal(statusRequiresNote("nao_e_de_competencia"), true);
  assert.equal(statusRequiresNote("em_analise"), false);
  for (const [type, status] of Object.entries(RESPONSE_SUGGESTED_STATUS)) {
    assert.ok(RESPONSE_TYPES.includes(type));
    assert.ok(INSTITUTIONAL_STATUSES.includes(status));
  }
});

test("query da lista e caminhos", () => {
  assert.equal(
    buildInstitutionalQuery({ scope: "todas", institutionalStatus: ["sem_acompanhamento", "recebida"], category: ["projeto_social"], q: "praça" }),
    "scope=todas&institutionalStatus=sem_acompanhamento%2Crecebida&category=projeto_social&q=pra%C3%A7a",
  );
  assert.equal(institutionalDemandPath("a b"), "/governo/demandas/a%20b");
});

test("linha do tempo: eventos institucionais com órgão, tipo e status", () => {
  const response = { type: "resposta_institucional", details: { organizationName: "Secretaria X", responseType: "acao_prevista", excerpt: "Vistoria", programName: null } };
  assert.equal(institutionalTimelineLabel(response), "Resposta institucional de Secretaria X: Ação prevista");
  assert.equal(institutionalTimelineDetail(response), "Vistoria");
  const status = { type: "status_institucional_alterado", details: { organizationName: "Secretaria X", institutionalStatus: "nao_e_de_competencia", note: "Estadual" } };
  assert.equal(institutionalTimelineLabel(status), "Secretaria X: Não é de competência");
  assert.equal(institutionalTimelineDetail(status), "Estadual");
  const offer = { type: "apoio_institucional_oferecido", details: { organizationName: "Secretaria X", supportTypes: ["infraestrutura", "parcerias"] } };
  assert.equal(institutionalTimelineDetail(offer), "Infraestrutura, Parcerias");
  assert.equal(timelineEventLabel({ ...offer, toStatus: null }), "Secretaria X ofereceu apoio");
  assert.equal(institutionalTimelineLabel({ type: "publicada" }), null);
});

test("mensagens de erro", () => {
  const err = Object.assign(new Error("x"), { code: "invalid_transition" });
  assert.match(institutionalErrorMessage(err), /não é permitida/);
  assert.match(institutionalErrorMessage(new Error("network")), /Sem conexão/);
});

test("encaminhamentos (T14): listas, transições e status da origem iguais aos do post-service", () => {
  assert.deepEqual(FORWARDING_DESTINATION_KINDS, server.DESTINATION_KINDS);
  assert.deepEqual(FORWARDING_DESTINATION_KIND_LABELS, server.DESTINATION_KIND_LABELS);
  assert.deepEqual(FORWARDING_STATUSES, server.FORWARDING_STATUSES);
  assert.deepEqual(FORWARDING_STATUS_LABELS, server.FORWARDING_STATUS_LABELS);
  assert.deepEqual(FORWARDING_TRANSITIONS, server.FORWARDING_TRANSITIONS);
  assert.deepEqual(FORWARDING_UPDATE_KINDS, server.UPDATE_KINDS);
  assert.deepEqual(FORWARDING_UPDATE_KIND_LABELS, server.UPDATE_KIND_LABELS);
  assert.deepEqual(DEFAULT_ORIGIN_TRACK_STATUS, server.DEFAULT_ORIGIN_TRACK_STATUS);
  assert.deepEqual([...FORWARDING_EVENT_TYPES], server.FORWARDING_EVENT_TYPES);
  // Encaminhar segue a máquina do status institucional.
  assert.equal(canForwardFrom(null, "encaminhada"), true);
  assert.equal(canForwardFrom("em_analise", "encaminhada_ao_orgao_responsavel"), true);
  assert.equal(canForwardFrom("encaminhada_ao_orgao_responsavel", "encaminhada_ao_orgao_responsavel"), true);
  assert.equal(canForwardFrom("acao_programada", "encaminhada"), false);
  assert.equal(canForwardFrom("nao_e_de_competencia", "encaminhada_ao_orgao_responsavel"), false);
});

test("linha do tempo e sino: encaminhamento com órgão, destino e status, sem responsável", () => {
  const forwarded = { type: "demanda_encaminhada", details: { organizationName: "Secretaria X", destinationKind: "orgao_plataforma", destinationOrganizationName: "Companhia Y", destinationSector: "Remoção", excerpt: "Competência da Companhia" } };
  assert.equal(institutionalTimelineLabel(forwarded), "Secretaria X encaminhou a demanda a Companhia Y — Remoção");
  assert.equal(institutionalTimelineDetail(forwarded), "Competência da Companhia");
  const internal = { type: "demanda_encaminhada", details: { organizationName: "Secretaria X", destinationKind: "setor_interno", destinationOrganizationName: "Secretaria X", destinationSector: "Fiscalização" } };
  assert.equal(timelineEventLabel({ ...internal, toStatus: null }), "Secretaria X encaminhou a demanda a Fiscalização");
  const status = { type: "encaminhamento_status_alterado", details: { organizationName: "Companhia Y", destinationKind: "orgao_plataforma", destinationOrganizationName: "Companhia Y", forwardingStatus: "devolvido", note: "Rede é municipal" } };
  assert.equal(institutionalTimelineLabel(status), "Encaminhamento a Companhia Y: devolvido");
  assert.equal(institutionalTimelineDetail(status), "Rede é municipal");
  const update = { type: "encaminhamento_atualizado", details: { organizationName: "Companhia Y", updateKind: "providencia", excerpt: "Equipe designada" } };
  assert.equal(institutionalTimelineLabel(update), "Companhia Y registrou providência no encaminhamento");
  assert.equal(forwardingDestinationLabel({ destinationKind: "orgao_externo", destinationOrganizationName: "Cedae" }), "Cedae");
});
