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

// ── Prestação de contas no dossiê (T18) ──────────────────────────────────────
const ACCOUNTABILITY = {
  accountability: {
    id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
    status: 'concluida',
    executionReport: 'Os 20 canteiros foram construídos e entregues.',
    actionsRecord: 'Mutirões em 3, 10 e 17 de novembro.',
    scheduleSummary: 'As duas etapas foram concluídas com 10 dias de atraso.',
    beneficiariesReached: 310,
    beneficiariesEstimate: 250,
    beneficiariesNote: 'Moradores e duas escolas.',
    impactIndicators: 'Produção semanal de 40 kg de hortaliças.',
    financialSupport: true,
    financialSummary: 'R$ 9.000,00 aplicados em madeira e terra.',
    executedAmountCents: 900000,
    participants: 'Associação de moradores, duas escolas e 12 voluntários.',
    executedFrom: '2026-10-01',
    executedTo: '2026-12-10',
    locationSummary: 'Praça central e pátio da escola municipal.',
    finalResult: 'Horta produzindo e cuidada pela comunidade.',
    concludedAt: '2026-12-20T12:00:00.000Z',
  },
  results: [{
    id: 'r1', goalId: 'g1', position: 0, goal: '20 canteiros', indicator: 'Canteiros ativos',
    expectedResult: 'Produção semanal', plannedMeasurementMethod: 'Contagem mensal',
    measuredValue: '20 canteiros ativos', measurementMethod: 'Contagem em campo, com foto',
    achieved: true, evidenceId: null, createdAt: null, updatedAt: null,
  }],
  documents: [{
    id: 'd1', kind: 'comprovante_financeiro', title: 'Nota fiscal 123',
    issuedOn: '2026-11-20', amountCents: 500000,
  }],
  summary: {
    goalsTotal: 1, goalsAchieved: 1, documentsTotal: 1, financialReceipts: 1, financialReceiptsCents: 500000,
  },
};

test('prestação de contas concluída entra no dossiê, integral e público (T18)', async () => {
  const snapshot = content.demandSnapshot(ROW, ITEMS, { accountability: ACCOUNTABILITY });
  assert.equal(snapshot.accountability.beneficiariesReached, 310);
  // Registro de resultados do Modelo de Conexão §21 (T-05-13).
  assert.match(snapshot.accountability.participants, /12 voluntários/);
  assert.equal(snapshot.accountability.executedFrom, '2026-10-01');
  assert.match(snapshot.accountability.finalResult, /Horta produzindo/);
  assert.equal(snapshot.accountability.results[0].measuredValue, '20 canteiros ativos');
  assert.equal(snapshot.accountability.documents[0].amountCents, 500000);

  const integral = content.buildDossierContent({
    snapshot, institution: INSTITUTION, meta: meta('integral', { trigger: 'prestacao_de_contas' }),
  });
  assert.equal(integral.trigger, 'prestacao_de_contas');
  assert.equal(integral.accountability.beneficiariesEstimate, 250);

  // A versão pública repete a mesma projeção (já é a pública: sem nota interna
  // do resultado e sem o arquivo do comprovante).
  const publica = content.buildDossierContent({
    snapshot, institution: INSTITUTION, meta: meta('publica', { trigger: 'prestacao_de_contas' }),
  });
  const json = JSON.stringify(publica.accountability);
  assert.ok(!json.includes('upload:'));
  assert.ok(!/"note"/.test(json));
  assert.equal(publica.accountability.summary.goalsAchieved, 1);

  const pdf = await renderDossierPdf(integral, {
    verifyUrl: 'https://dmconecta.org/dossie/verificar/' + 'a'.repeat(64),
    contentSha256: 'a'.repeat(64),
  });
  assert.ok(pdf.length > 10_000, 'o PDF da prestação é gerado');
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');

  // Sem prestação concluída a seção não existe.
  const semPrestacao = content.buildDossierContent({
    snapshot: content.demandSnapshot(ROW, ITEMS), institution: INSTITUTION, meta: meta('integral'),
  });
  assert.equal(semPrestacao.accountability, null);
});

test('migração 015: prestação congelada, gestão só lê e novo gatilho do dossiê (T18)', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/015-accountability.sql'), 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS demand_accountability\b/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS demand_accountability_results/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS demand_accountability_documents/);
  assert.match(sql, /'demand_accountability_document'\)\);/);
  assert.match(sql, /BEFORE TRUNCATE ON demand_accountability/);
  assert.match(sql, /trigger_kind IN \('envio', 'reenvio', 'publicacao', 'conclusao', 'prestacao_de_contas'\)/);
  const manifest = fs.readFileSync(path.join(__dirname, '../../migrations.manifest'), 'utf8');
  assert.match(manifest, /^post_db post-service\/migrations\/015-accountability\.sql$/m);
});

test('módulo específico (T-05-08): dossiê mostra o módulo e as informações; a versão pública omite o imóvel', async () => {
  const ambiental = content.demandSnapshot({
    ...ROW,
    category: 'recuperacao_ambiental',
    module_details: {
      area_m2: 1200.5, diagnostico: 'Restinga degradada',
      responsavel_tecnico: { nome: 'Ana Souza', registro: 'CRBio 12345' },
      imovel: { documento: 'não é deste módulo' },
    },
  }, ITEMS);
  assert.equal(ambiental.demand.module, 'ambiental');
  assert.equal(ambiental.demand.moduleLabel, 'Módulo Ambiental');
  assert.equal(ambiental.demand.moduleDetails.imovel, undefined, 'só as chaves do módulo');
  const lines = Object.fromEntries(content.moduleDetailLines(ambiental.demand));
  assert.equal(lines['Área (m²)'], '1.200,5 m²');
  assert.equal(lines['Responsável técnico'], 'Nome: Ana Souza\nRegistro profissional (CREA, CAU, CRBio ou outro): CRBio 12345');
  const c = content.buildDossierContent({ snapshot: ambiental, institution: INSTITUTION, meta: meta('integral') });
  const hash = content.contentHash(c);
  const pdf = await renderDossierPdf(c, { verifyUrl: 'https://dmconecta.org/x', contentSha256: hash });
  assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');

  const obra = content.demandSnapshot({
    ...ROW,
    category: 'obra_ou_melhoria_de_infraestrutura',
    module_details: { imovel: { documento: 'Matrícula 123' }, area_m2: 80 },
  }, ITEMS);
  assert.equal(obra.demand.moduleDetails.imovel.documento, 'Matrícula 123');
  const redacted = content.redactSnapshot(obra);
  assert.equal(redacted.demand.moduleDetails.imovel, undefined);
  assert.equal(redacted.demand.moduleDetails.area_m2, 80);
});

/** Textos escritos no PDF (as fontes são subconjuntos: o arquivo não tem texto legível). */
async function pdfTexts(c) {
  const PDFDocument = require('pdfkit');
  const original = PDFDocument.prototype.text;
  const texts = [];
  PDFDocument.prototype.text = function capture(value, ...rest) {
    if (typeof value === 'string') texts.push(value);
    return original.call(this, value, ...rest);
  };
  try {
    const hash = content.contentHash(c);
    await renderDossierPdf(c, { verifyUrl: 'https://dmconecta.org/x', contentSha256: hash });
  } finally {
    PDFDocument.prototype.text = original;
  }
  return texts.join('\n');
}

const PROCESS_ROWS = [
  {
    protocol: 'DM-2026-000001', sequence_in_demand: 1, party_kind: 'empresa', party_name: 'Construtora Exemplo',
    status: 'em_execucao', contribution_kinds: ['apoio_financeiro'], contribution_amount_cents: '1000000',
    fee_applies: true, agent_fee_cents: '40000', platform_fee_cents: '60000', total_with_fees_cents: '1100000',
    formalized_at: new Date('2026-09-23T12:00:00Z'),
  },
  {
    protocol: 'DM-2026-000002', sequence_in_demand: 2, party_kind: 'poder_publico', party_name: 'Secretaria de Obras',
    status: 'em_execucao', contribution_kinds: ['recurso_publico'], contribution_amount_cents: '500000',
    fee_applies: false, agent_fee_cents: '0', platform_fee_cents: '0', total_with_fees_cents: '500000',
    formalized_at: new Date('2026-09-23T13:00:00Z'),
  },
];

test('4% + 6% por processo (T-05-06, decisão 14): orçamento de execução, frase da Obs. e taxas só com Parceiros', async () => {
  const snapshot = content.demandSnapshot(ROW, ITEMS, { processes: PROCESS_ROWS });
  assert.equal(snapshot.processes.length, 2);
  assert.equal(snapshot.processes[0].totalWithFeesCents, 1_100_000);
  assert.equal(snapshot.processes[1].feeApplies, false);
  assert.equal(snapshot.processes[1].agentFeeCents, 0);

  const integral = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('integral') });
  assert.deepEqual(integral.connectionFinance, {
    executionBudgetCents: 1_000_000,
    withFees: { processes: 1, contributionCents: 1_000_000, agentFeeCents: 40_000, platformFeeCents: 60_000, totalWithFeesCents: 1_100_000 },
    government: { processes: 1, contributionCents: 500_000 },
  });
  const text = await pdfTexts(integral);
  assert.ok(text.includes('Orçamento de execução'));
  assert.ok(text.includes('Composição quando o apoio vem de Parceiros, Investidores ou Empresas (não se aplica ao Poder Público)'));
  assert.ok(text.includes(content.FEE_OBSERVATION), 'frase literal do Modelo §04 Obs.');
  assert.ok(text.includes('Não se aplica'), 'processo do Poder Público sem taxas');
  assert.ok(text.includes('Construtora Exemplo'));

  // Versão pública: Parceiro só pelo tipo; o órgão é identificado; valores iguais.
  const pub = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('publica') });
  assert.equal(pub.processes[0].partyName, null);
  assert.equal(pub.processes[1].partyName, 'Secretaria de Obras');
  assert.deepEqual(pub.connectionFinance, integral.connectionFinance);
  const pubText = await pdfTexts(pub);
  assert.ok(pubText.includes(content.FEE_OBSERVATION));
  assert.ok(!pubText.includes('Construtora Exemplo'));

  // Retrato anterior à T-05-06 (sem processos) continua gerando o mesmo conteúdo.
  const old = content.buildDossierContent({ snapshot: content.demandSnapshot(ROW, ITEMS), institution: INSTITUTION, meta: meta('integral') });
  assert.equal(old.processes, undefined);
  assert.equal(old.connectionFinance, undefined);
});

test('Modelo §04/§05 (T-05-09): problema, área de abrangência, item, fornecedor e recursos/valor da etapa no dossiê', async () => {
  const row = { ...ROW, problem_identified: 'Praça sem uso à noite.', coverage_area: 'Praça e quatro quadras do entorno' };
  const items = {
    ...ITEMS,
    budgetItems: ITEMS.budgetItems.map((b, i) => (i === 0 ? { ...b, item: 'Madeira', supplier_reference: 'Serraria do Zé' } : b)),
    scheduleItems: ITEMS.scheduleItems.map((s, i) => (i === 0 ? { ...s, resources_needed: 'Caçamba', amount_cents: '150000' } : s)),
  };
  const snapshot = content.demandSnapshot(row, items);
  assert.equal(snapshot.demand.problemIdentified, 'Praça sem uso à noite.');
  assert.equal(snapshot.location.coverageArea, 'Praça e quatro quadras do entorno');
  assert.equal(snapshot.budget.items[0].item, 'Madeira');
  assert.equal(snapshot.budget.items[0].supplierReference, 'Serraria do Zé');
  assert.deepEqual([snapshot.schedule[0].deadlineDays, snapshot.schedule[0].resourcesNeeded, snapshot.schedule[0].amountCents], [15, 'Caçamba', 150_000]);
  const integral = await pdfTexts(content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('integral') }));
  for (const expected of ['Problema identificado', 'Área de abrangência', 'Serraria do Zé', 'Recursos: Caçamba', 'Prazo: 15 dia(s)']) {
    assert.ok(integral.includes(expected), expected);
  }
  // Versão pública: sem fornecedor (pode ser nome de pessoa); o resto fica.
  const pub = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('publica') });
  assert.equal(pub.budget.items[0].supplierReference, null);
  assert.equal(pub.location.coverageArea, 'Praça e quatro quadras do entorno');
  assert.ok(!(await pdfTexts(pub)).includes('Serraria do Zé'));
});

test('Histórico (Modelo §06, T-05-10): integral com tudo; pública só com eventos públicos, sem ator nem nota', async () => {
  const history = require('../src/dossier/history');
  const at = (s) => new Date(`2026-09-22T${s}Z`);
  const rows = [
    { event_type: 'criada', actor_type: 'agente', note: null, is_public: false, created_at: at('13:00:00') },
    { event_type: 'enviada_para_analise', actor_type: 'agente', note: null, is_public: false, created_at: at('14:00:00'), reenvio: 'false' },
    { event_type: 'devolvida_para_ajustes', actor_type: 'gestao', note: 'Falta a cotação', is_public: false, created_at: at('15:00:00') },
    { event_type: 'enviada_para_analise', actor_type: 'agente', note: null, is_public: false, created_at: at('16:00:00'), reenvio: 'true' },
    { event_type: 'publicada', actor_type: 'gestao', note: 'Aprovada pela Ana', is_public: true, created_at: at('17:35:00') },
    { event_type: 'processo_formalizado', actor_type: 'agente', note: null, is_public: true, created_at: at('18:00:00'),
      protocol: 'DM-2026-000184', details: { protocol: 'DM-2026-000184', partyKind: 'empresa', organizationName: null } },
    { event_type: 'status_institucional_alterado', actor_type: 'poder_publico', note: null, is_public: true, created_at: at('18:10:00'),
      details: { organizationName: 'Secretaria de Obras', institutionalStatus: 'em_analise' } },
    { event_type: 'evento_novo_desconhecido', actor_type: 'sistema', note: null, is_public: true, created_at: at('18:20:00') },
  ];
  const items = history.historySnapshot(rows);
  assert.deepEqual(items.map((h) => h.label), [
    'Rascunho criado', 'Enviada para análise', 'Devolvida para ajustes', 'Reenviada para análise', 'Demanda publicada',
    'Conexão formalizada — processo DM-2026-000184 (Empresa)', 'Secretaria de Obras: Em análise', 'Atualização registrada',
  ]);
  assert.equal(history.formatHistoryWhen('2026-09-22T17:35:00Z'), '22/09/2026 — 14h35', 'horário de Brasília, formato do §12');

  const snapshot = content.demandSnapshot({ ...ROW, priority_criteria: ['risco_vida_seguranca', 'pessoas_afetadas'] }, ITEMS, { history: items });
  const integral = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('integral') });
  assert.equal(integral.history.length, 8);
  assert.equal(integral.history[2].note, 'Falta a cotação');
  const pub = content.buildDossierContent({ snapshot, institution: INSTITUTION, meta: meta('publica') });
  assert.deepEqual(pub.history.map((h) => h.type), ['publicada', 'processo_formalizado', 'status_institucional_alterado', 'evento_novo_desconhecido']);
  assert.ok(!pub.history.some((h) => h.type === 'devolvida_para_ajustes'), 'devolução fica fora da versão pública');
  assert.ok(pub.history.every((h) => !('actorType' in h) && !('note' in h)));
  // O histórico entra no hash.
  assert.notEqual(content.contentHash(integral),
    content.contentHash(content.buildDossierContent({ snapshot: { ...snapshot, history: items.slice(0, 7) }, institution: INSTITUTION, meta: meta('integral') })));

  const text = await pdfTexts(integral);
  assert.ok(text.includes('Histórico'));
  assert.ok(text.includes('22/09/2026 — 14h35'));
  assert.ok(text.includes('Falta a cotação'));
  assert.ok(text.includes('Equipe da plataforma'));
  // Critérios de prioridade declarados (decisão 17, T-02-01).
  assert.ok(text.includes('Critérios de prioridade declarados'));
  assert.ok(text.includes('Risco à vida ou à segurança\nNúmero de pessoas afetadas'));
  const pubText = await pdfTexts(pub);
  assert.ok(!pubText.includes('Falta a cotação') && !pubText.includes('Aprovada pela Ana') && !pubText.includes('Equipe da plataforma'));
  assert.ok(pubText.includes('Demanda publicada'));
  assert.ok(pubText.includes('Risco à vida ou à segurança'), 'os critérios são públicos, como na página da demanda');

  // Retrato anterior à T-05-10: sem a seção.
  const old = content.buildDossierContent({ snapshot: content.demandSnapshot(ROW, ITEMS), institution: INSTITUTION, meta: meta('integral') });
  assert.equal(old.history, undefined);
  assert.deepEqual(old.demand.priorityCriteria, []);
});
