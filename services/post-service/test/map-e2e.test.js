// Mapa inteligente (T20) contra um PostgreSQL de verdade: legenda por
// categoria, filtros, recorte por bbox, agrupamento em células, agregação por
// território e os índices da migração 016.
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
const { CLUSTER_THRESHOLD } = require('../src/map/constants');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';

const token = () => jwt.sign({ userId: AGENT, role: 'agent', profileType: 'associacao', name: 'Associação Recreio Vivo' }, SECRET);

async function institutionStatus() {
  return {
    kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT,
  };
}

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('mapa inteligente: legenda, filtros, bbox, agrupamento e territórios',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    try {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
      // Grants do dm-infra: a publicação da demanda é da gestão (decisão 2).
      await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
      await admin.query('GRANT SELECT ON demands, demand_events, posts TO gestao_app');
      await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                           ON demands TO gestao_app`);
    } catch (err) {
      admin.release();
      await pool.end();
      throw err;
    }
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
    const call = async (method, url, { body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token()}`;
      const res = await fetch(`${base}${url}`, {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    /** Rascunho completo o bastante para enviar, depois publicado pela gestão. */
    async function publishedDemand(fieldsOverride) {
      const created = await call('POST', '/demands', {
        body: {
          category: 'problema_urbano',
          title: 'Demanda',
          description: 'Descrição da demanda.',
          objective: 'Resolver.',
          justification: 'Necessário.',
          beneficiariesEstimate: 100,
          beneficiariesProfile: 'Moradores',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          priority: 'alta',
          photoRef: 'https://example.org/foto.jpg',
          cep: '22790-000',
          street: 'Rua A',
          addressNumber: '10',
          district: 'Recreio',
          municipality: 'Rio de Janeiro',
          uf: 'RJ',
          latitude: -23.02,
          longitude: -43.45,
          territory: 'Recreio dos Bandeirantes',
          hasPhysicalExecution: false,
          ...fieldsOverride,
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        body: { stage: 'Etapa', activities: 'Atividades', startsOn: '2026-10-01', endsOn: '2026-11-30' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Item', quantity: 1, unit: 'un', unitPriceCents: 100000 },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`)).status, 200);
      await gestao.query(
        "UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id],
      );
      return id;
    }

    try {
      // Uma demanda por classe da legenda, em dois territórios.
      const urgente = await publishedDemand({
        category: 'problema_urgente', title: 'Barreira com risco de deslizamento', priority: 'urgente',
        latitude: -23.02, longitude: -43.45,
      });
      await publishedDemand({ category: 'problema_urbano', title: 'Buraco na via', priority: 'media' });
      await publishedDemand({
        category: 'projeto_social', title: 'Aulas de esporte', priority: 'baixa',
        territory: 'Vila Kennedy', municipality: 'Rio de Janeiro', district: 'Bangu',
        latitude: -22.87, longitude: -43.37,
      });
      // Recuperação ambiental (Modelo §03, migração 031) cai em "Ações ambientais".
      const ambiental = await publishedDemand({
        category: 'recuperacao_ambiental', title: 'Recuperação do manguezal', priority: 'media',
        territory: 'Vila Kennedy', latitude: -22.88, longitude: -43.38,
        moduleDetails: { area_m2: 1500, responsavel_tecnico: { nome: 'Responsável', registro: 'CRBio 1' } },
      });

      await publishedDemand({
        category: 'necessidade_de_patrocinio', title: 'Patrocínio de uniformes', priority: 'alta',
        latitude: -23.03, longitude: -43.46,
      });
      // Demanda ainda em análise: nunca aparece no mapa público.
      const created = await call('POST', '/demands', {
        body: { category: 'problema_urbano', title: 'Rascunho', latitude: -23.02, longitude: -43.45 },
      });
      assert.equal(created.status, 201);

      // ── Legenda e atalhos ────────────────────────────────────────────────
      const legend = await call('GET', '/demands/map/legend', { auth: false });
      assert.equal(legend.status, 200);
      assert.equal(legend.body.legend.length, 5);

      // ── Pontos, contagens e sigilo ───────────────────────────────────────
      const all = await call('GET', '/demands/map', { auth: false });
      assert.equal(all.status, 200);
      assert.equal(all.body.mode, 'points');
      assert.equal(all.body.counts.total, 5, 'demanda em análise fora do mapa');
      assert.equal(all.body.points.length, 5);
      assert.equal(all.body.counts.category.problema_urgente, 1);
      assert.equal(all.body.counts.priority.urgente, 1);
      assert.equal(all.body.counts.status.publicada, 5);
      const ponto = all.body.points.find((p) => p.id === urgente);
      assert.equal(ponto.category, 'problema_urgente');
      assert.equal(ponto.territory, 'Recreio dos Bandeirantes');
      // Projeção pública: nada de autor, CEP, rua, número ou orçamento.
      for (const key of ['authorId', 'authorName', 'cep', 'street', 'addressNumber', 'budgetAmountCents']) {
        assert.equal(ponto[key], undefined, `${key} não sai no mapa público`);
      }

      // ── Filtros ──────────────────────────────────────────────────────────
      const urgentes = await call('GET', '/demands/map?category=problema_urgente&priority=urgente', { auth: false });
      assert.equal(urgentes.body.counts.total, 1);
      assert.equal(urgentes.body.points[0].id, urgente);

      const patrocinio = await call('GET', '/demands/map?category=necessidade_de_patrocinio,projeto_social', { auth: false });
      assert.equal(patrocinio.body.counts.total, 2);

      const territorio = await call('GET', '/demands/map?territory=Vila%20Kennedy', { auth: false });
      assert.equal(territorio.body.counts.total, 2);

      const uf = await call('GET', '/demands/map?uf=SP', { auth: false });
      assert.equal(uf.body.counts.total, 0);

      const periodo = await call('GET', '/demands/map?from=2000-01-01&to=2000-01-02', { auth: false });
      assert.equal(periodo.body.counts.total, 0, 'período antigo não traz demanda publicada hoje');

      // ── bbox ─────────────────────────────────────────────────────────────
      const recreio = await call('GET', '/demands/map?bbox=-43.5,-23.1,-43.4,-23.0', { auth: false });
      assert.equal(recreio.body.counts.total, 3, 'só os pontos do Recreio');
      const fora = await call('GET', '/demands/map?bbox=-40,-10,-39,-9', { auth: false });
      assert.equal(fora.body.counts.total, 0);

      // ── Teto de pontos: a contagem continua completa e `truncated` avisa ─
      assert.ok(CLUSTER_THRESHOLD >= 1);
      const comTeto = await call('GET', '/demands/map?zoom=8&limit=1', { auth: false });
      assert.equal(comTeto.body.mode, 'points', 'abaixo do limiar de agrupamento');
      assert.equal(comTeto.body.points.length, 1);
      assert.equal(comTeto.body.counts.total, 5);
      assert.equal(comTeto.body.truncated, true);

      // ── Territórios ──────────────────────────────────────────────────────
      const territorios = await call('GET', '/demands/map/territories', { auth: false });
      assert.equal(territorios.status, 200);
      const nomes = territorios.body.territories.map((t) => t.territory).sort();
      assert.deepEqual(nomes, ['Recreio dos Bandeirantes', 'Vila Kennedy']);
      const vila = territorios.body.territories.find((t) => t.territory === 'Vila Kennedy');
      assert.equal(vila.total, 2);
      assert.equal(vila.uf, 'RJ');
      assert.equal(vila.slug, 'vila-kennedy-rio-de-janeiro-rj');
      assert.equal(vila.category.projeto_social, 1);
      assert.equal(vila.category.recuperacao_ambiental, 1);
      assert.equal(vila.mapClass.acoes_ambientais, 1);

      // ── 12 tipos (T-05-07) e módulo (T-05-08) ────────────────────────────
      assert.deepEqual(legend.body.legend.find((l) => l.id === 'acoes_ambientais').categories,
        ['projeto_ambiental', 'recuperacao_ambiental']);
      const pontoAmbiental = all.body.points.find((p) => p.id === ambiental);
      assert.equal(pontoAmbiental.mapClass, 'acoes_ambientais');
      assert.equal(all.body.counts.mapClass.acoes_ambientais, 1);
      const { rows: [vitrine] } = await pool.query('SELECT type::text AS type FROM posts WHERE demand_id = $1', [ambiental]);
      assert.equal(vitrine.type, 'project');
      const { rows: [fn] } = await pool.query(
        `SELECT demand_post_type('apoio_com_materiais') AS apoio, demand_post_type('outras_demandas_territoriais') AS outras,
                demand_map_class('recuperacao_ambiental') AS classe, demand_module('recuperacao_ambiental') AS modulo`,
      );
      assert.deepEqual(fn, { apoio: 'need', outras: 'problem', classe: 'acoes_ambientais', modulo: 'ambiental' });
      const publica = await call('GET', `/demands/${ambiental}`, { auth: false });
      assert.equal(publica.body.module, 'ambiental');
      assert.equal(publica.body.moduleLabel, 'Módulo Ambiental');
      assert.deepEqual(publica.body.moduleDetails.responsavel_tecnico, { nome: 'Responsável', registro: 'CRBio 1' });

      // ── Índices da migração 016 ──────────────────────────────────────────
      const { rows: idx } = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE indexname = ANY($1)",
        [['idx_demands_map_points', 'idx_demands_map_place', 'idx_posts_map_points']],
      );
      assert.equal(idx.length, 3, 'os três índices do mapa existem');

      // ── Camada de conteúdos do feed: bbox e teto ─────────────────────────
      const feed = await fetch(`${base}/map?bbox=-43.5,-23.1,-43.4,-23.0&limit=10`);
      assert.equal(feed.status, 200);
      assert.ok(Array.isArray(await feed.json()));
      const feedRuim = await fetch(`${base}/map?limit=0`);
      assert.equal(feedRuim.status, 422);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
