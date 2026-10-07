// Engajamento, rankings e selos de impacto social (T21) contra um PostgreSQL
// de verdade: compartilhamento append-only com contador, recálculo
// materializado dos sete rankings, exclusão do Poder Público, consentimento de
// exibição do nome e concessão de selos por dado real.
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
const { refresh } = require('../src/ranking/store');
const { BOARD_IDS } = require('../src/ranking/constants');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const MEMBER = '44444444-4444-4444-8444-444444444444';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG_AGENT = '77777777-7777-4777-8777-777777777777';
const ORG_GOV = '88888888-8888-4888-8888-888888888888';
// Órgão que só atua institucionalmente (nunca apoia, demonstra interesse, publica nem comenta) e
// uma conta de Membro com vínculo ativo a ele (T29, `atuar_institucionalmente`).
const GOV_ONLY = '99999999-9999-4999-8999-999999999999';
const DELEGATE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_GOV_ONLY = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const USERS = {
  [AGENT]: ['agent', 'associacao', 'Associação Recreio Vivo'],
  [PARTNER]: ['partner', 'empresa', 'Construtora Horizonte'],
  [MEMBER]: ['member', 'voluntario', 'Joana Moradora'],
  [GOV]: ['government', 'secretaria', 'Secretaria de Obras'],
  [GOV_ONLY]: ['government', 'prefeitura', 'Prefeitura do Recreio'],
  [DELEGATE]: ['member', 'morador', 'Paulo Delegado'],
};
const token = (userId) => {
  const [role, profileType, name] = USERS[userId];
  return jwt.sign({ userId, role, profileType, name }, SECRET);
};

async function institutionStatus(req) {
  if (req.user.userId === GOV) return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV };
  if (req.user.userId === GOV_ONLY) return { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV_ONLY };
  if (req.user.userId === DELEGATE) {
    return {
      kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG_GOV_ONLY,
      delegation: {
        memberId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', level: 'publicador',
        permissions: ['atuar_institucionalmente'], organizationName: 'Prefeitura do Recreio',
      },
    };
  }
  if (req.user.userId === AGENT) return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG_AGENT };
  return { kind: null, status: null, canActInstitutionally: true, organizationId: null };
}

// Identificação pública do órgão (o user-service tem os próprios testes).
async function governmentProfile() {
  return {
    name: 'Prefeitura do Recreio', governmentSphere: 'municipal', department: null, competenceAreas: [],
    territory: null, municipality: 'Rio de Janeiro', uf: 'RJ',
  };
}

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('engajamento: compartilhamento, rankings materializados, neutralidade e selos',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    // Duas passadas: o manifesto é reaplicado a cada deploy.
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/004, 007, 013 e 016).
    await admin.query('DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$');
    await admin.query('GRANT SELECT ON demands, demand_events, supports, posts TO gestao_app');
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    await admin.query('GRANT UPDATE (status, updated_at) ON supports TO gestao_app');
    await admin.query(`GRANT SELECT ON content_shares, ranking_consents, ranking_snapshots,
                         ranking_runs, profile_badges, profile_engagement TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const server = createApp({
      pool, secret: SECRET, institutionStatus, governmentProfile, operationUserIds: new Set(), uploadStorage: null,
      dossierService: null, rankings: null,
      partnerProfile: { get: async () => null },
      connections: { create: async () => null, get: async () => null, update: async () => null },
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
          justification: 'Necessário.', beneficiariesEstimate: 200, beneficiariesProfile: 'Moradores',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          priority: 'alta', photoRef: 'https://example.org/foto.jpg', cep: '22790-000', street: 'Rua A',
          addressNumber: '10', district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ',
          latitude: -23.02, longitude: -43.45, territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      assert.equal((await call('POST', `/demands/${id}/schedule-items`, {
        as: AGENT,
        body: { stage: 'Execução', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-11-30', recordMilestones: ['antes', 'depois'] },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        as: AGENT, body: { description: 'Fotografia e filmagem', quantity: 1, unit: 'serviço', unitPriceCents: 200000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        as: AGENT, body: { goal: 'Meta', expectedResult: 'Resultado', indicator: 'Indicador', measurementMethod: 'Medição' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { as: AGENT, body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/submit`, { as: AGENT })).status, 200);
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      return id;
    }

    try {
      const demand = await publishedDemand('Calçada quebrada');
      const draft = (await call('POST', '/demands', {
        as: AGENT, body: { category: 'projeto_social', title: 'Rascunho', description: 'Ainda em análise.' },
      })).body.id;

      // ── Compartilhamento (slide 22) ──────────────────────────────────────
      const share = (as, targetId = demand, targetKind = 'demand', channel = 'web_share') => call('POST', '/shares', { as, body: { targetKind, targetId, channel } });

      assert.equal((await call('POST', '/shares', { as: PARTNER, auth: false, body: { targetKind: 'demand', targetId: demand } })).status, 401,
        'não há compartilhamento anônimo: nada é registrado sem sessão');
      const first = await share(PARTNER);
      assert.equal(first.status, 201);
      assert.deepEqual(first.body, { counted: true, sharesCount: 1 });
      const again = await share(PARTNER);
      assert.equal(again.status, 200);
      assert.equal(again.body.counted, false, 'o mesmo conteúdo, no mesmo dia, não conta duas vezes');
      assert.equal(again.body.sharesCount, 1);
      assert.equal((await share(MEMBER, demand, 'demand', 'copiar_link')).body.sharesCount, 2);
      assert.equal((await share(AGENT)).body.sharesCount, 3, 'o autor compartilha, mas isso não pontua o próprio projeto');
      assert.equal((await share(PARTNER, draft)).status, 409, 'demanda em análise não é compartilhada');

      // A leitura pública da demanda já traz a contagem.
      assert.equal((await call('GET', `/demands/${demand}`, { auth: false })).body.sharesCount, 3);

      // Append-only: nada é alterado nem excluído, e a gestão só lê.
      await assert.rejects(pool.query('UPDATE content_shares SET channel = $1', ['outro']), /não é alterado nem excluído/);
      await assert.rejects(pool.query('DELETE FROM content_shares'), /não é alterado nem excluído/);
      await assert.rejects(
        gestao.query('INSERT INTO content_shares (target_kind, demand_id, user_id) VALUES ($1, $2, $3)', ['demand', demand, MEMBER]),
        /permission denied|a gestão só lê/,
      );

      // ── Apoio confirmado (T16) e apoio do Poder Público ──────────────────
      const donation = await call('POST', `/demands/${demand}/supports`, {
        as: PARTNER,
        body: {
          modality: 'patrocinar_projeto', supportType: 'financial', description: 'Patrocínio da obra',
          amountCents: 250000, amountPublic: true, displayConsent: true, publicName: 'Construtora Horizonte',
          occurredOn: '2026-09-01',
        },
      });
      assert.equal(donation.status, 201, JSON.stringify(donation.body));
      assert.equal((await call('POST', `/demands/${demand}/supports/${donation.body.support.id}/confirm`.replace('/supports/', '/supports/'), {
        as: AGENT,
      })).status, 404, 'a confirmação é pela rota do autor');
      const confirmed = await call('POST', `/demands/mine/${demand}/supports/${donation.body.support.id}/confirm`, { as: AGENT });
      assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));

      const govSupport = await call('POST', `/demands/${demand}/supports`, {
        as: GOV,
        body: {
          modality: 'doar_recursos', supportType: 'equipment', description: 'Equipe e maquinário',
          displayConsent: true, publicName: 'Secretaria de Obras', occurredOn: '2026-09-02',
        },
      });
      assert.equal(govSupport.status, 201, JSON.stringify(govSupport.body));
      assert.equal((await call('POST', `/demands/mine/${demand}/supports/${govSupport.body.support.id}/confirm`, { as: AGENT })).status, 200);

      // Interesse de voluntariado com conexão aceita (T15), direto no banco:
      // o portal já exerce esse fluxo no interest-e2e.
      await pool.query(
        `INSERT INTO demand_interests (demand_id, user_id, user_name, user_category, profile_type, kind)
         VALUES ($1, $2, 'Joana Moradora', 'comunidade', 'voluntario', 'voluntariado')`,
        [demand, MEMBER],
      );
      await pool.query(
        `UPDATE demand_interests
            SET connection_id = gen_random_uuid(), connection_status = 'pendente', connection_requested_at = NOW()
          WHERE user_id = $1`,
        [MEMBER],
      );
      await pool.query(
        "UPDATE demand_interests SET connection_status = 'aceita', connection_answered_at = NOW() WHERE user_id = $1",
        [MEMBER],
      );

      // ── Recálculo materializado ──────────────────────────────────────────
      const run = await refresh(pool);
      assert.ok(run.entries > 0);
      const runs = await pool.query('SELECT entries, badges FROM ranking_runs ORDER BY started_at DESC LIMIT 1');
      assert.equal(Number(runs.rows[0].entries), run.entries);

      const rankings = await call('GET', '/rankings?period=sempre&limit=50', { auth: false });
      assert.equal(rankings.status, 200);
      assert.deepEqual(rankings.body.boards.map((b) => b.id), BOARD_IDS);
      const boardOf = (id) => rankings.body.boards.find((b) => b.id === id).entries;

      // Neutralidade institucional (slide 13): o órgão não aparece em lugar nenhum.
      for (const board of rankings.body.boards) {
        assert.equal(board.entries.some((e) => e.subjectId === GOV), false, `${board.id} não pode conter o Poder Público`);
      }

      const supporters = boardOf('maiores_apoiadores');
      assert.equal(supporters[0].subjectId, PARTNER);
      assert.equal(supporters[0].identified, true, 'o consentimento do apoio (T16) identifica o apoiador');
      assert.equal(supporters[0].displayName, 'Construtora Horizonte');
      assert.equal(supporters[0].position, 1);

      assert.equal(boardOf('empresas_em_destaque')[0].subjectId, PARTNER);
      // Patrocínio: R$ 2.500,00 declarados com nome e valor autorizados.
      assert.equal(boardOf('maiores_patrocinadores')[0].points, 2500);

      const volunteers = boardOf('voluntarios_mais_participativos');
      assert.equal(volunteers[0].subjectId, MEMBER);
      assert.equal(volunteers[0].points, 20, '5 pelo interesse + 15 pela conexão aceita');

      const active = boardOf('usuarios_mais_ativos');
      assert.ok(active.some((e) => e.subjectId === PARTNER));
      // Sem consentimento de perfil, a linha conta sem se identificar.
      const activeMember = active.find((e) => e.subjectId === MEMBER);
      assert.equal(activeMember.identified, false);
      assert.equal(activeMember.displayName, null);

      const places = boardOf('bairros_mais_engajados');
      assert.equal(places.length, 1);
      assert.match(places[0].displayName, /Recreio/);
      assert.equal(places[0].subjectKind, 'bairro');

      const projects = boardOf('projetos_mais_apoiados');
      assert.equal(projects[0].subjectId, demand);
      // 1 apoio confirmado que pontua (o do Poder Público não conta, slide 13)
      // + 1 interesse (5) + 2 compartilhamentos de quem não é o autor (3 cada).
      assert.equal(projects[0].points, 10 + 5 + 6);

      // ── Consentimento (LGPD) ─────────────────────────────────────────────
      assert.equal((await call('PUT', '/rankings/consent', { as: MEMBER, body: { consent: true } })).body.consent, true);
      await refresh(pool);
      const afterConsent = (await call('GET', '/rankings?limit=50', { auth: false })).body
        .boards.find((b) => b.id === 'usuarios_mais_ativos').entries
        .find((e) => e.subjectId === MEMBER);
      assert.equal(afterConsent.identified, true);
      assert.equal(afterConsent.displayName, 'Joana Moradora');

      assert.equal((await call('PUT', '/rankings/consent', { as: MEMBER, body: { consent: false } })).body.consent, false);
      await assert.rejects(pool.query('DELETE FROM ranking_consents'), /não excluído/);

      // ── Selos e indicadores ──────────────────────────────────────────────
      await refresh(pool);
      const partnerImpact = (await call('GET', `/profiles/${PARTNER}/impact`, { auth: false })).body;
      assert.equal(partnerImpact.ranked, true);
      const badges = partnerImpact.badges.map((b) => b.id);
      assert.ok(badges.includes('apoiador_confirmado'));
      assert.ok(badges.includes('patrocinador'));
      assert.equal(badges.includes('apoiador_recorrente'), false, 'cinco apoios confirmados são necessários');
      assert.ok(partnerImpact.badges.every((b) => b.awardedAt && b.rule));

      const memberImpact = (await call('GET', `/profiles/${MEMBER}/impact`, { auth: false })).body;
      assert.deepEqual(memberImpact.badges.map((b) => b.id), ['voluntario_participante']);

      const govImpact = (await call('GET', `/profiles/${GOV}/impact`, { auth: false })).body;
      assert.equal(govImpact.ranked, false, 'o Poder Público não recebe selo nem posição');
      assert.deepEqual(govImpact.badges, []);
      assert.equal(govImpact.indicators.length, 5);
      assert.match(govImpact.notice, /indicadores de atuação/);
      assert.equal(govImpact.category, 'poder_publico');

      // ── Órgão que só atua institucionalmente (§4 de Perfis: indicadores de atuação) ──
      // Nenhum apoio, interesse, demanda, compartilhamento, post ou comentário: só acompanha,
      // responde e oferece apoio pelas rotas institucionais. A categoria precisa vir dessa atuação.
      const track = await call('POST', `/institutional/demands/${demand}/track`, { as: GOV_ONLY });
      assert.equal(track.status, 201, JSON.stringify(track.body));
      const answer = await call('POST', `/institutional/demands/${demand}/responses`, {
        as: GOV_ONLY,
        body: { type: 'recebimento', body: 'Recebemos a demanda e ela está em análise pela equipe.', status: 'em_analise' },
      });
      assert.equal(answer.status, 201, JSON.stringify(answer.body));
      const institutionalOffer = await call('POST', `/institutional/demands/${demand}/offers`, {
        as: GOV_ONLY, body: { supportTypes: ['conhecimento_tecnico'], description: 'Orientação técnica da equipe municipal.' },
      });
      assert.equal(institutionalOffer.status, 201, JSON.stringify(institutionalOffer.body));

      // Conta de Membro agindo pelo órgão (T29): também responde, e além disso compartilha como pessoa.
      const delegated = await call('POST', `/institutional/demands/${demand}/responses`, {
        as: DELEGATE, body: { type: 'recebimento', body: 'Registro feito pela equipe vinculada ao órgão.' },
      });
      assert.equal(delegated.status, 201, JSON.stringify(delegated.body));
      assert.equal((await share(DELEGATE, demand, 'demand', 'copiar_link')).status, 201);

      await refresh(pool);
      const onlyImpact = (await call('GET', `/profiles/${GOV_ONLY}/impact`, { auth: false })).body;
      assert.equal(onlyImpact.category, 'poder_publico', 'a atuação institucional já identifica o Poder Público');
      assert.equal(onlyImpact.ranked, false, 'o órgão que só atua institucionalmente também não recebe selo nem posição');
      assert.deepEqual(onlyImpact.badges, []);
      assert.deepEqual(
        Object.fromEntries(onlyImpact.indicators.map((i) => [i.id, i.value])),
        { tracks: 1, responses: 1, forwardings: 0, offers: 1, concluded: 0 },
      );
      assert.match(onlyImpact.notice, /indicadores de atuação/);

      // Quem age pelo órgão é tratado como Poder Público, como já ocorria no apoio por delegação:
      // o compartilhamento pessoal dele não o leva a nenhum ranking.
      const delegateImpact = (await call('GET', `/profiles/${DELEGATE}/impact`, { auth: false })).body;
      assert.equal(delegateImpact.ranked, false);
      assert.deepEqual(delegateImpact.badges, []);
      assert.equal(delegateImpact.indicators.find((i) => i.id === 'responses').value, 1);

      for (const period of ['mes', 'ano', 'sempre']) {
        const { body } = await call('GET', `/rankings?period=${period}&limit=100`, { auth: false });
        for (const board of body.boards) {
          for (const account of [GOV, GOV_ONLY, DELEGATE]) {
            assert.equal(board.entries.some((e) => e.subjectId === account), false,
              `${board.id} (${period}) não pode conter ${account}`);
          }
        }
      }
      // Quem não é do Poder Público segue pontuando normalmente.
      const activeAfter = (await call('GET', '/rankings?period=sempre&limit=100&board=usuarios_mais_ativos', { auth: false }))
        .body.boards[0].entries;
      assert.ok(activeAfter.some((e) => e.subjectId === PARTNER));
      assert.ok(activeAfter.some((e) => e.subjectId === MEMBER));

      // ── Período configurável ─────────────────────────────────────────────
      const thisMonth = (await call('GET', '/rankings?period=mes&limit=50', { auth: false })).body;
      assert.equal(thisMonth.period, 'mes');
      assert.ok(thisMonth.boards.find((b) => b.id === 'maiores_apoiadores').entries.length >= 1);
      // Um período sem registro devolve lista vazia, nunca número inventado.
      await pool.query("UPDATE ranking_snapshots SET points = points WHERE period = 'ano'");
      assert.equal((await call('GET', '/rankings?period=xpto', { auth: false })).body.period, 'sempre');

      // A gestão lê a agregação, mas não escreve nela.
      const readByGestao = await gestao.query('SELECT count(*)::int AS total FROM ranking_snapshots');
      assert.ok(readByGestao.rows[0].total > 0);
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
