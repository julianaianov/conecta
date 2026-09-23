// Eventos e inscrições (T25): o espelho do frontend precisa ser igual ao
// domínio do post-service (services/post-service/src/event/constants.js).
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  EVENT_ACCESSIBILITY,
  EVENT_ACCESSIBILITY_LABELS,
  EVENT_EMAIL_NOTIFICATIONS,
  EVENT_KINDS,
  EVENT_KIND_LABELS,
  EVENT_ORGANIZER_ROLES,
  EVENT_PRICING,
  EVENT_PRICING_LABELS,
  EVENT_PUBLIC_STATUSES,
  EVENT_SIGNUP_ROLES,
  EVENT_SIGNUP_STATUSES,
  EVENT_SIGNUP_STATUS_LABELS,
  EVENT_STATUSES,
  EVENT_STATUS_LABELS,
  buildEventAgendaQuery,
  eventAccessibilityLabel,
  eventAddressLine,
  eventKindLabel,
  eventPeriodLabel,
  eventPlaceLine,
  eventPriceLabel,
  eventSeatsLabel,
  isEventOver,
} from "./event.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/event/constants.js");

test("vocabulário e rótulos seguem o post-service", () => {
  assert.deepEqual(EVENT_KINDS, server.KINDS);
  assert.deepEqual(EVENT_KIND_LABELS, server.KIND_LABELS);
  assert.deepEqual(EVENT_STATUSES, server.STATUSES);
  assert.deepEqual(EVENT_STATUS_LABELS, server.STATUS_LABELS);
  assert.deepEqual(EVENT_PUBLIC_STATUSES, server.PUBLIC_STATUSES);
  assert.deepEqual(EVENT_PRICING, server.PRICING);
  assert.deepEqual(EVENT_PRICING_LABELS, server.PRICING_LABELS);
  assert.deepEqual(EVENT_ACCESSIBILITY, server.ACCESSIBILITY);
  assert.deepEqual(EVENT_ACCESSIBILITY_LABELS, server.ACCESSIBILITY_LABELS);
  assert.deepEqual(EVENT_SIGNUP_STATUSES, server.SIGNUP_STATUSES);
  assert.deepEqual(EVENT_SIGNUP_STATUS_LABELS, server.SIGNUP_STATUS_LABELS);
  assert.deepEqual([...EVENT_ORGANIZER_ROLES], server.ORGANIZER_ROLES);
  assert.deepEqual([...EVENT_SIGNUP_ROLES], server.SIGNUP_ROLES);
  assert.deepEqual({ ...EVENT_EMAIL_NOTIFICATIONS }, server.EMAIL_NOTIFICATIONS);
});

test("as permissões da fonte não se perdem na tela", () => {
  // Slide 9: inscrever-se em eventos é dos Membros da Comunidade.
  assert.deepEqual([...EVENT_SIGNUP_ROLES], ["member"]);
  // Slides 8 e 11: quem publica é Agente e Poder Público.
  assert.deepEqual([...EVENT_ORGANIZER_ROLES], ["agent", "government"]);
  // Governança (slide 26): o e-mail aparece como em desenvolvimento.
  assert.equal(EVENT_EMAIL_NOTIFICATIONS.available, false);
  assert.equal(EVENT_EMAIL_NOTIFICATIONS.state, "em_desenvolvimento");
  // Slide 18: os conteúdos do território viram os tipos do evento.
  assert.deepEqual(EVENT_KINDS, ["evento", "oficina_cultural", "mutirao", "acao_ambiental", "aula_esportiva"]);
});

test("rótulos de valores desconhecidos não quebram a tela", () => {
  assert.equal(eventKindLabel("mutirao"), "Mutirão");
  assert.equal(eventKindLabel("xpto"), "Evento");
  assert.equal(eventAccessibilityLabel("piso_tatil"), "Piso tátil");
  assert.equal(eventAccessibilityLabel("rampa"), "rampa");
});

const EVENT = {
  street: "Avenida das Américas",
  addressNumber: "1000",
  addressComplement: null,
  district: "Recreio dos Bandeirantes",
  territory: "Recreio dos Bandeirantes",
  municipality: "Rio de Janeiro",
  uf: "RJ",
  cep: "22790-000",
};

test("endereço, território e período em texto", () => {
  assert.equal(
    eventAddressLine(EVENT),
    "Avenida das Américas, 1000 · Recreio dos Bandeirantes · Rio de Janeiro/RJ · 22790-000",
  );
  assert.equal(eventPlaceLine(EVENT), "Recreio dos Bandeirantes, Rio de Janeiro, RJ");
  const period = eventPeriodLabel("2026-11-14T13:00:00.000Z", "2026-11-14T17:00:00.000Z");
  assert.match(period, /14\/11\/2026/);
  assert.match(period, / às /);
  assert.match(eventPeriodLabel("2026-11-14T13:00:00Z", "2026-11-16T17:00:00Z"), / até /);
  assert.equal(eventPeriodLabel("ontem", "hoje"), "");
});

test("cobrança declarada, vagas e evento encerrado", () => {
  // Decisão 5: nada é cobrado pela plataforma.
  assert.match(eventPriceLabel({ pricing: "gratuito", priceCents: null }), /Gratuito/);
  assert.match(eventPriceLabel({ pricing: "pago", priceCents: 1500 }), /fora da plataforma/);
  assert.match(eventPriceLabel({ pricing: "pago", priceCents: 1500 }), /15,00/);

  assert.equal(eventSeatsLabel({ capacity: null, seatsLeft: null, waitlistEnabled: false, waitlistCount: 0 }), "Sem limite de vagas");
  assert.equal(eventSeatsLabel({ capacity: 30, seatsLeft: 4, waitlistEnabled: false, waitlistCount: 0 }), "4 de 30 vagas");
  assert.match(eventSeatsLabel({ capacity: 30, seatsLeft: 0, waitlistEnabled: true, waitlistCount: 3 }), /lista de espera/);
  assert.equal(eventSeatsLabel({ capacity: 30, seatsLeft: 0, waitlistEnabled: false, waitlistCount: 0 }), "Vagas esgotadas");

  assert.equal(isEventOver({ endsAt: "2020-01-01T00:00:00Z" }), true);
  assert.equal(isEventOver({ endsAt: "2099-01-01T00:00:00Z" }), false);
});

test("a query da agenda só leva filtros preenchidos", () => {
  assert.equal(buildEventAgendaQuery(), "");
  const query = buildEventAgendaQuery({ kind: "mutirao", territory: " Recreio ", uf: "RJ", q: "", limit: 10 });
  const params = new URLSearchParams(query);
  assert.equal(params.get("kind"), "mutirao");
  assert.equal(params.get("territory"), "Recreio");
  assert.equal(params.get("limit"), "10");
  assert.equal(params.has("q"), false);
});
