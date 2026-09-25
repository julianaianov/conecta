// Respostas à análise (T-05-05; Modelo de Conexão §10 e §12) contra um
// PostgreSQL de verdade: Parceiro solicita documentos → Agente vê, responde
// com um documento e `solicitacao_respondida` entra na linha do tempo; recusa
// sem motivo é 422; o Poder Público pede pela resposta institucional (espelho)
// e a recusa leva o acompanhamento a Não aprovada.
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
const PARTNER = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [MEMBER]: ['member', 'morador', 'Moradora'],
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

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('Respostas à análise: solicitação do Parceiro, resposta com documento, espelho do Poder Público e recusa',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/007, 009 e 027).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_events, demand_documents, demand_institutional_tracks,
                         demand_institutional_responses, demand_analysis_requests TO gestao_app`);
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: null,
      partnerProfile: { get: async () => null, match: async () => [] }, governmentProfile,
      connections: { create: async () => null, get: async () => null, update: async () => null },
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = PARTNER, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };
    const notificationsOf = async (column, id, kind) => (await pool.query(
      `SELECT kind, title, href FROM notifications WHERE ${column} = $1 AND kind = $2 ORDER BY created_at`, [id, kind],
    )).rows;

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
        as: AGENT, body: { stage: 'Execução', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 100000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { as: AGENT, body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      const doc = await call('POST', `/demands/${id}/documents`, {
        as: AGENT, body: { type: 'projetos_tecnicos', title: 'Projeto técnico', reference: 'https://example.org/projeto.pdf' },
      });
      assert.equal(doc.status, 201, JSON.stringify(doc.body));
      const submitted = await call('POST', `/demands/${id}/submit`, { as: AGENT });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return { id, documentId: doc.body.item.id };
    }

    try {
      const { id: demand, documentId } = await publishedDemand('Praça sem iluminação');
      const { documentId: otherDocument } = await publishedDemand('Outra demanda');
      const url = `/demands/${demand}/analysis-requests`;

      // ── 1. Parceiro solicita documentos ──────────────────────────────────
      assert.equal((await call('POST', url, { as: MEMBER, body: { kind: 'reuniao', body: 'x' } })).status, 403);
      assert.equal((await call('POST', url, { as: AGENT, body: { kind: 'reuniao', body: 'x' } })).status, 403, 'o autor não pede');
      const requested = await call('POST', url, {
        body: { kind: 'documentos', body: 'Envie o projeto técnico da iluminação.', requestedDocumentTypes: ['projetos_tecnicos'] },
      });
      assert.equal(requested.status, 201, JSON.stringify(requested.body));
      assert.equal(requested.body.request.status, 'aberta');
      const agentNotice = await notificationsOf('user_id', AGENT, 'solicitacao_de_analise');
      assert.equal(agentNotice.length, 1, '"Solicitação de análise" ao Agente (§08)');
      assert.equal(agentNotice[0].href, `/minhas-demandas#demanda-${demand}`);

      // Recusa sem motivo: 422.
      const noReason = await call('POST', url, { body: { kind: 'recusa' } });
      assert.equal(noReason.status, 422);
      assert.ok(noReason.body.fields.body);

      // ── 2. Agente vê e responde com um documento ────────────────────────
      const inbox = await call('GET', `/demands/mine/${demand}/analysis-requests`, { as: AGENT });
      assert.equal(inbox.status, 200);
      assert.equal(inbox.body.open, 1);
      assert.equal(inbox.body.requests[0].requesterName, 'Construtora Horizonte');
      assert.deepEqual(inbox.body.requests[0].requestedDocumentTypes, ['projetos_tecnicos']);
      const requestId = requested.body.request.id;
      const answerUrl = `/demands/mine/${demand}/analysis-requests/${requestId}/answer`;
      const wrongDoc = await call('POST', answerUrl, { as: AGENT, body: { body: 'Segue', documentIds: [otherDocument] } });
      assert.equal(wrongDoc.status, 422, 'documento de outra demanda');
      const answered = await call('POST', answerUrl, { as: AGENT, body: { body: 'Segue o projeto técnico.', documentIds: [documentId] } });
      assert.equal(answered.status, 200, JSON.stringify(answered.body));
      assert.equal(answered.body.request.status, 'respondida');
      assert.equal(answered.body.request.answerDocuments[0].title, 'Projeto técnico');
      assert.equal((await call('POST', answerUrl, { as: AGENT, body: { body: 'De novo' } })).body.code, 'request_closed');
      assert.equal((await notificationsOf('user_id', PARTNER, 'atualizacao_de_processo')).length, 1, 'quem pediu é avisado');
      const mine = await call('GET', `${url}/mine`);
      assert.equal(mine.body.requests[0].answerBody, 'Segue o projeto técnico.');

      const timeline = await call('GET', `/demands/${demand}/timeline`, { auth: false });
      const types = timeline.body.events.map((e) => e.type);
      assert.ok(types.includes('solicitacao_registrada'));
      assert.ok(types.includes('solicitacao_respondida'), 'a resposta entra na linha do tempo');
      assert.ok(!JSON.stringify(timeline.body).includes('Construtora'), 'sem nome de quem pediu');

      // ── 3. Poder Público: resposta institucional com espelho ────────────
      const meeting = await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV, body: { type: 'solicitacao_de_reuniao', body: 'Vistoria no local.', meetingMode: 'presencial', meetingProposedAt: '2030-01-10T10:00' },
      });
      assert.equal(meeting.status, 201, JSON.stringify(meeting.body));
      const meetingResponse = meeting.body.responses.find((r) => r.type === 'solicitacao_de_reuniao');
      assert.equal(meetingResponse.meetingMode, 'presencial');
      const govNoReason = await call('POST', `/institutional/demands/${demand}/responses`, { as: GOV, body: { type: 'recusa_com_motivo' } });
      assert.equal(govNoReason.status, 422);
      assert.ok(govNoReason.body.fields.refusalReason);
      const refused = await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV, body: { type: 'recusa_com_motivo', refusalReason: 'Fora do orçamento do exercício.' },
      });
      assert.equal(refused.status, 201, JSON.stringify(refused.body));
      assert.equal(refused.body.track.status, 'nao_aprovada', 'a recusa leva o acompanhamento a Não aprovada');
      const withMirror = await call('GET', `/demands/mine/${demand}/analysis-requests`, { as: AGENT });
      const mirrored = withMirror.body.requests.filter((r) => r.fromInstitutionalResponse);
      assert.deepEqual(mirrored.map((r) => [r.kind, r.status]).sort(), [['recusa', 'encerrada'], ['reuniao', 'aberta']]);
      assert.equal(mirrored[0].requesterName, 'Secretaria Municipal de Obras');
      const govMine = await call('GET', `${url}/mine`, { as: GOV });
      assert.equal(govMine.body.requests.length, 2);
      const meetingRequest = mirrored.find((r) => r.kind === 'reuniao');
      const meetingAnswer = await call('POST', `/demands/mine/${demand}/analysis-requests/${meetingRequest.id}/answer`, {
        as: AGENT, body: { body: 'Disponível na data.' },
      });
      assert.equal(meetingAnswer.status, 200, JSON.stringify(meetingAnswer.body));
      assert.equal((await notificationsOf('organization_id', ORG_GOV, 'atualizacao_de_processo')).length, 1, 'o órgão é avisado');

      // ── 4. Recusa do Parceiro: encerrada, uma só ─────────────────────────
      const partnerRefusal = await call('POST', url, { body: { kind: 'recusa', body: 'Não atuamos nesta região.' } });
      assert.equal(partnerRefusal.status, 201, JSON.stringify(partnerRefusal.body));
      assert.equal(partnerRefusal.body.request.status, 'encerrada');
      assert.equal((await call('POST', url, { body: { kind: 'recusa', body: 'De novo.' } })).body.code, 'refusal_exists');

      // ── 5. Nada é excluído; gestão só lê ─────────────────────────────────
      await assert.rejects(pool.query('DELETE FROM demand_analysis_requests WHERE id = $1', [requestId]), /não são excluídas/);
      await assert.rejects(pool.query("UPDATE demand_analysis_requests SET body = 'x' WHERE id = $1", [requestId]), /não muda/);
      assert.equal((await gestao.query('SELECT count(*)::int AS n FROM demand_analysis_requests')).rows[0].n, 4);
      await assert.rejects(gestao.query("UPDATE demand_analysis_requests SET status = 'encerrada'"));
    } finally {
      server.close();
      await gestao.end();
      await pool.end();
    }
  });
