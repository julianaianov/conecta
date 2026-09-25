// Registro de apoio realizado, dupla confirmação, transparência e "Meus
// apoios" (T16) contra um PostgreSQL de verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const PARTNER_TWO = '33333333-3333-4333-8333-333333333333';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [PARTNER_TWO]: ['partner', 'comercio_local', 'Mercado do Sul'],
  [MEMBER]: ['member', 'voluntario', 'Joana Moradora'],
  [GOV]: ['government', 'secretaria', 'Secretaria de Obras'],
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

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('apoio: modalidades da fonte, dupla confirmação, transparência e meus apoios',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/004, 007 e 013).
    await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await admin.query('GRANT SELECT ON demands, demand_events, supports, posts TO gestao_app');
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    await admin.query('GRANT UPDATE (status, updated_at) ON supports TO gestao_app');
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: null,
      partnerProfile: { get: async () => null },
      connections: { create: async () => null, get: async () => null, update: async () => null },
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = PARTNER, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    async function publishedDemand(title) {
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'problema_urbano', title, description: `${title}: descrição.`, objective: 'Resolver.',
          justification: 'Necessário.', beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores',
          priority: 'alta', photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A',
          addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ',
          latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 200000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { as: AGENT, body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`, { as: AGENT })).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return id;
    }

    try {
      const demand = await publishedDemand('Calçada quebrada');
      const draft = (await call('POST', '/demands', {
        as: AGENT,
        body: { category: 'projeto_social', title: 'Rascunho', description: 'Ainda em análise.' },
      })).body.id;

      // ── Registro do apoio realizado (slides 10 e 20) ──────────────────────
      const register = (body, as = PARTNER, target = demand) => call('POST', `/demands/${target}/supports`, { as, body });
      // Membro da Comunidade (T-04-01, decisão 18): patrocínio não é modalidade dele.
      assert.equal((await register({ modality: 'patrocinar_projeto', supportType: 'materials', description: 'Cimento' }, MEMBER)).status, 422);
      assert.equal((await register({ modality: 'doar_recursos', supportType: 'materials', description: 'Cimento' }, AGENT)).status, 403);
      assert.equal((await register({ modality: 'doar_recursos', supportType: 'materials', description: 'Cimento' }, PARTNER, draft)).status, 404,
        'demanda não publicada não recebe apoio');
      assert.equal((await register({ modality: 'doar_recursos', supportType: 'materials', description: 'Cimento' }, PARTNER, crypto.randomUUID())).status, 404);

      const donation = await register({
        modality: 'doar_recursos', supportType: 'materials', description: '20 sacos de cimento',
        amountCents: 150000, amountPublic: true, displayConsent: true, publicName: 'Construtora Horizonte',
        occurredOn: '2026-09-01', message: 'Entregamos na obra.',
      });
      assert.equal(donation.status, 201, JSON.stringify(donation.body));
      assert.equal(donation.body.support.receiptStatus, 'declarado');
      assert.equal(donation.body.support.status, 'pending');
      assert.equal(donation.body.support.amountCents, 150000);

      const sponsorship = await register({
        modality: 'patrocinar_projeto', supportType: 'financial', description: 'Patrocínio da execução',
        amountCents: 500000,
      }, PARTNER_TWO);
      assert.equal(sponsorship.status, 201);
      assert.equal(sponsorship.body.support.displayConsent, false, 'sem consentimento por padrão');

      const govSupport = await register({
        modality: 'contratar_servicos_locais', supportType: 'labor', description: 'Equipe de limpeza do bairro',
        displayConsent: true,
      }, GOV);
      assert.equal(govSupport.status, 201);
      const { rows: [govRow] } = await pool.query(
        'SELECT organization_id, supporter_category, post_id, modality::text AS modality FROM supports WHERE id = $1',
        [govSupport.body.support.id],
      );
      assert.equal(govRow.organization_id, ORG_GOV);
      assert.equal(govRow.supporter_category, 'poder_publico');
      assert.equal(govRow.modality, 'contratar_servicos_locais');
      assert.ok(govRow.post_id, 'o apoio fica ligado ao post-vitrine, que o dm-gestao lê');

      // Apoio pelo post-vitrine é recusado, com o caminho da demanda.
      const showcase = await call('POST', `/${govRow.post_id}/supports`, { as: PARTNER, body: { type: 'materials' } });
      assert.equal(showcase.status, 409);
      assert.equal(showcase.body.code, 'demand_support_flow');
      assert.equal(showcase.body.demandId, demand);

      // ── Histórico público (slide 21) ──────────────────────────────────────
      const publicHistory = await call('GET', `/demands/${demand}/supports`, { auth: false });
      assert.equal(publicHistory.status, 200);
      assert.equal(publicHistory.body.supports.length, 3);
      const consented = publicHistory.body.supports.find((s) => s.id === donation.body.support.id);
      assert.equal(consented.supporterName, 'Construtora Horizonte');
      assert.equal(consented.amountCents, 150000);
      const anonymous = publicHistory.body.supports.find((s) => s.id === sponsorship.body.support.id);
      assert.equal(anonymous.supporterName, null, 'sem consentimento, sem nome');
      assert.equal(anonymous.amountCents, null, 'valor declarado não público fica fora');
      assert.equal(anonymous.supporterCategory, 'parceiro');
      assert.equal(publicHistory.body.totals.total, 3);
      assert.equal(publicHistory.body.totals.declared, 3);
      assert.equal(publicHistory.body.totals.confirmed, 0);
      assert.equal(publicHistory.body.totals.government, 1);
      assert.equal(publicHistory.body.totals.publicAmountCents, 150000);
      assert.deepEqual(
        publicHistory.body.totals.byModality.map((m) => m.modality).sort(),
        ['contratar_servicos_locais', 'doar_recursos', 'patrocinar_projeto'],
      );

      // Consentimento é revogável (LGPD).
      const revoked = await call('PUT', `/demands/${demand}/supports/${donation.body.support.id}/consent`, {
        body: { displayConsent: false, amountPublic: false },
      });
      assert.equal(revoked.status, 200);
      assert.equal(revoked.body.support.displayConsent, false);
      const afterRevoke = await call('GET', `/demands/${demand}/supports`, { auth: false });
      assert.equal(afterRevoke.body.supports.find((s) => s.id === donation.body.support.id).supporterName, null);
      assert.equal(afterRevoke.body.totals.publicAmountCents, 0);
      assert.equal((await call('PUT', `/demands/${demand}/supports/${donation.body.support.id}/consent`, {
        as: PARTNER_TWO, body: { displayConsent: true },
      })).status, 404, 'consentimento é de quem apoiou');
      assert.equal((await call('PUT', `/demands/${demand}/supports/${donation.body.support.id}/consent`, {
        body: { displayConsent: true, publicName: 'Construtora Horizonte', amountPublic: true },
      })).status, 200);

      // ── Dupla confirmação pelo Agente ─────────────────────────────────────
      assert.equal((await call('GET', `/demands/mine/${demand}/supports`, { as: PARTNER })).status, 403);
      const inbox = await call('GET', `/demands/mine/${demand}/supports`, { as: AGENT });
      assert.equal(inbox.status, 200);
      assert.equal(inbox.body.supports.length, 3);
      assert.equal(inbox.body.supports.find((s) => s.id === sponsorship.body.support.id).supporter.userId, PARTNER_TWO);

      // Evidência: upload confirmado do Agente, nesta demanda (T08).
      const evidenceId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO uploads (id, owner_id, purpose, tmp_key, object_key, content_type, declared_size_bytes,
                              size_bytes, original_name, status, demand_id, confirmed_at)
         VALUES ($1, $2, 'demand_evidence_photo', 'tmp/x', $3, 'image/jpeg', 1000, 1000, 'recibo.jpg',
                 'confirmado', $4, NOW())`,
        [evidenceId, AGENT, `demands/${demand}/evidence/${evidenceId}.jpg`, demand],
      );
      const alheio = crypto.randomUUID();
      await pool.query(
        `INSERT INTO uploads (id, owner_id, purpose, tmp_key, object_key, content_type, declared_size_bytes,
                              original_name, status)
         VALUES ($1, $2, 'demand_evidence_photo', 'tmp/y', $3, 'image/jpeg', 1000, 'outro.jpg', 'pendente')`,
        [alheio, PARTNER, `demands/x/evidence/${alheio}.jpg`],
      );

      const confirmPath = (id) => `/demands/mine/${demand}/supports/${id}/confirm`;
      assert.equal((await call('POST', confirmPath(donation.body.support.id), {
        as: AGENT, body: { evidence: [`upload:${alheio}`] },
      })).status, 422, 'evidência precisa ser desta demanda e do Agente');

      const confirmed = await call('POST', confirmPath(donation.body.support.id), {
        as: AGENT, body: { note: 'Material recebido na obra.', evidence: [`upload:${evidenceId}`] },
      });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
      assert.equal(confirmed.body.support.receiptStatus, 'confirmado');
      assert.equal(confirmed.body.support.status, 'confirmed', 'a dupla confirmação alimenta o status da gestão');
      assert.deepEqual(confirmed.body.support.evidence.map((e) => e.reference), [`upload:${evidenceId}`]);
      assert.equal((await call('POST', confirmPath(donation.body.support.id), { as: AGENT, body: {} })).status, 409,
        'a confirmação é final');

      const contested = await call('POST', `/demands/mine/${demand}/supports/${sponsorship.body.support.id}/contest`, {
        as: AGENT, body: { note: 'O valor não chegou à execução.' },
      });
      assert.equal(contested.status, 200);
      assert.equal(contested.body.support.receiptStatus, 'contestado');
      assert.equal(contested.body.support.status, 'pending');
      const resolved = await call('POST', confirmPath(sponsorship.body.support.id), {
        as: AGENT, body: { note: 'Resolvido com o parceiro.' },
      });
      assert.equal(resolved.body.support.receiptStatus, 'confirmado', 'contestado → confirmado');

      // Apoio confirmado não é cancelado; o declarado é.
      assert.equal((await call('POST', `/demands/${demand}/supports/${donation.body.support.id}/cancel`)).status, 409);
      const canceled = await call('POST', `/demands/${demand}/supports/${govSupport.body.support.id}/cancel`, { as: GOV });
      assert.equal(canceled.status, 200);
      assert.equal(canceled.body.support.canceledAt !== null, true);
      const afterCancel = await call('GET', `/demands/${demand}/supports`, { auth: false });
      assert.equal(afterCancel.body.supports.length, 2, 'apoio cancelado sai do histórico público');
      assert.equal(afterCancel.body.totals.confirmed, 2);
      assert.equal(afterCancel.body.totals.government, 0);

      // ── Linha do tempo pública ────────────────────────────────────────────
      const timeline = await call('GET', `/demands/${demand}/timeline`, { auth: false });
      const types = timeline.body.events.map((e) => e.type);
      assert.ok(types.includes('apoio_declarado'));
      assert.ok(types.includes('apoio_confirmado'));
      assert.ok(types.includes('apoio_contestado'));
      assert.ok(!types.includes('apoio_cancelado'), 'cancelamento é privado');
      const declaredEvent = timeline.body.events.find((e) => e.type === 'apoio_declarado' && e.details?.modality === 'patrocinar_projeto');
      assert.equal(declaredEvent.details.supporterName, null, 'sem consentimento, sem nome na linha do tempo');
      assert.equal(declaredEvent.details.supporterCategory, 'parceiro');

      // ── "Meus apoios": acompanhar resultados ──────────────────────────────
      const mine = await call('GET', '/demands/supports/mine');
      assert.equal(mine.status, 200);
      assert.equal(mine.body.supports.length, 1);
      assert.equal(mine.body.supports[0].demand.title, 'Calçada quebrada');
      assert.equal(mine.body.supports[0].demand.status, 'publicada');
      assert.equal(mine.body.supports[0].receiptStatus, 'confirmado');
      const mineOnDemand = await call('GET', `/demands/${demand}/supports/mine`, { as: PARTNER_TWO });
      assert.equal(mineOnDemand.body.supports.length, 1);
      assert.equal(mineOnDemand.body.allowedModalities.length, 6);
      assert.equal((await call('GET', `/demands/${demand}/supports/mine`, { as: AGENT })).body.isAuthor, true);

      // ── Imutabilidade e contrato com o dm-gestao ──────────────────────────
      await assert.rejects(
        pool.query('UPDATE supports SET amount = 1 WHERE id = $1', [donation.body.support.id]),
        /não mudam/,
      );
      await assert.rejects(
        pool.query('DELETE FROM supports WHERE id = $1', [donation.body.support.id]),
        /não é excluído/,
      );
      await assert.rejects(pool.query('TRUNCATE supports'), /não é apagada/);
      // A gestão confirma ou rejeita o status (SupportController::updateStatus).
      await gestao.query("UPDATE supports SET status = 'rejected', updated_at = NOW() WHERE id = $1", [donation.body.support.id]);
      const afterGestao = await call('GET', `/demands/${demand}/supports`, { auth: false });
      assert.equal(afterGestao.body.supports.length, 1, 'apoio rejeitado pela gestão sai do histórico público');
      await assert.rejects(
        gestao.query("UPDATE supports SET description = 'outra' WHERE id = $1", [donation.body.support.id]),
        /permission denied|só confirma ou rejeita/,
      );
      await assert.rejects(
        gestao.query('DELETE FROM supports WHERE id = $1', [donation.body.support.id]),
        /permission denied|não exclui/,
      );
      const { rows: gestaoRows } = await gestao.query(
        'SELECT type::text AS type, modality::text AS modality, status FROM supports WHERE id = $1',
        [donation.body.support.id],
      );
      assert.deepEqual(gestaoRows[0], { type: 'materials', modality: 'doar_recursos', status: 'rejected' });

      // ── Membro da Comunidade apoia projetos (T-04-01, Perfis §3.2) ────────
      const garden = await publishedDemand('Horta comunitária');
      const memberContext = await call('GET', `/demands/${garden}/supports/mine`, { as: MEMBER });
      assert.equal(memberContext.status, 200);
      assert.deepEqual(memberContext.body.allowedModalities, ['doar_recursos', 'adotar_espaco_publico', 'apoiar_acao_ambiental']);
      assert.ok(!memberContext.body.allowedSupportTypes.includes('financial'));
      assert.ok(!memberContext.body.allowedSupportTypes.includes('volunteering'));
      const seedlings = await register({
        modality: 'apoiar_acao_ambiental', supportType: 'materials', description: '30 mudas nativas',
        displayConsent: true, publicName: 'Joana',
      }, MEMBER, garden);
      assert.equal(seedlings.status, 201, JSON.stringify(seedlings.body));
      const { rows: [memberRow] } = await pool.query('SELECT supporter_category FROM supports WHERE id = $1', [seedlings.body.support.id]);
      assert.equal(memberRow.supporter_category, 'comunidade');
      const { rows: [memberEvent] } = await pool.query(
        "SELECT actor_type, payload->'public'->>'supporterCategory' AS category FROM demand_events WHERE demand_id = $1 AND event_type = 'apoio_declarado'",
        [garden],
      );
      assert.deepEqual(memberEvent, { actor_type: 'comunidade', category: 'comunidade' });
      assert.equal((await register({
        modality: 'financiar_evento', supportType: 'food', description: 'Lanche',
      }, MEMBER, garden)).status, 422, 'financiar eventos fica com Parceiro e Poder Público');
      // O banco é a última barreira (CHECK supports_member_modalities, migração 041).
      await assert.rejects(pool.query(
        `INSERT INTO supports (post_id, demand_id, user_id, supporter_category, type, modality, description,
                               receipt_status, status)
         SELECT p.id, p.demand_id, $2, 'comunidade', 'financial', 'patrocinar_projeto', 'x', 'declarado', 'pending'
           FROM posts p WHERE p.demand_id = $1 LIMIT 1`,
        [garden, MEMBER],
      ), /supports_member_modalities/);
      // O Agente confirma o apoio do Membro; o histórico mostra a categoria.
      const memberConfirmed = await call('POST', `/demands/mine/${garden}/supports/${seedlings.body.support.id}/confirm`, {
        as: AGENT, body: {},
      });
      assert.equal(memberConfirmed.status, 200);
      assert.equal(memberConfirmed.body.support.supporter.category, 'comunidade');
      const gardenHistory = await call('GET', `/demands/${garden}/supports`, { auth: false });
      assert.equal(gardenHistory.body.supports[0].supporterCategory, 'comunidade');
      assert.equal(gardenHistory.body.supports[0].supporterName, 'Joana');
      assert.equal((await call('GET', '/demands/supports/mine', { as: MEMBER })).body.supports.length, 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
