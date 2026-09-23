// Composição financeira da demanda (Fluxo 2, slides 9 e 10; decisão 5).
//
// - Tudo em centavos inteiros; contas em BigInt para não perder precisão.
// - Item: total = quantidade × valor unitário, arredondado meio para cima ao
//   centavo (quantidade com até 3 casas decimais).
// - Base (valor original) = soma dos itens.
// - 4% (Agente) e 6% (plataforma) são calculados cada um sobre a base e
//   arredondados meio para cima ao centavo; total = base + 4% + 6%. Os
//   percentuais se somam ao total e não descontam do recurso de execução.
//   R$ 10.000,00 → R$ 400,00 + R$ 600,00 → R$ 11.000,00.
// - É a mesma regra do CHECK demands_financial_composition (round() do
//   PostgreSQL arredonda meio para longe de zero; os valores nunca são negativos).
// - Não há pagamento: o valor compõe dossiê, transparência e prestação de contas.

const { AGENT_FEE_BPS, PLATFORM_FEE_BPS } = require('./constants');

// Limites: NUMERIC(12,3) na quantidade e teto de R$ 1 bilhão por demanda, que
// mantém os centavos dentro de Number.MAX_SAFE_INTEGER com folga.
const MAX_QUANTITY = 999_999_999.999;
const MAX_BUDGET_CENTS = 100_000_000_000;

/** Divide inteiros não negativos arredondando meio para cima. */
function divRoundHalfUp(numerator, denominator) {
  return (numerator * 2n + denominator) / (denominator * 2n);
}

function isCents(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * Converte a quantidade para milésimos inteiros. Aceita número ou texto com
 * ponto ou vírgula decimal ("2,5"). Retorna null se inválida (zero, negativa,
 * mais de 3 casas ou acima do limite).
 */
function quantityToMilli(quantity) {
  const text = typeof quantity === 'number' ? (Number.isFinite(quantity) ? String(quantity) : '')
    : typeof quantity === 'string' ? quantity.trim().replace(',', '.') : '';
  const match = /^(\d{1,9})(?:\.(\d{1,3}))?$/.exec(text);
  if (!match) return null;
  const milli = BigInt(match[1]) * 1000n + BigInt((match[2] ?? '').padEnd(3, '0'));
  if (milli <= 0n) return null;
  return milli;
}

/** Total do item em centavos: round(quantidade × valor unitário). */
function lineTotalCents(quantity, unitPriceCents) {
  const milli = quantityToMilli(quantity);
  if (milli === null) throw new RangeError('quantidade inválida');
  if (!isCents(unitPriceCents)) throw new RangeError('valor unitário inválido');
  return Number(divRoundHalfUp(milli * BigInt(unitPriceCents), 1000n));
}

/** Parcela em pontos-base (400 = 4%) sobre a base, meio para cima. */
function feeCents(baseCents, bps) {
  if (!isCents(baseCents)) throw new RangeError('valor do orçamento inválido');
  return Number(divRoundHalfUp(BigInt(baseCents) * BigInt(bps), 10000n));
}

/**
 * Composição gravada na demanda (colunas de `demands`):
 * `{ budgetAmountCents, agentFeeBps, platformFeeBps, agentFeeCents,
 *    platformFeeCents, totalAmountCents }`.
 */
// TODO(fonte-da-verdade): Modelo de Conexão §04 Obs. — 4% + 6% só se aplica a conexões com Parceiros/Investidores/Empresas, não ao Poder Público; hoje é calculado por demanda. Ver TODO em migrations/007-demands.sql.
function computeComposition(baseCents) {
  if (!isCents(baseCents) || baseCents > MAX_BUDGET_CENTS) {
    throw new RangeError('valor do orçamento inválido');
  }
  const agentFeeCents = feeCents(baseCents, AGENT_FEE_BPS);
  const platformFeeCents = feeCents(baseCents, PLATFORM_FEE_BPS);
  return {
    budgetAmountCents: baseCents,
    agentFeeBps: AGENT_FEE_BPS,
    platformFeeBps: PLATFORM_FEE_BPS,
    agentFeeCents,
    platformFeeCents,
    totalAmountCents: baseCents + agentFeeCents + platformFeeCents,
  };
}

/** Composição a partir dos itens do orçamento (base = soma dos totais). */
function compositionFromItems(items) {
  let base = 0;
  for (const item of items ?? []) base += lineTotalCents(item.quantity, item.unitPriceCents);
  return computeComposition(base);
}

/** Formata centavos em reais (pt-BR), para mensagens e dossiê. */
function formatBRL(cents) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

module.exports = {
  MAX_QUANTITY,
  MAX_BUDGET_CENTS,
  quantityToMilli,
  lineTotalCents,
  feeCents,
  computeComposition,
  compositionFromItems,
  formatBRL,
};
