// Processo de Conexão (T-05-01): o espelho do frontend precisa ser igual ao
// domínio do post-service.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  CONTRIBUTION_KIND_LABELS, PARTY_KIND_LABELS, PROCESS_EVENT_TYPES, PROCESS_FINAL_STATUSES, PROCESS_PROTOCOL_RE,
  PROCESS_STATUSES, PROCESS_STATUSES_REQUIRING_NOTE, PROCESS_STATUS_COLORS, PROCESS_STATUS_LABELS,
  connectionNumberLabel, contributionLabels, processFeesLine, processPath, processTimelineLabel, publicPartyLabel,
} from "./process.ts";
import { timelineEventLabel } from "./demand.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/process/constants.js");

test("vocabulário igual ao do post-service (Modelo §16, §26–§28)", () => {
  assert.deepEqual(PROCESS_STATUSES, server.PROCESS_STATUSES);
  assert.deepEqual(PROCESS_STATUS_LABELS, server.PROCESS_STATUS_LABELS);
  assert.deepEqual(Object.keys(PROCESS_STATUS_COLORS), PROCESS_STATUSES);
  assert.deepEqual(PROCESS_STATUSES_REQUIRING_NOTE, server.STATUSES_REQUIRING_NOTE);
  assert.deepEqual(PROCESS_FINAL_STATUSES, server.FINAL_STATUSES);
  assert.deepEqual(PARTY_KIND_LABELS, server.PARTY_KIND_LABELS);
  assert.deepEqual(CONTRIBUTION_KIND_LABELS, server.CONTRIBUTION_KIND_LABELS);
  assert.deepEqual([...PROCESS_EVENT_TYPES], server.PROCESS_EVENT_TYPES);
  assert.equal(String(PROCESS_PROTOCOL_RE), String(server.PROTOCOL_RE));
});

test("rótulos, caminho e linha do tempo sem nome de pessoa", () => {
  assert.equal(processPath("DM-2026-000184"), "/processos/DM-2026-000184");
  assert.equal(connectionNumberLabel(1), "Conexão 01");
  assert.equal(contributionLabels(["materiais", "equipe"]), "Materiais, Equipe");
  assert.equal(contributionLabels([]), "A definir");
  assert.equal(publicPartyLabel({ partyKind: "empresa", organizationName: null }), "Empresa");
  assert.equal(publicPartyLabel({ partyKind: "poder_publico", organizationName: "Secretaria de Obras" }), "Secretaria de Obras");
  const formalized = { type: "processo_formalizado", details: { protocol: "DM-2026-000001", partyKind: "patrocinador" } };
  assert.equal(processTimelineLabel(formalized), "Conexão formalizada — processo DM-2026-000001 (Patrocinador)");
  assert.equal(timelineEventLabel(formalized), "Conexão formalizada — processo DM-2026-000001 (Patrocinador)");
  assert.equal(
    timelineEventLabel({ type: "processo_status_alterado", details: { protocol: "DM-2026-000001", status: "aprovada_para_execucao" } }),
    "Processo DM-2026-000001: Aprovada para execução",
  );
  assert.equal(processTimelineLabel({ type: "outro" }), null);
});

test("valor da conexão (T-05-06, decisão 14): 4% + 6% só com Parceiros/Empresas", () => {
  const brl = (s) => s.replace(/\s/g, " ");
  assert.equal(
    brl(processFeesLine({ applies: true, contributionAmountCents: 1_000_000, agentFeeCents: 40_000, platformFeeCents: 60_000, totalWithFeesCents: 1_100_000 })),
    "Contribuição R$ 10.000,00 + 4% (R$ 400,00) + 6% (R$ 600,00) = R$ 11.000,00",
  );
  assert.equal(
    brl(processFeesLine({ applies: false, contributionAmountCents: 500_000, agentFeeCents: 0, platformFeeCents: 0, totalWithFeesCents: 500_000 })),
    "Contribuição R$ 5.000,00 (sem 4% + 6%: conexão com o Poder Público)",
  );
  assert.equal(processFeesLine(null), null);
});
