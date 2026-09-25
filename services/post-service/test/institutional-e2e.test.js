// Atuação institucional do Poder Público (T13) contra um PostgreSQL de verdade.
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
const MEMBER = '33333333-3333-4333-8333-333333333333';
const GOV = '55555555-5555-4555-8555-555555555555';
const GOV_STATE = '66666666-6666-4666-8666-666666666666';
const GOV_PENDING = '77777777-7777-4777-8777-777777777777';
const ORG_AGENT = '44444444-4444-4444-8444-444444444444';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
const ORG_GOV_STATE = '99999999-9999-4999-8999-999999999999';
const CONNECTION = 'abababab-abab-4bab-8bab-abababababab';

const ROLES = {
  [AGENT]: ['agent', 'associacao'],
  [MEMBER]: ['member', 'morador'],
  [GOV]: ['government', 'secretaria'],
  [GOV_STATE]: ['government', 'orgao_publico'],
  [GOV_PENDING]: ['government', 'prefeitura'],
};
const token = (userId) => {
  const [role, profileType] = ROLES[userId];
  return jwt.sign({ userId, role, profileType, name: `Conta ${userId.slice(0, 4)}` }, SECRET);
};

// Estado institucional e identificação pública simulados (o user-service tem os próprios testes).
async function institutionStatus(req) {
  switch (req.user.userId) {
    case AGENT: return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
    case GOV: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV };
    case GOV_STATE: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV_STATE };
    case GOV_PENDING: return { kind: 'poder_publico', status: 'em_analise', canActInstitutionally: false, organizationId: null };
    default: return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
  }
}

async function governmentProfile(userId) {
  if (userId === GOV) {
    return {
      name: 'Secretaria Municipal de Meio Ambiente', governmentSphere: 'municipal', department: 'Parques e praças',
      competenceAreas: ['Meio ambiente'], territory: 'Zona Oeste', municipality: 'Rio de Janeiro', uf: 'RJ',
    };
  }
  if (userId === GOV_STATE) {
    return {
      name: 'Secretaria Estadual de Cultura', governmentSphere: 'estadual', department: null,
      competenceAreas: ['Cultura'], territory: null, municipality: 'São Paulo', uf: 'SP',
    };
  }
  return null;
}

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('Poder Público: fila, acompanhamento, respostas, status, oferta de apoio e transparência',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007 e 009).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_budget_items, demand_schedule_items, demand_goals,
                         demand_resources, demand_documents, demand_events, demand_institutional_tracks,
                         demand_institutional_responses, demand_institutional_offers TO gestao_app`);
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, governmentProfile, operationUserIds: new Set(),
      uploadStorage: null, dossierService: null,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = GOV, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    async function publishedDemand(overrides) {
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'projeto_ambiental', title: 'Horta comunitária', description: 'Canteiros elevados na praça.',
          objective: 'Produzir alimentos.', justification: 'Praça abandonada.', beneficiariesEstimate: 120,
          beneficiariesProfile: 'Moradores do entorno', priority: 'alta', photoRef: 'https://example.org/foto.jpg',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          cep: '22790-000', street: 'Rua A', addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro',
          uf: 'RJ', latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes', ...overrides,
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      const stage = await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Plantio', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      });
      assert.equal(stage.status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 50000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Canteiros', expectedResult: 'Produção', indicator: 'Canteiros ativos', measurementMethod: 'Contagem' },
      })).status, 201);
      const submitted = await call('POST', `/demands/${id}/submit`, { as: AGENT });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      await gestao.query(
        "UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id],
      );
      return id;
    }

    try {
      const rio = await publishedDemand({ themes: ['meio_ambiente'] });
      const sp = await publishedDemand({ title: 'Biblioteca comunitária', municipality: 'São Paulo', uf: 'SP', cep: '01001-000', territory: 'Sé', themes: ['cultura', 'educacao'] });
      const draft = await call('POST', '/demands', { as: AGENT, body: { title: 'Rascunho' } });
      assert.equal(draft.status, 201);

      // ── Acesso ────────────────────────────────────────────────────────────
      assert.equal((await call('GET', '/institutional/demands', { auth: false })).status, 401);
      const member = await call('GET', '/institutional/demands', { as: MEMBER });
      assert.equal(member.status, 403);
      assert.equal(member.body.code, 'not_government');
      const agent = await call('POST', `/institutional/demands/${rio}/track`, { as: AGENT });
      assert.equal(agent.body.code, 'not_government');
      const pending = await call('GET', '/institutional/demands', { as: GOV_PENDING });
      assert.equal(pending.status, 403);
      assert.equal(pending.body.code, 'institution_not_validated');

      // ── Lista e recorte territorial ───────────────────────────────────────
      const mine = await call('GET', '/institutional/demands');
      assert.equal(mine.status, 200, JSON.stringify(mine.body));
      assert.equal(mine.body.scope, 'jurisdicao');
      assert.deepEqual(mine.body.demands.map((d) => d.id), [rio], 'municipal: só o próprio município');
      assert.equal(mine.body.demands[0].institutional, null);
      const all = await call('GET', '/institutional/demands?scope=todas');
      assert.deepEqual(new Set(all.body.demands.map((d) => d.id)), new Set([rio, sp]));
      assert.ok(!all.body.demands.some((d) => d.id === draft.body.id), 'rascunho fora da lista');
      const state = await call('GET', '/institutional/demands', { as: GOV_STATE });
      assert.deepEqual(state.body.demands.map((d) => d.id), [sp], 'estadual: só a própria UF');
      const filtered = await call('GET', '/institutional/demands?scope=todas&category=projeto_social');
      assert.deepEqual(filtered.body.demands, []);
      assert.equal((await call('GET', '/institutional/demands?institutionalStatus=xyz')).status, 422);
      // Eixo temático (T-03-01).
      const byTheme = await call('GET', '/institutional/demands?scope=todas&theme=cultura,saneamento');
      assert.deepEqual(byTheme.body.demands.map((d) => d.id), [sp]);
      assert.deepEqual(byTheme.body.demands[0].themes, ['educacao', 'cultura']);
      assert.equal((await call('GET', '/institutional/demands?theme=saude')).status, 422);
      assert.equal((await call('GET', `/institutional/demands/${draft.body.id}`)).status, 404);

      const before = await call('GET', `/institutional/demands/${rio}`);
      assert.equal(before.status, 200);
      assert.equal(before.body.track, null);
      assert.equal(before.body.demand.title, 'Horta comunitária');
      assert.ok(!('cep' in before.body.demand), 'o órgão vê a projeção pública');

      // ── Abertura (Recebida) ───────────────────────────────────────────────
      const opened = await call('POST', `/institutional/demands/${rio}/track`);
      assert.equal(opened.status, 201, JSON.stringify(opened.body));
      assert.equal(opened.body.track.status, 'recebida');
      assert.equal(opened.body.track.organizationName, 'Secretaria Municipal de Meio Ambiente');
      assert.deepEqual(opened.body.track.availableStatuses,
        ['em_analise', 'solicitacao_de_informacoes', 'encaminhada', 'nao_e_de_competencia', 'encaminhada_ao_orgao_responsavel']);
      assert.equal((await call('POST', `/institutional/demands/${rio}/track`)).status, 200, 'abrir de novo não duplica');
      assert.equal((await call('POST', `/institutional/demands/${draft.body.id}/track`)).status, 404);

      const queue = await call('GET', '/institutional/tracks?status=recebida');
      assert.equal(queue.status, 200);
      assert.deepEqual(queue.body.tracks.map((t) => [t.demand.id, t.track.status]), [[rio, 'recebida']]);
      const untracked = await call('GET', '/institutional/demands?scope=todas&institutionalStatus=sem_acompanhamento');
      assert.deepEqual(untracked.body.demands.map((d) => d.id), [sp]);

      // ── Status ────────────────────────────────────────────────────────────
      const jump = await call('POST', `/institutional/demands/${rio}/status`, { body: { status: 'concluida' } });
      assert.equal(jump.status, 409);
      assert.equal(jump.body.code, 'invalid_transition');
      const noNote = await call('POST', `/institutional/demands/${rio}/status`, { body: { status: 'nao_e_de_competencia' } });
      assert.equal(noNote.status, 422);
      assert.ok(noNote.body.fields.note);

      // ── Respostas ─────────────────────────────────────────────────────────
      const received = await call('POST', `/institutional/demands/${rio}/responses`, {
        body: { type: 'recebimento', body: 'Recebemos a demanda e ela está em análise pela equipe de parques.', status: 'em_analise' },
      });
      assert.equal(received.status, 201, JSON.stringify(received.body));
      assert.equal(received.body.track.status, 'em_analise');
      assert.equal(received.body.responses[0].institutionalStatus, 'em_analise');
      assert.equal(received.body.responses[0].authorId, GOV);
      const noProgram = await call('POST', `/institutional/demands/${rio}/responses`, {
        body: { type: 'programa_publico_relacionado', body: 'Há um programa.' },
      });
      assert.equal(noProgram.status, 422);
      assert.ok(noProgram.body.fields.programName);
      const badUrl = await call('POST', `/institutional/demands/${rio}/responses`, {
        body: { type: 'programa_publico_relacionado', body: 'x', programName: 'Hortas', programUrl: 'http://inseguro' },
      });
      assert.ok(badUrl.body.fields.programUrl);
      const program = await call('POST', `/institutional/demands/${rio}/responses`, {
        body: {
          type: 'programa_publico_relacionado', body: 'A demanda se enquadra no programa municipal de hortas.',
          programName: 'Hortas Cariocas', programUrl: 'https://prefeitura.example.org/hortas',
        },
      });
      assert.equal(program.status, 201);
      const programmed = await call('POST', `/institutional/demands/${rio}/responses`, {
        body: { type: 'acao_prevista', body: 'Vistoria técnica programada.', plannedFor: '2026-10-20', status: 'aprovada_para_execucao' },
      });
      assert.equal(programmed.status, 201, JSON.stringify(programmed.body));
      assert.equal(programmed.body.track.status, 'aprovada_para_execucao');
      assert.deepEqual(programmed.body.responses.map((r) => r.type),
        ['recebimento', 'programa_publico_relacionado', 'acao_prevista']);

      // ── Responsável (privado) e oferta de apoio ───────────────────────────
      const responsible = await call('PUT', `/institutional/demands/${rio}/track`, {
        body: { responsibleName: 'Carla Souza', responsibleRole: 'Coordenadora de parques' },
      });
      assert.equal(responsible.status, 200);
      assert.equal(responsible.body.track.responsibleName, 'Carla Souza');
      const badOffer = await call('POST', `/institutional/demands/${rio}/offers`, {
        body: { supportTypes: ['dinheiro'], description: '' },
      });
      assert.equal(badOffer.status, 422);
      assert.ok(badOffer.body.fields.supportTypes && badOffer.body.fields.description);
      const offer = await call('POST', `/institutional/demands/${rio}/offers`, {
        body: {
          supportTypes: ['conhecimento_tecnico', 'infraestrutura'], connectionId: CONNECTION,
          description: 'Mudas do viveiro municipal e orientação técnica da equipe de parques.',
        },
      });
      assert.equal(offer.status, 201, JSON.stringify(offer.body));
      assert.deepEqual(offer.body.offers[0].supportTypes, ['infraestrutura', 'conhecimento_tecnico']);
      assert.equal(offer.body.offers[0].connectionId, CONNECTION);

      // Outro órgão, fora da competência (com justificativa).
      const other = await call('POST', `/institutional/demands/${rio}/status`, {
        as: GOV_STATE, body: { status: 'nao_e_de_competencia', note: 'Tema municipal; encaminhar à Prefeitura.' },
      });
      assert.equal(other.status, 200, JSON.stringify(other.body));
      assert.equal(other.body.track.status, 'nao_e_de_competencia');
      assert.equal(other.body.otherOrganizations.length, 1);
      assert.equal(other.body.otherOrganizations[0].organizationName, 'Secretaria Municipal de Meio Ambiente');
      assert.ok(!('responsibleName' in other.body.otherOrganizations[0]));
      assert.deepEqual(other.body.responses, [], 'o órgão vê só as próprias respostas na área institucional');

      const me = await call('GET', '/institutional/me');
      assert.equal(me.status, 200);
      assert.equal(me.body.counts.aprovada_para_execucao, 1);
      assert.equal(me.body.jurisdiction.municipality, 'Rio de Janeiro');
      assert.deepEqual(me.body.suggestedThemes, ['meio_ambiente'], 'competência "Meio ambiente"');

      // ── Público ───────────────────────────────────────────────────────────
      const pub = await call('GET', `/demands/${rio}/institutional`, { auth: false });
      assert.equal(pub.status, 200);
      assert.deepEqual(pub.body.organizations.map((o) => [o.organizationName, o.status]), [
        ['Secretaria Municipal de Meio Ambiente', 'aprovada_para_execucao'],
        ['Secretaria Estadual de Cultura', 'nao_e_de_competencia'],
      ]);
      for (const o of pub.body.organizations) {
        for (const hidden of ['responsibleName', 'responsibleRole', 'openedBy', 'openedByName', 'organizationId', 'statusChangedBy']) {
          assert.ok(!(hidden in o), `${hidden} não pode sair na rota pública`);
        }
      }
      assert.equal(pub.body.responses.length, 3);
      assert.ok(pub.body.responses.every((r) => !('authorId' in r) && !('authorName' in r)));
      assert.equal(pub.body.responses[1].programName, 'Hortas Cariocas');
      assert.deepEqual(Object.keys(pub.body.offers[0]).sort(),
        ['createdAt', 'description', 'id', 'organizationName', 'supportTypes', 'trackId']);
      assert.equal((await call('GET', `/demands/${draft.body.id}/institutional`, { auth: false })).status, 404);

      const timeline = await call('GET', `/demands/${rio}/timeline`, { auth: false });
      const institutional = timeline.body.events.filter((e) => e.details);
      assert.deepEqual(institutional.map((e) => e.type), [
        'acompanhamento_institucional_aberto', 'status_institucional_alterado', 'resposta_institucional',
        'resposta_institucional', 'status_institucional_alterado', 'resposta_institucional',
        'apoio_institucional_oferecido', 'acompanhamento_institucional_aberto', 'status_institucional_alterado',
      ]);
      for (const e of institutional) {
        assert.ok(e.details.organizationName);
        assert.ok(!('track_id' in e.details) && !('actor' in e) && !('note' in e));
      }
      assert.equal(institutional[2].details.responseType, 'recebimento');
      assert.equal(institutional[8].details.note, 'Tema municipal; encaminhar à Prefeitura.');
      assert.ok(!timeline.body.events.some((e) => e.type === 'responsavel_institucional_definido'), 'responsável é privado');
      const authorEvents = await call('GET', `/demands/mine/${rio}/events`, { as: AGENT });
      assert.ok(authorEvents.body.events.some((e) => e.actorType === 'poder_publico' && e.type === 'responsavel_institucional_definido'));

      // ── Banco: imutabilidade, transições e gestão só leitura ─────────────
      const { rows: [response] } = await pool.query('SELECT id FROM demand_institutional_responses LIMIT 1');
      await assert.rejects(pool.query("UPDATE demand_institutional_responses SET body = 'x' WHERE id = $1", [response.id]), /somente inserção/);
      await assert.rejects(pool.query('DELETE FROM demand_institutional_responses WHERE id = $1', [response.id]), /somente inserção/);
      await assert.rejects(pool.query('TRUNCATE demand_institutional_offers CASCADE'), /somente inserção/);
      await assert.rejects(pool.query('DELETE FROM demand_institutional_tracks'), /não são excluídos/);
      await assert.rejects(pool.query(
        "UPDATE demand_institutional_tracks SET status = 'recebida', status_changed_by = $1 WHERE organization_id = $2",
        [GOV, ORG_GOV],
      ), /transição institucional não permitida/);
      await assert.rejects(pool.query(
        "UPDATE demand_institutional_tracks SET organization_name = 'Outro' WHERE organization_id = $1", [ORG_GOV],
      ), /não mudam/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_institutional_tracks (demand_id, organization_id, organization_name, opened_by, status)
         VALUES ($1, gen_random_uuid(), 'X', $2, 'em_analise')`, [sp, GOV],
      ), /nasce recebida/);
      await assert.rejects(pool.query(
        `INSERT INTO demand_institutional_tracks (demand_id, organization_id, organization_name, opened_by)
         VALUES ($1, gen_random_uuid(), 'X', $2)`, [draft.body.id, GOV],
      ), /só em demanda publicada/);
      await assert.rejects(pool.query(
        "INSERT INTO demand_events (demand_id, event_type, actor_type) VALUES ($1, 'x', 'prefeito')", [rio],
      ), /demand_events_actor_type_check/);
      const { rows: seen } = await gestao.query('SELECT count(*)::int AS n FROM demand_institutional_responses');
      assert.equal(seen[0].n, 3);
      await assert.rejects(gestao.query("UPDATE demand_institutional_tracks SET responsible_name = 'x'"), /permission denied|só lê/);
      await assert.rejects(gestao.query(
        `INSERT INTO demand_institutional_offers (track_id, demand_id, organization_id, support_types, description, author_id)
         SELECT id, demand_id, organization_id, '{parcerias}', 'x', $1 FROM demand_institutional_tracks LIMIT 1`, [GOV],
      ), /permission denied|só lê/);

      // Índices da leitura da gestão.
      const { rows: indexes } = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1::text[]) ORDER BY indexname",
        [['idx_demands_submitted', 'idx_demands_place', 'idx_demands_territory', 'idx_demand_events_type_created', 'idx_supports_post_confirmed']],
      );
      assert.equal(indexes.length, 5);

      // ── Arquivada: sai do público e não aceita mais atuação ──────────────
      await gestao.query(
        "UPDATE demands SET status = 'arquivada', archive_reason = 'Duplicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1",
        [rio],
      );
      assert.equal((await call('GET', `/demands/${rio}/institutional`, { auth: false })).status, 404);
      assert.equal((await call('POST', `/institutional/demands/${rio}/responses`, {
        body: { type: 'analise_em_andamento', body: 'Seguimos analisando.' },
      })).status, 404);
      const { rows: [track] } = await pool.query('SELECT id FROM demand_institutional_tracks WHERE organization_id = $1', [ORG_GOV]);
      await assert.rejects(pool.query(
        `INSERT INTO demand_institutional_responses (track_id, demand_id, organization_id, response_type, body, author_id)
         VALUES ($1, $2, $3, 'recebimento', 'x', $4)`, [track.id, rio, ORG_GOV, GOV],
      ), /só em demanda publicada/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });

// ── Nível Institucional (T-05-18) ───────────────────────────────────────────

/** S3 em memória (o bastante para upload, confirmação e dossiê). */
function memoryStorage() {
  const objects = new Map();
  return {
    objects,
    async presignPut({ key, contentType }) { return { url: `https://s3.test/${key}`, headers: { 'Content-Type': contentType }, expiresIn: 900 }; },
    async presignGet({ key, expiresIn }) { return `https://s3.test/${key}?exp=${expiresIn}`; },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, contentType: o.contentType, checksumSha256: null } : null;
    },
    async readPrefix(key, length) { return objects.get(key).bytes.slice(0, length); },
    async get(key) {
      const o = objects.get(key);
      if (!o) throw Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' });
      return Buffer.from(o.bytes);
    },
    async put({ key, body, contentType }) { objects.set(key, { bytes: Uint8Array.from(body), contentType }); },
    async copy(from, to) { objects.set(to, objects.get(from)); },
    async remove(key) { objects.delete(key); },
  };
}

test('nível Institucional: órgão com acompanhamento aberto abre documento e dossiê integral; sem relação é 404; restrito fica fora',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const { createDossierService } = require('../src/dossier/service');
    const pool = new Pool({ connectionString: DATABASE_URL });
    for (const file of postDbFiles()) await pool.query(fs.readFileSync(file, 'utf8'));
    await pool.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await pool.query('GRANT SELECT ON demands TO gestao_app');
    await pool.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                        ON demands TO gestao_app`);
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const storage = memoryStorage();
    const fetchInstitution = async (userId) => (userId === AGENT ? {
      institution_kind: 'agente_transformacao', cnpj: '11222333000181', legal_name: 'Associação de Teste', trade_name: null,
      cnae_primary: '9430800', cnae_primary_description: 'Atividades de associações de defesa de direitos sociais',
      cnae_secondary: [], municipality: 'Rio de Janeiro', uf: 'RJ', validation_status: 'validada',
    } : null);
    const dossiers = createDossierService({
      pool, storage, fetchInstitution, siteUrl: 'https://homologacao.dmconecta.org', logger: { error() {} }, backoffSeconds: 0,
    });
    const server = createApp({
      pool, secret: SECRET, institutionStatus, governmentProfile, operationUserIds: new Set(),
      uploadStorage: storage, dossierService: dossiers,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = GOV, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
      });
      return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
    };

    try {
      // Demanda com um documento enviado ao bucket, publicada.
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'projeto_ambiental', title: 'Horta da escola', description: 'Canteiros no pátio.',
          objective: 'Produzir alimentos.', justification: 'Pátio sem uso.', beneficiariesEstimate: 80,
          beneficiariesProfile: 'Estudantes', priority: 'media', photoRef: 'https://example.org/foto.jpg',
          cep: '22790-000', street: 'Rua B', addressNumber: '5', district: 'Recreio', municipality: 'Rio de Janeiro',
          uf: 'RJ', latitude: -23.01, longitude: -43.44, territory: 'Recreio dos Bandeirantes',
          problemIdentified: 'Pátio da escola sem uso.', coverageArea: 'Escola e quadras vizinhas',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT, body: { stage: 'Plantio', activities: 'Canteiros', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 40000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Canteiros', expectedResult: 'Produção', indicator: 'Canteiros ativos', measurementMethod: 'Contagem' },
      })).status, 201);
      const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj', 'latin1');
      const ticket = await call('POST', '/uploads/presign', {
        as: AGENT, body: { purpose: 'demand_document', contentType: 'application/pdf', size: pdf.length, fileName: 'orcamento.pdf' },
      });
      assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
      storage.objects.set(`tmp/${ticket.body.uploadId}`, { bytes: Uint8Array.from(pdf), contentType: 'application/pdf' });
      const upload = await call('POST', `/uploads/${ticket.body.uploadId}/confirm`, { as: AGENT, body: { demandId: id } });
      assert.equal(upload.status, 200, JSON.stringify(upload.body));
      const doc = await call('POST', `/demands/${id}/documents`, {
        as: AGENT, body: { type: 'orcamentos_e_cotacoes', title: 'Orçamento da horta', reference: upload.body.id },
      });
      assert.equal(doc.status, 201, JSON.stringify(doc.body));
      const docId = doc.body.item.id;
      const submitted = await call('POST', `/demands/${id}/submit`, { as: AGENT });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      const regenerated = await call('POST', `/demands/${id}/dossiers/regenerate`, { as: AGENT });
      assert.equal(regenerated.status, 200, JSON.stringify(regenerated.body));

      // Sem acompanhamento aberto, o órgão não é envolvido: 404.
      assert.equal((await call('GET', `/demands/${id}/documents`)).status, 404);
      assert.equal((await call('GET', `/uploads/${upload.body.id}`)).status, 404);
      assert.equal((await call('GET', `/demands/${id}/dossie-integral`)).status, 404);
      assert.equal((await call('POST', `/institutional/demands/${id}/track`)).status, 201);

      // ── Órgão com acompanhamento aberto ─────────────────────────────────
      const list = await call('GET', `/demands/${id}/documents`);
      assert.equal(list.status, 200, JSON.stringify(list.body));
      assert.equal(list.body.role, 'orgao');
      assert.deepEqual(list.body.documents.map((d) => [d.id, d.accessLevel, d.hasFile]), [[docId, 'institucional', true]]);
      assert.ok(list.body.dossier && list.body.dossier.version >= 1);
      const open = await call('GET', `/demands/${id}/documents/${docId}/open`);
      assert.equal(open.status, 200);
      assert.match(open.body.url, new RegExp(`^https://s3.test/demands/${id}/documents/${upload.body.id}\\.pdf\\?exp=300$`));
      assert.equal((await call('GET', `/uploads/${upload.body.id}`)).status, 200);
      const integral = await call('GET', `/demands/${id}/dossie-integral`);
      assert.equal(integral.status, 200, JSON.stringify(integral.body));
      assert.match(integral.body.url, /dossie\/v\d+\.pdf\?exp=60$/);
      assert.doesNotMatch(integral.body.url, /publica/);
      // Registro privado, com o órgão, fora da linha do tempo pública.
      const { rows: consulted } = await pool.query(
        `SELECT event_type, actor_type, is_public, payload->>'organization_id' AS org FROM demand_events
          WHERE demand_id = $1 AND event_type IN ('documento_consultado', 'dossie_integral_consultado') ORDER BY created_at`,
        [id],
      );
      assert.deepEqual(consulted.map((e) => e.event_type), ['documento_consultado', 'documento_consultado', 'dossie_integral_consultado']);
      assert.ok(consulted.every((e) => e.actor_type === 'poder_publico' && e.is_public === false && e.org === ORG_GOV));
      const timeline = await call('GET', `/demands/${id}/timeline`, { auth: false });
      assert.ok(!timeline.body.events.some((e) => /consultado/.test(e.type)));

      // ── Sem relação: 404 ────────────────────────────────────────────────
      for (const as of [MEMBER, GOV_STATE]) {
        assert.equal((await call('GET', `/demands/${id}/documents`, { as })).status, 404);
        assert.equal((await call('GET', `/demands/${id}/documents/${docId}/open`, { as })).status, 404);
        assert.equal((await call('GET', `/demands/${id}/dossie-integral`, { as })).status, 404);
        assert.equal((await call('GET', `/uploads/${upload.body.id}`, { as })).status, 404);
      }
      assert.equal((await call('GET', `/uploads/${upload.body.id}/content`, { auth: false })).status, 404);

      // ── O autor define o nível ──────────────────────────────────────────
      assert.equal((await call('PUT', `/demands/${id}/documents/${docId}/access`, { body: { accessLevel: 'publico' } })).status, 403);
      const restricted = await call('PUT', `/demands/${id}/documents/${docId}/access`, { as: AGENT, body: { accessLevel: 'restrito' } });
      assert.equal(restricted.status, 200, JSON.stringify(restricted.body));
      assert.equal(restricted.body.document.accessLevel, 'restrito');
      assert.deepEqual((await call('GET', `/demands/${id}/documents`)).body.documents, []);
      assert.equal((await call('GET', `/demands/${id}/documents/${docId}/open`)).status, 404);
      assert.equal((await call('GET', `/uploads/${upload.body.id}`)).status, 404);
      assert.equal((await call('PUT', `/demands/${id}/documents/${docId}/access`, {
        as: AGENT, body: { accessLevel: 'restrito', restrictedTo: [GOV] },
      })).status, 200);
      assert.equal((await call('GET', `/uploads/${upload.body.id}`)).status, 200, 'conta autorizada no restrito');
      assert.equal((await call('PUT', `/demands/${id}/documents/${docId}/access`, { as: AGENT, body: { accessLevel: 'publico' } })).status, 200);
      const publicContent = await call('GET', `/uploads/${upload.body.id}/content`, { auth: false });
      assert.equal(publicContent.status, 302);
      // O autor segue vendo tudo, sem registro de consulta.
      const own = await call('GET', `/demands/${id}/documents`, { as: AGENT });
      assert.equal(own.body.canManage, true);
      assert.equal((await call('GET', `/demands/${id}/dossie-integral`, { as: AGENT })).status, 200);
      const { rows: [{ n }] } = await pool.query(
        "SELECT count(*)::int AS n FROM demand_events WHERE demand_id = $1 AND actor = $2 AND event_type LIKE '%consultado'", [id, AGENT],
      );
      assert.equal(n, 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
