const test = require('node:test');
const assert = require('node:assert/strict');
const {
  computeComposition, compositionFromItems, lineTotalCents, feeCents, quantityToMilli, formatBRL, MAX_BUDGET_CENTS,
} = require('../src/demand/finance');

test('exemplo da fonte: R$ 10.000 → R$ 400 + R$ 600 → R$ 11.000', () => {
  assert.deepEqual(computeComposition(1_000_000), {
    budgetAmountCents: 1_000_000,
    agentFeeBps: 400,
    platformFeeBps: 600,
    agentFeeCents: 40_000,
    platformFeeCents: 60_000,
    totalAmountCents: 1_100_000,
  });
});

test('os percentuais são somados ao total e não descontados da base', () => {
  for (const base of [1, 99, 12_345, 777_777, 1_000_000, 123_456_789]) {
    const c = computeComposition(base);
    assert.equal(c.budgetAmountCents, base, 'a base de execução fica intacta');
    assert.equal(c.totalAmountCents, base + c.agentFeeCents + c.platformFeeCents);
    assert.ok(c.totalAmountCents >= base);
  }
});

test('arredondamento meio para cima, por parcela, em centavos', () => {
  // 12.345 × 4% = 493,8 → 494; × 6% = 740,7 → 741.
  assert.deepEqual(
    [computeComposition(12_345).agentFeeCents, computeComposition(12_345).platformFeeCents, computeComposition(12_345).totalAmountCents],
    [494, 741, 13_580],
  );
  // Exatamente meio: 25 × 6% = 1,5 → 2; 125 × 4% = 5 (exato); 1.250 × 6% = 75.
  assert.equal(feeCents(25, 600), 2);
  assert.equal(feeCents(125, 400), 5);
  assert.equal(feeCents(1_250, 600), 75);
  // Abaixo de meio: 12 × 4% = 0,48 → 0; 13 × 4% = 0,52 → 1.
  assert.equal(feeCents(12, 400), 0);
  assert.equal(feeCents(13, 400), 1);
  // 1 centavo: 0,04 e 0,06 → 0.
  assert.deepEqual(computeComposition(1), { ...computeComposition(1), agentFeeCents: 0, platformFeeCents: 0, totalAmountCents: 1 });
  assert.equal(computeComposition(0).totalAmountCents, 0);
});

test('mesma regra do CHECK do banco: round(base × bps / 10000)', () => {
  // Comparação com a conta decimal exata, feita em BigInt: floor((2·b·bps + 10000) / 20000).
  for (let base = 0; base < 5_000; base += 7) {
    for (const bps of [400, 600]) {
      const expected = Number((BigInt(base) * BigInt(bps) * 2n + 10_000n) / 20_000n);
      assert.equal(feeCents(base, bps), expected, `base ${base}, ${bps} bps`);
    }
  }
});

test('valores grandes sem perda de precisão', () => {
  const c = computeComposition(MAX_BUDGET_CENTS);
  assert.equal(c.agentFeeCents, 4_000_000_000);
  assert.equal(c.platformFeeCents, 6_000_000_000);
  assert.equal(c.totalAmountCents, 110_000_000_000);
  assert.throws(() => computeComposition(MAX_BUDGET_CENTS + 1), RangeError);
});

test('entradas inválidas são recusadas', () => {
  for (const bad of [-1, 1.5, Number.NaN, '100', null, undefined, Infinity]) {
    assert.throws(() => computeComposition(bad), RangeError, String(bad));
  }
});

test('total do item: quantidade × valor unitário, meio para cima', () => {
  assert.equal(lineTotalCents(1, 900_000), 900_000);
  assert.equal(lineTotalCents(3, 1_999), 5_997);
  assert.equal(lineTotalCents(2.5, 333), 833); // 832,5 → 833
  assert.equal(lineTotalCents('2,5', 333), 833);
  assert.equal(lineTotalCents('0.001', 499), 0); // 0,499 → 0
  assert.equal(lineTotalCents('0.001', 500), 1); // 0,5 → 1
  assert.equal(lineTotalCents(12.345, 100), 1_235); // 1234,5 → 1235
  assert.equal(lineTotalCents(1, 0), 0);
  assert.throws(() => lineTotalCents(0, 100), RangeError);
  assert.throws(() => lineTotalCents(-1, 100), RangeError);
  assert.throws(() => lineTotalCents(1.2345, 100), RangeError);
  assert.throws(() => lineTotalCents(1, -1), RangeError);
  assert.throws(() => lineTotalCents(1, 10.5), RangeError);
});

test('quantidade: até 9 dígitos inteiros e 3 decimais (NUMERIC(12,3))', () => {
  assert.equal(quantityToMilli('999999999.999'), 999_999_999_999n);
  assert.equal(quantityToMilli('1000000000'), null);
  assert.equal(quantityToMilli('1e3'), null);
  assert.equal(quantityToMilli(' 7 '), 7_000n);
  assert.equal(quantityToMilli(0.1 + 0.2), null);
  assert.equal(quantityToMilli(true), null);
});

test('composição a partir dos itens do orçamento', () => {
  const c = compositionFromItems([
    { quantity: 1, unitPriceCents: 900_000 },
    { quantity: 2, unitPriceCents: 50_000 },
  ]);
  assert.equal(c.budgetAmountCents, 1_000_000);
  assert.equal(c.totalAmountCents, 1_100_000);
  assert.equal(compositionFromItems([]).totalAmountCents, 0);
});

test('formatação em reais', () => {
  assert.equal(formatBRL(1_100_000).replace(/\s/g, ' '), 'R$ 11.000,00');
});
