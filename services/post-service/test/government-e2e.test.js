// Área de governo e gestão pública (T22) contra um PostgreSQL de verdade: os
// 10 indicadores do slide 14 calculados de dados reais, recorte por
// competência/território e período, priorização de áreas, divulgação de ações
// (feed + linha do tempo) e exportação CSV/PDF.
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
const { createIndicatorCache } = require('../src/government/cache');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const GOV = '55555555-5555-4555-8555-555555555555';
const GOV_OTHER = '66666666-6666-4666-8666-666666666666';
const ORG_AGENT = '44444444-4444-4444-8444-444444444444';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
const ORG_GOV_OTHER = '99999999-9999-4999-8999-999999999999';

const ROLES = {
  [AGENT]: ['agent', 'associacao'],
  [GOV]: ['government', 'secretaria'],
  [GOV_OTHER]: ['government', 'prefeitura'],
};
const token = (userId) => {
  const [role, profileType] = ROLES[userId];
  return jwt.sign({ userId, role, profileType, name: `Conta ${userId.slice(0, 4)}` }, SECRET);
};

async function institutionStatus(req) {
  switch (req.user.userId) {
    case AGENT: return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
    case GOV: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV };
    case GOV_OTHER: return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV_OTHER };
    default: return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
  }
}

async function governmentProfile(userId) {
  if (userId === GOV) {
    return {
      name: 'Secretaria Municipal de Obras', governmentSphere: 'municipal', department: 'Zeladoria',
      competenceAreas: ['Obras', 'Iluminação'], territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
    };
  }
  if (userId === GOV_OTHER) {
    return {
      name: 'Prefeitura de Niterói', governmentSphere: 'municipal', department: null,
      competenceAreas: ['Geral'], territory: null, municipality: 'Niterói', uf: 'RJ',
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

test('governo: indicadores reais, recorte, priorização, ações divulgadas e exportação',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    // Duas passadas: o manifesto é reaplicado a cada deploy.
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await admin.query(`GRANT SELECT ON demands, demand_events, demand_institutional_tracks,
                         demand_institutional_responses, government_actions TO gestao_app`);
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
      // Sem cache: o teste mede o efeito de cada escrita na mesma requisição.
      governmentCache: createIndicatorCache({ ttlMs: 0 }),
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = GOV, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    async function publishedDemand(overrides = {}) {
      const created = await call('POST', '/demands', {
        as: AGENT,
        body: {
          category: 'problema_urbano', title: 'Praça sem iluminação', description: 'Postes apagados há meses.',
          objective: 'Restabelecer a iluminação.', justification: 'Insegurança à noite.', beneficiariesEstimate: 500,
          beneficiariesProfile: 'Moradores', priority: 'alta', photoRef: 'https://example.org/foto.jpg',
          cep: '22790-000', street: 'Rua A', addressNumber: '10', district: 'Recreio',
          municipality: 'Rio de Janeiro', uf: 'RJ', latitude: -23.02, longitude: -43.45,
          territory: 'Zona Oeste', ...overrides,
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Troca de luminárias', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 50000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Luminárias', expectedResult: 'Praça iluminada', indicator: 'Postes ativos', measurementMethod: 'Contagem' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`, { as: AGENT })).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return id;
    }

    try {
      // Três demandas no município do órgão (uma urgente) e uma em outra UF.
      const urbana = await publishedDemand();
      const urgente = await publishedDemand({ category: 'problema_urgente', priority: 'urgente', title: 'Alagamento na via' });
      const social = await publishedDemand({ category: 'projeto_social', priority: 'media', title: 'Reforço escolar', territory: 'Centro' });
      const fora = await publishedDemand({ municipality: 'Curitiba', uf: 'PR', cep: '80010-000', title: 'Ciclovia', territory: 'Centro' });

      // ── Indicadores no recorte territorial ──────────────────────────────
      const jurisdicao = await call('GET', '/government/indicators?scope=jurisdicao&period=30d');
      assert.equal(jurisdicao.status, 200, JSON.stringify(jurisdicao.body));
      assert.equal(jurisdicao.body.indicators.demandas_recebidas, 3, 'só as do município do órgão');
      assert.equal(jurisdicao.body.indicators.demandas_urgentes, 1);
      assert.equal(jurisdicao.body.indicators.demandas_encaminhadas, 0);
      assert.equal(jurisdicao.body.indicators.demandas_concluidas, 0);
      assert.equal(jurisdicao.body.indicators.beneficiarios_alcancados, 0);
      assert.equal(jurisdicao.body.byCategory.length, 5);
      assert.equal(jurisdicao.body.byCategory.find((c) => c.category === 'problema_urbano').total, 1);
      assert.deepEqual(
        [...jurisdicao.body.byTerritory.map((t) => t.label)].sort(),
        ['Centro', 'Zona Oeste'],
      );
      assert.ok(jurisdicao.body.generatedAt);

      const todas = await call('GET', '/government/indicators?scope=todas&period=30d');
      assert.equal(todas.body.indicators.demandas_recebidas, 4, 'a de Curitiba entra em `todas`');

      const competencia = await call('GET', '/government/indicators?scope=competencia&period=30d');
      assert.equal(competencia.body.indicators.demandas_recebidas, 0, 'ainda não há atuação do órgão');

      // Recorte de período anterior à publicação não conta nada.
      const antigo = await call('GET', '/government/indicators?from=2020-01-01&to=2020-12-31');
      assert.equal(antigo.body.indicators.demandas_recebidas, 0);

      // Outro órgão, outro município: recorte independente, sem comparação.
      const outro = await call('GET', '/government/indicators?scope=jurisdicao', { as: GOV_OTHER });
      assert.equal(outro.body.indicators.demandas_recebidas, 0);

      // ── Priorização de áreas ────────────────────────────────────────────
      const prioridade = await call('GET', '/government/priority-areas?scope=jurisdicao');
      assert.equal(prioridade.status, 200);
      const zonaOeste = prioridade.body.territories.find((t) => t.label === 'Zona Oeste');
      assert.equal(zonaOeste.total, 2);
      assert.equal(zonaOeste.urgent, 1);
      assert.equal(zonaOeste.withoutResponse, 2, 'nenhuma resposta do órgão ainda');
      // A área com urgência fica na frente da que só tem volume.
      assert.equal(prioridade.body.territories[0].label, 'Zona Oeste');

      // ── Atuação do órgão muda os indicadores ────────────────────────────
      assert.equal((await call('POST', `/institutional/demands/${urgente}/track`)).status, 201);
      assert.equal((await call('POST', `/institutional/demands/${urgente}/responses`, {
        body: { type: 'analise_em_andamento', body: 'Equipe acionada para vistoria.', status: 'em_analise' },
      })).status, 201);
      assert.equal((await call('POST', `/institutional/demands/${urbana}/status`, {
        body: { status: 'encaminhada', note: 'Encaminhada à concessionária de energia.' },
      })).status, 200);

      const depois = await call('GET', '/government/indicators?scope=competencia');
      assert.equal(depois.body.indicators.demandas_recebidas, 2, 'as duas em que o órgão atuou');
      const encaminhadas = await call('GET', '/government/indicators?scope=jurisdicao');
      assert.equal(encaminhadas.body.indicators.demandas_encaminhadas, 1, 'a que o órgão marcou como encaminhada');

      const comResposta = await call('GET', '/government/priority-areas?scope=jurisdicao');
      const zo = comResposta.body.territories.find((t) => t.label === 'Zona Oeste');
      assert.equal(zo.withoutResponse, 1, 'a demanda respondida saiu da espera');

      // ── Divulgação de ações ─────────────────────────────────────────────
      const acao = await call('POST', '/government/actions', {
        body: {
          kind: 'programa', title: 'Programa Luz na Praça', summary: 'Substituição de luminárias em 12 praças.',
          programName: 'Luz na Praça', programUrl: 'https://exemplo.rj.gov.br/luz', demandId: social,
          territory: 'Centro', startsOn: '2026-10-01',
        },
      });
      assert.equal(acao.status, 201, JSON.stringify(acao.body));
      assert.equal(acao.body.demandId, social);
      assert.ok(acao.body.postId);
      assert.ok(acao.body.responseId, 'a ação vira também resposta institucional (T13)');

      // Aparece no feed como publicação `message` do órgão…
      const feed = await fetch(`${base}/`).then((r) => r.json());
      const publicacao = (Array.isArray(feed) ? feed : feed.posts ?? []).find((p) => p.id === acao.body.postId);
      assert.ok(publicacao, 'a ação aparece no feed');
      assert.equal(publicacao.type, 'message');
      assert.equal(publicacao.title, 'Programa Luz na Praça');

      // …e na linha do tempo pública da demanda.
      const timeline = await call('GET', `/demands/${social}/timeline`, { auth: false });
      const tipos = timeline.body.events.map((e) => e.type);
      assert.ok(tipos.includes('acao_institucional_divulgada'), JSON.stringify(tipos));
      assert.ok(tipos.includes('resposta_institucional'));
      const evento = timeline.body.events.find((e) => e.type === 'acao_institucional_divulgada');
      assert.equal(evento.details.actionTitle, 'Programa Luz na Praça');
      assert.equal(evento.details.organizationName, 'Secretaria Municipal de Obras');

      // Rota pública das ações da demanda, sem representante nem conta.
      const publicas = await fetch(`${base}/demands/${social}/government-actions`).then((r) => r.json());
      assert.equal(publicas.actions.length, 1);
      assert.ok(!JSON.stringify(publicas).includes(GOV));

      // Ação só do território (sem demanda) e lista do órgão.
      assert.equal((await call('POST', '/government/actions', {
        body: { kind: 'obra', title: 'Recapeamento da Av. das Américas', summary: 'Obra iniciada no trecho 3.', territory: 'Zona Oeste' },
      })).status, 201);
      const minhas = await call('GET', '/government/actions');
      assert.equal(minhas.body.actions.length, 2);

      // Guardas: demanda inexistente/não publicada e post-vitrine.
      const rascunho = await call('POST', '/demands', {
        as: AGENT,
        body: { category: 'projeto_social', title: 'Rascunho', description: 'Ainda em elaboração da proposta.' },
      });
      const recusada = await call('POST', '/government/actions', {
        body: { kind: 'acao', title: 'Ação inválida', summary: 'Demanda ainda não publicada.', demandId: rascunho.body.id },
      });
      assert.ok([404, 409].includes(recusada.status), `esperado 404/409, veio ${recusada.status}`);

      // ── Medição de impacto ──────────────────────────────────────────────
      const impacto = await call('GET', '/government/impact');
      assert.equal(impacto.status, 200);
      assert.equal(impacto.body.impact.demandsActedOn, 3, 'track aberto nas três em que o órgão agiu');
      assert.equal(impacto.body.impact.responses, 2, 'a análise em andamento e a resposta gerada pela ação');
      assert.equal(impacto.body.impact.actions, 2);
      assert.equal(impacto.body.impact.beneficiariesReached, 0, 'nenhuma prestação de contas concluída ainda');

      // ── Exportação ──────────────────────────────────────────────────────
      const csvRes = await fetch(`${base}/government/indicators/export?format=csv`, {
        headers: { authorization: `Bearer ${token(GOV)}` },
      });
      assert.equal(csvRes.status, 200);
      const csvBytes = Buffer.from(await csvRes.arrayBuffer());
      assert.deepEqual([...csvBytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
      const csv = csvBytes.toString('utf8');
      assert.ok(csv.includes('Secretaria Municipal de Obras'));
      assert.ok(csv.includes('Demandas recebidas;3'));
      assert.ok(!csv.includes(GOV), 'sem id de conta');
      assert.ok(!csv.includes(AGENT), 'sem id do autor da demanda');

      const pdfRes = await fetch(`${base}/government/indicators/export?format=pdf`, {
        headers: { authorization: `Bearer ${token(GOV)}` },
      });
      assert.equal(pdfRes.status, 200);
      const pdf = Buffer.from(await pdfRes.arrayBuffer());
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF');

      // ── Imutabilidade e gestão só leitura ───────────────────────────────
      await assert.rejects(
        gestao.query('UPDATE government_actions SET title = $1', ['adulterado']),
        /somente leitura|permission denied/i,
      );
      await assert.rejects(
        pool.query('DELETE FROM government_actions'),
        /não é excluída/i,
      );
      await assert.rejects(
        pool.query('UPDATE government_actions SET organization_id = $1', [ORG_GOV_OTHER]),
        /não mudam/i,
      );
      assert.ok(fora);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
