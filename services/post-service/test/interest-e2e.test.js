// Interesse, conexão e oportunidades de apoio (T15) contra um PostgreSQL de
// verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado. O user-service (perfil
// de apoio e conexões) é simulado com as mesmas regras de routes/connections.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');
const { HttpError } = require('../src/demand/store');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const PARTNER_FAR = '33333333-3333-4333-8333-333333333333';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const GOV = '55555555-5555-4555-8555-555555555555';
const MEDIA = '66666666-6666-4666-8666-666666666666';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [PARTNER_FAR]: ['partner', 'comercio_local', 'Mercado do Sul'],
  [MEMBER]: ['member', 'voluntario', 'Joana Moradora'],
  [GOV]: ['government', 'secretaria', 'Secretaria de Obras'],
  [MEDIA]: ['media', 'jornalista', 'Jornal do Bairro'],
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

// ── user-service simulado ───────────────────────────────────────────────────
const PROFILES = {
  [PARTNER]: {
    exists: true, nationwide: false, ufs: [], municipalities: ['Rio de Janeiro/RJ'], territories: ['Recreio dos Bandeirantes'],
    interestCategories: ['problema_urbano'], offeredResources: ['materiais', 'mao_de_obra'],
  },
  [PARTNER_FAR]: {
    exists: true, nationwide: false, ufs: ['SP'], municipalities: [], territories: [],
    interestCategories: ['projeto_social'], offeredResources: ['recursos_financeiros'],
  },
};
let profileDown = false;
const partnerProfile = {
  async get(req) {
    if (profileDown) throw new Error('user-service fora');
    return PROFILES[req.user.userId] ?? null;
  },
};

const store = new Map();
let connectionsDown = false;
const userOf = (req) => req.user.userId;
const connections = {
  async create(req, input) {
    if (connectionsDown) throw new HttpError(503, { error: 'fora', code: 'connections_unavailable' });
    const id = crypto.randomUUID();
    const connection = {
      id, type: input.type, status: 'pending', fromUserId: userOf(req), toUserId: input.toUserId,
      demandId: input.demandId ?? null, postId: input.postId ?? null, message: input.message,
    };
    store.set(id, connection);
    return { ...connection };
  },
  async get(req, id) {
    const c = store.get(id);
    if (!c || (c.fromUserId !== userOf(req) && c.toUserId !== userOf(req))) return null;
    return { ...c };
  },
  async update(req, id, status) {
    const c = store.get(id);
    if (!c || (c.fromUserId !== userOf(req) && c.toUserId !== userOf(req))) throw new HttpError(404, { error: 'Conexão não encontrada' });
    const isTo = c.toUserId === userOf(req);
    const ok = c.status === 'pending' && (((status === 'accepted' || status === 'declined') && isTo) || (status === 'canceled' && !isTo));
    if (!ok) throw new HttpError(409, { error: 'não permitido', code: 'connection_conflict' });
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

test('interesse, conexão com o Agente, demanda conectada e oportunidades com compatibilidade',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007 e 011).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_budget_items, demand_schedule_items, demand_goals,
                         demand_resources, demand_documents, demand_events, demand_interests TO gestao_app`);
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: null,
      partnerProfile, connections,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = PARTNER, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    async function publishedDemand({ category, title, territory, municipality, uf, resources, unitPriceCents }) {
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category, title, description: `${title}: descrição.`, objective: 'Resolver.', justification: 'Necessário.',
          beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores', priority: 'alta',
          photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A', addressNumber: '10',
          district: territory, municipality, uf, latitude: -23.02, longitude: -43.45, territory,
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      for (const type of resources) {
        assert.equal((await call('POST', `/demands/${id}/resources`, { as: AGENT, body: { kind: 'necessario', type } })).status, 201);
      }
      assert.equal((await call('POST', `/demands/${id}/submit`, { as: AGENT })).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return id;
    }

    try {
      const near = await publishedDemand({
        category: 'problema_urbano', title: 'Calçada quebrada', territory: 'Recreio dos Bandeirantes',
        municipality: 'Rio de Janeiro', uf: 'RJ', resources: ['materiais', 'mao_de_obra', 'equipamentos'], unitPriceCents: 200000,
      });
      const far = await publishedDemand({
        category: 'projeto_social', title: 'Biblioteca comunitária', territory: 'Centro',
        municipality: 'Niterói', uf: 'RJ', resources: ['recursos_financeiros'], unitPriceCents: 5000000,
      });

      // ── Oportunidades: quem pode, filtros e compatibilidade ───────────────
      assert.equal((await call('GET', '/demands/opportunities', { auth: false })).status, 401);
      assert.equal((await call('GET', '/demands/opportunities', { as: MEMBER })).body.code, 'opportunities_not_allowed');
      assert.equal((await call('GET', '/demands/opportunities', { as: AGENT })).status, 403);
      assert.equal((await call('GET', '/demands/opportunities?resourceType=foguete')).status, 422);
      assert.equal((await call('GET', '/demands/opportunities?minTotalCents=10&maxTotalCents=5')).status, 422);

      const opp = await call('GET', '/demands/opportunities');
      assert.equal(opp.status, 200, JSON.stringify(opp.body));
      assert.equal(opp.body.compatibilityAvailable, true);
      assert.deepEqual(opp.body.profile, { exists: true, complete: true });
      assert.deepEqual(opp.body.opportunities.map((o) => o.demand.id), [near, far], 'mais compatível primeiro');
      const [top] = opp.body.opportunities;
      // território 40 + categoria 30 + recursos round(30 * 2/3) = 20 → 90
      assert.equal(top.compatibility.score, 90);
      assert.equal(top.compatibility.level, 'alta');
      assert.deepEqual(top.compatibility.reasons.map((r) => [r.criterion, r.points]), [['territorio', 40], ['categoria', 30], ['recursos', 20]]);
      assert.match(top.compatibility.reasons[0].text, /Recreio dos Bandeirantes/);
      assert.match(top.compatibility.reasons[2].text, /Materiais, Mão de obra/);
      assert.deepEqual(top.demand.neededResources, ['materiais', 'mao_de_obra', 'equipamentos']);
      assert.ok(!('cep' in top.demand) && !('street' in top.demand), 'resumo público, sem endereço fino');
      assert.equal(opp.body.opportunities[1].compatibility.score, 0);

      const farView = await call('GET', '/demands/opportunities', { as: PARTNER_FAR });
      assert.deepEqual(farView.body.opportunities.map((o) => o.demand.id), [far, near]);
      assert.equal(farView.body.opportunities[0].compatibility.score, 60, 'categoria 30 + recursos 30; fora de SP');

      const recent = await call('GET', '/demands/opportunities?sort=recentes');
      assert.deepEqual(recent.body.opportunities.map((o) => o.demand.id), [far, near]);
      const byResource = await call('GET', '/demands/opportunities?resourceType=recursos_financeiros');
      assert.deepEqual(byResource.body.opportunities.map((o) => o.demand.id), [far]);
      const byValue = await call('GET', `/demands/opportunities?maxTotalCents=${300000}`);
      assert.deepEqual(byValue.body.opportunities.map((o) => o.demand.id), [near]);
      const byPlace = await call('GET', '/demands/opportunities?municipality=niter&category=projeto_social&priority=alta');
      assert.deepEqual(byPlace.body.opportunities.map((o) => o.demand.id), [far]);
      const paged = await call('GET', '/demands/opportunities?limit=1');
      assert.equal(paged.body.opportunities.length, 1);
      assert.equal(paged.body.nextOffset, 1);
      assert.equal(paged.body.total, 2);

      profileDown = true;
      const degraded = await call('GET', '/demands/opportunities');
      assert.equal(degraded.status, 200);
      assert.equal(degraded.body.compatibilityAvailable, false);
      assert.equal(degraded.body.sort, 'recentes');
      assert.equal(degraded.body.opportunities[0].compatibility, null);
      profileDown = false;

      const govOpp = await call('GET', '/demands/opportunities', { as: GOV });
      assert.equal(govOpp.status, 200);
      assert.deepEqual(govOpp.body.profile, { exists: false, complete: false });

      // ── Demonstrar interesse ──────────────────────────────────────────────
      const interest = (body, as = PARTNER, demand = near) => call('POST', `/demands/${demand}/interests`, { as, body });
      assert.equal((await interest({ kind: 'apoio', offerTypes: ['recursos'] }, MEDIA)).body.code, 'interest_not_allowed');
      assert.equal((await interest({ kind: 'apoio', offerTypes: ['recursos'] }, AGENT)).status, 403);
      const noOffer = await interest({ kind: 'apoio', offerTypes: [] });
      assert.equal(noOffer.status, 422);
      assert.ok(noOffer.body.fields.offerTypes);
      assert.ok((await interest({ kind: 'voluntariado' })).body.fields.kind, 'Parceiro não oferece voluntariado');
      assert.ok((await interest({ kind: 'apoio', offerTypes: ['recursos'] }, MEMBER)).body.fields.kind);
      assert.equal((await interest({ kind: 'apoio', offerTypes: ['recursos'] }, PARTNER, crypto.randomUUID())).status, 404);

      const created = await interest({ kind: 'apoio', offerTypes: ['produtos', 'servicos', 'estrutura'], message: 'Podemos doar cimento e mão de obra.' });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const partnerInterest = created.body.interest;
      assert.deepEqual(partnerInterest.offerTypes, ['produtos', 'servicos', 'estrutura']);
      assert.equal(partnerInterest.connectionStatus, null);
      assert.equal((await interest({ kind: 'apoio', offerTypes: ['recursos'] })).body.code, 'interest_exists');

      const volunteer = await interest({ kind: 'voluntariado', message: 'Posso ajudar aos sábados.' }, MEMBER);
      assert.equal(volunteer.status, 201);
      const participate = await interest({ kind: 'participacao' }, MEMBER);
      assert.equal(participate.status, 201);
      const govInterest = await interest({ offerTypes: ['conhecimento'] }, GOV);
      assert.equal(govInterest.status, 201, 'kind padrão do Poder Público é apoio');
      const { rows: [govRow] } = await pool.query('SELECT organization_id, user_category FROM demand_interests WHERE id = $1', [govInterest.body.interest.id]);
      assert.deepEqual(govRow, { organization_id: ORG_GOV, user_category: 'poder_publico' });

      const mine = await call('GET', `/demands/${near}/interests/mine`);
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.body.allowedKinds, ['apoio']);
      assert.equal(mine.body.interests.length, 1);
      assert.equal(mine.body.compatibility.score, 90);
      const memberMine = await call('GET', `/demands/${near}/interests/mine`, { as: MEMBER });
      assert.deepEqual(memberMine.body.allowedKinds, ['participacao', 'voluntariado']);
      assert.equal(memberMine.body.compatibility, null);
      assert.equal((await call('GET', `/demands/${near}/interests/mine`, { as: AGENT })).body.isAuthor, true);

      const summary = await call('GET', `/demands/${near}/interests/summary`, { auth: false });
      assert.deepEqual(summary.body, { apoio: 2, participacao: 1, voluntariado: 1, acceptedConnections: 0 });

      const listed = await call('GET', '/demands/opportunities');
      assert.deepEqual(listed.body.opportunities[0].myInterests.map((i) => i.kind), ['apoio']);

      // ── Solicitar conexão com o Agente ────────────────────────────────────
      const connect = (id, body, as = PARTNER, demand = near) => call('POST', `/demands/${demand}/interests/${id}/connection`, { as, body });
      assert.equal((await connect(partnerInterest.id, { message: 'x' }, MEMBER)).status, 404, 'manifestação de outra conta');
      assert.ok((await connect(partnerInterest.id, { message: '  ' })).body.fields.message);
      connectionsDown = true;
      assert.equal((await connect(partnerInterest.id, { message: 'Vamos conversar?' })).body.code, 'connections_unavailable');
      connectionsDown = false;
      const requested = await connect(partnerInterest.id, { message: 'Vamos conversar sobre a doação?' });
      assert.equal(requested.status, 201, JSON.stringify(requested.body));
      const connectionId = requested.body.interest.connectionId;
      assert.equal(requested.body.interest.connectionStatus, 'pendente');
      assert.equal(requested.body.connection.type, 'resources', 'produtos/estrutura sugerem conexão de recursos');
      const stored = store.get(connectionId);
      assert.equal(stored.toUserId, AGENT);
      assert.equal(stored.demandId, near);
      assert.ok(stored.postId, 'vinculada ao post-vitrine');
      assert.equal((await connect(partnerInterest.id, { message: 'de novo' })).body.code, 'connection_exists');

      // Conexão com outra demanda não move esta.
      const other = await connections.create({ user: { userId: PARTNER } }, { toUserId: AGENT, type: 'support', message: 'x', demandId: far });
      const notLinked = await call('POST', `/demands/mine/${near}/connections/${other.id}/accept`, { as: AGENT });
      assert.equal(notLinked.status, 422);
      assert.equal(notLinked.body.code, 'connection_not_linked');
      assert.equal(store.get(other.id).status, 'pending', 'nada aceito');

      // ── Agente: interessados, recusa e aceite ─────────────────────────────
      assert.equal((await call('GET', `/demands/mine/${near}/interests`, { as: PARTNER })).status, 403);
      const inbox = await call('GET', `/demands/mine/${near}/interests`, { as: AGENT });
      assert.equal(inbox.status, 200);
      assert.equal(inbox.body.interests.length, 4);
      const partnerRow = inbox.body.interests.find((i) => i.id === partnerInterest.id);
      assert.equal(partnerRow.user.name, 'Construtora Horizonte');
      assert.equal(partnerRow.user.category, 'parceiro');
      assert.equal(partnerRow.message, 'Podemos doar cimento e mão de obra.');
      assert.equal(partnerRow.connectionStatus, 'pendente');

      // O Agente pede parceiro antes (em_busca_de_parceiro, ação dele).
      assert.equal((await call('POST', `/demands/${near}/transitions`, { as: AGENT, body: { action: 'buscar_parceiro' } })).body.status, 'em_busca_de_parceiro');

      assert.equal((await call('POST', `/demands/mine/${near}/connections/${connectionId}/accept`, { as: PARTNER })).status, 403);
      const accepted = await call('POST', `/demands/mine/${near}/connections/${connectionId}/accept`, { as: AGENT });
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      assert.equal(accepted.body.transitioned, true);
      assert.equal(accepted.body.demand.status, 'conectada');
      assert.equal(accepted.body.connection.status, 'accepted');
      assert.equal(accepted.body.interest.connectionStatus, 'aceita');
      assert.equal(store.get(connectionId).status, 'accepted');
      const again = await call('POST', `/demands/mine/${near}/connections/${connectionId}/accept`, { as: AGENT });
      assert.equal(again.status, 200, 'idempotente');
      assert.equal(again.body.transitioned, false);

      const { rows: [statusEvent] } = await pool.query(
        "SELECT actor_type, actor FROM demand_events WHERE demand_id = $1 AND event_type = 'status_alterado' AND to_status = 'conectada'",
        [near],
      );
      assert.deepEqual(statusEvent, { actor_type: 'sistema', actor: `conexao:${connectionId}` });

      // Membro pede conexão; o Agente recusa: evento privado, fica recusada.
      const memberReq = await connect(volunteer.body.interest.id, { message: 'Quero ajudar no mutirão.' }, MEMBER);
      assert.equal(memberReq.status, 201);
      assert.equal(memberReq.body.connection.type, 'support');
      const declined = await call('POST', `/demands/mine/${near}/connections/${memberReq.body.interest.connectionId}/decline`, { as: AGENT });
      assert.equal(declined.status, 200);
      assert.equal(declined.body.interest.connectionStatus, 'recusada');
      // Depois de recusada, pode pedir de novo (outra conexão).
      const retry = await connect(volunteer.body.interest.id, { message: 'Posso em outro horário.' }, MEMBER);
      assert.equal(retry.status, 201);
      assert.notEqual(retry.body.interest.connectionId, memberReq.body.interest.connectionId);

      // Retirar cancela o pedido pendente no user-service.
      const withdrawn = await call('POST', `/demands/${near}/interests/${volunteer.body.interest.id}/withdraw`, { as: MEMBER });
      assert.equal(withdrawn.status, 200);
      assert.ok(withdrawn.body.interest.withdrawnAt);
      assert.equal(withdrawn.body.interest.connectionStatus, 'cancelada');
      assert.equal(store.get(retry.body.interest.connectionId).status, 'canceled');
      assert.equal((await interest({ kind: 'voluntariado' }, MEMBER)).status, 201, 'nova manifestação depois de retirada');

      const summaryAfter = await call('GET', `/demands/${near}/interests/summary`, { auth: false });
      assert.deepEqual(summaryAfter.body, { apoio: 2, participacao: 1, voluntariado: 1, acceptedConnections: 1 });
      const myList = await call('GET', '/demands/interests/mine', { as: MEMBER });
      assert.equal(myList.body.interests.length, 3);
      assert.equal(myList.body.interests[0].demand.title, 'Calçada quebrada');

      // ── Linha do tempo pública, sem dados pessoais ────────────────────────
      const timeline = await call('GET', `/demands/${near}/timeline`, { auth: false });
      const types = timeline.body.events.map((e) => e.type);
      for (const type of ['interesse_registrado', 'conexao_solicitada', 'conexao_aceita', 'interesse_retirado']) {
        assert.ok(types.includes(type), `${type} na linha do tempo`);
      }
      assert.ok(!types.includes('conexao_recusada') && !types.includes('conexao_cancelada'), 'recusa e cancelamento são privados');
      const registered = timeline.body.events.find((e) => e.type === 'interesse_registrado');
      assert.deepEqual(Object.keys(registered.details).sort(), ['interestKind', 'offerTypes', 'userCategory']);
      const timelineJson = JSON.stringify(timeline.body);
      for (const secret of ['Construtora', 'Joana', 'doar cimento', 'sábados', PARTNER, MEMBER, connectionId]) {
        assert.ok(!timelineJson.includes(secret), `${secret} fora da linha do tempo pública`);
      }
      const ownerEvents = await call('GET', `/demands/mine/${near}/events`, { as: AGENT });
      assert.ok(ownerEvents.body.events.some((e) => e.type === 'conexao_recusada' && !e.isPublic));

      // ── Banco: imutabilidade, estados e gestão só leitura ─────────────────
      const pid = partnerInterest.id;
      await assert.rejects(pool.query("UPDATE demand_interests SET message = 'x' WHERE id = $1", [pid]), /não mudam/);
      await assert.rejects(pool.query("UPDATE demand_interests SET kind = 'voluntariado' WHERE id = $1", [pid]), /não mudam/);
      await assert.rejects(pool.query('DELETE FROM demand_interests WHERE id = $1', [pid]), /não são excluídos/);
      await assert.rejects(pool.query('TRUNCATE demand_interests CASCADE'), /não é apagada/);
      await assert.rejects(pool.query("UPDATE demand_interests SET connection_status = 'recusada' WHERE id = $1", [pid]), /pedido pendente/);
      await assert.rejects(pool.query('UPDATE demand_interests SET connection_id = NULL, connection_status = NULL WHERE id = $1', [pid]), /não é desfeita|connection/);
      await assert.rejects(pool.query(
        "UPDATE demand_interests SET withdrawn_at = NULL WHERE id = $1", [volunteer.body.interest.id],
      ), /retirado não muda/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_interests (demand_id, user_id, user_category, kind, offer_types)
         VALUES ($1, $2, 'comunidade', 'apoio', '{recursos}')`, [far, MEMBER],
      ), /demand_interests_kind_category/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_interests (demand_id, user_id, user_category, kind, offer_types)
         VALUES ($1, $2, 'parceiro', 'apoio', '{recursos,recursos}')`, [far, PARTNER],
      ), /oferta repetida/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_interests (demand_id, user_id, user_category, kind, offer_types)
         VALUES ($1, $2, 'parceiro', 'apoio', '{recursos}')`, [far, AGENT],
      ), /própria demanda/);
      const { rows: seen } = await gestao.query('SELECT count(*)::int AS n FROM demand_interests');
      assert.ok(seen[0].n >= 5);
      await assert.rejects(gestao.query("UPDATE demand_interests SET withdrawn_at = NOW()"), /permission denied|só lê/);
      await assert.rejects(gestao.query(
        `INSERT INTO demand_interests (demand_id, user_id, user_category, kind) VALUES ($1, $2, 'comunidade', 'participacao')`,
        [far, MEMBER],
      ), /permission denied|só lê/);

      // ── Estados fechados ──────────────────────────────────────────────────
      // T17: sem execução física a registrar, a justificativa libera as
      // transições que exigiriam o "antes" e o "depois".
      assert.equal((await call('POST', `/demands/mine/${near}/record-waiver`, {
        as: AGENT, body: { reason: 'Articulação institucional, sem intervenção física a fotografar.' },
      })).status, 200);
      assert.equal((await call('POST', `/demands/${near}/transitions`, { as: AGENT, body: { action: 'iniciar_execucao' } })).status, 200);
      assert.equal((await call('POST', `/demands/${near}/transitions`, { as: AGENT, body: { action: 'concluir' } })).status, 200);
      const closed = await interest({ kind: 'apoio', offerTypes: ['recursos'] }, PARTNER_FAR);
      assert.equal(closed.status, 409);
      assert.equal(closed.body.code, 'demand_not_open');
      const nearOpp = await call('GET', '/demands/opportunities?status=publicada,em_busca_de_parceiro,conectada,em_execucao');
      assert.ok(!nearOpp.body.opportunities.some((o) => o.demand.id === near), 'concluída sai das oportunidades');
      await gestao.query(
        "UPDATE demands SET status = 'arquivada', archive_reason = 'Duplicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1",
        [far],
      );
      assert.equal((await call('GET', `/demands/${far}/interests/summary`, { auth: false })).status, 404);
      assert.equal((await interest({ kind: 'apoio', offerTypes: ['recursos'] }, PARTNER, far)).status, 404);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
