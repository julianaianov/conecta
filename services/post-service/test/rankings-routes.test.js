// Rotas de engajamento, rankings e selos (T21) com banco simulado.
//
// O que estes testes garantem: a leitura pública lê **só** a tabela
// materializada (nenhuma agregação por requisição), o critério de cada ranking
// sai junto para a interface, o compartilhamento exige sessão e não infla, o
// Poder Público recebe indicadores de atuação em vez de selo e o nome só
// aparece com consentimento.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { BOARD_IDS, GOVERNMENT_NOTICE } = require('../src/ranking/constants');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '11111111-1111-4111-8111-111111111111';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const token = (over = {}) => jwt.sign({
  userId: USER, role: 'partner', profileType: 'empresa', name: 'Empresa Local', ...over,
}, SECRET);

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
  const server = createApp({
    pool, secret: SECRET, institutionStatus: async () => null, rankings: null,
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const snapshotRow = (over = {}) => ({
  board: 'maiores_apoiadores',
  period: 'sempre',
  position: 1,
  tied: false,
  subject_kind: 'usuario',
  subject_id: USER,
  identified: true,
  display_name: 'Empresa Local',
  avatar_url: null,
  category: 'parceiro',
  profile_type: 'empresa',
  place: null,
  points: 30,
  metrics: { confirmedSupports: 2, supportedDemands: 2 },
  computed_at: '2026-09-22T12:00:00.000Z',
  ...over,
});

test('GET /rankings devolve os sete rankings com o critério e os avisos', async () => {
  const pool = fakePool((text) => {
    if (/FROM ranking_snapshots/.test(text)) return { rows: [snapshotRow()] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/rankings`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.boards.map((b) => b.id), BOARD_IDS);
    assert.equal(body.period, 'sempre');
    assert.deepEqual(body.periods.map((p) => p.id), ['mes', 'ano', 'sempre']);
    assert.equal(body.notices.government, GOVERNMENT_NOTICE);
    for (const board of body.boards) assert.ok(board.criteria.length > 60, board.id);
    const supporters = body.boards.find((b) => b.id === 'maiores_apoiadores');
    assert.equal(supporters.entries[0].displayName, 'Empresa Local');
    assert.equal(supporters.entries[0].points, 30);
    assert.equal(body.computedAt, '2026-09-22T12:00:00.000Z');
  });
  // Nenhuma agregação por requisição: só a tabela materializada.
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].text, /FROM ranking_snapshots/);
  assert.doesNotMatch(pool.calls[0].text, /FROM (supports|reactions|comments|demands)\b/);
});

test('GET /rankings respeita período, recorte e teto de linhas', async () => {
  const pool = fakePool((text) => (/FROM ranking_snapshots/.test(text) ? { rows: [] } : null));
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/rankings?period=mes&board=bairros_mais_engajados&limit=500`);
    const body = await res.json();
    assert.equal(body.period, 'mes');
    assert.deepEqual(body.boards.map((b) => b.id), ['bairros_mais_engajados']);
  });
  assert.deepEqual(pool.calls[0].params, ['mes', ['bairros_mais_engajados'], 100]);
});

test('período inválido cai no padrão e ranking inexistente não filtra nada', async () => {
  const pool = fakePool((text) => (/FROM ranking_snapshots/.test(text) ? { rows: [] } : null));
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/rankings?period=decada&board=inventado`);
    const body = await res.json();
    assert.equal(body.period, 'sempre');
    assert.deepEqual(body.boards.map((b) => b.id), BOARD_IDS);
  });
});

test('a linha sem consentimento não leva nome nem foto', async () => {
  const pool = fakePool((text) => (/FROM ranking_snapshots/.test(text)
    ? { rows: [snapshotRow({ identified: false, display_name: null, avatar_url: null })] }
    : null));
  await withServer(pool, async (base) => {
    const body = await (await fetch(`${base}/rankings`)).json();
    const [entry] = body.boards.find((b) => b.id === 'maiores_apoiadores').entries;
    assert.equal(entry.identified, false);
    assert.equal(entry.displayName, null);
    assert.equal(entry.avatarUrl, null);
    assert.equal(entry.points, 30);
  });
});

test('GET /rankings/criteria publica os critérios, os selos e os avisos', async () => {
  await withServer(fakePool(() => ({ rows: [] })), async (base) => {
    const body = await (await fetch(`${base}/rankings/criteria`)).json();
    assert.deepEqual(body.boards.map((b) => b.id), BOARD_IDS);
    assert.ok(body.badges.length >= 8);
    assert.match(body.notices.government, /indicadores de atuação/);
    assert.equal(body.governmentIndicators.length, 5);
  });
});

test('selos do perfil; o Poder Público recebe indicadores de atuação', async () => {
  const pool = fakePool((text, params) => {
    if (/FROM profile_badges/.test(text)) {
      return {
        rows: params[0] === USER
          ? [{ badge: 'apoiador_confirmado', awarded_at: '2026-05-01T00:00:00.000Z', evidence_count: 3, computed_at: '2026-09-22T12:00:00.000Z' }]
          : [],
      };
    }
    if (/FROM profile_engagement/.test(text)) {
      return {
        rows: [params[0] === USER
          ? { category: 'parceiro', metrics: { confirmedSupports: 3 }, computed_at: '2026-09-22T12:00:00.000Z' }
          : { category: 'poder_publico', metrics: { government: { tracks: 4, responses: 2 } }, computed_at: '2026-09-22T12:00:00.000Z' }],
      };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const mine = await (await fetch(`${base}/profiles/${USER}/impact`)).json();
    assert.equal(mine.ranked, true);
    assert.equal(mine.badges[0].id, 'apoiador_confirmado');
    assert.match(mine.badges[0].rule, /confirmado pelo Agente/);
    assert.equal(mine.indicators.length, 0);
    assert.equal(mine.notice, null);

    const gov = await (await fetch(`${base}/profiles/${DEMAND}/impact`)).json();
    assert.equal(gov.ranked, false);
    assert.deepEqual(gov.badges, []);
    assert.equal(gov.indicators.find((i) => i.id === 'tracks').value, 4);
    assert.equal(gov.indicators.find((i) => i.id === 'offers').value, 0);
    assert.equal(gov.notice, GOVERNMENT_NOTICE);

    assert.equal((await fetch(`${base}/profiles/nao-uuid/impact`)).status, 404);
  });
});

test('compartilhar exige sessão, valida o alvo e não conta duas vezes no mesmo dia', async () => {
  let inserted = 0;
  const pool = fakePool((text) => {
    if (/INSERT INTO content_shares/.test(text)) {
      inserted += 1;
      return { rows: inserted === 1 ? [{ id: 'share-1' }] : [] };
    }
    if (/shares_count FROM demands/.test(text)) return { rows: [{ shares_count: 1 }] };
    return null;
  });
  await withServer(pool, async (base) => {
    const body = JSON.stringify({ targetKind: 'demand', targetId: DEMAND, channel: 'web_share' });
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token()}` };

    assert.equal((await fetch(`${base}/shares`, { method: 'POST', body, headers: { 'content-type': 'application/json' } })).status, 401);

    const first = await fetch(`${base}/shares`, { method: 'POST', body, headers });
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), { counted: true, sharesCount: 1 });

    const second = await fetch(`${base}/shares`, { method: 'POST', body, headers });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).counted, false);

    const invalid = await fetch(`${base}/shares`, {
      method: 'POST', headers, body: JSON.stringify({ targetKind: 'x', targetId: 'y', channel: 'z' }),
    });
    assert.equal(invalid.status, 422);
    assert.deepEqual(Object.keys((await invalid.json()).fields).sort(), ['channel', 'targetId', 'targetKind']);
  });
  // O registro guarda o retrato da identidade para o ranking (post_db não lê profiles).
  const insert = pool.calls.find(({ text }) => /INSERT INTO content_shares/.test(text));
  assert.equal(insert.params[4], 'Empresa Local');
  assert.equal(insert.params[6], 'partner');
});

test('consentimento de exibição do nome: leitura, gravação e validação', async () => {
  const pool = fakePool((text, params) => {
    if (/FROM ranking_consents/.test(text)) return { rows: [{ consent: false, updated_at: null }] };
    if (/INSERT INTO ranking_consents/.test(text)) {
      return { rows: [{ consent: params[1], updated_at: '2026-09-22T12:00:00.000Z' }] };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const headers = { 'content-type': 'application/json', authorization: `Bearer ${token()}` };
    const current = await (await fetch(`${base}/rankings/consent`, { headers })).json();
    assert.equal(current.consent, false);
    assert.match(current.notice, /consentiu/);

    const saved = await fetch(`${base}/rankings/consent`, {
      method: 'PUT', headers, body: JSON.stringify({ consent: true }),
    });
    assert.equal((await saved.json()).consent, true);

    const invalid = await fetch(`${base}/rankings/consent`, {
      method: 'PUT', headers, body: JSON.stringify({ consent: 'sim' }),
    });
    assert.equal(invalid.status, 422);
    assert.equal((await fetch(`${base}/rankings/consent`)).status, 401);
  });
});
