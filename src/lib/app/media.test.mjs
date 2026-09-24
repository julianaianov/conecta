// Pautas da Comunicação (T28): o espelho do frontend precisa ser igual ao
// domínio do post-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  AGENDA_SIGNALS, AGENDA_SIGNAL_LABELS, AGENDA_STATUSES, AGENDA_STATUS_LABELS, AGENDA_STATUS_TRANSITIONS,
  AGENDA_TARGET_KINDS, AGENDA_ANGLE_MAX, AGENDA_OUTLET_MAX, AGENDA_URL_MAX, MEDIA_EVENT_TYPES, MEDIA_ROLES,
  agendaErrorMessage, agendaTargetPath, canIdentifyAgenda, formatIsoDay, mediaTimelineDetail, mediaTimelineLabel,
} from "./media.ts";
import { timelineEventLabel } from "./demand.ts";
import { ROLE_PERMISSIONS } from "./types.ts";

const require = createRequire(import.meta.url);
const constants = require("../../../services/post-service/src/media/constants.js");

test("vocabulário igual ao post-service", () => {
  assert.deepEqual(AGENDA_STATUSES, constants.STATUSES);
  assert.deepEqual(AGENDA_STATUS_LABELS, constants.STATUS_LABELS);
  assert.deepEqual(AGENDA_STATUS_TRANSITIONS, constants.STATUS_TRANSITIONS);
  assert.deepEqual(AGENDA_TARGET_KINDS, constants.TARGET_KINDS);
  assert.deepEqual(AGENDA_SIGNALS, constants.SIGNALS);
  assert.deepEqual(AGENDA_SIGNAL_LABELS, constants.SIGNAL_LABELS);
  assert.equal(AGENDA_ANGLE_MAX, constants.ANGLE_MAX);
  assert.equal(AGENDA_OUTLET_MAX, constants.OUTLET_MAX);
  assert.equal(AGENDA_URL_MAX, constants.URL_MAX);
  assert.deepEqual(MEDIA_EVENT_TYPES, constants.EVENT_TYPES);
  assert.deepEqual([...MEDIA_ROLES], constants.MEDIA_ROLES);
});

test("só a Comunicação identifica pautas, e a permissão está na tabela de perfis", () => {
  assert.equal(canIdentifyAgenda("media", "jornalista"), true);
  assert.equal(canIdentifyAgenda("institutional", "imprensa"), true);
  assert.equal(canIdentifyAgenda("agent", "ong"), false);
  assert.equal(canIdentifyAgenda("member"), false);
  assert.ok(ROLE_PERMISSIONS.media.includes("agenda"));
  for (const role of ["agent", "member", "partner", "government"]) assert.ok(!ROLE_PERMISSIONS[role].includes("agenda"));
});

test("linha do tempo: divulgação com veículo, data e endereço", () => {
  const event = { type: "divulgacao_registrada", details: { outletName: "Jornal do Bairro", publishedOn: "2026-09-23", publishedUrl: "https://jornal.example/praca" } };
  assert.equal(mediaTimelineLabel(event), "Divulgada por Jornal do Bairro");
  assert.equal(timelineEventLabel(event), "Divulgada por Jornal do Bairro");
  assert.equal(mediaTimelineDetail(event), "publicada em 23/09/2026 · https://jornal.example/praca");
  assert.equal(mediaTimelineLabel({ type: "publicada", details: {} }), null);
  assert.equal(formatIsoDay("2026-01-05"), "05/01/2026");
});

test("caminhos e mensagens de erro", () => {
  assert.equal(agendaTargetPath("demanda", "abc"), "/demandas/abc");
  assert.equal(agendaTargetPath("evento", "abc"), "/eventos/abc");
  const err = Object.assign(new Error("x"), { code: "agenda_item_exists" });
  assert.equal(agendaErrorMessage(err), "Você já identificou esta pauta.");
  assert.equal(agendaErrorMessage(new Error("network")), "Sem conexão com o servidor. Confira a internet e tente de novo.");
});
