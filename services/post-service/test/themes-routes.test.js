const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src');
const { THEMES, THEME_LABELS } = require('../src/demand/constants');
const { INTELLIGENCE_MAX } = require('../src/routes/themes');

// Eixos temáticos e inteligência territorial (T26) com banco simulado: o
// vocabulário vem da fonte (slide 26), a agregação é uma consulta só e a
// resposta não leva dado pessoal.

const SECRET = 'post-service-test-secret-0123456789abcdef';

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    const result = await handler(text, params);
    if (!result) throw new Error(`Consulta inesperada: ${text}`);
    return result;
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, institutionStatus: async () => null }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('os nove eixos do slide 26, na ordem e com o rótulo da fonte, e opcionais', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/demands/themes`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.themes.map((t) => t.label), [
      'Iluminação', 'Segurança', 'Saneamento', 'Limpeza', 'Esporte',
      'Educação', 'Mobilidade', 'Cultura', 'Meio Ambiente',
    ]);
    assert.deepEqual(body.themes.map((t) => t.theme), THEMES);
    assert.equal(body.required, false);
  });
  assert.equal(pool.calls.length, 0, 'o vocabulário não consulta o banco');
});

test('inteligência territorial: uma consulta, eixos zerados presentes e filtro por eixo', async () => {
  const pool = fakePool((text) => (/demand_themes/.test(text) ? {
    rows: [{
      demands_total: 4,
      demands_with_theme: 3,
      by_theme: [{ theme: 'saneamento', total: 2, urgent: 1, concluded: 0, territories: 1 }],
      crossed: [{ theme: 'saneamento', territory: 'Centro', municipality: 'Niterói', uf: 'RJ', total: 2, urgent: 1, concluded: 0 }],
    }],
  } : null));
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/demands/themes/intelligence?theme=saneamento`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.demandsTotal, 4);
    assert.equal(body.demandsWithTheme, 3);
    assert.equal(body.themes.length, THEMES.length);
    const saneamento = body.themes.find((t) => t.theme === 'saneamento');
    assert.equal(saneamento.total, 2);
    assert.equal(saneamento.label, THEME_LABELS.saneamento);
    assert.equal(body.themes.find((t) => t.theme === 'cultura').total, 0);
    assert.equal(body.byTerritory[0].territory, 'Centro');
    assert.ok(body.byTerritory[0].slug);
    assert.equal(body.truncated, false);

    const invalid = await fetch(`${base}/demands/themes/intelligence?theme=inventado`);
    assert.equal(invalid.status, 422);
  });
  const aggregate = pool.calls.filter((c) => /demand_themes/.test(c.text));
  assert.equal(aggregate.length, 1, 'uma consulta por requisição');
  assert.ok(aggregate[0].params.some((p) => Array.isArray(p) && p.includes('saneamento')));
  assert.equal(aggregate[0].params.at(-1), INTELLIGENCE_MAX);
});
