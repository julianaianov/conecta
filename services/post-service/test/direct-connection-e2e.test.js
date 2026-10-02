// Conexão direta pedida pelo Agente a um potencial parceiro (T30) contra um
// PostgreSQL de verdade: quem recebe aceita pelo post-service, o user-service
// (simulado com as regras de routes/connections.js) registra o aceite e nasce
// o Processo de Conexão com origem `conexao_direta` (decisão 13).
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

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'patrocinador', 'Patrocinadora Sol'],
  [OTHER]: ['partner', 'marca', 'Marca Qualquer'],
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

// user-service simulado: mesmas regras de routes/connections.js (só as partes veem; só o destinatário aceita).
const store = new Map();
const connections = {
  async create(req, input) {
    const c = {
      id: crypto.randomUUID(), type: input.type, status: 'pending', fromUserId: req.user.userId, toUserId: input.toUserId,
      demandId: input.demandId ?? null,
    };
    store.set(c.id, c);
    return { ...c };
  },
  async get(req, id) {
    const c = store.get(id);
    return c && (c.fromUserId === req.user.userId || c.toUserId === req.user.userId) ? { ...c } : null;
  },
  async update(req, id, status) {
    const c = store.get(id);
    if (!c) throw new HttpError(404, { error: 'Conexão não encontrada' });
    const ok = c.status === 'pending' && status === 'accepted' && c.toUserId === req.user.userId;
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

test('Conexão direta do Agente (T30): o aceite pela outra parte gera o Processo de Conexão',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query('GRANT SELECT ON demands, connection_processes TO gestao_app');
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
    const call = async (method, url, { as = PARTNER, body } = {}) => {
      const res = await fetch(`${base}${url}`, {
        method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token(as)}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    try {
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'problema_urbano', title: 'Quadra sem rede', description: 'Quadra sem rede: descrição.', objective: 'Resolver.',
          justification: 'Necessário.', beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores', priority: 'alta',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A', addressNumber: '10',
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
      const submitted = await call('POST', `/demands/${demand}/submit`, { as: AGENT });
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [demand]);

      // O Agente pede a conexão a um potencial parceiro (PotentialPartnersPanel → user-service).
      const asked = await connections.create({ user: { userId: AGENT } }, { toUserId: PARTNER, demandId: demand, type: 'sponsorship' });
      const accept = (cid, as) => call('POST', `/processes/connections/${cid}/accept`, { as });
      assert.equal((await accept(asked.id, OTHER)).status, 404, 'terceiro não vê a conexão');
      assert.equal((await accept(asked.id, AGENT)).body.code, 'connection_not_linked', 'quem pediu não aceita');

      const accepted = await accept(asked.id, PARTNER);
      assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
      assert.equal(accepted.body.connection.status, 'accepted', 'o user-service registrou o aceite');
      const processRef = accepted.body.process;
      assert.equal(processRef.partyKind, 'patrocinador');
      const { rows: [row] } = await pool.query(
        `SELECT origin_kind::text AS origin_kind, origin_connection_id, contribution_kinds::text[] AS kinds, formalized_by_kind
           FROM connection_processes WHERE id = $1`, [processRef.id],
      );
      assert.deepEqual(row, { origin_kind: 'conexao_direta', origin_connection_id: asked.id, kinds: ['patrocinio'], formalized_by_kind: 'parte' });
      assert.equal((await pool.query('SELECT status::text AS s FROM demands WHERE id = $1', [demand])).rows[0].s, 'conectada');
      const again = await accept(asked.id, PARTNER);
      assert.equal(again.status, 200, 'idempotente');
      assert.equal(again.body.process.id, processRef.id);
      const byConnection = await call('GET', `/processes/by-connection/${asked.id}`, { as: AGENT });
      assert.equal(byConnection.body.process.protocol, processRef.protocol, 'o Agente acha o processo pela conexão');

      // Conexão com demanda de outro autor: não é conexão direta do autor.
      const foreign = await connections.create({ user: { userId: OTHER } }, { toUserId: PARTNER, demandId: demand, type: 'support' });
      assert.equal((await accept(foreign.id, PARTNER)).body.code, 'connection_not_linked');

      // Órgão do Poder Público: a parte é o órgão, com o nome da identificação pública.
      const toGov = await connections.create({ user: { userId: AGENT } }, { toUserId: GOV, demandId: demand, type: 'partnership' });
      const govAccepted = await accept(toGov.id, GOV);
      assert.equal(govAccepted.status, 201, JSON.stringify(govAccepted.body));
      assert.equal(govAccepted.body.process.partyKind, 'poder_publico');
      assert.equal(govAccepted.body.process.partyName, 'Secretaria Municipal de Obras');
      const pub = await fetch(`${base}/demands/${demand}/processes`).then((r) => r.json());
      assert.deepEqual(pub.processes.map((p) => p.partyKind), ['patrocinador', 'poder_publico']);

      // Direto no banco: conexão direta sem conexão de origem é recusada.
      await assert.rejects(pool.query(
        `INSERT INTO connection_processes (demand_id, party_kind, party_user_id, party_name, origin_kind, formalized_by,
                                           formalized_by_kind, protocol, sequence_in_demand)
         VALUES ($1, 'marca', $2, 'x', 'conexao_direta', $2, 'parte', 'DM-2026-000099', 9)`, [demand, OTHER]),
      /connection_processes_origin/);
    } finally {
      server.close();
      await gestao.end();
      await pool.end();
    }
  });
