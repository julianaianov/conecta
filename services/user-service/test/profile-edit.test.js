// Edição do perfil pelo titular (W36). Os perfis abaixo existem só neste teste.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { PUBLIC_PROFILE_COLUMNS } = require('../src/routes/users');
const {
  PROFILE_FIELDS, UPDATABLE_COLUMNS, validateProfileUpdate, buildProfileUpdate,
} = require('../src/profile-edit');

const SECRET = 'user-service-test-secret-0123456789abcdef';
const ANA = '11111111-1111-4111-8111-111111111111';
const BRUNO = '22222222-2222-4222-8222-222222222222';
const REMOVIDA = '33333333-3333-4333-8333-333333333333';
const NOVA = '44444444-4444-4444-8444-444444444444';

const headers = (userId, role = 'agent', profileType = 'ong', name = 'Pessoa') => ({
  authorization: `Bearer ${jwt.sign({ userId, name, role, profileType }, SECRET)}`,
  'content-type': 'application/json',
});

const baseRow = (userId, over = {}) => ({
  id: `p-${userId}`, user_id: userId, name: 'Ana', bio: null, avatar_url: null, cover_url: null, status: null,
  neighborhood: null, city: null, website: null, role: 'agent', profile_type: 'ong', member_since: '2026-09-01',
  friend_count: 0, phone: null, state: null, created_at: '2026-09-01', updated_at: '2026-09-01', anonymized_at: null,
  ...over,
});

/** Pool em memória: o que importa de `profiles` (INSERT do provisionamento, UPDATE do titular e os SELECTs). */
function createPool(rows = [baseRow(ANA), baseRow(BRUNO, { name: 'Bruno', phone: '21988887777', state: 'RJ' })]) {
  const profiles = new Map(rows.map((row) => [row.user_id, row]));
  const updates = [];
  const project = (columns, row) => Object.fromEntries(columns.split(',').map((c) => c.trim()).map((c) => [c, row[c]]));
  return {
    profiles,
    updates,
    async query(text, params = []) {
      const sql = text.replace(/\s+/g, ' ').trim();
      if (sql.startsWith('INSERT INTO profiles') && sql.includes('ON CONFLICT (user_id) DO NOTHING')) {
        const [userId, name, avatarUrl, role, profileType] = params;
        if (profiles.has(userId)) return { rows: [], rowCount: 0 };
        profiles.set(userId, baseRow(userId, { name, avatar_url: avatarUrl, role, profile_type: profileType }));
        return { rows: [{ id: `p-${userId}` }], rowCount: 1 };
      }
      const update = /^UPDATE profiles SET (.+), updated_at = NOW\(\) WHERE user_id = \$(\d+) AND anonymized_at IS NULL RETURNING (.+)$/.exec(sql);
      if (update) {
        updates.push({ sql, params });
        const row = profiles.get(params[Number(update[2]) - 1]);
        if (!row || row.anonymized_at) return { rows: [], rowCount: 0 };
        update[1].split(', ').forEach((assignment, index) => {
          row[assignment.split(' = ')[0]] = params[index];
        });
        row.updated_at = '2026-10-04';
        return { rows: [project(update[3], row)], rowCount: 1 };
      }
      const select = /^SELECT (.+) FROM profiles WHERE user_id=\$1$/.exec(sql);
      if (select) {
        const row = profiles.get(params[0]);
        return { rows: row ? [project(select[1], row)] : [] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
  };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, operationUserIds: new Set() }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = (base, h, body) => fetch(`${base}/me`, { method: 'POST', headers: h, body: JSON.stringify(body) });

// ── Domínio ─────────────────────────────────────────────────

test('os campos editáveis são os do perfil e nada de categoria, subperfil ou e-mail', () => {
  assert.deepEqual(Object.keys(PROFILE_FIELDS), ['name', 'bio', 'avatarUrl', 'neighborhood', 'city', 'state', 'phone', 'website']);
  assert.deepEqual(UPDATABLE_COLUMNS, ['name', 'bio', 'avatar_url', 'neighborhood', 'city', 'state', 'phone', 'website']);
  for (const column of ['role', 'profile_type', 'user_id', 'email', 'anonymized_at', 'member_since']) {
    assert.ok(!UPDATABLE_COLUMNS.includes(column), column);
  }
});

test('validação: só os campos enviados, aparados, normalizados; vazio limpa', () => {
  const ok = validateProfileUpdate({
    name: '  Ana Souza ', bio: ' Moradora do Centro. ', avatarUrl: 'https://exemplo.org/ana.jpg',
    neighborhood: ' Centro ', city: 'Duque de Caxias', state: 'rj', phone: '(21) 98888-7777', website: 'https://ana.org.br',
  });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value, {
    name: 'Ana Souza', bio: 'Moradora do Centro.', avatar_url: 'https://exemplo.org/ana.jpg',
    neighborhood: 'Centro', city: 'Duque de Caxias', state: 'RJ', phone: '21988887777', website: 'https://ana.org.br',
  });

  assert.deepEqual(validateProfileUpdate({ city: 'Niterói' }).value, { city: 'Niterói' }, 'só o enviado');
  assert.deepEqual(validateProfileUpdate({}).value, {});
  assert.deepEqual(validateProfileUpdate(null).value, {});
  assert.deepEqual(validateProfileUpdate(['x']).value, {});

  const cleared = validateProfileUpdate({ bio: '   ', avatarUrl: null, phone: '', website: '', neighborhood: null, city: '', state: '' });
  assert.deepEqual(cleared.errors, {});
  assert.deepEqual(cleared.value, {
    bio: null, avatar_url: null, phone: null, website: null, neighborhood: null, city: null, state: null,
  });

  // Chave snake_case que o cliente Android já usava.
  assert.deepEqual(validateProfileUpdate({ avatar_url: 'https://exemplo.org/a.png' }).value, { avatar_url: 'https://exemplo.org/a.png' });
  // Categoria, subperfil, e-mail e id do corpo são ignorados.
  assert.deepEqual(validateProfileUpdate({ role: 'government', profile_type: 'prefeitura', email: 'x@y.org', user_id: BRUNO }).value, {});
});

test('validação: erros por campo com a chave da interface', () => {
  const bad = validateProfileUpdate({
    name: '   ', bio: 'x'.repeat(501), avatarUrl: 'http://exemplo.org/a.jpg', neighborhood: 'x'.repeat(256),
    city: 'x'.repeat(101), state: 'XX', phone: '123', website: 'ana.org',
  });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['avatarUrl', 'bio', 'city', 'name', 'neighborhood', 'phone', 'state', 'website']);
  assert.equal(bad.errors.name, 'Nome é obrigatório');
  assert.equal(bad.errors.bio, 'Apresentação: até 500 caracteres');
  assert.equal(bad.errors.avatarUrl, 'Link da foto deve começar com https://');
  assert.equal(bad.errors.state, 'Estado: informe a sigla da UF (ex.: RJ)');
  assert.equal(bad.errors.website, 'Site deve começar com http:// ou https://');
  assert.match(bad.errors.phone, /DDD/);
  assert.deepEqual(bad.value, {});

  for (const avatarUrl of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'https://', 'https://u:p@exemplo.org/a.png', '//exemplo.org/a.png', '/api/x.png']) {
    assert.ok(validateProfileUpdate({ avatarUrl }).errors.avatarUrl, avatarUrl);
  }
  assert.ok(validateProfileUpdate({ name: 123 }).errors.name, 'número não é texto');
  assert.ok(validateProfileUpdate({ bio: { x: 1 } }).errors.bio, 'objeto não é texto');
  assert.ok(validateProfileUpdate({ bio: 'a\u0000b' }).errors.bio, 'NUL derrubaria o INSERT');
  assert.deepEqual(validateProfileUpdate({ name: null }).errors, { name: 'Nome é obrigatório' }, 'o nome não é limpo');
  assert.deepEqual(validateProfileUpdate({ phone: '+55 21 3333-4444' }).errors, {}, 'DDI 55 e fixo valem');
  assert.equal(validateProfileUpdate({ phone: '+55 21 3333-4444' }).value.phone, '2133334444');
});

test('o UPDATE só toca as colunas da lista, na conta do titular e fora das anonimizadas', () => {
  const update = buildProfileUpdate(ANA, { name: 'Ana', neighborhood: 'Centro', role: 'government', 'x = 1; --': 'y' }, 'user_id, name');
  const sql = update.text.replace(/\s+/g, ' ');
  assert.equal(sql, 'UPDATE profiles SET name = $1, neighborhood = $2, updated_at = NOW() WHERE user_id = $3 AND anonymized_at IS NULL RETURNING user_id, name');
  assert.deepEqual(update.params, ['Ana', 'Centro', ANA]);
  assert.throws(() => buildProfileUpdate(ANA, { role: 'government' }, 'user_id'), /ao menos um campo/);
});

// ── Rota ────────────────────────────────────────────────────

test('POST /me grava só o que foi enviado, inclusive o bairro, e devolve a visão do titular', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await post(base, headers(ANA), {
      name: 'Associação Bairro Verde', bio: 'Hortas comunitárias no Centro.', neighborhood: 'Centro',
      city: 'Duque de Caxias', state: 'RJ', phone: '(21) 98888-7777', website: 'https://bairroverde.org', avatarUrl: 'https://exemplo.org/logo.png',
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.name, 'Associação Bairro Verde');
    assert.equal(body.neighborhood, 'Centro');
    assert.equal(body.state, 'RJ');
    assert.equal(body.phone, '21988887777', 'o titular recebe o próprio telefone');
    assert.equal(body.avatar_url, 'https://exemplo.org/logo.png');
    assert.equal(body.role, 'agent', 'categoria não muda');

    // Segunda gravação parcial: o resto fica como está (antes, o que faltava virava NULL).
    const again = await post(base, headers(ANA), { bio: 'Hortas e oficinas.' });
    assert.equal(again.status, 200);
    const next = await again.json();
    assert.equal(next.bio, 'Hortas e oficinas.');
    assert.equal(next.neighborhood, 'Centro');
    assert.equal(next.phone, '21988887777');

    // Limpar um campo opcional.
    const cleared = await (await post(base, headers(ANA), { phone: '', website: null })).json();
    assert.equal(cleared.phone, null);
    assert.equal(cleared.website, null);
    assert.equal(cleared.name, 'Associação Bairro Verde');
  });
  assert.equal(pool.updates.length, 3);
  for (const { sql } of pool.updates) {
    const assignments = /SET (.+), updated_at = NOW\(\)/.exec(sql)[1];
    assert.doesNotMatch(assignments, /role|profile_type|user_id/, 'o SET não toca categoria, subperfil nem dono');
  }
});

test('POST /me serve as cinco categorias e nunca troca categoria nem subperfil', async () => {
  const contas = [
    ['agent', 'associacao'], ['member', 'morador'], ['partner', 'comercio_local'], ['government', 'secretaria'], ['media', 'jornalista'],
  ];
  const pool = createPool(contas.map(([role, profile_type], index) => baseRow(`0000000${index}-0000-4000-8000-000000000000`, { role, profile_type })));
  await withServer(pool, async (base) => {
    for (const [index, [role, profileType]] of contas.entries()) {
      const userId = `0000000${index}-0000-4000-8000-000000000000`;
      const res = await post(base, headers(userId, role, profileType), {
        bio: `Perfil de ${role}`, role: 'government', profile_type: 'prefeitura', neighborhood: 'Centro',
      });
      assert.equal(res.status, 200, role);
      const body = await res.json();
      assert.equal(body.bio, `Perfil de ${role}`);
      assert.equal(body.neighborhood, 'Centro');
      assert.equal(body.role, role);
      assert.equal(body.profile_type, profileType);
    }
  });
});

test('POST /me: 401 sem token, 422 com erros por campo, 422 sem nenhum campo', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/me`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 401);

    const bad = await post(base, headers(ANA), { name: '', phone: '12', website: 'sem-protocolo', state: 'ZZ', bio: 'ok' });
    assert.equal(bad.status, 422);
    const body = await bad.json();
    assert.equal(body.code, 'validation_failed');
    assert.deepEqual(Object.keys(body.fields).sort(), ['name', 'phone', 'state', 'website']);
    assert.equal(pool.profiles.get(ANA).bio, null, 'nada é gravado quando há erro');

    const empty = await post(base, headers(ANA), {});
    assert.equal(empty.status, 422);
    assert.equal((await empty.json()).code, 'validation_failed');
    assert.equal((await post(base, headers(ANA), { role: 'government' })).status, 422, 'só chave desconhecida também não grava');
  });
  assert.equal(pool.updates.length, 0);
});

test('POST /me só altera o perfil do dono do token', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    // `user_id`/`userId` no corpo não escolhem o perfil.
    const res = await post(base, headers(ANA), { name: 'Ana Nova', user_id: BRUNO, userId: BRUNO });
    assert.equal(res.status, 200);
    assert.equal(pool.profiles.get(ANA).name, 'Ana Nova');
    assert.equal(pool.profiles.get(BRUNO).name, 'Bruno');
    assert.equal(pool.profiles.get(BRUNO).phone, '21988887777');
  });
});

test('POST /me cria o perfil da conta que ainda não tem e recusa conta anonimizada', async () => {
  const pool = createPool([baseRow(REMOVIDA, { name: 'Conta removida', anonymized_at: '2026-09-30' })]);
  await withServer(pool, async (base) => {
    const nova = await post(base, headers(NOVA, 'member', 'morador', 'Pessoa Nova'), { bio: 'Moro no Centro.' });
    assert.equal(nova.status, 200);
    const body = await nova.json();
    assert.equal(body.name, 'Pessoa Nova', 'o nome vem das claims do token');
    assert.equal(body.bio, 'Moro no Centro.');
    assert.equal(body.role, 'member');

    const removida = await post(base, headers(REMOVIDA, 'member', 'morador', 'Pessoa'), { name: 'Voltei', phone: '21988887777' });
    assert.equal(removida.status, 404);
    assert.equal(pool.profiles.get(REMOVIDA).name, 'Conta removida');
    assert.equal(pool.profiles.get(REMOVIDA).phone, null);
  });
});

test('LGPD: telefone e estado só aparecem para o dono, nunca na rota pública', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    await post(base, headers(ANA), { phone: '(21) 98888-7777', state: 'RJ', neighborhood: 'Centro', city: 'Duque de Caxias', bio: 'Oi' });

    const own = await (await fetch(`${base}/me`, { headers: headers(ANA) })).json();
    assert.equal(own.phone, '21988887777');
    assert.equal(own.state, 'RJ');

    const publicText = await (await fetch(`${base}/${ANA}`)).text();
    const pub = JSON.parse(publicText);
    assert.deepEqual(Object.keys(pub).sort(), [...PUBLIC_PROFILE_COLUMNS].sort());
    assert.equal(pub.neighborhood, 'Centro', 'o bairro é público, como o perfil já o exibe');
    assert.equal(pub.city, 'Duque de Caxias');
    assert.doesNotMatch(publicText, /98888|"phone"|"state"/);
  });
  assert.ok(!PUBLIC_PROFILE_COLUMNS.includes('phone'));
  assert.ok(!PUBLIC_PROFILE_COLUMNS.includes('state'));
});
