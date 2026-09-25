// Controle de prazos (T-05-03; Modelo de Conexão §13–§15) contra um
// PostgreSQL de verdade: prazo do encaminhamento, responsável do órgão com
// setor e data limite, prazos por etapa do processo com histórico, laço de
// alertas com relógio simulado e pendências das duas partes.
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
const { HttpError } = require('../src/demand/store');
const { createDeadlineMonitor, addDays, saoPauloDay } = require('../src/process/deadlines');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const GOV = '55555555-5555-4555-8555-555555555555';
const GOV2 = '66666666-6666-4666-8666-666666666666';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
const ORG_GOV2 = '99999999-9999-4999-8999-999999999999';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [GOV]: ['government', 'secretaria', 'Maria Representante'],
  [GOV2]: ['government', 'orgao_publico', 'João Representante'],
};
const token = (userId) => {
  const [role, profileType, name] = USERS[userId];
  return jwt.sign({ userId, role, profileType, name }, SECRET);
};

async function institutionStatus(req) {
  switch (req.user.userId) {
    case AGENT: return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
    case GOV: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV };
    case GOV2: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV2 };
    default: return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
  }
}

async function governmentProfile(userId) {
  if (userId === GOV2) {
    return {
      name: 'Secretaria Municipal de Meio Ambiente', governmentSphere: 'municipal', department: null,
      competenceAreas: ['Meio ambiente'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
    };
  }
  if (userId !== GOV) return null;
  return {
    name: 'Secretaria Municipal de Obras', governmentSphere: 'municipal', department: 'Conservação',
    competenceAreas: ['Obras'], territory: 'Zona Oeste', municipality: 'Rio de Janeiro', uf: 'RJ',
  };
}

// user-service simulado (conexões), com as regras de routes/connections.js.
const connectionStore = new Map();
const connections = {
  async create(req, input) {
    const id = crypto.randomUUID();
    const c = { id, type: input.type, status: 'pending', fromUserId: req.user.userId, toUserId: input.toUserId, demandId: input.demandId ?? null };
    connectionStore.set(id, c);
    return { ...c };
  },
  async get(req, id) {
    const c = connectionStore.get(id);
    return c && (c.fromUserId === req.user.userId || c.toUserId === req.user.userId) ? { ...c } : null;
  },
  async update(req, id, status) {
    const c = connectionStore.get(id);
    if (!c) throw new HttpError(404, { error: 'Conexão não encontrada' });
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

test('Prazos: encaminhamento + N dias, responsável do órgão, prazos por etapa, alertas e pendências',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007, 009, 010, 025 e 027).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_events, demand_institutional_tracks, demand_forwardings,
                         connection_processes, connection_process_deadlines, deadline_alerts TO gestao_app`);
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: null,
      partnerProfile: { get: async () => null, match: async () => [] }, connections, governmentProfile,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = GOV2, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const notificationsOf = async (column, id, kind) => (await pool.query(
      `SELECT kind, title, summary, href FROM notifications WHERE ${column} = $1 AND kind = $2 ORDER BY created_at`, [id, kind],
    )).rows;

    const today = saoPauloDay();
    try {
      // Demanda publicada.
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'problema_urbano', title: 'Praça sem iluminação', description: 'Praça sem iluminação: descrição.',
          objective: 'Resolver.', justification: 'Necessário.', beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          priority: 'alta', photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A', addressNumber: '10',
          district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ', latitude: -23.02, longitude: -43.45,
          territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const demand = created.body.id;
      assert.equal((await call('POST', `/demands/${demand}/schedule-items`, {
        as: AGENT, body: { stage: 'Execução', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${demand}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 100000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${demand}/goals`, {
        as: AGENT, body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${demand}/resources`, { as: AGENT, body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      { const s = await call("POST", `/demands/${demand}/submit`, { as: AGENT }); assert.equal(s.status, 200, JSON.stringify(s.body)); }
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [demand]);

      // ── 1. Encaminhamento com prazo de 10 dias (§13) ─────────────────────
      const forwarded = await call('POST', `/institutional/demands/${demand}/forwardings`, {
        as: GOV,
        body: { destinationKind: 'setor_interno', destinationSector: 'Departamento de Iluminação', reason: 'Competência técnica', dueDays: 10 },
      });
      assert.equal(forwarded.status, 201, JSON.stringify(forwarded.body));
      const { rows: [fw] } = await pool.query(
        `SELECT to_char(due_on, 'YYYY-MM-DD') AS due_on,
                due_on = ((forwarded_at AT TIME ZONE 'America/Sao_Paulo')::date + 10) AS ten_days
           FROM demand_forwardings WHERE id = $1`, [forwarded.body.forwardingId],
      );
      assert.equal(fw.ten_days, true, 'due_on = forwarded_at + 10');
      assert.equal(forwarded.body.forwardings[0].dueOn, fw.due_on);
      await assert.rejects(pool.query('UPDATE demand_forwardings SET due_on = due_on + 1 WHERE id = $1', [forwarded.body.forwardingId]),
        /não muda/);
      const pastForwarding = await call('POST', `/institutional/demands/${demand}/forwardings`, {
        as: GOV, body: { destinationKind: 'setor_interno', destinationSector: 'Outro setor', reason: 'x', dueOn: '2000-01-01' },
      });
      assert.equal(pastForwarding.status, 422);
      assert.ok(pastForwarding.body.fields.dueOn);
      const publicInstitutional = await call('GET', `/demands/${demand}/institutional`, { auth: false });
      assert.equal(publicInstitutional.body.forwardings[0].dueOn, fw.due_on, 'o Agente acompanha o prazo');

      // ── 2. Responsável do órgão com setor e data limite (§14) ────────────
      const responsible = await call('PUT', `/institutional/demands/${demand}/track`, {
        as: GOV, body: { responsibleSector: 'Iluminação pública', responsibleDueOn: addDays(today, 2) },
      });
      assert.equal(responsible.status, 200, JSON.stringify(responsible.body));
      assert.equal(responsible.body.track.responsibleSector, 'Iluminação pública');
      assert.equal(responsible.body.track.responsibleDueOn, addDays(today, 2));
      assert.equal(responsible.body.track.responsibleName, null, 'campo ausente fica como estava');

      // ── 3. Processo formalizado por outro órgão e prazos por etapa (§15) ──
      const formalized = await call('POST', `/institutional/demands/${demand}/formalize`, { as: GOV2, body: {} });
      assert.equal(formalized.status, 201, JSON.stringify(formalized.body));
      const processId = formalized.body.process.id;
      const protocol = formalized.body.process.protocol;

      const suggested = await call('POST', `/processes/${processId}/deadlines`, { body: { stage: 'analise_inicial' } });
      assert.equal(suggested.status, 201, JSON.stringify(suggested.body));
      assert.equal(suggested.body.deadlines[0].dueOn, addDays(today, 5), 'Análise inicial: 5 dias');
      assert.equal((await call('POST', `/processes/${processId}/deadlines`, { as: AGENT, body: { stage: 'analise_inicial' } })).status, 403);
      const redefined = await call('POST', `/processes/${processId}/deadlines`, { body: { stage: 'analise_inicial', dueDays: 2 } });
      assert.equal(redefined.status, 201);
      const history = redefined.body.deadlines.filter((d) => d.stage === 'analise_inicial');
      assert.equal(history.length, 2);
      assert.equal(history[0].open, true);
      assert.equal(history[0].dueOn, addDays(today, 2));
      assert.equal(history[1].supersededBy, history[0].id, 'o anterior fica no histórico');
      const docs = await call('POST', `/processes/${processId}/deadlines`, {
        as: AGENT, body: { stage: 'envio_de_documentacao', dueDays: 1, note: 'Projeto elétrico' },
      });
      assert.equal(docs.status, 201, JSON.stringify(docs.body));
      const docsDeadline = docs.body.deadlines.find((d) => d.stage === 'envio_de_documentacao');
      assert.ok((await notificationsOf('organization_id', ORG_GOV2, 'atualizacao_de_processo')).length >= 1,
        'a parte sabe do prazo definido');
      const past = await call('POST', `/processes/${processId}/deadlines`, { as: AGENT, body: { stage: 'execucao', dueOn: '2000-01-01' } });
      assert.equal(past.status, 422);
      await assert.rejects(pool.query(
        `UPDATE connection_process_deadlines SET due_on = due_on + 30 WHERE id = $1`, [docsDeadline.id]), /não mudam/);
      await assert.rejects(pool.query('DELETE FROM connection_process_deadlines WHERE id = $1', [docsDeadline.id]), /não são excluídos/);
      await assert.rejects(pool.query(
        `UPDATE connection_process_deadlines SET status = 'vencido' WHERE id = $1`, [docsDeadline.id]), /ainda não venceu/);

      // ── 4. Laço: prazos próximos avisam uma vez, às duas partes ──────────
      const monitor = createDeadlineMonitor({ pool });
      const first = await monitor.runNow(today);
      assert.equal(first.overdue, 0);
      assert.ok(first.alerts >= 4, JSON.stringify(first));
      const soonAgent = await notificationsOf('user_id', AGENT, 'prazo_proximo');
      const soonPartner = await notificationsOf('organization_id', ORG_GOV2, 'prazo_proximo');
      assert.equal(soonAgent.length, 2, 'análise inicial e envio de documentação');
      assert.equal(soonPartner.length, 2);
      assert.ok(soonAgent.every((n) => n.href === `/processos/${protocol}`));
      assert.ok(soonAgent.some((n) => /Envio de documentação/.test(n.summary)));
      const soonOrg = await notificationsOf('organization_id', ORG_GOV, 'prazo_proximo');
      assert.equal(soonOrg.length, 1, 'acompanhamento do órgão com data limite em 2 dias (o encaminhamento vence em 10)');
      assert.deepEqual(await monitor.runNow(today), { overdue: 0, alerts: 0 }, 'não repete o aviso');

      // ── 5. Relógio simulado: 4 dias depois, os prazos venceram ──────────
      const later = addDays(today, 4);
      const second = await monitor.runNow(later);
      assert.equal(second.overdue, 2);
      const { rows: statuses } = await pool.query(
        `SELECT stage::text AS stage, status::text AS status FROM connection_process_deadlines
          WHERE process_id = $1 AND superseded_by IS NULL ORDER BY stage`, [processId],
      );
      assert.deepEqual(statuses, [
        { stage: 'analise_inicial', status: 'vencido' }, { stage: 'envio_de_documentacao', status: 'vencido' },
      ]);
      assert.equal((await notificationsOf('user_id', AGENT, 'prazo_vencido')).length, 2);
      assert.equal((await notificationsOf('organization_id', ORG_GOV2, 'prazo_vencido')).length, 2);
      assert.equal((await notificationsOf('organization_id', ORG_GOV, 'prazo_vencido')).length, 1);
      assert.deepEqual(await monitor.runNow(later), { overdue: 0, alerts: 0 });

      // Pendência para as duas partes.
      for (const as of [AGENT, GOV2]) {
        const pending = await call('GET', '/processes/pending', { as });
        assert.equal(pending.status, 200);
        const mine = pending.body.pending.filter((p) => p.processId === processId);
        assert.equal(mine.length, 2, `pendências de ${as}`);
        assert.ok(mine.every((p) => p.overdue && p.status === 'vencido'));
      }
      const agentPending = (await call('GET', '/processes/pending', { as: AGENT })).body.pending;
      assert.equal(agentPending.find((p) => p.stage === 'envio_de_documentacao').mustAct, true);
      assert.equal(agentPending.find((p) => p.stage === 'analise_inicial').mustAct, false);
      const govPending = (await call('GET', '/processes/pending', { as: GOV })).body.pending;
      assert.deepEqual(govPending.map((p) => p.kind).sort(), ['acompanhamento', 'encaminhamento']);
      assert.ok(govPending.every((p) => p.href === `/governo/demandas/${demand}`));

      // ── 6. Cumprido com atraso: linha do tempo do processo ───────────────
      const done = await call('POST', `/processes/${processId}/deadlines/${docsDeadline.id}/fulfill`, {
        as: AGENT, body: { note: 'Projeto enviado' },
      });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.deadlines.find((d) => d.id === docsDeadline.id).status, 'cumprido');
      assert.equal((await call('POST', `/processes/${processId}/deadlines/${docsDeadline.id}/fulfill`, { as: AGENT })).body.code, 'deadline_closed');
      const types = done.body.timeline.map((e) => e.type);
      for (const type of ['prazo_definido', 'prazo_vencido', 'prazo_cumprido']) assert.ok(types.includes(type), type);
      const publicTimeline = await call('GET', `/processes/${protocol}/timeline`, { auth: false });
      assert.ok(!publicTimeline.body.events.some((e) => e.type.startsWith('prazo_')), 'prazos são das partes');

      // ── 7. Gestão só lê ──────────────────────────────────────────────────
      assert.equal((await gestao.query('SELECT count(*)::int AS n FROM connection_process_deadlines')).rows[0].n, 3);
      // Três alvos (dois prazos de etapa e o acompanhamento) × próximo e vencido.
      assert.equal((await gestao.query('SELECT count(*)::int AS n FROM deadline_alerts')).rows[0].n, 6);
      await assert.rejects(gestao.query("UPDATE connection_process_deadlines SET status = 'cumprido'"));
    } finally {
      server.close();
      await gestao.end();
      await pool.end();
    }
  });
