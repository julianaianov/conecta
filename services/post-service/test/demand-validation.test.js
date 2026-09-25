const test = require('node:test');
const assert = require('node:assert/strict');
const { validateDemand } = require('../src/demand/validation');

const S1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const S2 = 'aaaaaaaa-0000-0000-0000-000000000002';

// Demanda completa, montada só para o teste (fixture isolada).
function complete(overrides = {}) {
  return {
    category: 'projeto_social',
    title: 'Reforma da praça do bairro',
    description: 'A praça está sem iluminação e com brinquedos quebrados.',
    objective: 'Recuperar a praça para uso das famílias.',
    justification: 'É o único espaço de lazer do bairro.',
    beneficiariesEstimate: 300,
    beneficiariesProfile: 'Crianças e famílias do entorno',
    priority: 'alta',
    // Prioridade alta com critério declarado (decisão 17): sem aviso.
    priorityCriteria: ['pessoas_afetadas'],
    photoRef: 'https://exemplo.org/praca.jpg',
    cep: '20040-002',
    street: 'Rua Exemplo',
    municipality: 'Rio de Janeiro',
    uf: 'rj',
    latitude: -22.9,
    longitude: -43.2,
    territory: 'Centro',
    themes: ['iluminacao', 'esporte'],
    // Módulo Social (§25), derivado de projeto_social.
    moduleDetails: { equipe: 'Coordenação e dez voluntários', publico_alvo: 'Famílias do entorno', metodologia: 'Mutirões mensais' },
    hasPhysicalExecution: true,
    scheduleItems: [
      { id: S1, stage: 'Preparação', activities: 'Registro inicial e compras', startsOn: '2026-10-01', endsOn: '2026-10-05', recordMilestones: ['antes'] },
      { id: S2, stage: 'Obra', activities: 'Reforma e registro final', startsOn: '2026-10-06', endsOn: '2026-11-30', recordMilestones: ['depois', 'acompanhamento'] },
    ],
    budgetItems: [
      { description: 'Materiais', quantity: 1, unit: 'lote', unitPriceCents: 900_000, scheduleItemId: S2 },
      { description: 'Fotografia e filmagem do antes e do depois', quantity: 1, unit: 'serviço', unitPriceCents: 100_000, isAudiovisualRecord: true, scheduleItemId: S1 },
    ],
    goals: [
      { goal: 'Reformar a praça', expectedResult: 'Praça em uso', indicator: 'Frequência semanal', measurementMethod: 'Contagem mensal' },
    ],
    resources: [
      { kind: 'necessario', type: 'recursos_financeiros' },
      { kind: 'necessario', type: 'servicos_de_fotografia_e_filmagem' },
      { kind: 'contrapartida', type: 'equipe', description: 'Voluntários da associação' },
    ],
    documents: [
      { type: 'estatuto', title: 'Estatuto', reference: 'https://exemplo.org/estatuto.pdf' },
    ],
    ...overrides,
  };
}

test('demanda completa passa no envio, com composição calculada', () => {
  const { value, errors, warnings, composition } = validateDemand(complete(), { forSubmission: true });
  assert.deepEqual(errors, {});
  assert.deepEqual(warnings, {});
  assert.equal(value.cep, '20040002');
  assert.equal(value.uf, 'RJ');
  assert.deepEqual(value.scheduleItems[1].recordMilestones, ['acompanhamento', 'depois']);
  assert.equal(value.budgetItems[0].totalCents, 900_000);
  assert.deepEqual(
    [composition.budgetAmountCents, composition.agentFeeCents, composition.platformFeeCents, composition.totalAmountCents],
    [1_000_000, 40_000, 60_000, 1_100_000],
  );
});

test('eixos temáticos (T26): opcionais, na ordem da fonte, sem repetição e sem invenção', () => {
  const ordered = validateDemand(complete({ themes: ['esporte', 'iluminacao', 'esporte'] }), { forSubmission: true });
  assert.deepEqual(ordered.value.themes, ['iluminacao', 'esporte']);
  assert.deepEqual(ordered.errors, {});

  // Sem eixo, o envio passa: a ausência é aviso, nunca erro.
  const none = validateDemand(complete({ themes: undefined }), { forSubmission: true });
  assert.deepEqual(none.errors, {});
  assert.deepEqual(none.value.themes, []);
  assert.match(none.warnings.themes, /eixos temáticos/);

  // Rascunho sem eixo não recebe aviso.
  assert.equal(validateDemand(complete({ themes: [] })).warnings.themes, undefined);

  assert.match(validateDemand(complete({ themes: ['inventado'] })).errors.themes, /nove/);
  assert.match(validateDemand(complete({ themes: 'iluminacao' })).errors.themes, /inválida/);
});

test('envio: cada obrigatório da fonte, quando ausente, gera erro no próprio campo', () => {
  const required = [
    'category', 'title', 'description', 'objective', 'justification', 'beneficiariesEstimate',
    'beneficiariesProfile', 'priority', 'photoRef', 'cep', 'latitude', 'municipality', 'uf', 'territory',
  ];
  for (const field of required) {
    const { errors } = validateDemand(complete({ [field]: '' }), { forSubmission: true });
    assert.ok(errors[field], `${field} deveria ser obrigatório`);
    assert.equal(Object.keys(errors).length, 1, `${field}: só um erro (${JSON.stringify(errors)})`);
  }
});

test('envio: fotografia, CEP, orçamento e cronograma são obrigatórios', () => {
  const { errors } = validateDemand(complete({ photoRef: null, cep: undefined, latitude: null, longitude: null, budgetItems: [], scheduleItems: [] }), { forSubmission: true });
  assert.match(errors.photoRef, /fotografia/i);
  assert.match(errors.latitude, /mapa/i);
  assert.match(errors.cep, /CEP/);
  assert.match(errors.budgetItems, /orçamento/i);
  assert.match(errors.scheduleItems, /cronograma/i);
});

test('envio: metas com resultado, indicador e mensuração', () => {
  assert.ok(validateDemand(complete({ goals: [] }), { forSubmission: true }).errors.goals);
  const { errors } = validateDemand(complete({ goals: [{ goal: 'Meta' }] }), { forSubmission: true });
  assert.ok(errors['goals[0].expectedResult']);
  assert.ok(errors['goals[0].indicator']);
  assert.ok(errors['goals[0].measurementMethod']);
});

test('rascunho aceita campos ausentes, mas não formato inválido', () => {
  assert.deepEqual(validateDemand({ title: 'Só o título' }).errors, {});
  assert.deepEqual(validateDemand({}).errors, {});
  const { errors } = validateDemand({ category: 'outra', priority: 'maxima', cep: '123', uf: 'XX', photoRef: 'http://exemplo.org/a.jpg' });
  assert.deepEqual(Object.keys(errors).sort(), ['category', 'cep', 'photoRef', 'priority', 'uf']);
});

test('item audiovisual obrigatório quando há execução física', () => {
  const withoutAv = complete({
    budgetItems: [{ description: 'Materiais', quantity: 1, unit: 'lote', unitPriceCents: 1_000_000 }],
  });
  assert.match(validateDemand(withoutAv, { forSubmission: true }).errors.audiovisualRecord, /registro fotográfico e audiovisual/);

  // Item marcado, mas sem valor, não conta como previsão de custo.
  const zeroAv = complete({
    budgetItems: [
      { description: 'Materiais', quantity: 1, unit: 'lote', unitPriceCents: 1_000_000 },
      { description: 'Fotografia', quantity: 1, unit: 'serviço', unitPriceCents: 0, isAudiovisualRecord: true },
    ],
  });
  assert.ok(validateDemand(zeroAv, { forSubmission: true }).errors.audiovisualRecord);

  // Sem execução física (ex.: necessidade de patrocínio de um serviço), não se exige.
  const noPhysical = validateDemand({ ...withoutAv, hasPhysicalExecution: false }, { forSubmission: true });
  assert.equal(noPhysical.errors.audiovisualRecord, undefined);
  assert.equal(noPhysical.errors.recordMilestones, undefined);
});

test('cronograma prevê registro do antes e do depois quando há execução física', () => {
  const noAfter = complete({
    scheduleItems: [{ id: S1, stage: 'Tudo', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-10-30', recordMilestones: ['antes'] }],
    budgetItems: complete().budgetItems.map((item) => ({ ...item, scheduleItemId: S1 })),
  });
  assert.match(validateDemand(noAfter, { forSubmission: true }).errors.recordMilestones, /antes e do depois/);

  const noFollowUp = complete({
    scheduleItems: [{ id: S1, stage: 'Tudo', activities: 'Obra', startsOn: '2026-10-01', endsOn: '2026-10-30', recordMilestones: ['antes', 'depois'] }],
    budgetItems: complete().budgetItems.map((item) => ({ ...item, scheduleItemId: S1 })),
  });
  const result = validateDemand(noFollowUp, { forSubmission: true });
  assert.deepEqual(result.errors, {});
  assert.ok(result.warnings.recordMilestones, 'acompanhamento é aviso, não bloqueio');
});

test('cronograma físico-financeiro: vínculo à etapa da mesma demanda; ausência é aviso', () => {
  const unlinked = complete({ budgetItems: complete().budgetItems.map((item) => ({ ...item, scheduleItemId: undefined })) });
  const result = validateDemand(unlinked, { forSubmission: true });
  assert.deepEqual(result.errors, {});
  assert.ok(result.warnings.physicalFinancial);

  const foreign = complete();
  foreign.budgetItems[0].scheduleItemId = 'bbbbbbbb-0000-0000-0000-000000000009';
  assert.ok(validateDemand(foreign).errors['budgetItems[0].scheduleItemId']);
});

test('itens do orçamento: descrição, unidade, quantidade e valor em centavos', () => {
  const { errors, composition } = validateDemand({
    budgetItems: [
      { description: '', quantity: 0, unit: '', unitPriceCents: 10.5 },
      { description: 'Tinta', quantity: '2,5', unit: 'lata', unitPriceCents: 333 },
    ],
  });
  assert.ok(errors['budgetItems[0].description']);
  assert.ok(errors['budgetItems[0].quantity']);
  assert.ok(errors['budgetItems[0].unit']);
  assert.ok(errors['budgetItems[0].unitPriceCents']);
  assert.equal(errors['budgetItems[1].quantity'], undefined);
  assert.equal(composition, null, 'sem composição enquanto houver item inválido');

  const ok = validateDemand({ budgetItems: [{ description: 'Tinta', quantity: '2,5', unit: 'lata', unitPriceCents: 333 }] });
  assert.equal(ok.value.budgetItems[0].quantity, 2.5);
  assert.equal(ok.value.budgetItems[0].totalCents, 833);
  assert.equal(ok.composition.totalAmountCents, 833 + 33 + 50);
});

test('orçamento sem valor não é enviado', () => {
  const { errors } = validateDemand(complete({
    budgetItems: [{ description: 'Doação', quantity: 1, unit: 'un', unitPriceCents: 0, isAudiovisualRecord: true }],
  }), { forSubmission: true });
  assert.match(errors.budgetItems, /valor/);
});

test('etapas: datas válidas, término depois do início, marcos da lista', () => {
  const { errors } = validateDemand({
    scheduleItems: [
      { stage: 'A', activities: 'x', startsOn: '2026-02-30', endsOn: '2026-03-01' },
      { stage: 'B', activities: 'y', startsOn: '2026-05-10', endsOn: '2026-05-01', recordMilestones: ['durante'] },
    ],
  });
  assert.ok(errors['scheduleItems[0].startsOn']);
  assert.ok(errors['scheduleItems[1].endsOn']);
  assert.ok(errors['scheduleItems[1].recordMilestones']);
});

test('recursos: tipos da fonte por lista, sem repetição', () => {
  const { errors } = validateDemand({
    resources: [
      { kind: 'contrapartida', type: 'recursos_financeiros' },
      { kind: 'necessario', type: 'mao_de_obra' },
      { kind: 'necessario', type: 'mao_de_obra' },
      { kind: 'doacao', type: 'equipe' },
      { kind: 'contrapartida', type: 'espaco_fisico' },
    ],
  });
  assert.ok(errors['resources[0].type'], 'recursos financeiros não é contrapartida');
  assert.equal(errors['resources[1].type'], undefined);
  assert.match(errors['resources[2].type'], /repetido/);
  assert.ok(errors['resources[3].kind']);
  assert.equal(errors['resources[4].type'], undefined);
});

test('documentos: tipo da fonte, nome e link https', () => {
  const { errors } = validateDemand({
    documents: [
      { type: 'ata', title: 'Ata', reference: 'https://exemplo.org/a.pdf' },
      { type: 'autorizacoes', title: '', reference: 'ftp://exemplo.org/b.pdf' },
      { type: 'orcamentos_e_cotacoes', title: 'Cotação', reference: 'https://exemplo.org/c.pdf' },
    ],
  });
  assert.ok(errors['documents[0].type']);
  assert.ok(errors['documents[1].title']);
  assert.ok(errors['documents[1].reference']);
  assert.equal(Object.keys(errors).filter((k) => k.startsWith('documents[2]')).length, 0);
});

test('público beneficiado: inteiro positivo; coordenadas em par e dentro dos limites', () => {
  assert.ok(validateDemand({ beneficiariesEstimate: 0 }).errors.beneficiariesEstimate);
  assert.ok(validateDemand({ beneficiariesEstimate: 2.5 }).errors.beneficiariesEstimate);
  assert.equal(validateDemand({ beneficiariesEstimate: '120' }).value.beneficiariesEstimate, 120);
  assert.ok(validateDemand({ latitude: -22.9 }).errors.latitude);
  assert.ok(validateDemand({ latitude: 91, longitude: 0 }).errors.latitude);
  assert.ok(validateDemand({ latitude: 0, longitude: 181 }).errors.longitude);
});

test('limites de tamanho e listas', () => {
  assert.ok(validateDemand({ title: 'x'.repeat(201) }).errors.title);
  assert.ok(validateDemand({ goals: 'não é lista' }).errors.goals);
  assert.ok(validateDemand({ goals: new Array(201).fill({}) }).errors.goals);
  assert.ok(validateDemand({ title: 42 }).errors.title);
});

test('entrada que não é objeto vira rascunho vazio', () => {
  for (const input of [null, undefined, 'x', 42]) {
    const { errors, value } = validateDemand(input);
    assert.deepEqual(errors, {});
    assert.equal(value.hasPhysicalExecution, true, 'execução física é o padrão');
  }
});

test('módulo específico (T-05-08): informações validadas, marcos do ambiental e avisos por módulo', () => {
  const S = 'aaaaaaaa-0000-0000-0000-00000000000';
  const ambiental = complete({
    category: 'recuperacao_ambiental',
    moduleDetails: {
      area_m2: '1500,5', diagnostico: 'Restinga degradada', situacao_atual: 'Lixo e espécies exóticas',
      vegetacao: 'Restinga arbustiva', metodologia: 'Plantio de nativas',
      responsavel_tecnico: { nome: 'Ana Souza', registro: 'CRBio 12345' }, plano_de_monitoramento: 'Visitas mensais',
    },
    scheduleItems: [
      { id: `${S}1`, stage: 'Diagnóstico', activities: 'Levantamento', startsOn: '2026-10-01', endsOn: '2026-10-05', recordMilestones: ['antes', 'diagnostico'] },
      { id: `${S}2`, stage: 'Plantio', activities: 'Intervenção e monitoramento', startsOn: '2026-10-06', endsOn: '2026-11-30', recordMilestones: ['intervencao', 'monitoramento', 'depois'] },
    ],
    budgetItems: [
      { description: 'Mudas', quantity: 1, unit: 'lote', unitPriceCents: 900_000, scheduleItemId: `${S}2` },
      { description: 'Registro do antes e do depois', quantity: 1, unit: 'serviço', unitPriceCents: 100_000, isAudiovisualRecord: true, scheduleItemId: `${S}1` },
    ],
  });
  const ok = validateDemand(ambiental, { forSubmission: true });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.moduleDetails.area_m2, 1500.5);
  assert.deepEqual(ok.value.moduleDetails.responsavel_tecnico, { nome: 'Ana Souza', registro: 'CRBio 12345' });
  assert.deepEqual(ok.value.scheduleItems[0].recordMilestones, ['antes', 'diagnostico']);
  assert.equal(ok.warnings.moduleDetails, undefined);
  assert.equal(ok.warnings.recordMilestones, undefined);

  // Marcos do ambiental fora dele: erro no envio.
  const social = validateDemand({ ...ambiental, category: 'projeto_social' }, { forSubmission: true });
  assert.match(social.errors.recordMilestones, /módulo ambiental/);

  // Obra sem informações do módulo: aviso, não erro.
  const obra = validateDemand(complete({ category: 'obra_ou_melhoria_de_infraestrutura', moduleDetails: {} }), { forSubmission: true });
  assert.equal(obra.errors.moduleDetails, undefined);
  assert.match(obra.warnings.moduleDetails, /Módulo de Obras: informe também área/);

  // Apoio/Investimento não pede campos próprios.
  const apoio = validateDemand(complete({ category: 'apoio_tecnico', moduleDetails: {} }), { forSubmission: true });
  assert.equal(apoio.warnings.moduleDetails, undefined);

  // Formato: chave desconhecida, área inválida, subcampo fora do grupo.
  const bad = validateDemand({ moduleDetails: { x: 1, area_m2: -3, responsavel_tecnico: { cpf: '1' } } });
  assert.deepEqual(Object.keys(bad.errors).sort(), [
    'moduleDetails.area_m2', 'moduleDetails.responsavel_tecnico.cpf', 'moduleDetails.x',
  ]);
  assert.equal(validateDemand({ moduleDetails: [] }).errors.moduleDetails, 'Informações do módulo inválidas');
});
