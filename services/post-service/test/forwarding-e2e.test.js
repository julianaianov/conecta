// Encaminhamentos da demanda (T14) contra um PostgreSQL de verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh), que sobe um PostgreSQL temporário, roda este
// arquivo num banco próprio e apaga tudo no fim. Sem a variável, é pulado.

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
const GOV_B = '66666666-6666-4666-8666-666666666666';
const GOV_STATE = '77777777-7777-4777-8777-777777777777';
const ORG_AGENT = '44444444-4444-4444-8444-444444444444';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
const ORG_GOV_B = '99999999-9999-4999-8999-999999999999';
const ORG_GOV_STATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_UNKNOWN = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ROLES = {
  [AGENT]: ['agent', 'associacao'],
  [GOV]: ['government', 'secretaria'],
  [GOV_B]: ['government', 'orgao_publico'],
  [GOV_STATE]: ['government', 'secretaria'],
};
const token = (userId) => {
  const [role, profileType] = ROLES[userId];
  return jwt.sign({ userId, role, profileType, name: `Representante ${userId.slice(0, 4)}` }, SECRET);
};

const ORGS = {
  [GOV]: {
    organizationId: ORG_GOV, name: 'Secretaria Municipal de Meio Ambiente', governmentSphere: 'municipal',
    department: 'Parques e praças', competenceAreas: ['Meio ambiente'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
  },
  [GOV_B]: {
    organizationId: ORG_GOV_B, name: 'Companhia Municipal de Limpeza Urbana', governmentSphere: 'municipal',
    department: null, competenceAreas: ['Limpeza urbana'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
  },
  [GOV_STATE]: {
    organizationId: ORG_GOV_STATE, name: 'Secretaria Estadual do Ambiente', governmentSphere: 'estadual',
    department: null, competenceAreas: ['Meio ambiente'], territory: null, municipality: null, uf: 'RJ',
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

// Diretório do user-service simulado (o user-service tem os próprios testes).
let directoryDown = false;
const governmentDirectory = {
  async search(_req, { q } = {}) {
    if (directoryDown) throw new Error('user-service fora');
    return Object.values(byOrg).filter((o) => !q || o.name.toLowerCase().includes(q.toLowerCase()));
  },
  async byId(_req, id) {
    if (directoryDown) throw new Error('user-service fora');
    return byOrg[id] ?? null;
  },
};

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('encaminhamentos: setor interno, órgão da plataforma e órgão externo, status, providências e tramitação pública',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007, 009 e 010).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_budget_items, demand_schedule_items, demand_goals,
                         demand_resources, demand_documents, demand_events, demand_institutional_tracks,
                         demand_institutional_responses, demand_institutional_offers, demand_forwardings,
                         demand_forwarding_updates TO gestao_app`);
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
    const call = async (method, url, { as = GOV, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    async function publishedDemand() {
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'problema_urbano', title: 'Descarte irregular na praça', description: 'Entulho acumulado na praça.',
          objective: 'Limpar a praça.', justification: 'Risco à saúde.', beneficiariesEstimate: 300,
          beneficiariesProfile: 'Moradores do entorno', priority: 'alta', photoRef: 'https://example.org/foto.jpg',
          cep: '22790-000', street: 'Rua A', addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro',
          uf: 'RJ', latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Limpeza', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 50000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Praça limpa', expectedResult: 'Sem entulho', indicator: 'Toneladas retiradas', measurementMethod: 'Pesagem' },
      })).status, 201);
      const submitted = await call('POST', `/demands/${id}/submit`, { as: AGENT });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return id;
    }

    try {
      const demand = await publishedDemand();
      const forward = (body, as = GOV) => call('POST', `/institutional/demands/${demand}/forwardings`, { as, body });

      // ── Diretório ─────────────────────────────────────────────────────────
      const dir = await call('GET', '/institutional/organizations?q=limpeza');
      assert.equal(dir.status, 200, JSON.stringify(dir.body));
      assert.deepEqual(dir.body.organizations.map((o) => o.organizationId), [ORG_GOV_B]);
      const all = await call('GET', '/institutional/organizations');
      assert.ok(!all.body.organizations.some((o) => o.organizationId === ORG_GOV), 'o próprio órgão fica fora');
      assert.equal((await call('GET', '/institutional/organizations', { as: AGENT })).status, 403);
      assert.equal((await call('GET', '/institutional/organizations?uf=Rio')).status, 422);

      // ── Validação ─────────────────────────────────────────────────────────
      const empty = await forward({});
      assert.equal(empty.status, 422);
      assert.ok(empty.body.fields.destinationKind && empty.body.fields.reason);
      assert.ok((await forward({ destinationKind: 'orgao_plataforma', reason: 'x' })).body.fields.destinationOrganizationId);
      assert.ok((await forward({ destinationKind: 'setor_interno', reason: 'x' })).body.fields.destinationSector);
      assert.ok((await forward({ destinationKind: 'orgao_externo', reason: 'x' })).body.fields.destinationOrganizationName);
      const self = await forward({ destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG_GOV, reason: 'x' });
      assert.equal(self.status, 422);
      const unknown = await forward({ destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG_UNKNOWN, reason: 'x' });
      assert.equal(unknown.status, 422);
      assert.ok(unknown.body.fields.destinationOrganizationId);
      directoryDown = true;
      const down = await forward({ destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG_GOV_B, reason: 'x' });
      assert.equal(down.status, 503);
      assert.equal(down.body.code, 'directory_unavailable');
      directoryDown = false;
      const { rows: [{ n: before }] } = await pool.query('SELECT count(*)::int AS n FROM demand_forwardings');
      assert.equal(before, 0, 'nada gravado nas recusas');

      // ── (b) Setor interno: abre o acompanhamento e vai para Encaminhada ───
      const internal = await forward({
        destinationKind: 'setor_interno', destinationSector: 'Coordenadoria de Fiscalização',
        reason: 'Vistoria de fiscalização do descarte irregular.', responsibleName: 'Carla Souza', responsibleRole: 'Coordenadora',
      });
      assert.equal(internal.status, 201, JSON.stringify(internal.body));
      assert.equal(internal.body.track.status, 'encaminhada');
      const [fwInternal] = internal.body.forwardings;
      assert.equal(fwInternal.id, internal.body.forwardingId);
      assert.equal(fwInternal.destinationKind, 'setor_interno');
      assert.equal(fwInternal.destinationOrganizationName, 'Secretaria Municipal de Meio Ambiente');
      assert.equal(fwInternal.status, 'enviado');
      assert.equal(fwInternal.responsibleName, 'Carla Souza');
      assert.equal(fwInternal.direction, 'enviado');
      assert.equal(fwInternal.canChangeStatus, true, 'fora da plataforma, a origem registra o retorno');
      assert.deepEqual(internal.body.responses.map((r) => [r.type, r.responsibleSector, r.institutionalStatus]),
        [['encaminhamento_realizado', 'Coordenadoria de Fiscalização', 'encaminhada']]);

      // ── (a) Órgão da plataforma: abre o acompanhamento dele como Recebida ──
      const platform = await forward({
        destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG_GOV_B, destinationSector: 'Gerência de Remoção',
        reason: 'Remoção de entulho é competência da Companhia de Limpeza.',
      });
      assert.equal(platform.status, 201, JSON.stringify(platform.body));
      assert.equal(platform.body.track.status, 'encaminhada_ao_orgao_responsavel');
      const fwPlatform = platform.body.forwardings.find((f) => f.id === platform.body.forwardingId);
      assert.equal(fwPlatform.destinationOrganizationName, 'Companhia Municipal de Limpeza Urbana');
      assert.equal(fwPlatform.destinationSphere, 'municipal');
      assert.equal(fwPlatform.canChangeStatus, false, 'na plataforma responde o destino');
      assert.equal(fwPlatform.responsibleName, 'Representante 5555', 'responsável padrão: quem encaminhou');
      const dup = await forward({ destinationKind: 'orgao_plataforma', destinationOrganizationId: ORG_GOV_B, reason: 'De novo.' });
      assert.equal(dup.status, 409);
      assert.equal(dup.body.code, 'duplicate_forwarding');

      const received = await call('GET', `/institutional/demands/${demand}`, { as: GOV_B });
      assert.equal(received.body.track.status, 'recebida');
      assert.equal(received.body.track.openedByName, 'Encaminhamento de Secretaria Municipal de Meio Ambiente');
      assert.deepEqual(received.body.forwardings.map((f) => [f.id, f.direction, f.canChangeStatus]),
        [[fwPlatform.id, 'recebido', true]], 'o destino vê só o que o envolve');
      assert.deepEqual(received.body.forwardings[0].availableStatuses, ['recebido', 'aceito', 'devolvido']);
      const meB = await call('GET', '/institutional/me', { as: GOV_B });
      assert.deepEqual(meB.body.forwardings, { pendingReceived: 1, openSent: 0 });
      assert.equal(meB.body.counts.recebida, 1);
      const inbox = await call('GET', '/institutional/forwardings?direction=recebidos&status=enviado', { as: GOV_B });
      assert.deepEqual(inbox.body.forwardings.map((i) => [i.forwarding.id, i.demand.id]), [[fwPlatform.id, demand]]);
      const sent = await call('GET', '/institutional/forwardings?direction=enviados');
      assert.equal(sent.body.forwardings.length, 2);
      assert.equal((await call('GET', '/institutional/forwardings?direction=todos')).status, 422);
      assert.equal((await call('GET', `/institutional/forwardings/${fwPlatform.id}`, { as: GOV_STATE })).status, 404, 'terceiro órgão não vê');

      // ── Status ────────────────────────────────────────────────────────────
      const notMine = await call('POST', `/institutional/forwardings/${fwPlatform.id}/status`, { body: { status: 'aceito' } });
      assert.equal(notMine.status, 403);
      assert.equal(notMine.body.code, 'forwarding_forbidden');
      const got = await call('POST', `/institutional/forwardings/${fwPlatform.id}/status`, { as: GOV_B, body: { status: 'recebido' } });
      assert.equal(got.status, 200, JSON.stringify(got.body));
      assert.equal(got.body.forwarding.status, 'recebido');
      assert.ok(got.body.forwarding.receivedAt);
      const noReason = await call('POST', `/institutional/forwardings/${fwPlatform.id}/status`, { as: GOV_B, body: { status: 'devolvido' } });
      assert.equal(noReason.status, 422);
      assert.ok(noReason.body.fields.note);
      const accepted = await call('POST', `/institutional/forwardings/${fwPlatform.id}/status`, {
        as: GOV_B, body: { status: 'aceito', note: 'Equipe de remoção agendada.' },
      });
      assert.equal(accepted.status, 200);
      assert.ok(accepted.body.forwarding.acceptedAt);
      assert.deepEqual(accepted.body.forwarding.availableStatuses, []);
      const late = await call('POST', `/institutional/forwardings/${fwPlatform.id}/status`, {
        as: GOV_B, body: { status: 'devolvido', note: 'Mudou.' },
      });
      assert.equal(late.status, 409);
      assert.equal(late.body.code, 'invalid_transition');

      // ── Providências e atualizações posteriores ───────────────────────────
      assert.equal((await call('POST', `/institutional/forwardings/${fwPlatform.id}/updates`, { as: GOV_B, body: { kind: 'status', body: 'x' } })).status, 422);
      const step = await call('POST', `/institutional/forwardings/${fwPlatform.id}/updates`, {
        as: GOV_B, body: { kind: 'providencia', body: 'Caminhão e equipe designados para 12/10.' },
      });
      assert.equal(step.status, 201, JSON.stringify(step.body));
      const followUp = await call('POST', `/institutional/forwardings/${fwPlatform.id}/updates`, {
        body: { kind: 'atualizacao', body: 'Moradores informados sobre a data da remoção.' },
      });
      assert.equal(followUp.status, 201);
      assert.deepEqual(followUp.body.forwarding.updates.map((u) => [u.side, u.kind, u.toStatus]), [
        ['destino', 'status', 'recebido'], ['destino', 'status', 'aceito'], ['destino', 'providencia', null], ['origem', 'atualizacao', null],
      ]);
      assert.equal(followUp.body.forwarding.updates[1].body, 'Equipe de remoção agendada.');
      assert.equal((await call('POST', `/institutional/forwardings/${fwPlatform.id}/updates`, {
        as: GOV_STATE, body: { kind: 'providencia', body: 'x' },
      })).status, 404);

      // Setor interno: a própria origem registra o aceite.
      const internalOk = await call('POST', `/institutional/forwardings/${fwInternal.id}/status`, { body: { status: 'aceito' } });
      assert.equal(internalOk.status, 200, JSON.stringify(internalOk.body));
      assert.equal(internalOk.body.forwarding.updates[0].side, 'origem');

      // ── (c) Órgão fora da plataforma, depois devolvido ────────────────────
      const external = await forward({
        destinationKind: 'orgao_externo', destinationOrganizationName: 'Companhia Estadual de Águas e Esgotos',
        destinationSector: 'Ouvidoria', destinationSphere: 'estadual', destinationUf: 'rj',
        reason: 'Há vazamento de esgoto no local; ofício 123/2026 enviado.',
      });
      assert.equal(external.status, 201, JSON.stringify(external.body));
      const fwExternal = external.body.forwardings.find((f) => f.id === external.body.forwardingId);
      assert.equal(fwExternal.destinationUf, 'RJ');
      assert.equal(external.body.track.status, 'encaminhada_ao_orgao_responsavel', 'mesmo status: sem nova transição');
      const returned = await call('POST', `/institutional/forwardings/${fwExternal.id}/status`, {
        body: { status: 'devolvido', note: 'A companhia informou que a rede é municipal.' },
      });
      assert.equal(returned.status, 200);
      assert.ok(returned.body.forwarding.returnedAt);

      // Encaminhar exige transição válida do acompanhamento de origem.
      assert.equal((await call('POST', `/institutional/demands/${demand}/status`, { as: GOV_STATE, body: { status: 'em_analise' } })).status, 200);
      assert.equal((await call('POST', `/institutional/demands/${demand}/status`, { as: GOV_STATE, body: { status: 'acao_programada' } })).status, 200);
      const blocked = await forward({ destinationKind: 'setor_interno', destinationSector: 'Gabinete', reason: 'x' }, GOV_STATE);
      assert.equal(blocked.status, 409);
      assert.equal(blocked.body.code, 'invalid_transition');

      // ── Público: tramitação e linha do tempo, sem responsável ─────────────
      const pub = await call('GET', `/demands/${demand}/institutional`, { auth: false });
      assert.equal(pub.status, 200);
      assert.deepEqual(pub.body.forwardings.map((f) => [f.destinationKind, f.status]), [
        ['setor_interno', 'aceito'], ['orgao_plataforma', 'aceito'], ['orgao_externo', 'devolvido'],
      ]);
      const publicJson = JSON.stringify(pub.body);
      for (const secret of ['Carla Souza', 'Coordenadora', 'Representante', GOV, GOV_B, ORG_GOV_B]) {
        assert.ok(!publicJson.includes(secret), `${secret} não pode sair na rota pública`);
      }
      assert.equal(pub.body.forwardings[1].updates.length, 4);
      const timeline = await call('GET', `/demands/${demand}/timeline`, { auth: false });
      const tramitation = timeline.body.events.filter((e) => /encaminha/.test(e.type));
      assert.deepEqual(tramitation.map((e) => e.type), [
        'demanda_encaminhada', 'demanda_encaminhada', 'encaminhamento_status_alterado', 'encaminhamento_status_alterado',
        'encaminhamento_atualizado', 'encaminhamento_atualizado', 'encaminhamento_status_alterado',
        'demanda_encaminhada', 'encaminhamento_status_alterado',
      ]);
      for (const e of tramitation) assert.ok(e.details?.organizationName, e.type);
      assert.equal(tramitation[1].details.destinationOrganizationName, 'Companhia Municipal de Limpeza Urbana');
      assert.equal(tramitation[4].details.updateKind, 'providencia');
      const timelineJson = JSON.stringify(timeline.body);
      assert.ok(!timelineJson.includes('Carla Souza') && !timelineJson.includes('Representante'));
      assert.ok(timeline.body.events.some((e) => e.type === 'acompanhamento_institucional_aberto'
        && e.details.organizationName === 'Companhia Municipal de Limpeza Urbana'), 'abertura do destino na linha do tempo');

      // ── Banco: imutabilidade, regras e gestão só leitura ──────────────────
      await assert.rejects(pool.query("UPDATE demand_forwardings SET reason = 'x' WHERE id = $1", [fwPlatform.id]), /não mudam/);
      await assert.rejects(pool.query('DELETE FROM demand_forwardings WHERE id = $1', [fwPlatform.id]), /não são excluídos/);
      await assert.rejects(pool.query('TRUNCATE demand_forwarding_updates'), /somente inserção/);
      await assert.rejects(pool.query('UPDATE demand_forwarding_updates SET body = $1', ['x']), /somente inserção/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_forwarding_updates (forwarding_id, demand_id, organization_id, organization_name, side, kind, to_status, author_id)
         VALUES ($1, $2, $3, 'x', 'origem', 'status', 'aceito', $4)`, [fwPlatform.id, demand, ORG_GOV, GOV],
      ), /registrada pelo próprio encaminhamento/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_forwarding_updates (forwarding_id, demand_id, organization_id, organization_name, side, kind, body, author_id)
         VALUES ($1, $2, $3, 'x', 'origem', 'providencia', 'x', $4)`, [fwPlatform.id, demand, ORG_GOV_STATE, GOV_STATE],
      ), /fora deste encaminhamento/);
      const { rows: [openFw] } = await pool.query(
        `INSERT INTO demand_forwardings (track_id, demand_id, organization_id, origin_organization_name, destination_kind,
           destination_organization_name, reason, forwarded_by)
         SELECT id, demand_id, organization_id, '', 'orgao_externo', 'Defesa Civil', 'Risco', $2
           FROM demand_institutional_tracks WHERE organization_id = $1 RETURNING id`, [ORG_GOV, GOV],
      );
      await assert.rejects(pool.query(
        `UPDATE demand_forwardings SET status = 'aceito', status_changed_by = $2, status_changed_by_organization = $3 WHERE id = $1`,
        [openFw.id, GOV_B, ORG_GOV_B],
      ), /sem permissão/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_forwardings (track_id, demand_id, organization_id, origin_organization_name, destination_kind,
           destination_organization_name, reason, forwarded_by, status)
         SELECT id, demand_id, organization_id, '', 'orgao_externo', 'X', 'x', $2, 'aceito'
           FROM demand_institutional_tracks WHERE organization_id = $1`, [ORG_GOV, GOV],
      ), /nasce enviado/);
      const { rows: seen } = await gestao.query('SELECT count(*)::int AS n FROM demand_forwarding_updates');
      assert.ok(seen[0].n >= 6);
      await assert.rejects(gestao.query("UPDATE demand_forwardings SET status_note = 'x'"), /permission denied|só lê/);
      await assert.rejects(gestao.query(
        `INSERT INTO demand_forwarding_updates (forwarding_id, demand_id, organization_id, organization_name, side, kind, body, author_id)
         SELECT id, demand_id, organization_id, 'x', 'origem', 'providencia', 'x', forwarded_by FROM demand_forwardings LIMIT 1`,
      ), /permission denied|só lê/);

      // ── Arquivada: sai do público e não aceita mais tramitação ────────────
      await gestao.query(
        "UPDATE demands SET status = 'arquivada', archive_reason = 'Duplicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1",
        [demand],
      );
      assert.equal((await forward({ destinationKind: 'setor_interno', destinationSector: 'Gabinete', reason: 'x' })).status, 404);
      assert.equal((await call('POST', `/institutional/forwardings/${fwPlatform.id}/updates`, {
        body: { kind: 'atualizacao', body: 'x' },
      })).status, 404);
      await assert.rejects(pool.query(
        `INSERT INTO demand_forwarding_updates (forwarding_id, demand_id, organization_id, organization_name, side, kind, body, author_id)
         VALUES ($1, $2, $3, 'x', 'origem', 'atualizacao', 'x', $4)`, [fwPlatform.id, demand, ORG_GOV, GOV],
      ), /só em demanda publicada/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
