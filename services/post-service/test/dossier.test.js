// Dossiê da Demanda (T10): conteúdo, redação da versão pública, hash e PDF.
// O ciclo com banco e S3 simulado está em dossier-e2e.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const content = require('../src/dossier/content');
const { renderDossierPdf, formatCents, formatCnpj, formatCnae } = require('../src/dossier/pdf');
const { createPublicInstitutionClient } = require('../src/dossier/institution');
const { dossierKey, serializeDossier } = require('../src/dossier/service');
const brand = require('../src/dossier/brand');

const ROOT = path.join(__dirname, '../../..');

// Dados de exemplo, só neste teste isolado.
const ROW = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  author_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  author_name: 'Conta de teste',
  organization_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  category: 'projeto_ambiental',
  title: 'Horta comunitária na praça',
  description: 'Canteiros elevados e oficinas de educação ambiental.',
  objective: 'Produzir alimentos e ocupar o espaço público.',
  justification: 'A praça está abandonada.',
  beneficiaries_estimate: 250,
  beneficiaries_profile: 'Moradores do entorno, escolas e idosos',
  priority: 'alta',
  has_physical_execution: true,
  photo_ref: 'upload:dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  cep: '22790000',
  street: 'Rua das Flores',
  address_number: '100',
  address_complement: 'Fundos',
  district: 'Recreio',
  municipality: 'Rio de Janeiro',
  uf: 'RJ',
  latitude: '-23.02470000',
  longitude: '-43.45670000',
  territory: 'Recreio dos Bandeirantes',
  budget_amount_cents: '1000000',
  agent_fee_bps: 400,
  platform_fee_bps: 600,
  agent_fee_cents: '40000',
  platform_fee_cents: '60000',
  total_amount_cents: '1100000',
  status: 'em_analise',
  submitted_at: new Date('2026-09-22T12:00:00Z'),
  published_at: null,
};

const ITEMS = {
  scheduleItems: [
    { id: 's1', stage: 'Preparação', activities: 'Limpeza e registro inicial', starts_on: '2026-10-01', ends_on: '2026-10-15', responsible: 'Maria Silva', record_milestones: ['antes'] },
    { id: 's2', stage: 'Plantio', activities: 'Canteiros e plantio', starts_on: '2026-10-16', ends_on: '2026-11-30', responsible: null, record_milestones: ['acompanhamento', 'depois'] },
  ],
  budgetItems: [
    { description: 'Madeira e terra', quantity: '10.000', unit: 'kit', unit_price_cents: '90000', total_cents: '900000', is_audiovisual_record: false, schedule_item_id: 's2' },
    { description: 'Fotografia e filmagem do antes e do depois', quantity: '1.000', unit: 'serviço', unit_price_cents: '100000', total_cents: '100000', is_audiovisual_record: true, schedule_item_id: 's1' },
  ],
  goals: [{ goal: '20 canteiros', expected_result: 'Produção semanal', indicator: 'Canteiros ativos', measurement_method: 'Contagem mensal' }],
  resources: [
    { kind: 'necessario', resource_type: 'materiais', description: null },
    { kind: 'contrapartida', resource_type: 'equipe', description: 'Mutirão' },
  ],
  documents: [{ document_type: 'orcamentos_e_cotacoes', title: 'Cotação da madeira', reference: 'upload:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', description: 'Três orçamentos' }],
};

const INSTITUTION = {
  institution_kind: 'agente_transformacao',
  cnpj: '11222333000181',
  legal_name: 'Associação de Teste',
  trade_name: 'Teste',
  cnae_primary: '9430800',
  cnae_primary_description: 'Atividades de associações de defesa de direitos sociais',
  cnae_secondary: [{ code: '8599604', description: 'Treinamento em desenvolvimento profissional' }],
  municipality: 'Rio de Janeiro',
  uf: 'RJ',
  validation_status: 'validada',
};

const meta = (variant, extra = {}) => ({
  number: 'DMC-2026-000001', version: 1, variant, trigger: variant === 'publica' ? 'publicacao' : 'envio',
  issuedAt: '2026-09-22T12:30:00.000Z', ...extra,
});

test('snapshot reúne o que a fonte lista (slide 19)', () => {
  const snapshot = content.demandSnapshot(ROW, ITEMS);
  const c = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('integral') });
  assert.equal(c.document, 'Documento Oficial da Demanda — Dossiê da Demanda');
  assert.equal(c.agent.institution.cnpj, '11222333000181');
  assert.equal(c.agent.institution.cnaePrimary, '9430800');
  assert.deepEqual(c.agent.institution.cnaeSecondary, [{ code: '8599604', description: 'Treinamento em desenvolvimento profissional' }]);
  for (const key of ['category', 'description', 'justification', 'objective', 'beneficiariesEstimate', 'beneficiariesProfile']) {
    assert.ok(c.demand[key] !== null && c.demand[key] !== undefined, key);
  }
  assert.equal(c.location.territory, 'Recreio dos Bandeirantes');
  assert.equal(c.budget.items.length, 2);
  assert.equal(c.budget.items[1].scheduleStage, 'Preparação');
  assert.deepEqual(c.budget.composition, {
    budgetAmountCents: 1_000_000, agentFeeBps: 400, platformFeeBps: 600,
    agentFeeCents: 40_000, platformFeeCents: 60_000, totalAmountCents: 1_100_000,
  });
  assert.equal(c.audiovisualCents, 100_000);
  assert.deepEqual(c.deadlines, { startsOn: '2026-10-01', endsOn: '2026-11-30', durationDays: 61, stages: 2 });
  assert.equal(c.goals[0].indicator, 'Canteiros ativos');
  assert.deepEqual(c.resources.necessary, [{ type: 'materiais', description: null }]);
  assert.deepEqual(c.resources.counterpart, [{ type: 'equipe', description: 'Mutirão' }]);
  assert.deepEqual(c.documents, [{ type: 'orcamentos_e_cotacoes', title: 'Cotação da madeira', description: 'Três orçamentos', source: 'arquivo' }]);
  assert.equal(c.photo.ref, ROW.photo_ref);
  // Integral guarda o endereço completo e o responsável.
  assert.equal(c.location.street, 'Rua das Flores');
  assert.equal(c.location.cep, '22790000');
  assert.equal(c.schedule[0].responsible, 'Maria Silva');
});

test('versão pública: sem endereço completo, coordenadas, responsáveis, contatos nem links', () => {
  const snapshot = content.demandSnapshot(ROW, ITEMS);
  const c = content.buildDossierContent({ snapshot, institution: { ...INSTITUTION, institutional_email: 'x@y.org' }, meta: meta('publica') });
  const json = JSON.stringify(c);
  for (const secret of ['Rua das Flores', '22790000', 'Fundos', 'Maria Silva', '-23.0247', 'Três orçamentos', 'x@y.org',
    ROW.author_id, ROW.organization_id, 'upload:']) {
    assert.ok(!json.includes(secret), `não pode conter ${secret}`);
  }
  assert.equal(c.location.municipality, 'Rio de Janeiro');
  assert.equal(c.location.territory, 'Recreio dos Bandeirantes');
  assert.equal(c.documents[0].title, 'Cotação da madeira');
  assert.equal(c.photo.ref, null);
  // O snapshot gravado não muda: a redação é só da variante.
  assert.equal(snapshot.location.street, 'Rua das Flores');
});

test('hash: JSON canônico estável, sensível a qualquer mudança', () => {
  const snapshot = content.demandSnapshot(ROW, ITEMS);
  const a = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('integral') });
  const reordered = JSON.parse(JSON.stringify(a), (_k, v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).reverse()) : v));
  assert.equal(content.contentHash(a), content.contentHash(reordered));
  assert.match(content.contentHash(a), content.HASH_RE);
  const changed = structuredClone(a);
  changed.budget.items[0].totalCents += 1;
  assert.notEqual(content.contentHash(a), content.contentHash(changed));
  assert.equal(content.canonicalJson({ b: 1, a: [2, { d: null, c: 'ç' }] }), '{"a":[2,{"c":"ç","d":null}],"b":1}');
  assert.equal(content.verifyUrl('https://homologacao.dmconecta.org/', 'f'.repeat(64)),
    `https://homologacao.dmconecta.org/dossie/verificar/${'f'.repeat(64)}`);
  assert.equal(content.formatDossierNumber(2026, 42), 'DMC-2026-000042');
});

test('PDF: gera com dados de exemplo, fontes embutidas e várias páginas', async () => {
  const snapshot = content.demandSnapshot(ROW, ITEMS);
  for (const variant of ['integral', 'publica']) {
    const c = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta(variant) });
    const hash = content.contentHash(c);
    const pdf = await renderDossierPdf(c, { verifyUrl: content.verifyUrl('https://dmconecta.org', hash), contentSha256: hash });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    const raw = pdf.toString('latin1');
    // Fontes do manual de marca embutidas (subconjunto), o que garante a acentuação.
    assert.match(raw, /\/BaseFont \/[A-Z]{6}\+DMSans-Regular/);
    assert.match(raw, /\/BaseFont \/[A-Z]{6}\+DMSans-Bold/);
    assert.match(raw, /\/FontFile2/);
    assert.ok((raw.match(/\/Type \/Page\b/g) ?? []).length >= 2, 'mais de uma página');
    assert.ok(pdf.length > 20_000 && pdf.length < 2_000_000);
  }
});

test('PDF: fotografia JPEG/PNG embutida; formato não suportado vira aviso', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const snapshot = content.demandSnapshot(ROW, ITEMS);
  const photo = { bytes: png, sha256: content.sha256Hex(png), contentType: 'image/png', embedded: true };
  const c = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('integral'), photo });
  assert.equal(c.photo.sha256, content.sha256Hex(png));
  const hash = content.contentHash(c);
  const withPhoto = await renderDossierPdf(c, { verifyUrl: 'https://dmconecta.org/x', contentSha256: hash, photo });
  assert.match(withPhoto.toString('latin1'), /\/Subtype \/Image/);
  const broken = await renderDossierPdf(c, {
    verifyUrl: 'https://dmconecta.org/x', contentSha256: hash, photo: { ...photo, bytes: Buffer.from('não é imagem') },
  });
  assert.doesNotMatch(broken.toString('latin1'), /\/Subtype \/Image/);
});

test('formatação: moeda, CNPJ e CNAE', () => {
  assert.equal(formatCents(1_100_000), 'R$ 11.000,00');
  assert.equal(formatCents(5), 'R$ 0,05');
  assert.equal(formatCnpj('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatCnae('9430800'), '9430-8/00');
});

test('chave S3 e serialização da versão', () => {
  assert.equal(dossierKey('x', 3, 'integral'), 'demands/x/dossie/v3.pdf');
  assert.equal(dossierKey('x', 3, 'publica'), 'demands/x/dossie/v3-publica.pdf');
  const s = serializeDossier({
    id: '1', demand_id: 'x', dossier_number: 'DMC-2026-000001', version: 2, variant: 'integral', trigger_kind: 'reenvio',
    status: 'falhou', status_reason: 'S3 fora', attempts: 1, content_sha256: null, file_sha256: null, size_bytes: null,
    generated_at: null, requested_at: new Date('2026-09-22T00:00:00Z'),
  });
  assert.equal(s.statusReason, 'S3 fora');
  assert.equal(s.fileName, 'dossie-DMC-2026-000001-v2.pdf');
  assert.equal(s.verifyPath, null);
});

test('cliente da instituição pública: 404 → null; erro → lança (a geração tenta de novo)', async () => {
  const calls = [];
  const ok = createPublicInstitutionClient({
    baseUrl: 'http://user-service:3002/',
    fetchImpl: async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => INSTITUTION }; },
  });
  assert.equal((await ok('u-1')).cnpj, '11222333000181');
  assert.equal(calls[0], 'http://user-service:3002/u-1/institution');
  const missing = createPublicInstitutionClient({ baseUrl: 'http://u', fetchImpl: async () => ({ ok: false, status: 404 }) });
  assert.equal(await missing('u'), null);
  const down = createPublicInstitutionClient({ baseUrl: 'http://u', fetchImpl: async () => ({ ok: false, status: 502 }) });
  await assert.rejects(down('u'), /502/);
  await assert.rejects(createPublicInstitutionClient({ baseUrl: '' })('u'), /DM_INTERNAL_USER_API_URL/);
});

test('monograma e rótulos iguais aos do frontend', () => {
  const brandTs = fs.readFileSync(path.join(ROOT, 'src/lib/app/brand.ts'), 'utf8');
  assert.ok(brandTs.includes(brand.DM_MARK_PATH), 'DM_MARK_PATH diverge de src/lib/app/brand.ts');
  assert.ok(brandTs.includes(`"${brand.DM_MARK_VIEWBOX}"`));
  const demandTs = fs.readFileSync(path.join(ROOT, 'src/lib/app/demand.ts'), 'utf8');
  for (const labels of [content.RESOURCE_TYPE_LABELS, content.DOCUMENT_TYPE_LABELS]) {
    for (const [key, label] of Object.entries(labels)) {
      assert.ok(demandTs.includes(`${key}: "${label}"`), `${key}: "${label}" diverge de src/lib/app/demand.ts`);
    }
  }
});

test('migração 009: imutabilidade e finalidade demand_dossier', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/009-demand-dossiers.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS demand_dossiers/);
  assert.match(sql, /'demand_dossier'\)\);/);
  assert.match(sql, /dossiê gerado é imutável/);
  assert.match(sql, /BEFORE TRUNCATE ON demand_dossiers/);
  const manifest = fs.readFileSync(path.join(__dirname, '../../migrations.manifest'), 'utf8');
  assert.match(manifest, /^post_db post-service\/migrations\/009-demand-dossiers\.sql$/m);
});
