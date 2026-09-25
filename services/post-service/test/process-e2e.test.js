// Processo de Conexão (T-05-01) contra um PostgreSQL de verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado. O user-service
// (conexões) é simulado com as mesmas regras de routes/connections.js.

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
const OTHER = '33333333-3333-4333-8333-333333333333';
const GOV = '55555555-5555-4555-8555-555555555555';
const GOV2 = '66666666-6666-4666-8666-666666666666';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
const ORG_GOV2 = '99999999-9999-4999-8999-999999999999';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [OTHER]: ['partner', 'marca', 'Marca Qualquer'],
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
  if (userId === GOV) {
    return {
      name: 'Secretaria Municipal de Obras', governmentSphere: 'municipal', department: 'Conservação',
      competenceAreas: ['Obras'], territory: 'Zona Oeste', municipality: 'Rio de Janeiro', uf: 'RJ',
    };
  }
  if (userId === GOV2) {
    return {
      name: 'Secretaria Municipal de Meio Ambiente', governmentSphere: 'municipal', department: null,
      competenceAreas: ['Meio ambiente'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
    };
  }
  return null;
}

// ── user-service simulado ───────────────────────────────────────────────────
const connectionStore = new Map();
const userOf = (req) => req.user.userId;
const connections = {
  async create(req, input) {
    const id = crypto.randomUUID();
    const connection = {
      id, type: input.type, status: 'pending', fromUserId: userOf(req), toUserId: input.toUserId,
      demandId: input.demandId ?? null, postId: input.postId ?? null, message: input.message,
    };
    connectionStore.set(id, connection);
    return { ...connection };
  },
  async get(req, id) {
    const c = connectionStore.get(id);
    if (!c || (c.fromUserId !== userOf(req) && c.toUserId !== userOf(req))) return null;
    return { ...c };
  },
  async update(req, id, status) {
    const c = connectionStore.get(id);
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

test('Processo de Conexão: protocolo anual, número na demanda, status §16, espelho no órgão e linha do tempo',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007, 009, 011 e 025).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_budget_items, demand_schedule_items, demand_goals,
                         demand_resources, demand_documents, demand_events, demand_interests,
                         demand_institutional_tracks, demand_institutional_offers, connection_processes,
                         connection_protocol_counters TO gestao_app`);
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
          justification: 'Necessário.', beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores', priority: 'alta',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A', addressNumber: '10',
          district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ', latitude: -23.02, longitude: -43.45,
          territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 100000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { as: AGENT, body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      const submitted = await call('POST', `/demands/${id}/submit`, { as: AGENT });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return id;
    }

    const year = new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date());

    try {
      const demand = await publishedDemand('Calçada quebrada');

      // ── 1. Parceiro: interesse de apoio → conexão → aceite = processo 1 ──
      const interest = await call('POST', `/demands/${demand}/interests`, {
        body: { kind: 'apoio', offerTypes: ['produtos', 'servicos'], message: 'Doamos o material e a mão de obra.' },
      });
      assert.equal(interest.status, 201, JSON.stringify(interest.body));
      const asked = await call('POST', `/demands/${demand}/interests/${interest.body.interest.id}/connection`, {
        body: { message: 'Podemos conversar?' },
      });
      assert.equal(asked.status, 201, JSON.stringify(asked.body));
      const partnerConnection = asked.body.connection.id;
      const accepted = await call('POST', `/demands/mine/${demand}/connections/${partnerConnection}/accept`, { as: AGENT });
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      assert.equal(accepted.body.demand.status, 'conectada', 'a demanda fica conectada no primeiro processo');
      const first = accepted.body.process;
      assert.equal(first.protocol, `DM-${year}-000001`);
      assert.equal(first.sequenceInDemand, 1);
      assert.equal(first.partyKind, 'empresa');
      assert.equal(first.status, 'recebida');
      // Aceitar de novo não cria outro processo.
      const again = await call('POST', `/demands/mine/${demand}/connections/${partnerConnection}/accept`, { as: AGENT });
      assert.equal(again.body.process.id, first.id);

      // ── 2. Órgão: oferta com pedido de conexão → aceite = processo 2 ──────
      const orgConnection = await connections.create({ user: { userId: GOV } }, { toUserId: AGENT, demandId: demand, type: 'apoio' });
      const offer = await call('POST', `/institutional/demands/${demand}/offers`, {
        as: GOV,
        body: { supportTypes: ['infraestrutura', 'equipes'], description: 'Equipe de conservação e caçamba.', connectionId: orgConnection.id },
      });
      assert.equal(offer.status, 201, JSON.stringify(offer.body));
      const govAccepted = await call('POST', `/demands/mine/${demand}/connections/${orgConnection.id}/accept`, { as: AGENT });
      assert.equal(govAccepted.status, 200, JSON.stringify(govAccepted.body));
      const second = govAccepted.body.process;
      assert.equal(second.protocol, `DM-${year}-000002`);
      assert.equal(second.sequenceInDemand, 2);
      assert.equal(second.partyKind, 'poder_publico');
      assert.equal(second.partyName, 'Secretaria Municipal de Obras');

      // ── 3. Formalização pelo próprio órgão = processo 3 ─────────────────
      const formalized = await call('POST', `/institutional/demands/${demand}/formalize`, {
        as: GOV2, body: { contributionKinds: ['articulacao', 'autorizacao'], contributionDescription: 'Licença ambiental.' },
      });
      assert.equal(formalized.status, 201, JSON.stringify(formalized.body));
      assert.equal(formalized.body.process.protocol, `DM-${year}-000003`);
      assert.equal(formalized.body.process.sequenceInDemand, 3);
      assert.equal(formalized.body.track.processId, formalized.body.process.id);
      assert.equal((await call('POST', `/institutional/demands/${demand}/formalize`, { as: GOV2 })).status, 200, 'idempotente');

      // ── 4. Lista pública sem dado pessoal ────────────────────────────────
      const pub = await call('GET', `/demands/${demand}/processes`, { auth: false });
      assert.equal(pub.status, 200);
      assert.deepEqual(pub.body.processes.map((p) => [p.protocol, p.sequenceInDemand, p.partyKind]), [
        [`DM-${year}-000001`, 1, 'empresa'],
        [`DM-${year}-000002`, 2, 'poder_publico'],
        [`DM-${year}-000003`, 3, 'poder_publico'],
      ]);
      assert.equal(pub.body.processes[0].organizationName, null, 'Parceiro aparece só pelo tipo');
      assert.equal(pub.body.processes[1].organizationName, 'Secretaria Municipal de Obras');
      assert.deepEqual(pub.body.processes[0].contributionKinds, ['materiais', 'servicos']);
      assert.deepEqual(pub.body.processes[1].contributionKinds, ['infraestrutura', 'equipe']);
      const text = JSON.stringify(pub.body);
      for (const secret of [PARTNER, GOV, GOV2, AGENT, 'Construtora Horizonte', 'Maria Representante', 'Doamos']) {
        assert.ok(!text.includes(secret), `lista pública sem ${secret}`);
      }

      // ── 5. Acesso: partes veem, terceiros recebem 404 ────────────────────
      assert.equal((await call('GET', `/processes/${first.id}`, { as: OTHER })).status, 404);
      assert.equal((await call('GET', `/processes/${second.protocol}`, { as: GOV2 })).status, 404, 'outro órgão não é parte');
      const partnerView = await call('GET', `/processes/${first.protocol}`);
      assert.equal(partnerView.status, 200, JSON.stringify(partnerView.body));
      assert.equal(partnerView.body.process.viewerRole, 'parte');
      assert.ok(partnerView.body.process.availableStatuses.includes('em_analise'));
      assert.ok(!partnerView.body.process.availableStatuses.includes('nao_e_de_competencia'), 'só órgão público');
      const agentView = await call('GET', `/processes/${first.id}`, { as: AGENT });
      assert.equal(agentView.body.process.viewerRole, 'agente');
      assert.equal((await call('GET', '/processes/DM-2026-99999x', { as: AGENT })).status, 404);
      const mine = await call('GET', '/processes/mine', { as: GOV });
      assert.deepEqual(mine.body.processes.map((p) => p.protocol), [second.protocol]);
      assert.equal((await call('GET', '/processes/mine', { as: AGENT })).body.processes.length, 3);
      const byConnection = await call('GET', `/processes/by-connection/${partnerConnection}`);
      assert.equal(byConnection.body.process.protocol, first.protocol);
      assert.equal((await call('GET', `/processes/by-connection/${partnerConnection}`, { as: OTHER })).body.process, null);

      // ── 5b. 4% + 6% por processo, nunca com o Poder Público (T-05-06, migração 040) ──
      const empresaFees = await call('PUT', `/processes/${first.id}/contribution`, {
        body: { contributionKinds: ['apoio_financeiro', 'materiais'], contributionAmountCents: 1_000_000 },
      });
      assert.equal(empresaFees.status, 200, JSON.stringify(empresaFees.body));
      assert.equal(empresaFees.body.process.feeApplies, true);
      assert.deepEqual(empresaFees.body.process.fees, {
        applies: true, contributionAmountCents: 1_000_000, agentFeeCents: 40_000, platformFeeCents: 60_000,
        totalWithFeesCents: 1_100_000,
      });
      const govFees = await call('PUT', `/processes/${second.id}/contribution`, {
        as: GOV, body: { contributionKinds: ['apoio_financeiro', 'infraestrutura'], contributionAmountCents: 1_000_000 },
      });
      assert.equal(govFees.status, 200, JSON.stringify(govFees.body));
      assert.equal(govFees.body.process.feeApplies, false);
      assert.deepEqual(govFees.body.process.fees, {
        applies: false, contributionAmountCents: 1_000_000, agentFeeCents: 0, platformFeeCents: 0, totalWithFeesCents: 1_000_000,
      });
      const { rows: feeRows } = await pool.query(
        `SELECT party_kind::text AS k, fee_applies, agent_fee_cents::int AS a, platform_fee_cents::int AS p,
                total_with_fees_cents::int AS t FROM connection_processes WHERE demand_id = $1 ORDER BY sequence_in_demand`,
        [demand],
      );
      assert.deepEqual(feeRows.slice(0, 2), [
        { k: 'empresa', fee_applies: true, a: 40_000, p: 60_000, t: 1_100_000 },
        { k: 'poder_publico', fee_applies: false, a: 0, p: 0, t: 1_000_000 },
      ]);
      assert.equal(feeRows[2].t, null, 'sem contribuição financeira, sem taxas');
      const pubFees = (await call('GET', `/demands/${demand}/processes`, { auth: false })).body.processes;
      assert.equal(pubFees[0].fees.totalWithFeesCents, 1_100_000);
      assert.equal(pubFees[1].fees.applies, false);
      // A visão do órgão não traz a composição da demanda com 4% + 6%.
      const organView = await call('GET', `/institutional/demands/${demand}`, { as: GOV });
      assert.equal(organView.status, 200, JSON.stringify(organView.body));
      assert.deepEqual(Object.keys(organView.body.demand.composition), ['budgetAmountCents']);

      // ── 6. Status do §16: quem pode, motivo obrigatório, pausa e retomada ──
      const status = (ref, as, body) => call('POST', `/processes/${ref}/status`, { as, body });
      assert.equal((await status(first.id, AGENT, { status: 'em_analise' })).status, 403, 'análise é da parte');
      assert.equal((await status(first.id, PARTNER, { status: 'em_analise' })).status, 200);
      const noNote = await status(first.id, PARTNER, { status: 'nao_aprovada' });
      assert.equal(noNote.status, 422);
      assert.ok(noNote.body.fields.note);
      assert.equal((await status(first.id, PARTNER, { status: 'concluida' })).status, 409);
      assert.equal((await status(first.id, PARTNER, { status: 'nao_e_de_competencia', note: 'x' })).status, 409);
      const paused = await status(first.id, PARTNER, { status: 'aguardando_documentacao' });
      assert.equal(paused.status, 200);
      assert.equal(paused.body.process.previousStatus, 'em_analise');
      assert.ok(paused.body.process.availableStatuses.includes('em_analise'), 'volta ao anterior');
      assert.equal((await status(first.id, AGENT, { status: 'em_analise' })).status, 200, 'retomar vale para os dois lados');
      assert.equal((await status(first.id, PARTNER, { status: 'aprovada_para_execucao' })).status, 200);
      assert.equal((await status(first.id, AGENT, { status: 'em_execucao' })).status, 200);
      assert.equal((await status(first.id, AGENT, { status: 'concluida' })).status, 200);
      const closed = await status(first.id, AGENT, { status: 'prestacao_de_contas' });
      assert.equal(closed.status, 200);
      assert.ok(closed.body.process.closedAt);
      assert.equal((await status(first.id, AGENT, { status: 'cancelada', note: 'x' })).body.code, 'process_closed');

      // ── 7. Órgão: status pela área institucional espelha processo e acompanhamento ──
      const govStatus = await call('POST', `/institutional/demands/${demand}/status`, { as: GOV, body: { status: 'em_analise' } });
      assert.equal(govStatus.status, 200, JSON.stringify(govStatus.body));
      assert.equal(govStatus.body.process.status, 'em_analise');
      assert.equal(govStatus.body.track.status, 'em_analise');
      const approved = await status(second.id, GOV, { status: 'aprovada_para_execucao' });
      assert.equal(approved.status, 200, JSON.stringify(approved.body));
      const { rows: [track] } = await pool.query(
        'SELECT status::text AS status, process_id FROM demand_institutional_tracks WHERE organization_id = $1', [ORG_GOV],
      );
      assert.deepEqual(track, { status: 'aprovada_para_execucao', process_id: second.id }, 'o acompanhamento espelha o processo');
      assert.equal((await status(second.id, GOV, { status: 'suspensa' })).status, 422);
      assert.equal((await status(second.id, GOV, { status: 'suspensa', note: 'Aguardando licitação' })).status, 200);
      assert.equal((await pool.query('SELECT status::text AS s FROM demand_institutional_tracks WHERE organization_id = $1', [ORG_GOV])).rows[0].s, 'suspensa');

      // ── 8. Responsável atual (§14) e contribuição ────────────────────────
      const responsible = await call('PUT', `/processes/${second.id}/responsible`, {
        as: GOV,
        body: { organizationName: 'Prefeitura do Rio', organ: 'Secretaria Municipal de Obras', department: 'Conservação',
          sector: 'Fiscalização', name: 'Carlos Lima', role: 'Coordenador', dueOn: '2026-12-15' },
      });
      assert.equal(responsible.status, 200, JSON.stringify(responsible.body));
      assert.equal(responsible.body.process.responsible.sector, 'Fiscalização');
      assert.equal(responsible.body.process.responsible.dueOn, '2026-12-15');
      assert.ok(responsible.body.process.responsible.since);
      assert.equal((await call('PUT', `/processes/${second.id}/responsible`, { as: GOV, body: { dueOn: '2026-02-30' } })).status, 422);
      const contribution = await call('PUT', `/processes/${first.id}/contribution`, { body: { contributionAmountCents: 100 } });
      assert.equal(contribution.body.code, 'process_closed');
      const third = formalized.body.process;
      const badAmount = await call('PUT', `/processes/${third.id}/contribution`, { as: GOV2, body: { contributionAmountCents: 500 } });
      assert.equal(badAmount.status, 422);
      assert.ok(badAmount.body.fields.contributionAmountCents);

      // ── 9. Linha do tempo por processo (§35) ─────────────────────────────
      const full = await call('GET', `/processes/${second.id}`, { as: GOV });
      const types = full.body.timeline.map((e) => e.type);
      assert.ok(types.includes('processo_formalizado'));
      assert.ok(types.includes('processo_status_alterado'));
      assert.ok(types.includes('responsavel_do_processo_definido'), 'evento privado para as partes');
      assert.ok(types.includes('status_institucional_alterado'), 'eventos do acompanhamento entram no processo');
      const publicTimeline = await call('GET', `/processes/${second.protocol}/timeline`, { auth: false });
      assert.equal(publicTimeline.status, 200);
      assert.ok(publicTimeline.body.events.every((e) => !('note' in e) && !('actorType' in e)));
      assert.ok(!publicTimeline.body.events.some((e) => e.type === 'responsavel_do_processo_definido'));
      assert.ok(!JSON.stringify(publicTimeline.body).includes('Carlos Lima'));
      const processEvents = publicTimeline.body.events.filter((e) => e.type.startsWith('processo_'));
      assert.ok(!JSON.stringify(processEvents).includes('licitação'), 'o motivo do processo fica com as partes');
      const demandTimeline = await call('GET', `/demands/${demand}/timeline`, { auth: false });
      const formalizedEvent = demandTimeline.body.events.find((e) => e.type === 'processo_formalizado');
      assert.equal(formalizedEvent.details.protocol, first.protocol);

      // ── 10. Protocolo e partes imutáveis; nada excluído; gestão só lê ─────
      await assert.rejects(pool.query('UPDATE connection_processes SET protocol = $2 WHERE id = $1', [second.id, 'DM-2000-000001']),
        /não mudam/);
      await assert.rejects(pool.query('DELETE FROM connection_processes WHERE id = $1', [second.id]), /não são excluídos/);
      await assert.rejects(pool.query('TRUNCATE connection_processes CASCADE'), /não é apagada/);
      assert.equal((await gestao.query('SELECT count(*)::int AS n FROM connection_processes')).rows[0].n, 3);
      await assert.rejects(gestao.query(
        `INSERT INTO connection_processes (demand_id, party_kind, party_user_id, party_name, origin_kind, origin_interest_id,
                                           formalized_by, formalized_by_kind, protocol, sequence_in_demand)
         VALUES ($1, 'empresa', $2, 'x', 'interesse', $3, $2, 'parte', 'DM-2026-000009', 9)`,
        [demand, PARTNER, interest.body.interest.id],
      ));
      await assert.rejects(gestao.query("UPDATE connection_processes SET status = 'cancelada' WHERE id = $1", [second.id]));

      // ── 11. Transição direto no banco: sem nota → recusa ─────────────────
      await assert.rejects(
        pool.query(`UPDATE connection_processes SET status = 'nao_aprovada', status_changed_by = $2, status_changed_by_kind = 'parte'
                     WHERE id = $1`, [third.id, GOV2]),
        /justificativa/,
      );
    } finally {
      server.close();
      await gestao.end();
      await pool.end();
    }
  });
