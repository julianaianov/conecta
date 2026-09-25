// Ciclo completo da demanda (T07) contra um PostgreSQL de verdade.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (PostgreSQL 15+, superusuário). O jeito normal é `npm run test:e2e`, que sobe
// um PostgreSQL temporário (scripts/e2e-postgres.sh), roda este arquivo e
// apaga tudo no fim. Sem a variável, o teste é pulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');
const store = require('../src/demand/store');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';

const AGENT = '11111111-1111-4111-8111-111111111111';
const AGENT_PENDING = '22222222-2222-4222-8222-222222222222';
const MEMBER = '33333333-3333-4333-8333-333333333333';
const ORG = '44444444-4444-4444-8444-444444444444';

const token = (userId, role = 'agent', profileType = 'associacao') => jwt.sign(
  { userId, role, profileType, name: `Conta ${userId.slice(0, 4)}` }, SECRET,
);

// Estado institucional simulado (o user-service tem os próprios testes).
async function institutionStatus(req) {
  if (req.user.userId === AGENT) {
    return { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG };
  }
  return { kind: 'agente_transformacao', status: 'em_analise', canActInstitutionally: false, organizationId: null };
}

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

test('demanda: rascunho → envio → devolução → reenvio → publicação → execução → prestação de contas',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    // Schema do manifesto, duas vezes (o deploy reaplica tudo: idempotente).
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query(`GRANT SELECT ON demands, demand_budget_items, demand_schedule_items, demand_goals,
                         demand_resources, demand_documents, demand_events TO gestao_app`);
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    // S3 simulado em memória (T08): o resto do fluxo é o banco real.
    const objects = new Map();
    const uploadStorage = {
      async presignPut({ key, contentType }) {
        return { url: `https://s3.test/${key}`, headers: { 'Content-Type': contentType }, expiresIn: 900 };
      },
      async presignGet({ key }) { return `https://s3.test/${key}?get`; },
      async head(key) {
        const o = objects.get(key);
        return o ? { size: o.bytes.length, contentType: o.contentType, checksumSha256: null } : null;
      },
      async readPrefix(key, length) { return objects.get(key).bytes.slice(0, length); },
      async copy(from, to) { objects.set(to, objects.get(from)); },
      async remove(key) { objects.delete(key); },
    };
    const server = createApp({
      // Dossiê (T10) tem e2e próprio (dossier-e2e.test.js); aqui a linha do tempo fica só com o estado.
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage, dossierService: null,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, url, { as = AGENT, body, auth = true } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${typeof as === 'string' && as.length > 36 ? as : token(as)}`;
      const res = await fetch(`${base}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    const complete = {
      category: 'projeto_ambiental',
      title: 'Horta comunitária na praça',
      description: 'Implantar horta comunitária com canteiros elevados.',
      objective: 'Produzir alimentos e ocupar o espaço público.',
      justification: 'A praça está abandonada e o bairro não tem área verde cuidada.',
      beneficiariesEstimate: 250,
      beneficiariesProfile: 'Moradores do entorno, escolas e idosos',
      priority: 'alta',
      photoRef: 'https://example.org/foto-praca.jpg',
      cep: '22790-000',
      street: 'Rua das Flores',
      addressNumber: '100',
      district: 'Recreio',
      municipality: 'Rio de Janeiro',
      uf: 'RJ',
      latitude: -23.0247,
      longitude: -43.4567,
      territory: 'Recreio dos Bandeirantes',
    };

    async function buildDemand(overrides = {}) {
      const created = await call('POST', '/demands', { body: { ...complete, ...overrides } });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      const s1 = await call('POST', `/demands/${id}/schedule-items`, {
        body: { stage: 'Preparação', activities: 'Limpeza e registro inicial', startsOn: '2026-10-01', endsOn: '2026-10-15', responsible: 'Maria Silva', recordMilestones: ['antes'] },
      });
      assert.equal(s1.status, 201, JSON.stringify(s1.body));
      const s2 = await call('POST', `/demands/${id}/schedule-items`, {
        body: { stage: 'Plantio', activities: 'Canteiros e plantio', startsOn: '2026-10-16', endsOn: '2026-11-30', recordMilestones: ['acompanhamento', 'depois'] },
      });
      assert.equal(s2.status, 201);
      const b1 = await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Madeira e terra', quantity: '10', unit: 'kit', unitPriceCents: 90000, scheduleItemId: s2.body.item.id },
      });
      assert.equal(b1.status, 201, JSON.stringify(b1.body));
      const b2 = await call('POST', `/demands/${id}/budget-items`, {
        body: { description: 'Fotografia e filmagem do antes e do depois', quantity: 1, unit: 'serviço', unitPriceCents: 100000, isAudiovisualRecord: true, scheduleItemId: s1.body.item.id },
      });
      assert.equal(b2.status, 201);
      // R$ 10.000,00 → 4% + 6% → R$ 11.000,00 (decisão 5).
      assert.deepEqual(b2.body.composition, {
        budgetAmountCents: 1_000_000, agentFeeBps: 400, platformFeeBps: 600,
        agentFeeCents: 40_000, platformFeeCents: 60_000, totalAmountCents: 1_100_000,
      });
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        body: { goal: '20 canteiros', expectedResult: 'Produção semanal', indicator: 'Canteiros ativos', measurementMethod: 'Contagem mensal' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { body: { kind: 'contrapartida', type: 'equipe', description: 'Mutirão' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/documents`, {
        body: { type: 'orcamentos_e_cotacoes', title: 'Cotação da madeira', reference: 'https://example.org/cotacao.pdf' },
      })).status, 201);
      return id;
    }

    const publish = (id) => gestao.query(
      "UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1",
      [id],
    );

    try {
      // ── Rascunho ──────────────────────────────────────────────────────────
      assert.equal((await call('POST', '/demands', { as: token(MEMBER, 'member', 'morador'), body: {} })).status, 403);
      const invalid = await call('POST', '/demands', { body: { category: 'festa', photoRef: 'http://x' } });
      assert.equal(invalid.status, 422);
      assert.equal(invalid.body.code, 'validation_failed');
      assert.ok(invalid.body.fields.category && invalid.body.fields.photoRef);

      const draft = await call('POST', '/demands', { body: { title: 'Rascunho', category: 'projeto_social' } });
      assert.equal(draft.status, 201);
      assert.equal(draft.body.status, 'em_analise');
      assert.equal(draft.body.reviewState, 'rascunho');
      assert.deepEqual(draft.body.availableActions, ['enviar']);
      const draftId = draft.body.id;

      const incomplete = await call('POST', `/demands/${draftId}/validate`);
      assert.equal(incomplete.status, 200);
      assert.equal(incomplete.body.valid, false);
      assert.ok(incomplete.body.fields.photoRef && incomplete.body.fields.cep && incomplete.body.fields.budgetItems);
      const notReady = await call('POST', `/demands/${draftId}/submit`);
      assert.equal(notReady.status, 422);
      assert.equal(notReady.body.code, 'demand_incomplete');

      // Outro agente não vê nem mexe (404), e sem instituição validada não envia.
      assert.equal((await call('GET', `/demands/mine/${draftId}`, { as: AGENT_PENDING })).status, 404);
      assert.equal((await call('PUT', `/demands/${draftId}`, { as: AGENT_PENDING, body: { title: 'x' } })).status, 404);
      const pendingDraft = await call('POST', '/demands', { as: AGENT_PENDING, body: { title: 'Rascunho em validação' } });
      assert.equal(pendingDraft.status, 201);
      const gated = await call('POST', `/demands/${pendingDraft.body.id}/submit`, { as: AGENT_PENDING });
      assert.equal(gated.status, 403);
      assert.equal(gated.body.code, 'institution_not_validated');

      // Composição sem gravar.
      const preview = await call('POST', '/demands/composition/preview', {
        body: { budgetItems: [{ description: 'a', quantity: '2,5', unit: 'm', unitPriceCents: 4938 }] },
      });
      assert.equal(preview.status, 200);
      assert.deepEqual(preview.body.items, [{ totalCents: 12345 }]);
      assert.equal(preview.body.composition.totalAmountCents, 13580);

      // ── Demanda completa, envio ──────────────────────────────────────────
      const id = await buildDemand();
      const dup = await call('POST', `/demands/${id}/resources`, { body: { kind: 'necessario', type: 'materiais' } });
      assert.equal(dup.status, 422);
      assert.ok(dup.body.fields.type);
      const wrongKind = await call('POST', `/demands/${id}/resources`, { body: { kind: 'contrapartida', type: 'mao_de_obra' } });
      assert.equal(wrongKind.status, 422);

      // Critérios de prioridade (T-02-01, decisão 17): prioridade alta sem
      // critério declarado vira aviso, nunca erro.
      const beforeCriteria = await call('POST', `/demands/${id}/validate`);
      assert.equal(beforeCriteria.body.valid, true, JSON.stringify(beforeCriteria.body.fields));
      assert.ok(beforeCriteria.body.warnings.priorityCriteria);
      const badCriteria = await call('PUT', `/demands/${id}`, { body: { priorityCriteria: ['urgencia_politica'] } });
      assert.equal(badCriteria.status, 422);
      assert.ok(badCriteria.body.fields.priorityCriteria);
      const criteria = await call('PUT', `/demands/${id}`, {
        body: { priorityCriteria: ['pessoas_afetadas', 'risco_vida_seguranca', 'pessoas_afetadas'] },
      });
      assert.equal(criteria.status, 200, JSON.stringify(criteria.body));
      assert.deepEqual(criteria.body.priorityCriteria, ['risco_vida_seguranca', 'pessoas_afetadas']);

      const ready = await call('POST', `/demands/${id}/validate`);
      assert.equal(ready.body.valid, true, JSON.stringify(ready.body.fields));
      assert.equal(ready.body.warnings.priorityCriteria, undefined);
      const submitted = await call('POST', `/demands/${id}/submit`);
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      assert.equal(submitted.body.reviewState, 'aguardando_analise');
      assert.equal(submitted.body.organizationId, ORG);
      assert.ok(submitted.body.submittedAt);
      assert.equal(submitted.body.editable, false);

      const locked = await call('PUT', `/demands/${id}`, { body: { title: 'Mudança depois do envio' } });
      assert.equal(locked.status, 409);
      assert.equal(locked.body.code, 'demand_not_editable');
      // O envio registra a prioridade e os critérios declarados na linha do tempo.
      const sentEvents = await call('GET', `/demands/mine/${id}/events`);
      const sent = sentEvents.body.events.find((e) => e.type === 'enviada_para_analise');
      assert.equal(sent.payload.priority, 'alta');
      assert.deepEqual(sent.payload.priority_criteria, ['risco_vida_seguranca', 'pessoas_afetadas']);
      assert.equal((await call('PUT', `/demands/${id}`, { body: { priorityCriteria: [] } })).status, 409);
      await assert.rejects(
        gestao.query(`UPDATE demands SET priority_criteria = '{}' WHERE id = $1`, [id]),
        /declarados pelo Agente|permission denied/,
      );
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        body: { goal: 'a', expectedResult: 'b', indicator: 'c', measurementMethod: 'd' },
      })).status, 409);
      assert.equal((await call('POST', `/demands/${id}/submit`)).status, 409);
      assert.equal((await call('GET', `/demands/${id}`, { auth: false })).status, 404);

      // ── Devolução para ajustes (gestão) e reenvio ───────────────────────
      await gestao.query(
        `UPDATE demands SET review_state = 'devolvida', review_note = 'Anexe a cotação da terra',
                reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1`, [id],
      );
      const review = await call('GET', `/demands/mine/${id}/review`);
      assert.equal(review.status, 200);
      assert.equal(review.body.reviewState, 'devolvida');
      assert.equal(review.body.reviewNote, 'Anexe a cotação da terra');
      assert.equal(review.body.returns.length, 1);
      const edited = await call('PUT', `/demands/${id}`, { body: { title: 'Horta comunitária da praça central' } });
      assert.equal(edited.status, 200);
      assert.equal(edited.body.title, 'Horta comunitária da praça central');

      // ── Upload da fotografia e de um documento (T08) ────────────────────
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 1, 2, 3]);
      const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj', 'latin1');
      async function upload(purpose, contentType, bytes, fileName) {
        const ticket = await call('POST', '/uploads/presign', { body: { purpose, contentType, size: bytes.length, fileName } });
        assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
        objects.set(`tmp/${ticket.body.uploadId}`, { bytes: Uint8Array.from(bytes), contentType });
        const confirmed = await call('POST', `/uploads/${ticket.body.uploadId}/confirm`, { body: { demandId: id } });
        assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
        return confirmed.body;
      }
      const photo = await upload('demand_photo', 'image/png', png, 'praça.png');
      assert.equal(photo.demandId, id);
      assert.ok(objects.has(`demands/${id}/photo/${photo.id}.png`) && !objects.has(`tmp/${photo.id}`));
      const withPhoto = await call('PUT', `/demands/${id}`, { body: { photoRef: photo.ref } });
      assert.equal(withPhoto.status, 200, JSON.stringify(withPhoto.body));
      assert.equal(withPhoto.body.photoFile.fileName, 'praça.png');
      const doc = await upload('demand_document', 'application/pdf', pdf, 'cotação da terra.pdf');
      const docItem = await call('POST', `/demands/${id}/documents`, {
        body: { type: 'orcamentos_e_cotacoes', title: 'Cotação da terra', reference: doc.id },
      });
      assert.equal(docItem.status, 201, JSON.stringify(docItem.body));
      assert.equal(docItem.body.item.reference, `upload:${doc.id}`);
      assert.equal(docItem.body.item.file.url, `https://s3.test/demands/${id}/documents/${doc.id}.pdf?get`);
      // Upload de outra finalidade ou de outra conta não serve de referência.
      assert.equal((await call('PUT', `/demands/${id}`, { body: { photoRef: doc.ref } })).status, 422);
      assert.equal((await call('GET', `/uploads/${doc.id}`, { as: AGENT_PENDING })).status, 404);
      assert.equal((await call('GET', `/uploads/${photo.id}/content`, { auth: false })).status, 404);
      const { rows: [stored] } = await pool.query('SELECT status, object_key, size_bytes FROM uploads WHERE id = $1', [photo.id]);
      assert.deepEqual(stored, { status: 'confirmado', object_key: `demands/${id}/photo/${photo.id}.png`, size_bytes: String(png.length) });
      const mine = await call('GET', `/demands/mine/${id}`);
      const b = mine.body.budgetItems.find((item) => !item.isAudiovisualRecord);
      const changed = await call('PUT', `/demands/${id}/budget-items/${b.id}`, {
        body: { description: 'Madeira, terra e adubo', quantity: 10, unit: 'kit', unitPriceCents: 91000, scheduleItemId: b.scheduleItemId },
      });
      assert.equal(changed.status, 200, JSON.stringify(changed.body));
      assert.equal(changed.body.composition.budgetAmountCents, 1_010_000);
      assert.equal(changed.body.composition.totalAmountCents, 1_111_000);
      const resubmitted = await call('POST', `/demands/${id}/submit`);
      assert.equal(resubmitted.status, 200);
      assert.equal(resubmitted.body.reviewNote, null);

      // ── Publicação (gestão) → vitrine e rotas públicas ──────────────────
      await publish(id);
      const published = await call('GET', `/demands/${id}`, { auth: false });
      assert.equal(published.status, 200);
      assert.equal(published.body.status, 'publicada');
      assert.ok(published.body.postId);
      for (const hidden of ['cep', 'street', 'addressNumber', 'organizationId', 'reviewNote', 'reviewState']) {
        assert.ok(!(hidden in published.body), `${hidden} não pode sair na rota pública`);
      }
      assert.ok(published.body.scheduleItems.every((s) => !('responsible' in s)));
      assert.deepEqual(Object.keys(published.body.documents[0]).sort(), ['id', 'position', 'title', 'type']);
      assert.equal(published.body.composition.totalAmountCents, 1_111_000);

      assert.equal(published.body.photoUrl, `/api/posts/uploads/${photo.id}/content`);
      const feed = await call('GET', '/', { auth: false });
      const showcase = feed.body.posts.find((p) => p.demand_id === id);
      assert.ok(showcase, 'post-vitrine no feed com demand_id');
      // A foto por upload sai no feed pelo endereço público estável.
      assert.deepEqual(showcase.images, [`/api/posts/uploads/${photo.id}/content`]);
      const photoRes = await fetch(`${base}/uploads/${photo.id}/content`, { redirect: 'manual' });
      assert.equal(photoRes.status, 302);
      assert.equal(photoRes.headers.get('location'), `https://s3.test/demands/${id}/photo/${photo.id}.png?get`);
      assert.equal((await fetch(`${base}/uploads/${doc.id}/content`, { redirect: 'manual' })).status, 404);
      assert.equal(showcase.id, published.body.postId);
      assert.equal((await call('GET', `/${showcase.id}`, { auth: false })).body.demand_id, id);
      const putShowcase = await call('PUT', `/${showcase.id}`, { body: { title: 'Outro' } });
      assert.equal(putShowcase.status, 409);
      assert.equal(putShowcase.body.code, 'demand_showcase');
      assert.equal((await call('DELETE', `/${showcase.id}`)).status, 409);

      // Lista pública: filtros e paginação keyset.
      const second = await buildDemand({ category: 'problema_urbano', title: 'Calçada quebrada', territory: 'Barra', latitude: -22.9, longitude: -43.2 });
      assert.equal((await call('POST', `/demands/${second}/submit`)).status, 200);
      await publish(second);
      const third = await buildDemand({ title: 'Mutirão de limpeza' });
      assert.equal((await call('POST', `/demands/${third}/submit`)).status, 200);
      await publish(third);

      const all = await call('GET', '/demands', { auth: false });
      assert.equal(all.status, 200);
      assert.deepEqual(all.body.demands.map((d) => d.id), [third, second, id]);
      assert.ok(!all.body.demands.some((d) => d.id === draftId));
      const page1 = await call('GET', '/demands?limit=2', { auth: false });
      assert.deepEqual(page1.body.demands.map((d) => d.id), [third, second]);
      assert.ok(page1.body.nextCursor);
      const page2 = await call('GET', `/demands?limit=2&cursor=${page1.body.nextCursor}`, { auth: false });
      assert.deepEqual(page2.body.demands.map((d) => d.id), [id]);
      assert.equal(page2.body.nextCursor, null);
      const byCategory = await call('GET', '/demands?category=problema_urbano', { auth: false });
      assert.deepEqual(byCategory.body.demands.map((d) => d.id), [second]);
      const byText = await call('GET', `/demands?q=${encodeURIComponent('praça central')}`, { auth: false });
      assert.deepEqual(byText.body.demands.map((d) => d.id), [id]);
      const byTerritory = await call('GET', '/demands?territory=barra', { auth: false });
      assert.deepEqual(byTerritory.body.demands.map((d) => d.id), [second]);
      const byBbox = await call('GET', '/demands?bbox=-43.5,-23.1,-43.4,-23.0', { auth: false });
      assert.deepEqual(byBbox.body.demands.map((d) => d.id).sort(), [id, third].sort());
      const badFilter = await call('GET', '/demands?status=em_analise&bbox=1,2', { auth: false });
      assert.equal(badFilter.status, 422);
      assert.ok(badFilter.body.fields.status && badFilter.body.fields.bbox);

      // ── Transições do agente e do sistema ────────────────────────────────
      const forbidden = await call('POST', `/demands/${id}/transitions`, { body: { action: 'publicar' } });
      assert.equal(forbidden.status, 403);
      const early = await call('POST', `/demands/${id}/transitions`, { body: { action: 'concluir' } });
      assert.equal(early.status, 409);
      assert.equal(early.body.code, 'invalid_transition');
      const searching = await call('POST', `/demands/${id}/transitions`, { body: { action: 'buscar_parceiro' } });
      assert.equal(searching.status, 200);
      assert.equal(searching.body.status, 'em_busca_de_parceiro');
      assert.equal((await call('POST', `/demands/${id}/transitions`, { as: AGENT_PENDING, body: { action: 'conectar' } })).status, 403);

      // O portal (ex.: conexão aceita, T15) conecta como `sistema`.
      await store.withTransaction(pool, async (client) => {
        const row = await store.loadOwnDemand(client, id, AGENT, { forUpdate: true });
        await store.transitionDemand(client, row, 'conectar', { actor: 'sistema', actorRef: 'conexao:teste' });
      });
      // Sistema não inicia execução (só o agente).
      await assert.rejects(store.withTransaction(pool, async (client) => {
        const row = await store.loadOwnDemand(client, id, AGENT, { forUpdate: true });
        await store.transitionDemand(client, row, 'iniciar_execucao', { actor: 'sistema' });
      }), (err) => err.status === 403);

      // Registro obrigatório do antes e do depois (T17): sem evidência, a
      // execução não começa; esta demanda não tem intervenção física, então a
      // justificativa libera as transições.
      const semRegistro = await call('POST', `/demands/${id}/transitions`, { body: { action: 'iniciar_execucao' } });
      assert.equal(semRegistro.status, 409, JSON.stringify(semRegistro.body));
      assert.equal(semRegistro.body.code, 'evidence_required');
      assert.equal(semRegistro.body.milestone, 'antes');
      assert.equal((await call('POST', `/demands/mine/${id}/record-waiver`, {
        body: { reason: 'Ação de articulação institucional, sem intervenção física a fotografar.' },
      })).status, 200);

      for (const [action, status] of [['iniciar_execucao', 'em_execucao'], ['concluir', 'concluida'], ['prestar_contas', 'prestacao_de_contas']]) {
        const moved = await call('POST', `/demands/${id}/transitions`, { body: { action } });
        assert.equal(moved.status, 200, JSON.stringify(moved.body));
        assert.equal(moved.body.status, status);
      }

      // ── Linhas do tempo ─────────────────────────────────────────────────
      const timeline = await call('GET', `/demands/${id}/timeline`, { auth: false });
      assert.equal(timeline.status, 200);
      assert.deepEqual(timeline.body.events.filter((e) => e.toStatus).map((e) => e.toStatus), [
        'publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao', 'concluida', 'prestacao_de_contas',
      ]);
      // A dispensa do registro (T17) também é pública, com `details`.
      assert.ok(timeline.body.events.some((e) => e.type === 'registro_dispensado'));
      const TIMELINE_KEYS = ['createdAt', 'details', 'fromStatus', 'id', 'toStatus', 'type'];
      for (const e of timeline.body.events) {
        assert.ok(Object.keys(e).every((k) => TIMELINE_KEYS.includes(k)), Object.keys(e).join(','));
      }
      const events = await call('GET', `/demands/mine/${id}/events`);
      assert.deepEqual(events.body.events.slice(0, 5).map((e) => e.type), [
        'criada', 'enviada_para_analise', 'devolvida_para_ajustes', 'enviada_para_analise', 'publicada',
      ]);
      assert.equal(events.body.events.find((e) => e.toStatus === 'conectada').actorType, 'sistema');
      assert.equal((await call('GET', `/demands/${draftId}/timeline`, { auth: false })).status, 404);

      const list = await call('GET', '/demands/mine');
      assert.equal(list.status, 200);
      assert.ok(list.body.demands.some((d) => d.id === draftId && d.reviewState === 'rascunho'));

      // Arquivamento (gestão) tira a demanda do público e oculta a vitrine.
      await gestao.query(
        "UPDATE demands SET status = 'arquivada', archive_reason = 'Duplicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1",
        [third],
      );
      assert.equal((await call('GET', `/demands/${third}`, { auth: false })).status, 404);
      const afterArchive = await call('GET', '/', { auth: false });
      assert.ok(!afterArchive.body.posts.some((p) => p.demand_id === third));
    } finally {
      await new Promise((resolve) => server.close(resolve));
      await gestao.end();
      await pool.end();
    }
  });
