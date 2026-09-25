// Inteligência artificial (T23) contra um PostgreSQL de verdade: a sugestão é
// gravada marcada como IA, o desfecho humano é o único campo que muda, o
// registro de uso é somente acréscimo, a demanda **não** é alterada e a gestão
// (papel `gestao_app`, com o grant do dm-infra db/migrations/gestao/022) só lê.
//
// O cliente do modelo é um duplo: **nenhum teste chama a API do Claude**.
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
const { createAiService } = require('../src/ai/service');
const { readAiConfig } = require('../src/ai/config');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OUTRO_AGENTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG = '88888888-8888-4888-8888-888888888888';

const token = (userId, role = 'agent', profileType = 'ong') => jwt.sign(
  { userId, role, profileType, name: 'Ana Agente' }, SECRET,
);

const institutionStatus = async () => ({
  kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG,
});

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

/** Cliente de modelo duplo: guarda o prompt e responde o combinado. */
function fakeModel() {
  const seen = [];
  let next = null;
  return {
    seen,
    reply(value) { next = value; },
    client: {
      model: 'claude-opus-5',
      async complete(prompt) {
        seen.push(prompt);
        if (next instanceof Error) throw next;
        return {
          value: next,
          model: 'claude-opus-5',
          latencyMs: 9,
          usage: { inputTokens: 120, outputTokens: 60 },
        };
      },
    },
  };
}

test('sugestões de IA: gravadas como sugestão, revisadas por pessoa, uso append-only, gestão só lê',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    // O deploy reaplica o manifesto inteiro: tudo tem de ser idempotente.
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grant do dm-infra (db/migrations/gestao/022): a gestão vê as sugestões.
    await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await admin.query('GRANT SELECT ON ai_suggestions, ai_usage_log TO gestao_app');
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const model = fakeModel();
    const ai = createAiService({
      pool,
      config: readAiConfig({ DM_AI_ENABLED: 'true', ANTHROPIC_API_KEY: 'chave-de-teste' }),
      model: model.client,
    });
    const server = createApp({
      pool, ai, secret: SECRET, institutionStatus, operationUserIds: new Set(),
      uploadStorage: null, dossierService: null, rankings: null,
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

    try {
      const created = await call('POST', '/demands', {
        body: {
          category: 'problema_urbano',
          title: 'Quadra sem iluminação',
          description: 'A quadra está às escuras. Falar com Ana no (21) 99999-8888 ou ana@exemplo.com.',
          objective: 'Reinstalar a iluminação', justification: 'Risco de acidente à noite',
          beneficiariesEstimate: 300, beneficiariesProfile: 'Crianças e jovens', priority: 'media',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          photoRef: 'https://example.org/quadra.jpg', cep: '24210-000', street: 'Rua das Flores',
          addressNumber: '100', district: 'Centro', municipality: 'Niterói', uf: 'RJ',
          latitude: -22.9, longitude: -43.1, territory: 'Centro',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const demandId = created.body.id;
      assert.equal((await call('POST', `/demands/${demandId}/resources`, {
        body: { kind: 'necessario', type: 'materiais' },
      })).status, 201);

      // ── Detecção de urgência ─────────────────────────────────────────────
      model.reply({
        prioridade: 'urgente', sinais: ['quadra às escuras'], confianca: 'alta',
        justificativa: 'Há risco de acidente enquanto a iluminação não volta.',
      });
      const urgencia = await call('POST', `/demands/${demandId}/ai/urgency`);
      assert.equal(urgencia.status, 200, JSON.stringify(urgencia.body));
      assert.equal(urgencia.body.available, true);
      assert.equal(urgencia.body.label, 'Sugestão de IA');
      const suggestionId = urgencia.body.suggestion.id;
      assert.equal(urgencia.body.suggestion.status, 'sugerida');
      assert.equal(urgencia.body.suggestion.aiGenerated, true);

      // O que foi enviado ao modelo não tem dado pessoal nem endereço fino.
      const enviado = JSON.stringify(model.seen);
      for (const proibido of ['Ana Agente', 'ana@exemplo.com', '99999-8888', 'Rua das Flores',
        '24210-000', AGENT, demandId]) {
        assert.ok(!enviado.includes(proibido), `vazou para o modelo: ${proibido}`);
      }

      // ── A demanda continua intacta: a IA não altera dado ─────────────────
      const demanda = await pool.query('SELECT priority, category, territory FROM demands WHERE id = $1', [demandId]);
      assert.equal(demanda.rows[0].priority, 'media', 'a prioridade da demanda não mudou');

      // ── Sugestão imutável; só o desfecho humano muda ─────────────────────
      await assert.rejects(
        () => pool.query("UPDATE ai_suggestions SET rationale = 'outro' WHERE id = $1", [suggestionId]),
        /não muda/,
      );
      await assert.rejects(
        () => pool.query('DELETE FROM ai_suggestions WHERE id = $1', [suggestionId]),
        /não é excluída/,
      );

      // Só o autor revisa.
      assert.equal((await call('POST', `/demands/${demandId}/ai/suggestions/${suggestionId}/review`, {
        as: OUTRO_AGENTE, body: { status: 'aceita' },
      })).status, 404);

      const revisada = await call('POST', `/demands/${demandId}/ai/suggestions/${suggestionId}/review`, {
        body: { status: 'aceita', note: 'confere com o que vimos no local' },
      });
      assert.equal(revisada.status, 200, JSON.stringify(revisada.body));
      assert.equal(revisada.body.suggestion.status, 'aceita');
      assert.equal(revisada.body.applied, false, 'aceitar não altera a demanda');
      assert.equal(
        (await pool.query('SELECT priority FROM demands WHERE id = $1', [demandId])).rows[0].priority,
        'media',
        'nem depois de aceita',
      );
      // Revisar duas vezes não passa.
      assert.equal((await call('POST', `/demands/${demandId}/ai/suggestions/${suggestionId}/review`, {
        body: { status: 'ignorada' },
      })).status, 409);

      // ── Registro de uso: somente acréscimo ───────────────────────────────
      const usos = await pool.query(
        'SELECT outcome::text AS outcome, model, latency_ms, input_tokens FROM ai_usage_log ORDER BY created_at',
      );
      assert.equal(usos.rows.length, 1);
      assert.equal(usos.rows[0].outcome, 'sucesso');
      assert.equal(usos.rows[0].model, 'claude-opus-5');
      assert.equal(usos.rows[0].input_tokens, 120);
      await assert.rejects(
        () => pool.query("UPDATE ai_usage_log SET outcome = 'erro'"), /somente acréscimo/,
      );
      await assert.rejects(() => pool.query('DELETE FROM ai_usage_log'), /somente acréscimo/);

      // ── Falha do modelo: o fluxo segue e a tentativa fica registrada ─────
      model.reply(Object.assign(new Error('provedor fora'), { code: 'indisponivel' }));
      const falha = await call('POST', `/demands/${demandId}/ai/organization`);
      assert.equal(falha.status, 200, 'sem IA o fluxo segue');
      assert.equal(falha.body.available, false);
      assert.equal(falha.body.reason, 'erro');
      assert.equal(
        (await pool.query("SELECT count(*)::int AS n FROM ai_usage_log WHERE outcome = 'erro'")).rows[0].n, 1,
      );

      // ── Editais e patrocinadores sem base: em desenvolvimento, sem invenção ─
      const editais = await call('POST', `/demands/${demandId}/ai/editais`);
      assert.equal(editais.body.reason, 'sem_base');
      assert.equal(editais.body.stage, 'em_desenvolvimento');
      const parceiros = await call('POST', `/demands/${demandId}/ai/partners`);
      assert.equal(parceiros.body.reason, 'sem_base');

      // ── Listagem para o Agente ───────────────────────────────────────────
      const lista = await call('GET', `/demands/${demandId}/ai/suggestions`);
      assert.equal(lista.body.suggestions.length, 1);
      assert.equal(lista.body.suggestions[0].status, 'aceita');
      assert.equal(lista.body.suggestions[0].label, 'Sugestão de IA');
      assert.equal((await call('GET', `/demands/${demandId}/ai/suggestions`, { as: OUTRO_AGENTE })).status, 404);

      // ── A gestão só lê ───────────────────────────────────────────────────
      const daGestao = await gestao.query('SELECT status::text AS status FROM ai_suggestions');
      assert.equal(daGestao.rows[0].status, 'aceita');
      assert.equal((await gestao.query('SELECT count(*)::int AS n FROM ai_usage_log')).rows[0].n, 2);
      await assert.rejects(
        () => gestao.query("UPDATE ai_suggestions SET status = 'ignorada'"), /gestão só lê|permission denied/,
      );
      await assert.rejects(
        () => gestao.query(
          "INSERT INTO ai_usage_log (kind, outcome) VALUES ('deteccao_de_urgencia', 'sucesso')",
        ),
        /gestão só lê|permission denied/,
      );
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
