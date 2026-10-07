// Encerramento do processo e da demanda (Modelo de Conexão §22, decisão 16;
// T-05-14, migração 037) contra um PostgreSQL de verdade: `encerrar` só com a
// prestação de contas concluída, registro final e responsáveis, data de
// conclusão gravada pelo banco, processos da demanda no status final
// adequado, evento público `demanda_encerrada`, aviso às partes, versão
// `encerramento` do dossiê (com as entregas, as evidências e os documentos da
// execução, §22) e a demanda encerrada no histórico público.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`
// (scripts/e2e-postgres.sh). Sem a variável, é pulado. O user-service
// (conexões) é simulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');
const { HttpError } = require('../src/demand/store');
const { createDossierService } = require('../src/dossier/service');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [GOV]: ['government', 'secretaria', 'Maria Representante'],
};
const token = (userId) => {
  const [role, profileType, name] = USERS[userId];
  return jwt.sign({ userId, role, profileType, name }, SECRET);
};

async function institutionStatus(req) {
  switch (req.user.userId) {
    case AGENT: return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
    case GOV: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV };
    default: return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
  }
}

async function governmentProfile(userId) {
  if (userId !== GOV) return null;
  return {
    name: 'Secretaria Municipal de Obras', governmentSphere: 'municipal', department: 'Conservação',
    competenceAreas: ['Obras'], territory: 'Zona Oeste', municipality: 'Rio de Janeiro', uf: 'RJ',
  };
}

// ── user-service simulado (conexões) ───────────────────────────────────────
const connectionStore = new Map();
const connections = {
  async create(req, input) {
    const id = crypto.randomUUID();
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
  async update(req, id, status) {
    const c = connectionStore.get(id);
    if (!c || c.status !== 'pending') throw new HttpError(409, { error: 'não permitido', code: 'connection_conflict' });
    c.status = status;
    return { ...c };
  },
};

/** Armazenamento em memória: só a gravação do PDF interessa (a foto da demanda é um link). */
function memoryStorage() {
  const objects = new Map();
  return {
    objects,
    async put({ key, body, contentType }) { objects.set(key, { bytes: Buffer.from(body), contentType }); },
    async get(key) {
      const o = objects.get(key);
      if (!o) throw new Error(`sem objeto ${key}`);
      return o.bytes;
    },
  };
}

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('encerramento (§22): prestação concluída, registro final, processos finais, evento, aviso e dossiê',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    try {
      for (let round = 0; round < 2; round += 1) {
        for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
      }
      await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
      await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO gestao_app');
      await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                           ON demands TO gestao_app`);
    } finally {
      admin.release();
    }
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const logger = { error() {}, warn() {}, log() {} };
    const dossiers = createDossierService({ pool, storage: null, fetchInstitution: async () => null, logger });
    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: dossiers,
      partnerProfile: { get: async () => null, match: async () => [] }, connections, governmentProfile,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = AGENT, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    try {
      // ── Demanda publicada, sem execução física ─────────────────────────────
      const created = await call('POST', '/demands', {
        body: {
          category: 'projeto_social', title: 'Oficina de leitura', description: 'Encontros de leitura no bairro.',
          objective: 'Formar leitores.', justification: 'Biblioteca sem uso.', beneficiariesEstimate: 40,
          beneficiariesProfile: 'Moradores', problemIdentified: 'Pouco acesso à leitura.', coverageArea: 'Recreio.',
          priority: 'media', photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A',
          addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ',
          latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes', hasPhysicalExecution: false,
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        body: { stage: 'Encontros', activities: 'Leitura', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Registro audiovisual', quantity: 1, unit: 'serviço', unitPriceCents: 100000, isAudiovisualRecord: true },
      })).status, 201);
      const goal = await call('POST', `/demands/${id}/goals`, {
        body: { goal: 'Formar leitores', expectedResult: '40 leitores', indicator: 'Participantes', measurementMethod: 'Lista de presença' },
      });
      assert.equal(goal.status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`)).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);

      // ── Dois processos: Parceiro (vai à execução) e órgão (fica na análise) ─
      const interest = await call('POST', `/demands/${id}/interests`, {
        as: PARTNER, body: { kind: 'apoio', offerTypes: ['produtos'], message: 'Doamos os livros.' },
      });
      assert.equal(interest.status, 201, JSON.stringify(interest.body));
      const asked = await call('POST', `/demands/${id}/interests/${interest.body.interest.id}/connection`, {
        as: PARTNER, body: { message: 'Podemos conversar?' },
      });
      assert.equal(asked.status, 201, JSON.stringify(asked.body));
      const accepted = await call('POST', `/demands/mine/${id}/connections/${asked.body.connection.id}/accept`);
      assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
      const partnerProcess = accepted.body.process;
      const formalized = await call('POST', `/institutional/demands/${id}/formalize`, {
        as: GOV, body: { contributionKinds: ['articulacao'], contributionDescription: 'Cessão do espaço.' },
      });
      assert.equal(formalized.status, 201, JSON.stringify(formalized.body));
      const govProcess = formalized.body.process;
      const status = (ref, as, body) => call('POST', `/processes/${ref}/status`, { as, body });
      assert.equal((await status(partnerProcess.id, PARTNER, { status: 'aprovada_para_execucao' })).status, 200);
      assert.equal((await status(partnerProcess.id, AGENT, { status: 'em_execucao' })).status, 200);

      // ── Demanda até a prestação de contas ──────────────────────────────────
      assert.equal((await call('POST', `/demands/mine/${id}/record-waiver`, {
        body: { reason: 'Ação de formação, sem intervenção física a fotografar.' },
      })).status, 200);
      for (const action of ['iniciar_execucao', 'concluir', 'prestar_contas']) {
        const moved = await call('POST', `/demands/${id}/transitions`, { body: { action } });
        assert.equal(moved.status, 200, `${action}: ${JSON.stringify(moved.body)}`);
      }
      const inAccountability = await call('GET', `/demands/mine/${id}`);
      assert.deepEqual(inAccountability.body.availableActions, ['encerrar']);

      // ── Antes da prestação concluída: 409 invalid_state, nada muda ─────────
      const early = await call('POST', `/demands/${id}/transitions`, {
        body: { action: 'encerrar', closingSummary: 'Fim.', closingResponsibles: 'Associação' },
      });
      assert.equal(early.status, 409, JSON.stringify(early.body));
      assert.equal(early.body.code, 'invalid_state');
      // O banco recusa por conta própria (demands_closure_guard).
      await assert.rejects(
        pool.query(`UPDATE demands SET status = 'encerrada', closing_summary = 'x', closing_responsibles = 'y'
                     WHERE id = $1`, [id]),
        /prestação de contas concluída/,
      );

      // ── Execução registrada: evidência, documento e entregas (Modelo §22) ──
      const confirmedUpload = async (purpose) => {
        const uploadId = crypto.randomUUID();
        await pool.query(
          `INSERT INTO uploads (id, owner_id, purpose, status, tmp_key, object_key, content_type,
                                declared_size_bytes, size_bytes, original_name, demand_id, confirmed_at)
           VALUES ($1, $2, $3, 'confirmado', $4, $5, $6, 1024, 1024, 'arquivo', $7, NOW())`,
          [uploadId, AGENT, purpose, `tmp/${uploadId}`, `demands/${id}/files/${uploadId}`,
            purpose === 'demand_evidence_photo' ? 'image/jpeg' : 'application/pdf', id],
        );
        return `upload:${uploadId}`;
      };
      const [{ id: scheduleItemId }] = (await call('GET', `/demands/mine/${id}`)).body.scheduleItems;
      const evidence = await call('POST', `/demands/mine/${id}/evidences`, {
        body: {
          reference: await confirmedUpload('demand_evidence_photo'), milestone: 'acompanhamento', mediaKind: 'foto',
          recordedOn: daysAgo(5), caption: 'Encontro de leitura', scheduleItemId,
        },
      });
      assert.equal(evidence.status, 201, JSON.stringify(evidence.body));
      assert.equal((await call('POST', `/demands/mine/${id}/execution-documents`, {
        body: {
          kind: 'certificado', title: 'Certificado do mediador', reference: await confirmedUpload('demand_execution_document'),
          issuedOn: daysAgo(4), description: 'Certificado interno da formação',
        },
      })).status, 201);
      // Sem entrega a prestação não conclui (§22).
      const semEntrega = await call('POST', `/demands/mine/${id}/accountability/conclude`);
      assert.equal(semEntrega.status, 422);
      assert.match(semEntrega.body.fields.deliveries, /ao menos uma entrega/);
      for (const delivery of [
        {
          item: 'Clube de leitura em funcionamento', description: 'Acervo e mediadores formados.', deliveredOn: daysAgo(3),
          recipient: 'Dona Maria Souza, coordenadora do clube', evidenceId: evidence.body.evidence.id,
        },
        {
          item: 'Acervo de 120 livros', deliveredOn: daysAgo(2), recipient: 'Biblioteca comunitária do Recreio', recipientPublic: true,
        },
      ]) {
        const registered = await call('POST', `/demands/mine/${id}/deliveries`, { body: delivery });
        assert.equal(registered.status, 201, JSON.stringify(registered.body));
      }

      // ── Prestação de contas concluída ─────────────────────────────────────
      assert.equal((await call('PUT', `/demands/mine/${id}/accountability`, {
        body: {
          executionReport: 'Doze encontros de leitura com 40 participantes.',
          actionsRecord: 'Encontros semanais no centro comunitário.',
          scheduleSummary: 'Todas as etapas cumpridas no prazo.',
          beneficiariesReached: 40,
          impactIndicators: 'Empréstimo de livros dobrou.',
          participants: 'Mediadores de leitura voluntários.',
          finalResult: 'Clube de leitura mantido pelos participantes.',
        },
      })).status, 200);
      const [goalId] = (await call('GET', `/demands/mine/${id}`)).body.goals.map((g) => g.id);
      assert.equal((await call('PUT', `/demands/mine/${id}/accountability/results/${goalId}`, {
        body: { measuredValue: '40 participantes', measurementMethod: 'Lista de presença', achieved: true },
      })).status, 200);
      const concluded = await call('POST', `/demands/mine/${id}/accountability/conclude`);
      assert.equal(concluded.status, 200, JSON.stringify(concluded.body));

      // ── Sem registro final: 422 por campo ─────────────────────────────────
      const missing = await call('POST', `/demands/${id}/transitions`, { body: { action: 'encerrar' } });
      assert.equal(missing.status, 422);
      assert.ok(missing.body.fields.closingSummary);
      assert.ok(missing.body.fields.closingResponsibles);

      // ── Encerramento ──────────────────────────────────────────────────────
      const closed = await call('POST', `/demands/${id}/transitions`, {
        body: {
          action: 'encerrar',
          closingSummary: 'Clube de leitura entregue à comunidade; prestação de contas publicada.',
          closingResponsibles: 'Associação Recreio Vivo — coordenação do projeto',
        },
      });
      assert.equal(closed.status, 200, JSON.stringify(closed.body));
      assert.equal(closed.body.status, 'encerrada');
      assert.ok(closed.body.closedAt, 'data de conclusão gravada pelo banco');
      assert.equal(closed.body.closingResponsibles, 'Associação Recreio Vivo — coordenação do projeto');
      assert.deepEqual(closed.body.availableActions, []);

      // Processos no status final adequado, com o evento de cada mudança.
      const { rows: processes } = await pool.query(
        `SELECT id, status::text AS status, closed_at, status_note FROM connection_processes
          WHERE demand_id = $1 ORDER BY sequence_in_demand`, [id],
      );
      assert.deepEqual(processes.map((p) => [p.id, p.status]), [
        [partnerProcess.id, 'prestacao_de_contas'], [govProcess.id, 'cancelada'],
      ]);
      assert.ok(processes.every((p) => p.closed_at && /§22/.test(p.status_note)));
      const { rows: [track] } = await pool.query(
        'SELECT status::text AS status FROM demand_institutional_tracks WHERE organization_id = $1', [ORG_GOV],
      );
      assert.equal(track.status, 'cancelada', 'o acompanhamento do órgão espelha o processo');

      // Linha do tempo pública: `demanda_encerrada` com data e registro final,
      // sem os responsáveis.
      const timeline = await call('GET', `/demands/${id}/timeline`, { auth: false });
      const event = timeline.body.events.find((e) => e.type === 'demanda_encerrada');
      assert.ok(event, 'evento público do encerramento');
      assert.equal(event.toStatus, 'encerrada');
      assert.equal(event.details.closingSummary, 'Clube de leitura entregue à comunidade; prestação de contas publicada.');
      assert.ok(event.details.closedAt);
      assert.equal(JSON.stringify(timeline.body).includes('coordenação do projeto'), false);
      assert.equal(timeline.body.events.filter((e) => e.type === 'status_alterado' && e.toStatus === 'encerrada').length, 0);

      // Página pública: permanece no histórico, sem os responsáveis.
      const pub = await call('GET', `/demands/${id}`, { auth: false });
      assert.equal(pub.status, 200);
      assert.equal(pub.body.status, 'encerrada');
      assert.ok(pub.body.closedAt);
      assert.equal(pub.body.closingResponsibles, undefined);
      const list = await call('GET', '/demands?status=encerrada', { auth: false });
      assert.deepEqual(list.body.demands.map((d) => d.id), [id]);

      // Aviso às partes (Parceiro e órgão), nunca ao próprio Agente.
      const { rows: notices } = await pool.query(
        `SELECT user_id, organization_id, kind FROM notifications
          WHERE demand_id = $1 AND title = 'Demanda encerrada' ORDER BY created_at`, [id],
      );
      assert.equal(notices.length, 2);
      assert.ok(notices.some((n) => n.user_id === PARTNER));
      assert.ok(notices.some((n) => n.organization_id === ORG_GOV));
      assert.ok(notices.every((n) => n.kind === 'atualizacao_de_processo' && n.user_id !== AGENT));

      // Dossiê: versão nova `encerramento` (integral e pública), sem bucket.
      await dossiers.request(id);
      const { rows: versions } = await pool.query(
        `SELECT version, variant, trigger_kind, snapshot FROM demand_dossiers
          WHERE demand_id = $1 AND trigger_kind = 'encerramento' ORDER BY variant`, [id],
      );
      assert.deepEqual(versions.map((v) => v.variant), ['integral', 'publica']);
      const { rows: [{ max }] } = await pool.query('SELECT max(version) AS max FROM demand_dossiers WHERE demand_id = $1', [id]);
      assert.equal(Number(versions[0].version), Number(max), 'é a última versão');
      assert.equal(versions[0].snapshot.closure.responsibles, 'Associação Recreio Vivo — coordenação do projeto');
      // O retrato do encerramento já carrega o que a execução registrou (§22), sem arquivo.
      const frozen = versions[0].snapshot.execution;
      assert.deepEqual(frozen.deliveries.map((d) => d.item), ['Clube de leitura em funcionamento', 'Acervo de 120 livros']);
      assert.deepEqual(frozen.evidences.map((e) => [e.milestone, e.mediaKind, e.caption]), [['acompanhamento', 'foto', 'Encontro de leitura']]);
      assert.deepEqual(frozen.documents.map((d) => [d.kind, d.title]), [['certificado', 'Certificado do mediador']]);
      assert.equal(JSON.stringify(frozen).includes('upload:'), false);

      // Com armazenamento, a geração monta o conteúdo das duas versões: o integral guarda o recebedor; o
      // público só o que o Agente autorizou, sem a descrição do documento e sem nenhuma referência de arquivo.
      const storage = memoryStorage();
      const withStorage = createDossierService({ pool, storage, fetchInstitution: async () => null, logger, backoffSeconds: 0 });
      const generated = await withStorage.processPending({ demandId: id, force: true });
      assert.equal(generated.failed, 0);
      const { rows: closedVersions } = await pool.query(
        `SELECT variant, status, content, object_key FROM demand_dossiers
          WHERE demand_id = $1 AND trigger_kind = 'encerramento' ORDER BY variant`, [id],
      );
      assert.deepEqual(closedVersions.map((v) => [v.variant, v.status]), [['integral', 'gerado'], ['publica', 'gerado']]);
      assert.ok(closedVersions.every((v) => storage.objects.has(v.object_key)), 'o PDF de cada versão foi gravado');
      const [integralContent, publicContent] = closedVersions.map((v) => v.content);
      for (const c of [integralContent, publicContent]) {
        assert.equal(c.execution.deliveries.length, 2);
        assert.deepEqual(c.execution.evidences.map((e) => e.caption), ['Encontro de leitura']);
        assert.deepEqual(c.execution.documents.map((d) => d.title), ['Certificado do mediador']);
        assert.equal(c.execution.deliveries[0].evidence.mediaKind, 'foto');
      }
      assert.equal(integralContent.execution.deliveries[0].recipient, 'Dona Maria Souza, coordenadora do clube');
      assert.equal(integralContent.execution.documents[0].description, 'Certificado interno da formação');
      assert.equal(publicContent.execution.deliveries[0].recipient, null);
      assert.equal(publicContent.execution.deliveries[1].recipient, 'Biblioteca comunitária do Recreio');
      assert.equal(publicContent.execution.documents[0].description, null);
      const publicJson = JSON.stringify(publicContent);
      assert.equal(publicJson.includes('Dona Maria Souza'), false);
      assert.equal(publicJson.includes('Certificado interno'), false);
      assert.equal(publicJson.includes('upload:'), false);

      // Encerrada é final para o Agente; o registro final não muda.
      assert.equal((await call('POST', `/demands/${id}/transitions`, { body: { action: 'encerrar' } })).status, 409);
      await assert.rejects(
        pool.query("UPDATE demands SET closing_summary = 'outro' WHERE id = $1", [id]),
        /registro final/,
      );
      await assert.rejects(
        gestao.query("UPDATE demands SET status = 'prestacao_de_contas', reviewed_by = 'Equipe' WHERE id = $1", [id]),
        /transição não permitida/,
      );
    } finally {
      dossiers.stop?.();
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
