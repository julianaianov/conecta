// Dossiê da Demanda (T10) de ponta a ponta contra um PostgreSQL de verdade:
// envio com falha do S3 (o envio não falha), regeneração, reenvio, publicação
// pela gestão, versão pública redigida, verificação por hash, imutabilidade e
// ambiente sem bucket.
//
// Só roda com DM_E2E_DATABASE_URL apontando para um banco VAZIO e descartável
// (`npm run test:e2e`, que sobe um PostgreSQL temporário). Sem a variável, pula.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { createApp } = require('../src');
const { createDossierService } = require('../src/dossier/service');
const { contentHash } = require('../src/dossier/content');

const DATABASE_URL = process.env.DM_E2E_DATABASE_URL;
const SECRET = 'post-service-e2e-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const OTHER_AGENT = '22222222-2222-4222-8222-222222222222';
const OPERATOR = '55555555-5555-4555-8555-555555555555';
const ORG = '44444444-4444-4444-8444-444444444444';
const SITE = 'https://homologacao.dmconecta.org';

// PNG 1×1 válido: a fotografia entra no PDF.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const token = (userId, role = 'agent', profileType = 'associacao') => jwt.sign(
  { userId, role, profileType, name: `Conta ${userId.slice(0, 4)}` }, SECRET,
);

const institutionStatus = async (req) => (req.user.userId === AGENT || req.user.userId === OTHER_AGENT
  ? { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: ORG }
  : { kind: null, status: null, canActInstitutionally: false, organizationId: null });

// Projeção pública do user-service (simulada; tem teste próprio lá).
const INSTITUTION = {
  institution_kind: 'agente_transformacao', cnpj: '11222333000181', legal_name: 'Associação de Teste',
  trade_name: null, cnae_primary: '9430800', cnae_primary_description: 'Atividades de associações de defesa de direitos sociais',
  cnae_secondary: [], municipality: 'Rio de Janeiro', uf: 'RJ', validation_status: 'validada',
};
const fetchInstitution = async (userId) => (userId === AGENT || userId === OTHER_AGENT ? INSTITUTION : null);

function postDbFiles() {
  const services = path.join(__dirname, '../..');
  return fs.readFileSync(path.join(services, 'migrations.manifest'), 'utf8')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(/\s+/)).filter(([db]) => db === 'post_db')
    .map(([, file]) => path.join(services, file));
}

/** S3 em memória; `failPut` simula o bucket fora do ar na gravação. */
function memoryStorage() {
  const objects = new Map();
  const state = { failPut: false, puts: 0 };
  return {
    objects,
    state,
    async presignPut({ key, contentType }) {
      return { url: `https://s3.test/${key}`, headers: { 'Content-Type': contentType }, expiresIn: 900 };
    },
    async presignGet({ key, expiresIn, disposition }) { return `https://s3.test/${key}?get&exp=${expiresIn}&d=${disposition}`; },
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
    async put({ key, body, contentType, sha256 }) {
      if (state.failPut) throw new Error('S3 indisponível (simulado)');
      assert.equal(sha256, crypto.createHash('sha256').update(body).digest('hex'));
      state.puts += 1;
      objects.set(key, { bytes: Uint8Array.from(body), contentType });
    },
    async copy(from, to) { objects.set(to, objects.get(from)); },
    async remove(key) { objects.delete(key); },
  };
}

test('dossiê: envio (S3 fora) → regeneração → reenvio → publicação → versão pública e verificação',
  { skip: !DATABASE_URL && 'defina DM_E2E_DATABASE_URL (npm run test:e2e)' }, async () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const admin = await pool.connect();
    for (let round = 0; round < 2; round += 1) {
      for (const file of postDbFiles()) await admin.query(fs.readFileSync(file, 'utf8'));
    }
    // Grants do dm-infra (db/migrations/gestao/004, 007 e 008).
    await admin.query(`DO $$ BEGIN CREATE ROLE gestao_app LOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await admin.query('GRANT SELECT ON ALL TABLES IN SCHEMA public TO gestao_app');
    await admin.query(`GRANT UPDATE (status, review_state, review_note, reviewed_by, archive_reason, updated_at)
                         ON demands TO gestao_app`);
    await admin.query('GRANT SELECT ON demand_dossiers TO gestao_app');
    admin.release();
    const gestaoUrl = new URL(DATABASE_URL);
    gestaoUrl.username = 'gestao_app';
    gestaoUrl.password = '';
    const gestao = new Pool({ connectionString: gestaoUrl.toString() });

    const storage = memoryStorage();
    const errors = [];
    const logger = { error: (...args) => errors.push(args.join(' ')) };
    const dossiers = createDossierService({ pool, storage, fetchInstitution, siteUrl: SITE, logger, backoffSeconds: 0 });
    const server = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set([OPERATOR]), uploadStorage: storage, dossierService: dossiers,
    }).listen(0);
    const base = `http://127.0.0.1:${server.address().port}`;

    // Ambiente sem bucket: mesmas rotas, dossiê `indisponivel`.
    const noBucket = createDossierService({ pool, storage: null, fetchInstitution, siteUrl: SITE, logger });
    const serverNoBucket = createApp({
      pool, secret: SECRET, institutionStatus, operationUserIds: new Set(), uploadStorage: null, dossierService: noBucket,
    }).listen(0);
    const baseNoBucket = `http://127.0.0.1:${serverNoBucket.address().port}`;

    const call = async (method, url, { as = AGENT, body, auth = true, root = base } = {}) => {
      const headers = { 'content-type': 'application/json' };
      if (auth) headers.authorization = `Bearer ${token(as)}`;
      const res = await fetch(`${root}${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
      return { status: res.status, location: res.headers.get('location'), body: await res.json().catch(() => null) };
    };

    /** Espera a geração em segundo plano disparada pelo envio. */
    async function settled(id, predicate, { root = base } = {}) {
      for (let i = 0; i < 100; i += 1) {
        const list = await call('GET', `/demands/${id}/dossiers`, { root });
        if (list.status === 200 && predicate(list.body.dossiers)) return list.body.dossiers;
        await new Promise((r) => setTimeout(r, 30));
      }
      throw new Error(`dossiê não chegou ao estado esperado: ${JSON.stringify((await call('GET', `/demands/${id}/dossiers`, { root })).body)}`);
    }

    async function buildDemand({ root = base, photo = true } = {}) {
      const created = await call('POST', '/demands', {
        root,
        body: {
          category: 'projeto_ambiental', title: 'Horta comunitária na praça',
          description: 'Implantar horta comunitária com canteiros elevados.',
          objective: 'Produzir alimentos e ocupar o espaço público.',
          justification: 'A praça está abandonada e o bairro não tem área verde cuidada.',
          beneficiariesEstimate: 250, beneficiariesProfile: 'Moradores do entorno, escolas e idosos',
          problemIdentified: 'Situação sem resposta no território.', coverageArea: 'Bairro e entorno.',
          priority: 'alta', photoRef: 'https://example.org/foto-praca.jpg', cep: '22790-000',
          street: 'Rua das Flores', addressNumber: '100', district: 'Recreio', municipality: 'Rio de Janeiro',
          uf: 'RJ', latitude: -23.0247, longitude: -43.4567, territory: 'Recreio dos Bandeirantes',
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const id = created.body.id;
      const s1 = await call('POST', `/demands/${id}/schedule-items`, {
        root, body: { stage: 'Preparação', activities: 'Limpeza e registro inicial', startsOn: '2026-10-01', endsOn: '2026-10-15', responsible: 'Maria Silva', recordMilestones: ['antes', 'depois'] },
      });
      assert.equal(s1.status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        root, body: { description: 'Madeira e terra', quantity: '10', unit: 'kit', unitPriceCents: 90000, scheduleItemId: s1.body.item.id },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/budget-items`, {
        root, body: { description: 'Fotografia e filmagem do antes e do depois', quantity: 1, unit: 'serviço', unitPriceCents: 100000, isAudiovisualRecord: true },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/goals`, {
        root, body: { goal: '20 canteiros', expectedResult: 'Produção semanal', indicator: 'Canteiros ativos', measurementMethod: 'Contagem mensal' },
      })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/resources`, { root, body: { kind: 'necessario', type: 'materiais' } })).status, 201);
      assert.equal((await call('POST', `/demands/${id}/documents`, {
        root, body: { type: 'orcamentos_e_cotacoes', title: 'Cotação da madeira', reference: 'https://example.org/cotacao.pdf', description: 'Documento interno de cotação' },
      })).status, 201);
      if (photo) {
        const ticket = await call('POST', '/uploads/presign', { root, body: { purpose: 'demand_photo', contentType: 'image/png', size: PNG.length, fileName: 'praça.png' } });
        assert.equal(ticket.status, 201, JSON.stringify(ticket.body));
        storage.objects.set(`tmp/${ticket.body.uploadId}`, { bytes: Uint8Array.from(PNG), contentType: 'image/png' });
        const confirmed = await call('POST', `/uploads/${ticket.body.uploadId}/confirm`, { root, body: { demandId: id } });
        assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
        assert.equal((await call('PUT', `/demands/${id}`, { root, body: { photoRef: confirmed.body.ref } })).status, 200);
      }
      return id;
    }

    try {
      const id = await buildDemand();

      // ── Envio com o S3 fora: o envio responde 200 e o dossiê fica `falhou` ──
      storage.state.failPut = true;
      const submitted = await call('POST', `/demands/${id}/submit`);
      assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
      assert.equal(submitted.body.reviewState, 'aguardando_analise');
      let versions = await settled(id, (list) => list.length === 1 && list[0].status === 'falhou');
      assert.equal(versions[0].version, 1);
      assert.equal(versions[0].trigger, 'envio');
      assert.equal(versions[0].variant, 'integral');
      assert.match(versions[0].statusReason, /S3 indisponível/);
      assert.match(versions[0].number, /^DMC-\d{4}-\d{6}$/);
      assert.ok(errors.some((e) => e.includes('S3 indisponível')));
      const notYet = await call('GET', `/demands/${id}/dossiers/${versions[0].id}/download`);
      assert.equal(notYet.status, 409);
      assert.equal(notYet.body.code, 'dossier_not_generated');

      // ── Acesso: outro agente não vê (404); sem token 401; operação vê ──────
      assert.equal((await call('GET', `/demands/${id}/dossiers`, { as: OTHER_AGENT })).status, 404);
      assert.equal((await call('GET', `/demands/${id}/dossiers`, { auth: false })).status, 401);
      assert.equal((await call('GET', `/demands/${id}/dossiers`, { as: OPERATOR })).status, 200);
      assert.equal((await call('POST', `/demands/${id}/dossiers/regenerate`, { as: OTHER_AGENT })).status, 404);

      // ── Regeneração pelo autor com o S3 de volta ─────────────────────────
      storage.state.failPut = false;
      const regen = await call('POST', `/demands/${id}/dossiers/regenerate`);
      assert.equal(regen.status, 200, JSON.stringify(regen.body));
      assert.equal(regen.body.generated, 1);
      const [v1] = regen.body.dossiers;
      assert.equal(v1.status, 'gerado');
      assert.equal(v1.statusReason, null);
      assert.match(v1.contentSha256, /^[0-9a-f]{64}$/);
      assert.equal(v1.verifyPath, `/dossie/verificar/${v1.contentSha256}`);

      const download = await call('GET', `/demands/${id}/dossiers/${v1.id}/download`);
      assert.equal(download.status, 200);
      assert.equal(download.body.url, `https://s3.test/demands/${id}/dossie/v1.pdf?get&exp=60&d=attachment`);
      assert.equal(download.body.fileName, `dossie-${v1.number}-v1.pdf`);
      const file = Buffer.from(storage.objects.get(`demands/${id}/dossie/v1.pdf`).bytes);
      assert.equal(file.subarray(0, 5).toString('latin1'), '%PDF-');
      assert.match(file.toString('latin1'), /\/Subtype \/Image/, 'a fotografia enviada entra no PDF');
      assert.equal(crypto.createHash('sha256').update(file).digest('hex'), v1.fileSha256);

      // Hash do conteúdo recalculado do JSON gravado confere.
      const { rows: [stored] } = await pool.query(
        'SELECT content, content_sha256, upload_id, object_key FROM demand_dossiers WHERE id = $1', [v1.id],
      );
      assert.equal(contentHash(stored.content), stored.content_sha256);
      assert.equal(stored.content.agent.institution.cnpj, '11222333000181');
      assert.equal(stored.content.location.street, 'Rua das Flores');
      assert.equal(stored.content.photo.embedded, true);
      const { rows: [up] } = await pool.query('SELECT purpose, status, owner_id, demand_id, object_key, sha256 FROM uploads WHERE id = $1', [stored.upload_id]);
      assert.deepEqual(up, {
        purpose: 'demand_dossier', status: 'confirmado', owner_id: AGENT, demand_id: id,
        object_key: `demands/${id}/dossie/v1.pdf`, sha256: v1.fileSha256,
      });
      // O dossiê é privado na rota de uploads (só o dono e a operação).
      assert.equal((await call('GET', `/uploads/${stored.upload_id}`, { as: OTHER_AGENT })).status, 404);
      assert.equal((await call('GET', `/uploads/${stored.upload_id}/content`, { auth: false })).status, 404);

      // Linha do tempo: dossie_gerado privado (demanda ainda em análise).
      const events = (await call('GET', `/demands/mine/${id}/events`)).body.events;
      const generatedEvent = events.find((e) => e.type === 'dossie_gerado');
      assert.equal(generatedEvent.isPublic, false);
      assert.equal(generatedEvent.actorType, 'sistema');
      assert.deepEqual(generatedEvent.payload, {
        dossierId: v1.id, number: v1.number, version: 1, trigger: 'envio', contentSha256: v1.contentSha256,
      });

      // ── Imutabilidade (trigger) e gestão só leitura ─────────────────────
      await assert.rejects(pool.query("UPDATE demand_dossiers SET status_reason = 'x' WHERE id = $1", [v1.id]), /imutável/);
      await assert.rejects(pool.query('DELETE FROM demand_dossiers WHERE id = $1', [v1.id]), /não são excluídos/);
      await assert.rejects(pool.query('TRUNCATE demand_dossiers CASCADE'), /não são excluídos/);
      const { rows: seen } = await gestao.query('SELECT version, status, object_key FROM demand_dossiers WHERE demand_id = $1', [id]);
      assert.deepEqual(seen, [{ version: 1, status: 'gerado', object_key: `demands/${id}/dossie/v1.pdf` }]);
      await assert.rejects(gestao.query("UPDATE demand_dossiers SET status_reason = 'x' WHERE id = $1", [v1.id]), /permission denied|só lê/);

      // ── Verificação pública por hash (demanda ainda não publicada) ───────
      const verified = await call('GET', `/demands/dossiers/verify/${v1.contentSha256}`, { auth: false });
      assert.equal(verified.status, 200);
      assert.equal(verified.body.valid, true);
      assert.equal(verified.body.matchedBy, 'content');
      assert.equal(verified.body.dossier.number, v1.number);
      assert.equal(verified.body.dossier.isLatest, true);
      assert.equal(verified.body.demand, null, 'demanda não publicada não expõe título');
      const byFile = await call('GET', `/demands/dossiers/verify/${v1.fileSha256.toUpperCase()}`, { auth: false });
      assert.equal(byFile.body.matchedBy, 'file');
      assert.equal((await call('GET', `/demands/dossiers/verify/${'0'.repeat(64)}`, { auth: false })).status, 404);
      assert.equal((await call('GET', '/demands/dossiers/verify/abc', { auth: false })).status, 422);

      // ── Devolução, ajuste e reenvio → v2 `reenvio` ───────────────────────
      await gestao.query(
        `UPDATE demands SET review_state = 'devolvida', review_note = 'Detalhe o cronograma',
                reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1`, [id],
      );
      assert.equal((await call('PUT', `/demands/${id}`, { body: { title: 'Horta comunitária da praça central' } })).status, 200);
      assert.equal((await call('POST', `/demands/${id}/submit`)).status, 200);
      versions = await settled(id, (list) => list.some((d) => d.version === 2 && d.status === 'gerado'));
      const v2 = versions.find((d) => d.version === 2);
      assert.equal(v2.trigger, 'reenvio');
      assert.notEqual(v2.contentSha256, v1.contentSha256);
      assert.equal(v2.number, v1.number, 'o número do dossiê se mantém entre versões');
      assert.equal((await call('GET', `/demands/dossiers/verify/${v1.contentSha256}`, { auth: false })).body.dossier.isLatest, false);

      // Público ainda não baixa (demanda em análise).
      assert.equal((await call('GET', `/demands/${id}/dossie-publico`, { auth: false })).status, 404);
      assert.equal((await call('GET', `/demands/${id}/dossie-publico/info`, { auth: false })).status, 404);

      // ── Publicação pela gestão (direto no banco) → o laço gera v3 ────────
      await gestao.query("UPDATE demands SET status = 'publicada', reviewed_by = 'Equipe DM', updated_at = NOW() WHERE id = $1", [id]);
      await dossiers.tick();
      versions = (await call('GET', `/demands/${id}/dossiers`)).body.dossiers;
      const v3 = versions.filter((d) => d.version === 3);
      assert.deepEqual(v3.map((d) => [d.variant, d.trigger, d.status]).sort(), [
        ['integral', 'publicacao', 'gerado'], ['publica', 'publicacao', 'gerado'],
      ]);
      const publicRow = v3.find((d) => d.variant === 'publica');

      const info = await call('GET', `/demands/${id}/dossie-publico/info`, { auth: false });
      assert.equal(info.status, 200);
      assert.equal(info.body.available, true);
      assert.equal(info.body.dossier.version, 3);
      assert.equal(info.body.dossier.contentSha256, publicRow.contentSha256);
      const publicDownload = await call('GET', `/demands/${id}/dossie-publico`, { auth: false });
      assert.equal(publicDownload.status, 302);
      assert.equal(publicDownload.location, `https://s3.test/demands/${id}/dossie/v3-publica.pdf?get&exp=300&d=attachment`);

      // Versão pública redigida: sem endereço completo, responsáveis e documentos internos.
      const { rows: [pub] } = await pool.query('SELECT content FROM demand_dossiers WHERE id = $1', [publicRow.id]);
      const publicJson = JSON.stringify(pub.content);
      for (const secret of ['Rua das Flores', '22790000', 'Maria Silva', 'Documento interno de cotação', AGENT, ORG, 'upload:']) {
        assert.ok(!publicJson.includes(secret), `versão pública não pode conter ${secret}`);
      }
      assert.equal(pub.content.location.territory, 'Recreio dos Bandeirantes');
      assert.equal(pub.content.documents[0].title, 'Cotação da madeira');
      assert.ok(storage.objects.has(`demands/${id}/dossie/v3-publica.pdf`));

      // Histórico (Modelo §06, T-05-10): a versão da publicação lista os eventos
      // até ali; a pública só os públicos, sem a devolução, o ator e a nota.
      const integralRow = v3.find((d) => d.variant === 'integral');
      const { rows: [full] } = await pool.query('SELECT content FROM demand_dossiers WHERE id = $1', [integralRow.id]);
      const fullTypes = full.content.history.map((h) => h.type);
      for (const type of ['criada', 'enviada_para_analise', 'devolvida_para_ajustes', 'publicada']) {
        assert.ok(fullTypes.includes(type), `histórico integral com ${type}`);
      }
      assert.ok(full.content.history.some((h) => h.label === 'Reenviada para análise'));
      assert.ok(full.content.history.every((h) => /^\d{4}-\d{2}-\d{2}T/.test(h.at) && h.actorType));
      const publicTypes = pub.content.history.map((h) => h.type);
      assert.ok(publicTypes.includes('publicada'));
      assert.ok(!publicTypes.includes('devolvida_para_ajustes'), 'a devolução não entra na versão pública');
      assert.ok(pub.content.history.every((h) => !('actorType' in h) && !('note' in h)));
      assert.ok(!publicJson.includes('Detalhe o cronograma'), 'o parecer da devolução fica fora da versão pública');

      // Verificação da versão pública mostra a demanda publicada.
      const verifiedPublic = await call('GET', `/demands/dossiers/verify/${publicRow.contentSha256}`, { auth: false });
      assert.equal(verifiedPublic.body.demand.id, id);
      assert.equal(verifiedPublic.body.demand.title, 'Horta comunitária da praça central');
      assert.equal(verifiedPublic.body.dossier.variant, 'publica');

      // O dossiê da publicação entra na linha do tempo pública (uma vez).
      const timeline = (await call('GET', `/demands/${id}/timeline`, { auth: false })).body.events;
      assert.equal(timeline.filter((e) => e.type === 'dossie_gerado').length, 1);

      // Reprocessar não cria versão nova (idempotente).
      await dossiers.tick();
      await dossiers.request(id);
      assert.equal((await call('GET', `/demands/${id}/dossiers`)).body.dossiers.length, 4);

      // ── Sem bucket: o envio segue; o dossiê fica `indisponivel` com motivo ─
      const other = await buildDemand({ root: baseNoBucket, photo: false });
      const noBucketSubmit = await call('POST', `/demands/${other}/submit`, { root: baseNoBucket });
      assert.equal(noBucketSubmit.status, 200, JSON.stringify(noBucketSubmit.body));
      const pending = await settled(other, (list) => list.length === 1, { root: baseNoBucket });
      assert.equal(pending[0].status, 'indisponivel');
      assert.match(pending[0].statusReason, /DM_UPLOADS_BUCKET/);
      const regenNoBucket = await call('POST', `/demands/${other}/dossiers/regenerate`, { root: baseNoBucket });
      assert.equal(regenNoBucket.status, 503);
      assert.equal(regenNoBucket.body.code, 'uploads_unavailable');
      // Quando o bucket existe (outra instância com S3), o laço gera a versão.
      await dossiers.tick();
      const recovered = (await call('GET', `/demands/${other}/dossiers`)).body.dossiers;
      assert.equal(recovered[0].status, 'gerado');
      const { rows: [noPhoto] } = await pool.query('SELECT content FROM demand_dossiers WHERE id = $1', [recovered[0].id]);
      assert.equal(noPhoto.content.photo.embedded, false, 'link externo não é baixado');
    } finally {
      dossiers.stop();
      await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => serverNoBucket.close(resolve));
      await dossiers.idle();
      await noBucket.idle();
      await gestao.end();
      await pool.end();
    }
  });
