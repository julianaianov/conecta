// Eventos e inscrições (T25) contra um PostgreSQL de verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const GOV = '55555555-5555-4555-8555-555555555555';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const MEMBER_2 = '66666666-6666-4666-8666-666666666666';
const MEMBER_3 = '77777777-7777-4777-8777-777777777777';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const ORG_AGENT = '88888888-8888-4888-8888-888888888888';
const ORG_GOV = '99999999-9999-4999-8999-999999999999';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [GOV]: ['government', 'secretaria', 'Secretaria de Meio Ambiente'],
  [MEMBER]: ['member', 'voluntario', 'Joana Moradora'],
  [MEMBER_2]: ['member', 'morador', 'Carlos Vizinho'],
  [MEMBER_3]: ['member', 'jovem', 'Rita Jovem'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
};
const token = (userId) => {
  const [role, profileType, name] = USERS[userId];
  return jwt.sign({ userId, role, profileType, name }, SECRET);
};

async function institutionStatus(req) {
  if (req.user.userId === GOV) return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV };
  if (req.user.userId === AGENT) return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
  return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
}

const connectionStore = new Map();
const connections = {
  async create(req, input) {
    const id = require('node:crypto').randomUUID();
    const connection = {
      id, type: input.type, status: 'pending', fromUserId: req.user.userId, toUserId: input.toUserId,
      demandId: input.demandId ?? null, postId: input.postId ?? null, message: input.message,
    };
    connectionStore.set(id, connection);
    return { ...connection };
  },
  async get(req, id) {
    const c = connectionStore.get(id);
    if (!c || (c.fromUserId !== req.user.userId && c.toUserId !== req.user.userId)) return null;
    return { ...c };
  },
  async update(_req, id, status) {
    const c = connectionStore.get(id);
    c.status = status;
    return { ...c };
  },
};

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

const hours = (n) => new Date(Date.now() + n * 3600_000).toISOString();

const EVENT_BODY = {
  kind: 'mutirao',
  title: 'Mutirão de limpeza do córrego',
  description: 'Limpeza do córrego com a comunidade, café da manhã e coleta seletiva.',
  startsAt: hours(48),
  endsAt: hours(52),
  locationName: 'Praça da Estação',
  cep: '22790-000',
  street: 'Avenida das Américas',
  addressNumber: '1000',
  district: 'Recreio dos Bandeirantes',
  territory: 'Recreio dos Bandeirantes',
  municipality: 'Rio de Janeiro',
  uf: 'RJ',
  latitude: -23.02,
  longitude: -43.45,
  audience: 'Moradores e voluntários do bairro',
  pricing: 'gratuito',
  accessibility: ['acesso_para_cadeirantes', 'banheiro_acessivel'],
  accessibilityNotes: 'Rampa na entrada principal.',
};

test('evento: rascunho, publicação, feed, mapa, inscrição, fila de espera, presença e cancelamento',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007, 011 e 021).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_budget_items, demand_schedule_items, demand_goals,
                         demand_resources, demand_documents, demand_events, demand_interests,
                         events, event_signups, posts TO gestao_app`);
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null,
      dossierService: null, rankings: null, partnerProfile: { get: async () => null }, connections,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = AGENT, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    try {
      // ── Rascunho e publicação ─────────────────────────────────────────────
      const incomplete = await call('POST', '/events', { body: { title: 'Só o título' } });
      assert.equal(incomplete.status, 201, JSON.stringify(incomplete.body));
      assert.equal(incomplete.body.event.status, 'rascunho');
      const draftId = incomplete.body.event.id;
      const refused = await call('POST', `/events/${draftId}/publish`);
      assert.equal(refused.status, 422);
      assert.equal(refused.body.code, 'event_incomplete');
      assert.ok(refused.body.fields.cep, 'a localização com CEP é obrigatória');

      const created = await call('POST', '/events', { body: EVENT_BODY });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.event.id;
      assert.equal(created.body.event.organizerCategory, 'agente');
      assert.equal(created.body.event.organizationId, ORG_AGENT);
      assert.equal(created.body.event.status, 'rascunho');

      // Rascunho não é público.
      assert.equal((await call('GET', `/events/${id}`, { auth: false })).status, 404);
      assert.deepEqual((await call('GET', '/events', { auth: false })).body.events, []);

      const published = await call('POST', `/events/${id}/publish`);
      assert.equal(published.status, 200, JSON.stringify(published.body));
      assert.equal(published.body.event.status, 'publicado');
      assert.ok(published.body.event.publishedAt);
      assert.equal(published.body.emailNotifications.available, false);
      assert.equal(published.body.emailNotifications.state, 'em_desenvolvimento');

      // ── Post-vitrine: feed e camada de conteúdos do mapa, com data ────────
      const feed = await call('GET', '/?type=event', { auth: false });
      assert.equal(feed.status, 200);
      const showcase = feed.body.posts.find((p) => p.event_id === id);
      assert.ok(showcase, 'o evento publicado entra no feed');
      assert.equal(showcase.title, EVENT_BODY.title);
      assert.ok(showcase.event_starts_at, 'o post-vitrine leva a data para o mapa');
      const map = await call('GET', '/map?type=event', { auth: false });
      assert.ok(map.body.some((p) => p.event_id === id && p.event_starts_at));
      // O post-vitrine não é editado nem excluído pelas rotas de posts.
      const edit = await call('PUT', `/${showcase.id}`, { body: { title: 'Outro' } });
      assert.ok([403, 409].includes(edit.status), JSON.stringify(edit.body));
      assert.equal((await call('DELETE', `/${showcase.id}`)).status >= 400, true);

      // ── Página pública do evento ─────────────────────────────────────────
      const publicEvent = await call('GET', `/events/${id}`, { auth: false });
      assert.equal(publicEvent.status, 200);
      assert.equal(publicEvent.body.event.title, EVENT_BODY.title);
      assert.equal(publicEvent.body.event.cep, '22790-000', 'o endereço do local é público');
      assert.deepEqual(publicEvent.body.event.accessibility, ['acesso_para_cadeirantes', 'banheiro_acessivel']);
      assert.equal(publicEvent.body.event.postId, showcase.id);
      assert.equal(publicEvent.body.signups.signupsCount, 0);
      assert.equal(publicEvent.body.emailNotifications.available, false);

      const agenda = await call('GET', '/events?territory=Recreio&uf=RJ&kind=mutirao', { auth: false });
      assert.deepEqual(agenda.body.events.map((e) => e.id), [id]);
      assert.deepEqual((await call('GET', '/events?when=passados', { auth: false })).body.events, []);
      const territories = await call('GET', '/events/territories', { auth: false });
      assert.deepEqual(territories.body.territories.map((t) => [t.territory, t.upcomingCount]),
        [['Recreio dos Bandeirantes', 1]]);

      // ── Inscrição: só Membro da Comunidade ───────────────────────────────
      assert.equal((await call('POST', `/events/${id}/signups`, { as: PARTNER, body: {} })).body.code, 'signup_not_allowed');
      assert.equal((await call('POST', `/events/${id}/signups`, { as: AGENT, body: {} })).body.code, 'signup_not_allowed');

      const signup = await call('POST', `/events/${id}/signups`, { as: MEMBER, body: { note: 'Levo luvas' } });
      assert.equal(signup.status, 201, JSON.stringify(signup.body));
      assert.equal(signup.body.signup.status, 'inscrito');
      assert.equal(signup.body.summary.signupsCount, 1);
      assert.equal(signup.body.emailNotifications.available, false);
      // Uma inscrição em aberto por conta.
      assert.equal((await call('POST', `/events/${id}/signups`, { as: MEMBER, body: {} })).body.code, 'signup_exists');

      const mine = await call('GET', `/events/${id}/signups/mine`, { as: MEMBER });
      assert.equal(mine.body.signup.status, 'inscrito');
      assert.equal(mine.body.canSignUp, false);
      assert.equal(mine.body.allowed, true);
      assert.equal((await call('GET', `/events/${id}/signups/mine`, { as: PARTNER })).body.allowed, false);
      assert.equal((await call('GET', `/events/${id}/signups/mine`, { as: AGENT })).body.isOrganizer, true);

      // Contagem pública sem lista.
      const summary = await call('GET', `/events/${id}/signups/summary`, { auth: false });
      assert.equal(summary.body.signupsCount, 1);
      assert.ok(!('attendees' in summary.body));

      // Lista de presença: só o organizador, sem dado pessoal além do necessário.
      assert.equal((await call('GET', `/events/${id}/signups`, { as: MEMBER })).status, 404);
      assert.equal((await call('GET', `/events/mine/${id}/signups`, { as: MEMBER })).status, 403);
      const attendees = await call('GET', `/events/mine/${id}/signups`);
      assert.equal(attendees.status, 200, JSON.stringify(attendees.body));
      assert.equal(attendees.body.attendees.length, 1);
      const [first] = attendees.body.attendees;
      assert.equal(first.name, 'Joana Moradora');
      assert.equal(first.userCategory, 'comunidade');
      assert.ok(!('userId' in first) && !('avatarUrl' in first), 'LGPD: nada além do necessário');

      // ── Vagas e fila de espera ────────────────────────────────────────────
      assert.ok((await call('PUT', `/events/${id}`, { body: { capacity: 1, waitlistEnabled: true } })).status === 200);
      const full = await call('POST', `/events/${id}/signups`, { as: MEMBER_2, body: {} });
      assert.equal(full.status, 201);
      assert.equal(full.body.signup.status, 'lista_de_espera');
      assert.equal(full.body.signup.waitlistPosition, 1);
      const second = await call('POST', `/events/${id}/signups`, { as: MEMBER_3, body: {} });
      assert.equal(second.body.signup.waitlistPosition, 2);
      assert.equal(second.body.summary.waitlistCount, 2);
      // Vagas não caem abaixo de quem já está inscrito.
      assert.equal((await call('PUT', `/events/${id}`, { body: { capacity: 0 } })).status, 422);

      // Sem fila de espera, evento cheio recusa a inscrição.
      assert.equal((await call('PUT', `/events/${id}`, { body: { waitlistEnabled: false } })).status, 200);
      const refusedSignup = await call('POST', `/events/${id}/signups`, { as: PARTNER, body: {} });
      assert.equal(refusedSignup.status, 403, 'antes disso, o papel já barra');
      assert.equal((await call('PUT', `/events/${id}`, { body: { waitlistEnabled: true } })).status, 200);

      // Quem sai abre vaga: o primeiro da fila é promovido.
      const canceled = await call('POST', `/events/${id}/signups/cancel`, { as: MEMBER });
      assert.equal(canceled.status, 200);
      assert.equal(canceled.body.signup.status, 'cancelado');
      const promoted = await call('GET', `/events/${id}/signups/mine`, { as: MEMBER_2 });
      assert.equal(promoted.body.signup.status, 'inscrito', 'a fila de espera avançou');
      assert.equal(promoted.body.signup.waitlistPosition, null);
      const stillWaiting = await call('GET', `/events/${id}/signups/mine`, { as: MEMBER_3 });
      assert.equal(stillWaiting.body.signup.status, 'lista_de_espera');
      assert.equal(stillWaiting.body.signup.waitlistPosition, 1, 'a fila foi renumerada');
      // Quem cancelou pode se inscrever de novo (agora sem vaga → fila).
      const again = await call('POST', `/events/${id}/signups`, { as: MEMBER, body: {} });
      assert.equal(again.status, 201);
      assert.equal(again.body.signup.status, 'lista_de_espera');

      // ── Lista de presença ─────────────────────────────────────────────────
      const signupId = (await call('GET', `/events/mine/${id}/signups?status=inscrito`)).body.attendees[0].id;
      const early = await call('PUT', `/events/mine/${id}/signups/${signupId}/attendance`, { body: { attended: true } });
      assert.equal(early.status, 409, 'a lista de presença abre no início do evento');
      // Traz o evento para agora e marca presença.
      await pool.query('UPDATE events SET starts_at = NOW() - interval \'1 hour\', ends_at = NOW() + interval \'1 hour\' WHERE id = $1', [id]);
      const marked = await call('PUT', `/events/mine/${id}/signups/${signupId}/attendance`, { body: { attended: true } });
      assert.equal(marked.status, 200, JSON.stringify(marked.body));
      assert.equal(marked.body.attendee.attended, true);
      assert.ok(marked.body.attendee.attendedAt);
      assert.equal((await call('GET', `/events/mine/${id}`)).body.event.attendedCount, 1);
      const unmarked = await call('PUT', `/events/mine/${id}/signups/${signupId}/attendance`, { body: { attended: false } });
      assert.equal(unmarked.body.attendee.attended, false);

      // ── Evento do Poder Público, vinculado ao território ─────────────────
      const govEvent = await call('POST', '/events', {
        as: GOV,
        body: { ...EVENT_BODY, kind: 'acao_ambiental', title: 'Plantio de mudas', pricing: 'pago', priceCents: 1000 },
      });
      assert.equal(govEvent.status, 201, JSON.stringify(govEvent.body));
      assert.equal(govEvent.body.event.organizerCategory, 'poder_publico');
      assert.equal(govEvent.body.event.organizationId, ORG_GOV);
      assert.equal((await call('POST', `/events/${govEvent.body.event.id}/publish`, { as: GOV })).status, 200);
      // Ninguém organiza o evento de outro.
      assert.equal((await call('PUT', `/events/${govEvent.body.event.id}`, { body: { title: 'X' } })).status, 404);

      // ── Cancelamento ──────────────────────────────────────────────────────
      assert.equal((await call('POST', `/events/${id}/cancel`, { body: {} })).status, 422);
      const cancel = await call('POST', `/events/${id}/cancel`, { body: { reason: 'Chuva forte prevista' } });
      assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
      assert.equal(cancel.body.event.status, 'cancelado');
      assert.equal((await call('PUT', `/events/${id}`, { body: { title: 'Outro' } })).status, 409);
      assert.equal((await call('POST', `/events/${id}/signups`, { as: MEMBER_3, body: {} })).status, 409);
      // O post-vitrine some do feed.
      assert.ok(!(await call('GET', '/?type=event', { auth: false })).body.posts.some((p) => p.event_id === id));
      // A página pública mostra o cancelamento e o motivo.
      const canceledPublic = await call('GET', `/events/${id}`, { auth: false });
      assert.equal(canceledPublic.body.event.status, 'cancelado');
      assert.equal(canceledPublic.body.event.cancelReason, 'Chuva forte prevista');
      // Agenda: por padrão só publicados.
      assert.ok(!(await call('GET', '/events', { auth: false })).body.events.some((e) => e.id === id));

      // ── Nada é excluído; a gestão só lê ───────────────────────────────────
      await assert.rejects(pool.query('DELETE FROM events WHERE id = $1', [id]), /não são excluídos/);
      await assert.rejects(pool.query('DELETE FROM event_signups WHERE event_id = $1', [id]), /não são excluídas/);
      assert.equal(Number((await gestao.query('SELECT count(*)::int AS n FROM events')).rows[0].n), 3);
      assert.ok(Number((await gestao.query('SELECT count(*)::int AS n FROM event_signups')).rows[0].n) > 0);
      await assert.rejects(gestao.query("UPDATE events SET title = 'x' WHERE id = $1", [id]), /permission|privilege|só lê/i);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });

test('evento da demanda: linha do tempo e voluntariado da T15 ligado ao evento',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null,
      dossierService: null, rankings: null, partnerProfile: { get: async () => null }, connections,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = AGENT, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    try {
      // Demanda publicada (mesmo caminho do e2e da T15).
      const created = await call('POST', '/demands', {
        body: {
          category: 'projeto_ambiental', title: 'Recuperação da margem do córrego',
          description: 'Recuperação da margem com plantio.', objective: 'Recuperar.',
          justification: 'Necessário.', beneficiariesEstimate: 300, beneficiariesProfile: 'Moradores',
          priority: 'alta', photoRef: 'https://example.org/foto.jpg', cep: '22790-000',
          street: 'Rua A', addressNumber: '10', district: 'Recreio dos Bandeirantes',
          municipality: 'Rio de Janeiro', uf: 'RJ', latitude: -23.02, longitude: -43.45,
          territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const demandId = created.body.id;
      assert.equal((await call('POST', `/demands/${demandId}/schedule-items`, {
        body: { stage: 'Execução', activities: 'Plantio', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${demandId}/budget-items`, {
        body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 200000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${demandId}/goals`, {
        body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${demandId}/resources`, { body: { kind: 'necessario', type: 'mao_de_obra' } })).status, 201);
      assert.equal((await call('POST', `/demands/${demandId}/submit`)).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [demandId]);

      // Evento vinculado só à demanda do próprio organizador.
      assert.equal((await call('POST', '/events', { as: GOV, body: { ...EVENT_BODY, demandId } })).status, 422);
      const event = await call('POST', '/events', {
        body: { ...EVENT_BODY, demandId, kind: 'acao_ambiental', title: 'Plantio na margem' },
      });
      assert.equal(event.status, 201, JSON.stringify(event.body));
      const eventId = event.body.event.id;
      assert.equal(event.body.event.demandId, demandId);
      assert.equal(event.body.event.demandTitle, 'Recuperação da margem do córrego');
      assert.equal((await call('POST', `/events/${eventId}/publish`)).status, 200);

      // Linha do tempo pública da demanda: o evento entra, com os dados públicos.
      const timeline = await call('GET', `/demands/${demandId}/timeline`, { auth: false });
      const entry = timeline.body.events.find((e) => e.type === 'evento_publicado');
      assert.ok(entry, JSON.stringify(timeline.body.events.map((e) => e.type)));
      assert.equal(entry.details.title, 'Plantio na margem');
      assert.equal(entry.details.eventId, eventId);
      assert.ok(entry.details.startsAt);
      assert.ok(!('organizer' in entry.details));

      // A agenda filtra pela demanda.
      assert.deepEqual((await call('GET', `/events?demandId=${demandId}`, { auth: false })).body.events.map((e) => e.id), [eventId]);

      // Voluntariado da T15 ligado ao evento.
      const volunteer = await call('POST', `/demands/${demandId}/interests`, {
        as: MEMBER, body: { kind: 'voluntariado', message: 'Posso nos sábados', eventId },
      });
      assert.equal(volunteer.status, 201, JSON.stringify(volunteer.body));
      assert.equal(volunteer.body.interest.event.id, eventId);
      assert.equal(volunteer.body.interest.event.title, 'Plantio na margem');
      // Apoio não se vincula a evento, e evento de outra demanda é recusado.
      const other = await call('POST', `/demands/${demandId}/interests`, {
        as: MEMBER_2, body: { kind: 'participacao', eventId: '00000000-0000-4000-8000-000000000000' },
      });
      assert.equal(other.status, 422);
      assert.ok(other.body.fields.eventId);

      // Cancelar o evento registra na linha do tempo da demanda.
      assert.equal((await call('POST', `/events/${eventId}/cancel`, { body: { reason: 'Alagamento' } })).status, 200);
      const after = await call('GET', `/demands/${demandId}/timeline`, { auth: false });
      assert.ok(after.body.events.some((e) => e.type === 'evento_cancelado'));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
