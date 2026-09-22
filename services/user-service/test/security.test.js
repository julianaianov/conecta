const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { transitionAllowed } = require('../src/routes/connections');
const { PUBLIC_PROFILE_COLUMNS } = require('../src/routes/users');

const SECRET = 'user-service-test-secret-0123456789abcdef';
const OPERATOR = '99999999-9999-9999-9999-999999999999';
const ANA = '11111111-1111-1111-1111-111111111111';
const BRUNO = '22222222-2222-2222-2222-222222222222';
const INTRUSO = '33333333-3333-3333-3333-333333333333';
const CONN_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const token = (userId, extra = {}) => jwt.sign({ userId, name: 'Pessoa', role: 'member', profileType: 'morador', ...extra }, SECRET);
const auth = (userId) => ({ authorization: `Bearer ${token(userId)}` });

const PROFILE_ROW = {
  id: 'p-internal', user_id: ANA, name: 'Ana', bio: 'Moradora', avatar_url: null, cover_url: null,
  status: null, neighborhood: 'Centro', city: 'Rio', website: null, role: 'member', profile_type: 'morador',
  member_since: '2026-09-01', friend_count: 0, phone: '+55 21 99999-0000', state: 'RJ',
  created_at: '2026-09-01', updated_at: '2026-09-01',
};

/** Devolve só as colunas que o SQL realmente seleciona (simula o Postgres). */
function project(sql, row) {
  const match = sql.match(/SELECT\s+([\s\S]+?)\s+FROM profiles/i);
  if (!match || match[1].trim() === '*') return { ...row };
  const cols = match[1].split(',').map((c) => c.trim());
  return Object.fromEntries(cols.map((c) => [c, row[c]]));
}

async function withServer(pool, callback, options = {}) {
  const server = createApp({ pool, secret: SECRET, operationUserIds: new Set([OPERATOR]), ...options }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// ── D4: perfil público sem dados pessoais ───────────────────

test('GET /:id devolve projeção pública, sem telefone, estado nem id interno', async () => {
  const calls = [];
  const pool = {
    async query(text, params) {
      calls.push(text);
      if (text.includes('FROM profiles WHERE user_id=$1')) return { rows: params[0] === ANA ? [project(text, PROFILE_ROW)] : [] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/${ANA}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.name, 'Ana');
    assert.equal('phone' in body, false);
    assert.equal('state' in body, false);
    assert.equal('id' in body, false);
    assert.deepEqual(Object.keys(body).sort(), [...PUBLIC_PROFILE_COLUMNS].sort());

    assert.equal((await fetch(`${base}/nao-e-uuid`)).status, 404);
  });
  assert.equal(calls.length, 1);
  assert.doesNotMatch(calls[0], /SELECT \*|phone/);
});

test('GET /me devolve ao dono os próprios dados de contato', async () => {
  const pool = {
    async query(text) {
      if (text.includes('FROM profiles WHERE user_id=$1')) return { rows: [project(text, PROFILE_ROW)] };
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/me`, { headers: auth(ANA) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).phone, PROFILE_ROW.phone);
  });
});

test('ranking público usa projeção explícita', async () => {
  const calls = [];
  const pool = { async query(text) { calls.push(text); return { rows: [] }; } };
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/ranking`)).status, 200);
  });
  assert.doesNotMatch(calls[0], /SELECT \*|phone/);
});

// ── D4: conexões só para as partes ──────────────────────────

function connectionPool(initial) {
  const connection = { ...initial };
  const calls = [];
  return {
    connection,
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('FROM connections c') && text.includes('WHERE c.id = $1')) {
        if (params[0] !== connection.id) return { rows: [] };
        if (text.includes('c.from_user_id = $2 OR c.to_user_id = $2')
          && params[1] !== connection.from_user_id && params[1] !== connection.to_user_id) return { rows: [] };
        return {
          rows: [{
            ...connection, created_at: 'now', updated_at: 'now',
            from_name: 'Ana', to_name: 'Bruno', from_role: 'member', to_role: 'partner',
          }],
        };
      }
      if (text.includes('FROM connections WHERE id = $1')) {
        return { rows: params[0] === connection.id ? [{ ...connection }] : [] };
      }
      if (text.includes('UPDATE connections')) {
        const [status, outcome, events, id, expected] = params;
        if (id !== connection.id || connection.status !== expected) return { rows: [] };
        Object.assign(connection, { status, outcome, events: JSON.parse(events) });
        return { rows: [{ id }] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

const PENDING = {
  id: CONN_ID, type: 'support', status: 'pending', from_user_id: ANA, to_user_id: BRUNO,
  message: 'Mensagem privada', post_id: null, post_title: null, outcome: null, events: [],
};

test('GET /connections/:id: 404 para quem não participa, 200 para as partes', async () => {
  const pool = connectionPool(PENDING);
  await withServer(pool, async (base) => {
    const intruso = await fetch(`${base}/connections/${CONN_ID}`, { headers: auth(INTRUSO) });
    assert.equal(intruso.status, 404);
    assert.doesNotMatch(await intruso.text(), /Mensagem privada/);

    for (const party of [ANA, BRUNO]) {
      const response = await fetch(`${base}/connections/${CONN_ID}`, { headers: auth(party) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).message, 'Mensagem privada');
    }
    assert.equal((await fetch(`${base}/connections/${CONN_ID}`)).status, 401);
    assert.equal((await fetch(`${base}/connections/abc`, { headers: auth(ANA) })).status, 404);
  });
});

test('PUT /connections/:id: só o destinatário aceita; estranho recebe 404', async () => {
  const pool = connectionPool(PENDING);
  const put = (base, userId, body) => fetch(`${base}/connections/${CONN_ID}`, {
    method: 'PUT',
    headers: { ...auth(userId), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await withServer(pool, async (base) => {
    assert.equal((await put(base, INTRUSO, { status: 'accepted' })).status, 404);
    assert.equal((await put(base, ANA, { status: 'accepted' })).status, 409);
    assert.equal((await put(base, BRUNO, { status: 'done', outcome: 'x' })).status, 409);
    assert.equal(pool.connection.status, 'pending');

    assert.equal((await put(base, BRUNO, { status: 'accepted' })).status, 200);
    assert.equal(pool.connection.status, 'accepted');
    assert.equal((await put(base, ANA, { status: 'done', outcome: 'Entregue' })).status, 200);
    assert.equal(pool.connection.status, 'done');
    assert.equal((await put(base, BRUNO, { status: 'accepted' })).status, 409);
  });
});

test('máquina de transições da conexão', () => {
  const from = { isFrom: true, isTo: false };
  const to = { isFrom: false, isTo: true };
  assert.equal(transitionAllowed('pending', 'accepted', to), true);
  assert.equal(transitionAllowed('pending', 'declined', to), true);
  assert.equal(transitionAllowed('pending', 'accepted', from), false);
  assert.equal(transitionAllowed('pending', 'canceled', from), true);
  assert.equal(transitionAllowed('pending', 'canceled', to), false);
  assert.equal(transitionAllowed('accepted', 'done', from), true);
  assert.equal(transitionAllowed('accepted', 'done', to), true);
  assert.equal(transitionAllowed('declined', 'accepted', to), false);
  assert.equal(transitionAllowed('pending', 'pending', to), false);
  assert.equal(transitionAllowed('pending', undefined, to), false);
});

test('POST /connections valida destino, tipo e conexão consigo mesmo', async () => {
  const calls = [];
  const pool = { async query(text) { calls.push(text); throw new Error(`Unexpected query: ${text}`); } };
  const post = (base, body) => fetch(`${base}/connections`, {
    method: 'POST',
    headers: { ...auth(ANA), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  await withServer(pool, async (base) => {
    assert.equal((await post(base, { toUserId: ANA, type: 'support', message: 'oi' })).status, 400);
    assert.equal((await post(base, { toUserId: BRUNO, type: 'hack', message: 'oi' })).status, 400);
    assert.equal((await post(base, { toUserId: 'x', type: 'support', message: 'oi' })).status, 404);
    assert.equal((await post(base, { toUserId: BRUNO, type: 'support', message: '   ' })).status, 400);
  });
  assert.equal(calls.length, 0);
});

test('depoimento para si mesmo é recusado', async () => {
  const pool = { async query(text) { throw new Error(`Unexpected query: ${text}`); } };
  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/testimonials`, {
      method: 'POST',
      headers: { ...auth(ANA), 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: ANA, content: 'Sou ótima' }),
    });
    assert.equal(response.status, 400);
  });
});

// ── D3: admin-snapshot só para a operação ───────────────────

function snapshotPool() {
  const calls = [];
  return {
    calls,
    async query(text) {
      calls.push(text);
      if (text.includes('FROM profiles')) return { rows: [project(text, PROFILE_ROW)] };
      if (text.includes('FROM connections')) {
        return { rows: [{ id: CONN_ID, type: 'support', status: 'pending', from_user_id: ANA, to_user_id: BRUNO, message: 'vazou?', outcome: 'vazou?', events: [{ label: 'vazou?' }] }] };
      }
      return { rows: [] };
    },
  };
}

test('GET /admin-snapshot: 401 sem token, 403 para conta comum, sem consultar o banco', async () => {
  const pool = snapshotPool();
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/admin-snapshot`)).status, 401);
    assert.equal((await fetch(`${base}/admin-snapshot`, { headers: auth(ANA) })).status, 403);
  });
  assert.equal(pool.calls.length, 0);
});

test('GET /admin-snapshot sem DM_OPERATION_USER_IDS recusa todos', async () => {
  const pool = snapshotPool();
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/admin-snapshot`, { headers: auth(OPERATOR) })).status, 403);
  }, { operationUserIds: new Set() });
});

test('GET /admin-snapshot da operação não traz telefone nem conteúdo privado de conexões', async () => {
  const pool = snapshotPool();
  await withServer(pool, async (base) => {
    const response = await fetch(`${base}/admin-snapshot`, { headers: auth(OPERATOR) });
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.doesNotMatch(text, /99999-0000|vazou\?/);
    const body = JSON.parse(text);
    assert.equal(body.users.length, 1);
    assert.equal(body.connections[0].status, 'pending');
  });
  for (const sql of pool.calls) assert.doesNotMatch(sql, /SELECT \*|phone|c\.message|c\.outcome|c\.events/);
});

test('o processo do user-service não sobe sem JWT_SECRET', () => {
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const env = { ...process.env, NODE_ENV: 'production', PORT: '0' };
  delete env.JWT_SECRET;
  const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], { env, encoding: 'utf8', timeout: 10000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /JWT_SECRET ausente/);
});
