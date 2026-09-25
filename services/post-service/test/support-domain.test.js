const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const S = require('../src/support');
const store = require('../src/support/store');

// Vocabulário e validação do apoio (T16). Fonte: Apresentação, slides 10, 11,
// 20 e 21; decisão 5 (sem processamento de pagamento).
const sql = fs.readFileSync(path.join(__dirname, '../migrations/013-support-modalities.sql'), 'utf8');
const init = fs.readFileSync(path.join(__dirname, '../init.sql'), 'utf8');

function enumValues(text, type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(text);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('as 6 modalidades da fonte (slide 20) são o enum da migração 013, mais as 2 do Modelo §27 (038)', () => {
  const offers = fs.readFileSync(path.join(__dirname, '../migrations/038-partner-offers.sql'), 'utf8');
  const added = [...offers.matchAll(/ALTER TYPE support_modality ADD VALUE IF NOT EXISTS '([a-z_]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...enumValues(sql, 'support_modality'), ...added], S.SUPPORT_MODALITIES);
  assert.deepEqual(S.SUPPORT_MODALITIES, [
    'patrocinar_projeto', 'doar_recursos', 'financiar_evento',
    'adotar_espaco_publico', 'apoiar_acao_ambiental', 'contratar_servicos_locais',
    'disponibilizar_equipe', 'executar_etapa',
  ]);
  assert.deepEqual(Object.keys(S.SUPPORT_MODALITY_LABELS), S.SUPPORT_MODALITIES);
  assert.deepEqual(enumValues(sql, 'support_receipt_status'), S.RECEIPT_STATUSES);
  assert.deepEqual(Object.keys(S.RECEIPT_STATUS_LABELS), S.RECEIPT_STATUSES);
  // O que é oferecido continua sendo o enum support_type do init.sql.
  assert.deepEqual(enumValues(init, 'support_type'), S.SUPPORT_TYPES);
  assert.deepEqual(Object.keys(S.SUPPORT_TYPE_LABELS), S.SUPPORT_TYPES);
  assert.ok(!S.DEMAND_SUPPORT_TYPES.includes('sharing'), 'divulgação é amplificação, não apoio à demanda');
});

test('mapeamento dos tipos antigos para as modalidades está na migração e no domínio', () => {
  assert.deepEqual(S.LEGACY_TYPE_MODALITY, {
    financial: 'patrocinar_projeto',
    materials: 'doar_recursos',
    equipment: 'doar_recursos',
    food: 'doar_recursos',
    space: 'doar_recursos',
    volunteering: 'doar_recursos',
    labor: 'contratar_servicos_locais',
    transport: 'contratar_servicos_locais',
    knowledge: 'contratar_servicos_locais',
    sharing: null,
  });
  assert.deepEqual(Object.keys(S.LEGACY_TYPE_MODALITY).sort(), [...S.SUPPORT_TYPES].sort());
  // O UPDATE da migração e o trigger do apoio do feed usam o mesmo mapeamento.
  const occurrences = sql.match(/WHEN (?:s|NEW)\.type IN \('materials', 'equipment', 'food', 'space', 'volunteering'\) THEN 'doar_recursos'/g);
  assert.equal(occurrences?.length, 2, 'migração e trigger repetem o mapeamento');
  assert.match(sql, /WHEN NEW\.type = 'financial' THEN 'patrocinar_projeto'/);
  assert.ok(sql.includes(`'${S.LEGACY_EVENT_MODALITY}'`), 'apoio financeiro em evento vira financiar_evento');
  assert.match(sql, /WHERE s\.modality IS NULL AND s\.type <> 'sharing'/);
});

test('estados, transições e eventos combinam com os triggers', () => {
  const open = /st NOT IN \(([^)]*)\)/.exec(sql)[1];
  assert.deepEqual([...open.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), S.SUPPORT_OPEN_STATUSES);
  assert.deepEqual(S.RECEIPT_TRANSITIONS, {
    declarado: ['confirmado', 'contestado'],
    contestado: ['confirmado'],
    confirmado: [],
  });
  assert.deepEqual(S.GESTAO_STATUSES, ['pending', 'confirmed', 'rejected']);
  assert.match(sql, /CHECK \(status IN \('pending', 'confirmed', 'rejected'\)\)/);
  for (const type of [...S.SUPPORT_EVENT_TYPES, ...S.PRIVATE_SUPPORT_EVENT_TYPES]) {
    assert.ok(sql.includes(`'${type}'`), `${type} gravado pelo trigger`);
  }
  // O Poder Público apoia, mas não entra no ranking competitivo (slide 11).
  assert.deepEqual(S.SUPPORTER_CATEGORIES, ['parceiro', 'poder_publico', 'comunidade']);
  assert.deepEqual(S.RANKING_CATEGORIES, ['parceiro', 'comunidade']);
});

// T-04-01: Membro da Comunidade apoia projetos (Perfis §3.2; decisão 18).
const member = fs.readFileSync(path.join(__dirname, '../migrations/041-member-support.sql'), 'utf8');

test('Membro da Comunidade registra apoio nas três modalidades da decisão 18', () => {
  assert.deepEqual(S.SUPPORT_ROLES, ['partner', 'government', 'member']);
  assert.equal(S.SUPPORT_ROLE_CATEGORY.member, 'comunidade');
  assert.deepEqual(S.MEMBER_SUPPORT_MODALITIES, ['doar_recursos', 'adotar_espaco_publico', 'apoiar_acao_ambiental']);
  assert.deepEqual(S.MODALITIES_BY_ROLE.member, S.MEMBER_SUPPORT_MODALITIES);
  assert.deepEqual(S.MODALITIES_BY_ROLE.partner, S.SUPPORT_MODALITIES);
  assert.ok(!S.MEMBER_SUPPORT_TYPES.includes('financial'), 'sem valor financeiro');
  assert.ok(!S.MEMBER_SUPPORT_TYPES.includes('volunteering'), 'voluntariado continua pelo interesse da T15');
  // A migração 041 diz o mesmo no banco.
  assert.match(member, /supporter_category IN \('parceiro', 'poder_publico', 'comunidade'\)/);
  const allowed = /modality::text IN \(([^)]*)\)/.exec(member)[1];
  assert.deepEqual([...allowed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort(), [...S.MEMBER_SUPPORT_MODALITIES].sort());
  assert.match(member, /type::text NOT IN \('financial', 'volunteering', 'sharing'\)/);
  assert.match(member, /WHEN 'comunidade' THEN 'comunidade'/, 'o evento sai com o ator comunidade');

  const ok = S.validateSupport({ modality: 'doar_recursos', supportType: 'materials', description: 'Mudas' }, { role: 'member' });
  assert.deepEqual(ok.errors, {});
  for (const modality of ['patrocinar_projeto', 'financiar_evento', 'contratar_servicos_locais']) {
    const res = S.validateSupport({ modality, supportType: 'materials', description: 'x' }, { role: 'member' });
    assert.match(res.errors.modality, /Membros da Comunidade/);
  }
  assert.ok(S.validateSupport({ modality: 'doar_recursos', supportType: 'financial', description: 'x', amountCents: 100 },
    { role: 'member' }).errors.supportType);
  assert.ok(S.validateSupport({ modality: 'apoiar_acao_ambiental', supportType: 'volunteering', description: 'x' },
    { role: 'member' }).errors.supportType);
  // Parceiro continua com as 6 modalidades.
  assert.deepEqual(S.validateSupport({ modality: 'patrocinar_projeto', supportType: 'financial', description: 'x', amountCents: 100 },
    { role: 'partner' }).errors, {});
});

test('validateSupport: modalidade, oferta, descrição e valor declarado', () => {
  const ok = S.validateSupport({
    modality: 'doar_recursos', supportType: 'materials', description: '  20 sacos de cimento  ',
    amountCents: 150000, amountPublic: true, displayConsent: true, publicName: ' Construtora Horizonte ',
    occurredOn: '2026-09-01', message: 'Entregue na obra.',
  }, { today: new Date('2026-09-22T12:00:00Z') });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value, {
    modality: 'doar_recursos', supportType: 'materials', description: '20 sacos de cimento',
    amountCents: 150000, amountPublic: true, occurredOn: '2026-09-01', message: 'Entregue na obra.',
    displayConsent: true, publicName: 'Construtora Horizonte', scheduleItemId: null,
  });

  assert.ok(S.validateSupport({ supportType: 'materials', description: 'x' }).errors.modality);
  assert.ok(S.validateSupport({ modality: 'doar_recursos', supportType: 'sharing', description: 'x' }).errors.supportType);
  assert.ok(S.validateSupport({ modality: 'doar_recursos', supportType: 'materials' }).errors.description);
  // Financeiro: valor declarado obrigatório (a plataforma não processa pagamento).
  const semValor = S.validateSupport({ modality: 'patrocinar_projeto', supportType: 'financial', description: 'Patrocínio' });
  assert.ok(semValor.errors.amountCents);
  assert.ok(S.validateSupport({
    modality: 'patrocinar_projeto', supportType: 'financial', description: 'Patrocínio', amountCents: -1,
  }).errors.amountCents);
  assert.ok(S.validateSupport({
    modality: 'doar_recursos', supportType: 'materials', description: 'Cimento', amountPublic: true,
  }).errors.amountPublic, 'sem valor declarado não há valor público');
  assert.ok(S.validateSupport({
    modality: 'doar_recursos', supportType: 'materials', description: 'Cimento', occurredOn: '2030-01-01',
  }, { today: new Date('2026-09-22T12:00:00Z') }).errors.occurredOn);
  assert.ok(S.validateSupport({
    modality: 'doar_recursos', supportType: 'materials', description: 'x'.repeat(2001),
  }).errors.description);
});

test('Executar determinada etapa exige a etapa do cronograma (T-05-15)', () => {
  const ITEM = '22222222-2222-4222-8222-222222222222';
  const base = { supportType: 'labor', description: 'Equipe de pedreiros na fundação' };
  assert.ok(S.validateSupport({ ...base, modality: 'executar_etapa' }, { role: 'partner' }).errors.scheduleItemId);
  const ok = S.validateSupport({ ...base, modality: 'executar_etapa', scheduleItemId: ITEM }, { role: 'partner' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.scheduleItemId, ITEM);
  assert.ok(S.validateSupport({ ...base, modality: 'disponibilizar_equipe', scheduleItemId: ITEM }, { role: 'partner' })
    .errors.scheduleItemId, 'etapa só com executar_etapa');
  assert.deepEqual(S.validateSupport({ ...base, modality: 'disponibilizar_equipe' }, { role: 'partner' }).errors, {});
  // O Membro da Comunidade não tem essas modalidades (decisão 18).
  assert.ok(S.validateSupport({ ...base, modality: 'executar_etapa', scheduleItemId: ITEM }, { role: 'member' }).errors.modality);
  const offers = fs.readFileSync(path.join(__dirname, '../migrations/038-partner-offers.sql'), 'utf8');
  assert.match(offers, /\(modality::text = 'executar_etapa'\) = \(schedule_item_id IS NOT NULL\)/);
  assert.match(member, /'scheduleStage'/, 'a linha do tempo pública do apoio mostra a etapa');
});

test('consentimento de exibição é opcional e revogável', () => {
  assert.deepEqual(S.validateConsent({}).value, { displayConsent: false, publicName: null, amountPublic: false });
  assert.deepEqual(S.validateConsent({ displayConsent: false, publicName: 'Empresa' }).value,
    { displayConsent: false, publicName: null, amountPublic: false }, 'sem consentimento, nome público é descartado');
  assert.deepEqual(S.validateConsent({ displayConsent: true, publicName: 'Empresa', amountPublic: true }).value,
    { displayConsent: true, publicName: 'Empresa', amountPublic: true });
  assert.ok(S.validateConsent({ displayConsent: 'sim' }).errors.displayConsent);
  assert.ok(S.validateConsent({ displayConsent: true, publicName: 'x'.repeat(161) }).errors.publicName);
});

test('validateReceipt: evidência opcional, justificativa obrigatória na contestação', () => {
  assert.deepEqual(S.validateReceipt({}).value, { note: null, evidence: [] });
  assert.deepEqual(S.validateReceipt({ evidence: ['upload:a', 'upload:a'] }).value.evidence, ['upload:a']);
  assert.ok(S.validateReceipt({}, { requireNote: true }).errors.note);
  assert.ok(S.validateReceipt({ evidence: Array.from({ length: 11 }, (_, i) => `upload:${i}`) }).errors.evidence);
  assert.ok(S.validateReceipt({ evidence: [1] }).errors.evidence);
  assert.deepEqual(S.validateReceipt({ note: '  Não recebemos  ' }, { requireNote: true }).value.note, 'Não recebemos');
});

test('valores declarados: centavos ↔ coluna DECIMAL e projeção pública', () => {
  assert.equal(store.centsToAmount(150000), '1500.00');
  assert.equal(store.centsToAmount(null), null);
  assert.equal(store.amountToCents('1500.00'), 150000);
  assert.equal(store.amountToCents(null), null);

  const row = {
    id: 'a', modality: 'doar_recursos', support_type: 'materials', description: 'Cimento',
    amount: '1500.00', amount_public: false, display_consent: false, public_name: null,
    user_name: 'Construtora Horizonte', supporter_category: 'parceiro', receipt_status: 'declarado',
    receipt_answered_at: null, occurred_on: null, created_at: null, evidence_count: 2,
  };
  const hidden = store.serializePublicSupport(row);
  assert.equal(hidden.supporterName, null, 'sem consentimento, sem nome');
  assert.equal(hidden.amountCents, null, 'valor só quando o apoiador o torna público');
  assert.equal(hidden.hasEvidence, true);
  const shown = store.serializePublicSupport({ ...row, display_consent: true, amount_public: true, public_name: 'Horizonte S/A' });
  assert.equal(shown.supporterName, 'Horizonte S/A');
  assert.equal(shown.amountCents, 150000);
  assert.ok(!('user_id' in shown) && !('message' in shown), 'histórico público não expõe a conta');
});
