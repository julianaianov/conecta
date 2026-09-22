const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TARGET_KINDS, REASONS, REASON_LABELS, TARGET_LABELS, OPEN_STATUSES, RESOLVED_STATUSES,
  STATUSES, REPORTER_STATE_OF, RATE_LIMIT, DESCRIPTION_MAX,
} = require('../src/report/constants');
const { validateReport, validateTargetQuery } = require('../src/report/validation');
const { summarize } = require('../src/report/store');

// Domínio puro da denúncia (T6.3): vocabulário e validação, sem banco.

const TARGET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('vocabulário: alvos, motivos e estados da fonte', () => {
  assert.deepEqual(TARGET_KINDS, ['publicacao', 'comentario', 'demanda', 'perfil']);
  assert.deepEqual(REASONS, [
    'conteudo_improprio', 'informacao_falsa', 'spam',
    'discurso_de_odio', 'dado_pessoal_indevido', 'outro',
  ]);
  for (const kind of TARGET_KINDS) assert.ok(TARGET_LABELS[kind]);
  for (const reason of REASONS) assert.ok(REASON_LABELS[reason]);
  assert.deepEqual([...OPEN_STATUSES, ...RESOLVED_STATUSES].sort(), [...STATUSES].sort());
  assert.ok(RATE_LIMIT.perHour > 0 && RATE_LIMIT.perDay >= RATE_LIMIT.perHour);
});

test('quem denunciou nunca recebe o desfecho', () => {
  assert.equal(REPORTER_STATE_OF('pendente'), 'em_apuracao');
  assert.equal(REPORTER_STATE_OF('em_analise'), 'em_apuracao');
  assert.equal(REPORTER_STATE_OF('procedente'), 'analisada');
  assert.equal(REPORTER_STATE_OF('improcedente'), 'analisada');
});

test('validação: alvo, motivo e descrição', () => {
  const vazio = validateReport({});
  assert.deepEqual(Object.keys(vazio.errors).sort(), ['reason', 'targetId', 'targetKind']);

  const alvoInvalido = validateReport({ targetKind: 'evento', targetId: TARGET, reason: 'spam' });
  assert.ok(alvoInvalido.errors.targetKind);

  const idInvalido = validateReport({ targetKind: 'publicacao', targetId: 'nao-e-uuid', reason: 'spam' });
  assert.ok(idInvalido.errors.targetId);

  const motivoInvalido = validateReport({ targetKind: 'publicacao', targetId: TARGET, reason: 'nao_gostei' });
  assert.ok(motivoInvalido.errors.reason);

  const ok = validateReport({ targetKind: 'perfil', targetId: TARGET.toUpperCase(), reason: 'discurso_de_odio' });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.targetId, TARGET);
  assert.equal(ok.value.description, null);
});

test('motivo "outro" exige descrição; a descrição tem teto', () => {
  const semDescricao = validateReport({ targetKind: 'demanda', targetId: TARGET, reason: 'outro' });
  assert.ok(semDescricao.errors.description);
  const comDescricao = validateReport({
    targetKind: 'demanda', targetId: TARGET, reason: 'outro', description: '  Usa o nome da prefeitura sem ser.  ',
  });
  assert.deepEqual(comDescricao.errors, {});
  assert.equal(comDescricao.value.description, 'Usa o nome da prefeitura sem ser.');

  const longa = validateReport({
    targetKind: 'comentario', targetId: TARGET, reason: 'spam', description: 'a'.repeat(DESCRIPTION_MAX + 1),
  });
  assert.ok(longa.errors.description);
});

test('filtro do contexto do alvo', () => {
  assert.deepEqual(validateTargetQuery({ targetKind: 'publicacao', targetId: TARGET }).errors, {});
  const ruim = validateTargetQuery({ targetKind: 'perfil', targetId: '123' });
  assert.ok(ruim.errors.targetId);
  assert.ok(validateTargetQuery(undefined).errors.targetKind);
});

test('o retrato do alvo é curto e de uma linha', () => {
  assert.equal(summarize('  Buraco   na\nrua  '), 'Buraco na rua');
  assert.equal(summarize(''), null);
  assert.equal(summarize(null), null);
  assert.equal(summarize('x'.repeat(900)).length, 500);
});
