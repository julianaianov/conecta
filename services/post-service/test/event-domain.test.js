// Domínio do evento e da inscrição (T25): vocabulário igual ao dos enums da
// migração 021, validação do rascunho e da publicação, e a agenda pública.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/event/constants');
const { validateEvent, validateSignup, validateCancellation } = require('../src/event/validation');
const { agendaQuery } = require('../src/routes/events');
const store = require('../src/event/store');

const migration = fs.readFileSync(path.join(__dirname, '../migrations/021-events.sql'), 'utf8');

/** Valores de um `CREATE TYPE <name> AS ENUM (...)` da migração. */
function enumValues(name) {
  const match = migration.match(new RegExp(`CREATE TYPE ${name} AS ENUM \\(([\\s\\S]*?)\\)`));
  assert.ok(match, `enum ${name} ausente na migração 021`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('o vocabulário do evento é o dos enums da migração 021', () => {
  assert.deepEqual(C.KINDS, enumValues('event_kind'));
  assert.deepEqual(C.STATUSES, enumValues('event_status'));
  assert.deepEqual(C.PRICING, enumValues('event_pricing'));
  assert.deepEqual(C.ACCESSIBILITY, enumValues('event_accessibility'));
  assert.deepEqual(C.SIGNUP_STATUSES, enumValues('event_signup_status'));
  for (const [list, labels] of [
    [C.KINDS, C.KIND_LABELS], [C.STATUSES, C.STATUS_LABELS], [C.PRICING, C.PRICING_LABELS],
    [C.ACCESSIBILITY, C.ACCESSIBILITY_LABELS], [C.SIGNUP_STATUSES, C.SIGNUP_STATUS_LABELS],
  ]) {
    assert.deepEqual(Object.keys(labels).sort(), [...list].sort());
  }
});

test('os conteúdos do slide 18 viram os tipos de evento', () => {
  // "Aulas esportivas, Eventos, Oficinas culturais, Mutirões, Ações ambientais".
  for (const kind of ['evento', 'oficina_cultural', 'mutirao', 'acao_ambiental', 'aula_esportiva']) {
    assert.ok(C.KINDS.includes(kind), kind);
  }
});

test('quem organiza e quem se inscreve vem das permissões da fonte', () => {
  // Slide 8 (Agente publica) e slide 11 (Poder Público informa programas e ações).
  assert.deepEqual(C.ORGANIZER_ROLES, ['agent', 'government']);
  assert.deepEqual(C.ROLE_ORGANIZER_CATEGORY, { agent: 'agente', government: 'poder_publico' });
  // Slide 9: "Inscrever-se em eventos" é permissão de Membros da Comunidade, e
  // de nenhuma outra categoria na fonte.
  assert.deepEqual(C.SIGNUP_ROLES, ['member']);
  assert.equal(C.ROLE_CATEGORY.member, 'comunidade');
  // Decisão 5: nada de pagamento na plataforma.
  assert.match(C.PRICING_LABELS.pago, /fora da plataforma/);
  // Governança (slide 26): o que não existe aparece como em desenvolvimento.
  assert.equal(C.EMAIL_NOTIFICATIONS.available, false);
  assert.equal(C.EMAIL_NOTIFICATIONS.state, 'em_desenvolvimento');
});

const DRAFT = {
  kind: 'mutirao',
  title: '  Mutirão   de limpeza ',
  description: 'Limpeza do córrego com a comunidade.',
  startsAt: '2026-11-14T13:00:00.000Z',
  endsAt: '2026-11-14T17:00:00.000Z',
  locationName: 'Praça central',
  cep: '22790000',
  municipality: 'Rio de Janeiro',
  uf: 'rj',
  latitude: -23.02,
  longitude: -43.45,
  audience: 'Moradores do bairro',
  pricing: 'gratuito',
};

test('validateEvent: rascunho normaliza e publicação exige o mínimo', () => {
  const draft = validateEvent(DRAFT);
  assert.deepEqual(draft.errors, {});
  assert.equal(draft.value.title, 'Mutirão de limpeza');
  assert.equal(draft.value.cep, '22790-000');
  assert.equal(draft.value.uf, 'RJ');
  assert.equal(draft.value.startsAt, '2026-11-14T13:00:00.000Z');

  // Campo ausente passa no rascunho e falta na publicação.
  assert.deepEqual(validateEvent({ title: 'Só o título' }).errors, {});
  const publish = validateEvent({ title: 'Só o título' }, { forPublication: true });
  for (const key of ['description', 'startsAt', 'endsAt', 'locationName', 'cep', 'municipality', 'uf',
    'latitude', 'longitude', 'audience', 'pricing']) {
    assert.ok(publish.errors[key], `faltou exigir ${key}`);
  }
  assert.ok(!publish.errors.title);
  // A localização com CEP é obrigatória, como na demanda.
  assert.match(publish.errors.cep, /CEP/);
});

test('validateEvent: período, cobrança, vagas e fila de espera', () => {
  assert.ok(validateEvent({ ...DRAFT, endsAt: DRAFT.startsAt }).errors.endsAt);
  assert.ok(validateEvent({ ...DRAFT, endsAt: '2027-11-14T17:00:00.000Z' }).errors.endsAt, 'duração absurda');
  assert.ok(validateEvent({ ...DRAFT, startsAt: 'ontem' }).errors.startsAt);

  // Decisão 5: gratuito não tem valor; pago declara o valor.
  assert.ok(validateEvent({ ...DRAFT, priceCents: 1000 }).errors.priceCents);
  assert.ok(validateEvent({ ...DRAFT, pricing: 'pago' }).errors.priceCents);
  assert.deepEqual(validateEvent({ ...DRAFT, pricing: 'pago', priceCents: 1500 }).errors, {});

  assert.ok(validateEvent({ ...DRAFT, waitlistEnabled: true }).errors.waitlistEnabled);
  assert.deepEqual(validateEvent({ ...DRAFT, capacity: 30, waitlistEnabled: true }).errors, {});
  assert.ok(validateEvent({ ...DRAFT, capacity: 0 }).errors.capacity);

  // Editar um evento gravado: o valor efetivo vem do que já existe.
  const current = { starts_at: '2026-11-14T13:00:00.000Z', ends_at: '2026-11-14T17:00:00.000Z', pricing: 'pago', price_cents: 1500, capacity: 10, waitlist_enabled: true, signups_count: 8 };
  assert.deepEqual(validateEvent({ title: 'Novo título' }, { current }).errors, {});
  assert.ok(validateEvent({ capacity: 5 }, { current }).errors.capacity, 'vagas abaixo dos inscritos');
  assert.ok(validateEvent({ endsAt: '2026-11-14T12:00:00.000Z' }, { current }).errors.endsAt);
});

test('validateEvent: acessibilidade, foto e valores fora da lista', () => {
  assert.deepEqual(validateEvent({ accessibility: ['piso_tatil', 'piso_tatil'] }).value.accessibility, ['piso_tatil']);
  assert.ok(validateEvent({ accessibility: ['rampa'] }).errors.accessibility);
  assert.ok(validateEvent({ accessibility: 'rampa' }).errors.accessibility);
  assert.ok(validateEvent({ kind: 'festa' }).errors.kind);
  assert.ok(validateEvent({ uf: 'XX' }).errors.uf);
  assert.ok(validateEvent({ cep: '123' }).errors.cep);
  assert.ok(validateEvent({ photoRef: 'http://exemplo.org/f.jpg' }).errors.photoRef);
  assert.deepEqual(validateEvent({ photoRef: 'https://exemplo.org/f.jpg' }).errors, {});
});

test('validateSignup e validateCancellation', () => {
  assert.deepEqual(validateSignup({ note: '  Levo luvas  ' }), { value: { note: 'Levo luvas' }, errors: {} });
  assert.ok(validateSignup({ note: 'x'.repeat(501) }).errors.note);
  assert.ok(validateCancellation({}).errors.reason, 'cancelar exige motivo');
  assert.deepEqual(validateCancellation({ reason: 'Chuva forte' }).value.reason, 'Chuva forte');
});

test('agenda pública: filtros, ordem e keyset', () => {
  const proximos = agendaQuery({});
  assert.match(proximos.sql, /e\.starts_at ASC, e\.id ASC/);
  assert.ok(proximos.sql.includes('e.ends_at >= NOW()'));
  assert.deepEqual(proximos.params[0], ['publicado']);

  const passados = agendaQuery({ when: 'passados', kind: 'mutirao,acao_ambiental', uf: 'rj', pricing: 'gratuito' });
  assert.match(passados.sql, /e\.starts_at DESC, e\.id DESC/);
  assert.ok(passados.params.includes('RJ'));
  assert.deepEqual(passados.params[1], ['mutirao', 'acao_ambiental']);

  for (const query of [{ kind: 'festa' }, { uf: 'Rio' }, { when: 'amanha' }, { limit: 999 },
    { cursor: 'x' }, { demandId: 'nao-e-uuid' }, { from: 'ontem' }, { pricing: 'caro' },
    { accessibility: 'rampa' }]) {
    assert.throws(() => agendaQuery(query), (err) => err.status === 422, JSON.stringify(query));
  }
});

test('projeções: o público vê o local, nunca um inscrito', () => {
  // O endereço do local é público de propósito (sem ele ninguém comparece).
  for (const column of ['e.cep', 'e.street', 'e.location_name', 'e.latitude']) {
    assert.ok(store.PUBLIC_EVENT_SQL.includes(column), column);
  }
  // Nada de inscrito na projeção pública do evento.
  assert.ok(!/user_name|user_avatar|attended_count/.test(store.PUBLIC_EVENT_SQL));

  const attendee = store.serializeAttendee({
    id: 'a', user_id: 'u', user_name: 'Joana', user_avatar: 'https://x/y.png',
    user_category: 'comunidade', profile_type: 'voluntario', status: 'inscrito',
    attended: false, signed_up_at: new Date('2026-10-01T10:00:00Z'),
  });
  // Minimização (LGPD): o organizador vê nome, categoria e estado; nada mais.
  assert.deepEqual(Object.keys(attendee).sort(), [
    'attended', 'attendedAt', 'canceledAt', 'id', 'name', 'note', 'profileType',
    'signedUpAt', 'status', 'userCategory', 'waitlistPosition',
  ]);
  assert.ok(!('userId' in attendee) && !('avatarUrl' in attendee));

  const event = store.serializeEvent({
    id: 'e1', organizer_id: 'o1', organizer_category: 'agente', kind: 'evento', title: 'T',
    description: 'D', starts_at: new Date('2026-11-14T13:00:00Z'), ends_at: new Date('2026-11-14T17:00:00Z'),
    location_name: 'Praça', cep: '22790-000', latitude: '-23.02', longitude: '-43.45',
    audience: 'Todos', capacity: 10, signups_count: 7, waitlist_count: 2, pricing: 'gratuito',
    accessibility: ['piso_tatil'], status: 'publicado',
  });
  assert.equal(event.seatsLeft, 3);
  assert.equal(event.latitude, -23.02);
  assert.equal(event.startsAt, '2026-11-14T13:00:00.000Z');
  assert.equal(store.serializeEvent({ ...{ id: 'x', capacity: null, signups_count: 0 } }).seatsLeft, null);
});
