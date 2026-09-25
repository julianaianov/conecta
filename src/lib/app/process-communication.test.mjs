// Comunicação do Processo de Conexão (T-05-02): o espelho do frontend precisa
// ser igual ao domínio do post-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  PROCESS_MESSAGE_LIMITS, PROCESS_MESSAGE_RECIPIENTS, PROCESS_MESSAGE_RECIPIENT_LABELS,
  messageAuthorDetails, recipientLabel, recipientOptions, sideOfViewer,
} from "./process-communication.ts";
import { processTimelineLabel } from "./process.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/process/communication.js");

test("vocabulário igual ao do post-service (Modelo §12)", () => {
  assert.deepEqual(PROCESS_MESSAGE_RECIPIENTS, server.MESSAGE_RECIPIENTS);
  assert.deepEqual(PROCESS_MESSAGE_RECIPIENT_LABELS, server.MESSAGE_RECIPIENT_LABELS);
  assert.deepEqual({ ...PROCESS_MESSAGE_LIMITS }, server.MESSAGE_LIMITS);
});

test("lado, destinatário e retrato do autor", () => {
  assert.equal(sideOfViewer("agente"), "agente");
  assert.equal(sideOfViewer("parte"), "conectado");
  assert.deepEqual(recipientOptions("agente").map((o) => o.value), ["todos", "conectado", "agente"]);
  assert.deepEqual(recipientOptions("parte").map((o) => o.value), ["todos", "agente", "conectado"]);
  assert.equal(messageAuthorDetails({ authorRoleLabel: "Coordenadora", authorOrganizationName: "Secretaria de Obras" }),
    "Coordenadora · Secretaria de Obras");
  assert.equal(messageAuthorDetails({ authorRoleLabel: null, authorOrganizationName: null }), null);
  assert.equal(recipientLabel("conectado"), "Para: Parte conectada");
  assert.equal(processTimelineLabel({ type: "mensagem_registrada", details: {} }), "Mensagem registrada no processo");
});
