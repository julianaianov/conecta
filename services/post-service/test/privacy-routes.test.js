// Direitos do titular sobre o post_db (T24), com o banco simulado: a
// exportação só lê o que é do titular e a anonimização não toca a trilha
// imutável.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const store = require('../src/privacy/store');

const SECRET = 'post-service-privacy-secret-0123456789ab';
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const token = (userId = USER) => jwt.sign({ userId, role: 'member', profileType: 'morador', name: 'Ana' }, SECRET);

/** Pool simulado: guarda as consultas e responde por trecho do SQL. */
function createPool({ anonymized = false } = {}) {
  const queries = [];
  return {
    queries,
    async query(text, params = []) {
      queries.push({ text, params });
      if (text.includes('FROM anonymized_users')) {
        return {
          rows: anonymized
            ? [{ user_id: USER, protocol: 'LGPD-2026-900001', summary: {}, anonymized_at: new Date('2026-09-22T12:00:00Z') }]
            : [],
        };
      }
      if (text.startsWith('UPDATE posts')) return { rows: [{ id: 'p1' }], rowCount: 1 };
      if (text.startsWith('UPDATE comments')) return { rows: [{ id: 'c1' }, { id: 'c2' }], rowCount: 2 };
      if (text.startsWith('UPDATE supports')) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO ranking_consents')) return { rows: [{ user_id: USER }], rowCount: 1 };
      if (text.includes('INSERT INTO anonymized_users')) {
        return { rows: [{ anonymized_at: new Date('2026-09-22T12:00:00Z') }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

const app = (pool) => createApp({
  pool,
  secret: SECRET,
  operationUserIds: new Set(),
  uploadStorage: null,
  dossierService: null,
  rankings: null,
  institutionStatus: async () => ({ kind: null, status: null, canActInstitutionally: true, organizationId: null }),
});

async function withServer(pool, fn) {
  const server = app(pool).listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('a exportação do post_db filtra sempre pelo titular e nunca por outra conta', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/privacy/data`, { headers: { authorization: `Bearer ${token()}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.fonte, 'post_db');
    for (const bloco of ['publicacoes', 'comentarios', 'demandas', 'apoios', 'interesses',
      'compartilhamentos', 'denunciasFeitas', 'arquivos']) {
      assert.ok(bloco in body.dados, `falta o bloco ${bloco}`);
    }
  });
  const selects = pool.queries.filter((q) => q.text.trim().startsWith('SELECT'));
  assert.ok(selects.length >= 10);
  for (const q of selects) {
    assert.deepEqual(q.params, [USER], `consulta sem o titular: ${q.text}`);
    assert.ok(!/SELECT \*/.test(q.text), 'a exportação usa projeção explícita de colunas');
  }
});

test('a exportação não aceita token de outra conta para ler dados alheios', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/privacy/data`, { headers: { authorization: `Bearer ${token(OTHER)}` } });
    assert.equal(res.status, 200);
  });
  for (const q of pool.queries) assert.deepEqual(q.params, [OTHER]);
});

test('sem token, os direitos do titular no post_db respondem 401', async () => {
  await withServer(createPool(), async (base) => {
    assert.equal((await fetch(`${base}/me/privacy/data`)).status, 401);
    assert.equal((await fetch(`${base}/me/privacy/anonymize`, { method: 'POST' })).status, 401);
  });
});

test('a anonimização troca o retrato de identidade e revoga os consentimentos de exibição', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/privacy/anonymize`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
      body: JSON.stringify({ protocol: 'LGPD-2026-900001' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.alreadyAnonymized, false);
    assert.deepEqual(body.summary, {
      publicacoes: 1,
      comentarios: 2,
      pautas: 0,
      apoiosComExibicaoRevogada: 0,
      consentimentoDeRankingRevogado: true,
    });
  });

  const written = pool.queries.filter((q) => /^(UPDATE|INSERT|DELETE)/.test(q.text.trim()));
  const tocadas = written.map((q) => q.text.trim().split(/\s+/)[q.text.trim().startsWith('INSERT') ? 2 : 1]);
  assert.deepEqual(new Set(tocadas), new Set(['posts', 'comments', 'supports', 'ranking_consents', 'media_agenda_items', 'anonymized_users']));
  // A trilha imutável não é tocada.
  for (const proibida of ['demands', 'demand_events', 'demand_interests', 'content_shares',
    'content_reports', 'demand_evidences', 'demand_accountability', 'demand_dossiers']) {
    assert.ok(!written.some((q) => new RegExp(`\\b${proibida}\\b`).test(q.text)),
      `a anonimização não pode escrever em ${proibida}`);
  }
  assert.ok(!written.some((q) => /^DELETE/.test(q.text.trim())), 'a anonimização não apaga registro');
});

test('anonimizar de novo é idempotente e não reescreve nada', async () => {
  const pool = createPool({ anonymized: true });
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/privacy/anonymize`, {
      method: 'POST', headers: { authorization: `Bearer ${token()}` },
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).alreadyAnonymized, true);
  });
  assert.ok(!pool.queries.some((q) => /^(UPDATE|INSERT|DELETE)/.test(q.text.trim())));
});

test('o rótulo da conta anonimizada é o mesmo do auth-service e do user-service', () => {
  const auth = require('../../auth-service/src/routes/consents');
  const user = require('../../user-service/src/privacy/constants');
  assert.equal(store.ANONYMOUS_NAME, auth.ANONYMOUS_NAME);
  assert.equal(store.ANONYMOUS_NAME, user.ANONYMOUS_NAME);
});
