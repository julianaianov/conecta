// Central de notificações e caixa de saída de e-mail (T-05-16, com a T-02-03)
// contra um PostgreSQL de verdade: triggers do post_db (migração 039) e do
// user_db (user-service/migrations/016), rotas do post-service e o laço de
// e-mail sem provedor.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado. O user_db é criado ao
// lado (`<banco>_user`) e apagado no fim.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');
const { createMailer } = require('../src/notifications/mailer');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const GOV = '55555555-5555-4555-8555-555555555555';
const GOV_B = '66666666-6666-4666-8666-666666666666';
const ORG_AGENT = '44444444-4444-4444-8444-444444444444';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
const ORG_GOV_B = '99999999-9999-4999-8999-999999999999';

const ROLES = { [AGENT]: ['agent', 'associacao'], [GOV]: ['government', 'secretaria'], [GOV_B]: ['government', 'orgao_publico'] };
const token = (userId) => {
  const [role, profileType] = ROLES[userId];
  return jwt.sign({ userId, role, profileType, name: `Conta ${userId.slice(0, 4)}` }, SECRET);
};

const ORGS = {
  [GOV]: {
    organizationId: ORG_GOV, name: 'Secretaria Municipal de Meio Ambiente', governmentSphere: 'municipal',
    department: null, competenceAreas: ['Meio ambiente'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
  },
  [GOV_B]: {
    organizationId: ORG_GOV_B, name: 'Companhia Municipal de Limpeza Urbana', governmentSphere: 'municipal',
    department: null, competenceAreas: ['Limpeza urbana'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
  },
};
const byOrg = Object.fromEntries(Object.values(ORGS).map((o) => [o.organizationId, o]));

async function institutionStatus(req) {
  const org = ORGS[req.user.userId];
  if (org) return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: org.organizationId };
  if (req.user.userId === AGENT) return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
  return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
}
async function governmentProfile(userId) {
  const org = ORGS[userId];
  if (!org) return null;
  const { organizationId, ...profile } = org;
  void organizationId;
  return profile;
}
const governmentDirectory = {
  async search() { return Object.values(byOrg); },
  async byId(_req, id) { return byOrg[id] ?? null; },
};

function manifestFiles(database) {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/))
    // A carga de contas do auth_db (entrada `auth-users-csv`) usa \copy do psql.
    .filter(([db, , input]) => db === database && !input)
    .map(([, file]) => path.join(services, file));
}

test('central de notificações: devolução, publicação, resposta institucional, encaminhamento ao órgão, leitura, preferência e caixa de saída',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of manifestFiles('post_db')) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007 e 032).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query('GRANT SELECT ON demands, demand_events, email_outbox TO gestao_app');
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, governmentProfile, governmentDirectory, operationUserIds: new Set(),
      uploadStorage: null, dossierService: null,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = AGENT, body } = {}) => {
      const res = await fetch(`${base}${url}`, {
        method,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token(as)}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const inbox = async (as = AGENT, query = '') => {
      const res = await call('GET', `/notifications${query}`, { as });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      return res.body;
    };

    async function submittedDemand() {
      const created = await call('POST', '/demands', {
        body: {
          category: 'problema_urbano', title: 'Descarte irregular na praça', description: 'Entulho acumulado na praça.',
          objective: 'Limpar a praça.', justification: 'Risco à saúde.', beneficiariesEstimate: 300,
          beneficiariesProfile: 'Moradores do entorno', priority: 'alta', photoRef: 'https://example.org/foto.jpg',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          cep: '22790-000', street: 'Rua A', addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro',
          uf: 'RJ', latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      const rscheduleitems = await call('POST', `/demands/${id}/schedule-items`, {
        body: { stage: 'Execução', activities: 'Limpeza', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      });
      assert.equal(rscheduleitems.status, 201, JSON.stringify(rscheduleitems.body));
      const rbudgetitems = await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 50000, isAudiovisualRecord: true },
      });
      assert.equal(rbudgetitems.status, 201, JSON.stringify(rbudgetitems.body));
      const rgoals = await call('POST', `/demands/${id}/goals`, {
        body: { goal: 'Praça limpa', expectedResult: 'Sem entulho', indicator: 'Toneladas retiradas', measurementMethod: 'Pesagem' },
      });
      assert.equal(rgoals.status, 201, JSON.stringify(rgoals.body));
      const submitted = await call('POST', `/demands/${id}/submit`);
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      return id;
    }

    let userDbName = null;
    try {
      // ── T-02-03: devolução e publicação avisam o Agente ──────────────────
      const demand = await submittedDemand();
      assert.equal((await inbox()).unreadCount, 0, 'o próprio envio não gera aviso');
      await gestao.query(
        `UPDATE demands SET review_state = 'devolvida', review_note = 'Anexe a cotação', reviewed_by = 'Equipe DM',
                updated_at = NOW() WHERE id = $1`, [demand],
      );
      let box = await inbox();
      assert.equal(box.unreadCount, 1);
      const [returned] = box.notifications;
      assert.deepEqual([returned.kind, returned.title, returned.summary, returned.href, returned.demandId],
        ['demanda_devolvida', 'Demanda devolvida para ajustes', '«Descarte irregular na praça»',
          `/minhas-demandas#demanda-${demand}`, demand]);
      assert.ok(!JSON.stringify(returned).includes('cotação'), 'a nota da gestão fica na tela, não no sino');
      assert.equal((await call('POST', `/demands/${demand}/submit`)).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [demand]);
      box = await inbox();
      assert.deepEqual(box.notifications.map((n) => n.kind), ['demanda_publicada', 'demanda_devolvida']);
      assert.equal(box.notifications[0].href, `/demandas/${demand}`);

      // Leitura persistida (vale em outra sessão: é o banco).
      const read = await call('POST', '/notifications/read', { body: { ids: [returned.id] } });
      assert.deepEqual(read.body, { updated: 1, unreadCount: 1 });
      box = await inbox(AGENT, '?unread=1');
      assert.deepEqual(box.notifications.map((n) => n.kind), ['demanda_publicada']);
      const again = await inbox();
      assert.ok(again.notifications.find((n) => n.id === returned.id).readAt);
      // Outra conta não marca aviso alheio.
      const foreign = await call('POST', '/notifications/read', { as: GOV, body: { ids: [box.notifications[0].id] } });
      assert.equal(foreign.body.updated, 0);
      assert.equal((await call('POST', '/notifications/read', { body: { all: true } })).body.unreadCount, 0);

      // ── Resposta institucional → atualização de processo, na mesma transação
      const response = await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV, body: { type: 'recebimento', body: 'Recebemos a demanda.', status: 'em_analise' },
      });
      assert.equal(response.status, 201, JSON.stringify(response.body));
      box = await inbox(AGENT, '?unread=1');
      assert.equal(box.notifications.length, 1, 'avisos em aberto da mesma demanda se juntam');
      assert.equal(box.notifications[0].kind, 'atualizacao_de_processo');
      const { rows: [linked] } = await pool.query(
        `SELECT e.event_type FROM notifications n JOIN demand_events e ON e.id = n.event_id WHERE n.id = $1`,
        [box.notifications[0].id],
      );
      assert.ok(['resposta_institucional', 'status_institucional_alterado', 'acompanhamento_institucional_aberto']
        .includes(linked.event_type));
      assert.equal((await inbox(GOV)).unreadCount, 0, 'quem agiu não é avisado');

      // ── Encaminhamento a outro órgão da plataforma: aviso ao órgão inteiro ──
      const forwarded = await call('POST', `/institutional/demands/${demand}/forwardings`, {
        as: GOV, body: { destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG_GOV_B, reason: 'Competência da Companhia.' },
      });
      assert.equal(forwarded.status, 201, JSON.stringify(forwarded.body));
      assert.equal((await inbox(GOV_B)).notifications.length, 0, 'sem institution=1, só os avisos da conta');
      const orgBox = await inbox(GOV_B, '?institution=1');
      assert.equal(orgBox.organizationScope, true);
      const received = orgBox.notifications.find((n) => n.kind === 'encaminhamento_recebido');
      assert.ok(received, JSON.stringify(orgBox));
      assert.equal(received.scope, 'organization');
      assert.equal(received.href, `/governo/demandas/${demand}`);
      assert.match(received.summary, /Secretaria Municipal de Meio Ambiente encaminhou «Descarte irregular na praça»/);
      assert.ok(!(await inbox(GOV, '?institution=1')).notifications.some((n) => n.kind === 'encaminhamento_recebido'));
      const orgRead = await call('POST', '/notifications/read?institution=1', { as: GOV_B, body: { ids: [received.id] } });
      assert.equal(orgRead.body.updated, 1);
      // O destino responde: a origem é avisada.
      const fid = forwarded.body.forwardingId;
      assert.equal((await call('POST', `/institutional/forwardings/${fid}/status`, { as: GOV_B, body: { status: 'recebido' } })).status, 200);
      assert.ok((await inbox(GOV, '?institution=1&unread=1')).notifications.some((n) => n.title === 'Encaminhamento respondido'));

      // ── Preferência: e-mail desligado não cria linha na caixa de saída ────
      assert.equal((await call('PUT', '/notifications/preferences', {
        body: { preferences: [{ kind: 'atualizacao_de_processo', inApp: true, email: false }] },
      })).status, 200);
      await call('POST', '/notifications/read', { body: { all: true } });
      // `analise_em_andamento` só registra a resposta: gera apenas o aviso de
      // atualização de processo. (`informacoes_adicionais` também abre uma
      // solicitação ao Agente, T-05-05, e esta avisa por outro tipo; ver abaixo.)
      assert.equal((await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV, body: { type: 'analise_em_andamento', body: 'Vistoria marcada.' },
      })).status, 201);
      const { rows: [latest] } = await pool.query(
        `SELECT n.id, (SELECT count(*)::int FROM email_outbox o WHERE o.notification_id = n.id) AS outbox
           FROM notifications n
          WHERE n.user_id = $1 AND n.kind = 'atualizacao_de_processo' AND n.read_at IS NULL`, [AGENT],
      );
      assert.equal(latest.outbox, 0);
      // App desligado e e-mail desligado: nenhum aviso.
      await call('PUT', '/notifications/preferences', {
        body: { preferences: [{ kind: 'atualizacao_de_processo', inApp: false, email: false }] },
      });
      await call('POST', '/notifications/read', { body: { all: true } });
      assert.equal((await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV, body: { type: 'analise_em_andamento', body: 'Equipe a caminho.' },
      })).status, 201);
      assert.equal((await inbox(AGENT, '?unread=1')).unreadCount, 0);
      // A preferência é por tipo: pedir informações ao Agente vira uma
      // "Solicitação de análise" (§08, T-05-05), tipo à parte que segue ligado.
      assert.equal((await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV, body: { type: 'informacoes_adicionais', body: 'Envie a planta do local.' },
      })).status, 201);
      box = await inbox(AGENT, '?unread=1');
      assert.deepEqual(box.notifications.map((n) => n.kind), ['solicitacao_de_analise']);

      // ── Caixa de saída sem provedor: tudo desligado, nada falha ──────────
      const { rows: [pending] } = await pool.query("SELECT count(*)::int AS n FROM email_outbox WHERE status = 'pendente'");
      assert.ok(pending.n >= 2, 'devolução e publicação foram para a caixa de saída');
      const outcome = await createMailer({ pool, env: {} }).tick();
      assert.equal(outcome.disabled, pending.n);
      const { rows: statuses } = await pool.query('SELECT DISTINCT status FROM email_outbox');
      assert.deepEqual(statuses.map((r) => r.status), ['desligado']);
      // A gestão lê a caixa de saída (grant 032) e não escreve aviso.
      assert.ok((await gestao.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n >= 2);
      await assert.rejects(gestao.query(
        "INSERT INTO notifications (user_id, kind, title) VALUES ($1, 'apoio', 'x')", [AGENT],
      ), /permission denied/);
      await assert.rejects(gestao.query("SELECT notification_create($1::uuid, 'apoio', 'x')", [AGENT]), /permission denied/);

      // Reaplicar a migração não repete aviso.
      const { rows: [before] } = await pool.query('SELECT count(*)::int AS n FROM notifications');
      await pool.query(fs.readFileSync(path.join(__dirname, '../migrations/039-notifications.sql'), 'utf8'));
      const { rows: [after] } = await pool.query('SELECT count(*)::int AS n FROM notifications');
      assert.equal(after.n, before.n);

      // ── user_db (migração 016): conexão, conversa e convite de vínculo ────
      userDbName = `${new URL(DATABASE_URL).pathname.slice(1)}_user`;
      await pool.query(`DROP DATABASE IF EXISTS ${userDbName}`);
      await pool.query(`CREATE DATABASE ${userDbName}`);
      const userUrl = new URL(DATABASE_URL);
      userUrl.pathname = `/${userDbName}`;
      const users = new Pool({ connectionString: userUrl.toString() });
      try {
        for (let round = 0; round < 2; round += 1) {
          for (const file of manifestFiles('user_db')) await users.query(fs.readFileSync(file, 'utf8'));
        }
        const A = AGENT;
        const B = GOV;
        const OWNER = '77777777-7777-4777-8777-777777777777';
        await users.query(`INSERT INTO profiles (user_id, name) VALUES ($1, 'Ana'), ($2, 'Bruno'), ($3, 'Dona da instituição')`, [A, B, OWNER]);
        const { rows: [cx] } = await users.query(
          `INSERT INTO connections (type, status, from_user_id, to_user_id, message) VALUES ('apoio', 'pending', $1, $2, 'Olá')
           RETURNING id`, [A, B],
        );
        const unread = async (userId) => (await users.query(
          'SELECT kind, title, actor_user_id FROM notifications WHERE user_id = $1 AND read_at IS NULL ORDER BY created_at', [userId],
        )).rows;
        assert.deepEqual((await unread(B)).map((n) => [n.kind, n.actor_user_id]), [['conexao', A]]);
        await users.query("UPDATE connections SET status = 'accepted' WHERE id = $1", [cx.id]);
        assert.deepEqual(await unread(B), [], 'o pedido respondido sai do sino de quem recebeu');
        assert.deepEqual((await unread(A)).map((n) => n.title), ['Conexão aceita']);
        await users.query('INSERT INTO connection_messages (connection_id, author_id, body) VALUES ($1, $2, $3)', [cx.id, B, 'Oi']);
        await users.query('INSERT INTO connection_messages (connection_id, author_id, body) VALUES ($1, $2, $3)', [cx.id, B, 'Tudo bem?']);
        assert.equal((await unread(A)).filter((n) => n.kind === 'nova_mensagem').length, 1, 'um aviso por conversa');
        await users.query(
          'INSERT INTO connection_message_reads (connection_id, user_id, last_read_at) VALUES ($1, $2, NOW())', [cx.id, A],
        );
        assert.equal((await unread(A)).filter((n) => n.kind === 'nova_mensagem').length, 0, 'abrir a conversa lê o aviso');
        const { rows: [org] } = await users.query(
          `INSERT INTO organizations (org_name, profile_id, institution_kind, validation_status)
           SELECT 'Associação Verde', id, 'agente_transformacao', 'pendente' FROM profiles WHERE user_id = $1 RETURNING id`, [OWNER],
        );
        const { rows: [member] } = await users.query(
          `INSERT INTO organization_members (organization_id, user_id, level, invited_by) VALUES ($1, $2, 'publicador', $3)
           RETURNING id`, [org.id, A, OWNER],
        );
        const invite = (await users.query(
          "SELECT summary, href FROM notifications WHERE user_id = $1 AND kind = 'convite_de_vinculo'", [A],
        )).rows[0];
        assert.deepEqual(invite, { summary: 'Associação Verde convidou você para atuar como Publicador', href: '/vinculos' });
        await users.query("UPDATE organization_members SET status = 'recusado', responded_at = NOW() WHERE id = $1", [member.id]);
        assert.equal((await unread(A)).filter((n) => n.kind === 'convite_de_vinculo').length, 0);
        const { rows: [outbox] } = await users.query("SELECT count(*)::int AS n FROM email_outbox WHERE status = 'pendente'");
        assert.equal(outbox.n, 4);
        assert.equal((await createMailer({ pool: users, env: {} }).tick()).disabled, 4);
      } finally {
        await users.end();
      }
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      if (userDbName) await pool.query(`DROP DATABASE IF EXISTS ${userDbName}`).catch(() => {});
      await pool.end();
    }
  });
