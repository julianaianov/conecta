// Central de notificações do post_db (T-05-16): rotas com banco simulado,
// `notify` e o laço da caixa de saída. O trigger demand_events_fan_out e o
// ciclo completo estão em notifications-e2e.test.js (npm run test:e2e).
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { buildNotifyCall, notify, NOTIFICATION_KINDS } = require('../src/notifications');
const { createMailer, sendPending, MAX_ATTEMPTS } = require('../src/notifications/mailer');

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '11111111-1111-4111-8111-111111111111';
const GOV = '55555555-5555-4555-8555-555555555555';
const ORG = '88888888-8888-4888-8888-888888888888';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const N1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const VALIDATED_GOV = { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG };

function fakePool(handler) {
  const calls = [];
  return {
    calls,
    async query(text, params = []) {
      calls.push({ text, params });
      const result = await handler(text, params);
      if (!result) throw new Error(`Consulta inesperada: ${text}`);
      return result;
    },
  };
}

async function withServer(pool, callback, { access = null, lookups = [] } = {}) {
  const server = createApp({
    pool, secret: SECRET, dossierService: null, uploadStorage: null,
    institutionStatus: async (req) => { lookups.push(req.user.userId); return access; },
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (userId = USER, role = 'agent') => ({
  authorization: `Bearer ${jwt.sign({ userId, role, profileType: role === 'government' ? 'secretaria' : 'ong', name: 'X' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, url, body, h = auth()) => {
  const res = await fetch(`${base}${url}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const ROW = {
  id: N1, kind: 'demanda_devolvida', title: 'Demanda devolvida para ajustes', summary: '«Praça limpa»',
  href: `/minhas-demandas#demanda-${DEMAND}`, demand_id: DEMAND, process_id: null, organization_id: null,
  created_at: '2026-09-25T10:00:00.000Z', read_at: null,
};

test('GET /notifications: avisos da conta, sem consultar o órgão quando não pedido', async () => {
  const lookups = [];
  const pool = fakePool((text, params) => {
    if (text.includes('FROM notifications') && text.includes('ORDER BY created_at DESC')) {
      assert.deepEqual(params.slice(0, 2), [USER, null]);
      assert.equal(params.at(-1), 31);
      return { rows: [ROW] };
    }
    if (text.includes('count(*)::int AS n')) return { rows: [{ n: 1 }] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'GET', '/notifications');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.unreadCount, 1);
    assert.equal(res.body.organizationScope, false);
    assert.deepEqual(res.body.notifications[0], {
      id: N1, kind: 'demanda_devolvida', title: 'Demanda devolvida para ajustes', summary: '«Praça limpa»',
      href: `/minhas-demandas#demanda-${DEMAND}`, actorName: null, demandId: DEMAND, processId: null,
      connectionId: null, scope: 'user', createdAt: '2026-09-25T10:00:00.000Z', readAt: null,
    });
    assert.equal((await fetch(`${base}/notifications`)).status, 401);
    assert.equal((await send(base, 'GET', '/notifications?unread=talvez')).status, 422);
  }, { lookups });
  assert.equal(lookups.length, 0);
});

test('GET /notifications?institution=1: Poder Público validado vê também os avisos do órgão', async () => {
  const pool = fakePool((text, params) => {
    if (text.includes('ORDER BY created_at DESC')) {
      assert.deepEqual(params.slice(0, 2), [GOV, ORG]);
      assert.match(text, /organization_id = \$2::uuid/);
      assert.match(text, /read_at IS NULL/);
      assert.deepEqual(params[2], ['encaminhamento_recebido']);
      return { rows: [{ ...ROW, kind: 'encaminhamento_recebido', organization_id: ORG }] };
    }
    if (text.includes('count(*)::int AS n')) return { rows: [{ n: 1 }] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'GET', '/notifications?institution=1&unread=1&kind=encaminhamento_recebido', undefined,
      auth(GOV, 'government'));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.organizationScope, true);
    assert.equal(res.body.notifications[0].scope, 'organization');
  }, { access: VALIDATED_GOV });
});

test('GET /notifications?institution=1: sem validação ou com o user-service fora, só os da conta', async () => {
  const seen = [];
  const pool = fakePool((text, params) => {
    if (text.includes('ORDER BY created_at DESC')) { seen.push(params[1]); return { rows: [] }; }
    if (text.includes('count(*)::int AS n')) return { rows: [{ n: 0 }] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await send(base, 'GET', '/notifications?institution=1', undefined, auth(GOV, 'government'));
    assert.equal(res.status, 200);
    assert.equal(res.body.organizationScope, false);
  }, { access: { ...VALIDATED_GOV, status: 'em_analise' } });
  const server = createApp({
    pool, secret: SECRET, dossierService: null, uploadStorage: null,
    institutionStatus: async () => { throw new Error('user-service fora'); },
  }).listen(0);
  try {
    const res = await send(`http://127.0.0.1:${server.address().port}`, 'GET', '/notifications?institution=1', undefined, auth(GOV, 'government'));
    assert.equal(res.status, 200, 'falha do órgão não derruba o sino');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  assert.deepEqual(seen, [null, null]);
});

test('POST /notifications/read: ids da conta (e do órgão com institution=1) ou all', async () => {
  const updates = [];
  const pool = fakePool((text, params) => {
    if (text.startsWith('UPDATE notifications SET read_at')) { updates.push({ text, params }); return { rowCount: 1 }; }
    if (text.includes('count(*)::int AS n')) return { rows: [{ n: 0 }] };
    return null;
  });
  await withServer(pool, async (base) => {
    const one = await send(base, 'POST', '/notifications/read?institution=1', { ids: [N1] }, auth(GOV, 'government'));
    assert.deepEqual(one.body, { updated: 1, unreadCount: 0 });
    assert.deepEqual(updates[0].params, [GOV, ORG, [N1]]);
    await send(base, 'POST', '/notifications/read', { all: true });
    assert.deepEqual(updates[1].params, [USER, null]);
    assert.equal((await send(base, 'POST', '/notifications/read', { ids: 'x' })).status, 422);
    const many = Array.from({ length: 201 }, () => N1);
    assert.equal((await send(base, 'POST', '/notifications/read', { ids: many })).status, 422);
  }, { access: VALIDATED_GOV });
});

test('preferências: todos os tipos, padrão ligado, PUT grava por tipo e recusa tipo desconhecido', async () => {
  let saved = [];
  const pool = fakePool((text, params) => {
    if (text.startsWith('SELECT kind, in_app, email FROM notification_preferences')) return { rows: saved };
    if (text.includes('INSERT INTO notification_preferences')) {
      saved = params[1].map((kind, i) => ({ kind, in_app: params[2][i], email: params[3][i] }));
      return { rowCount: saved.length };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const got = await send(base, 'GET', '/notifications/preferences');
    assert.deepEqual(got.body.preferences.map((p) => p.kind), NOTIFICATION_KINDS);
    const put = await send(base, 'PUT', '/notifications/preferences', {
      preferences: [{ kind: 'demanda_publicada', inApp: false, email: false }, { kind: 'apoio', inApp: true, email: false }],
    });
    assert.equal(put.status, 200);
    assert.deepEqual(put.body.preferences.filter((p) => !p.email).map((p) => p.kind), ['apoio', 'demanda_publicada']);
    const bad = await send(base, 'PUT', '/notifications/preferences', { preferences: [{ kind: 'x', inApp: 1, email: true }] });
    assert.equal(bad.status, 422);
  });
});

test('notify: chamada nomeada de notification_create com os opcionais; recusa entrada inválida', async () => {
  const call = buildNotifyCall({
    userId: USER, kind: 'prazo_proximo', title: ' Prazo próximo ', body: '«Praça»', href: '/processos',
    demandId: DEMAND, dedupeKey: 'prazo:1',
  });
  assert.equal(call.text,
    'SELECT notification_create(p_user_id => $1::uuid, p_kind => $2, p_title => $3, p_summary => $4, p_href => $5, '
    + 'p_demand_id => $6::uuid, p_dedupe_key => $7::text) AS id');
  assert.deepEqual(call.values, [USER, 'prazo_proximo', 'Prazo próximo', '«Praça»', '/processos', DEMAND, 'prazo:1']);
  const org = buildNotifyCall({ organizationId: ORG, kind: 'encaminhamento_recebido', title: 'Encaminhamento recebido' });
  assert.match(org.text, /^SELECT notification_create_for_organization\(p_organization_id => \$1::uuid/);
  assert.throws(() => buildNotifyCall({ userId: 'x', kind: 'apoio', title: 't' }), /UUID/);
  assert.throws(() => buildNotifyCall({ userId: USER, kind: 'curtida', title: 't' }), /tipo desconhecido/);
  assert.throws(() => buildNotifyCall({ userId: USER, kind: 'apoio', title: '' }), /title/);
  assert.throws(() => buildNotifyCall({ userId: USER, kind: 'apoio', title: 't', href: 'https://fora.example' }), /href/);
  assert.throws(() => buildNotifyCall({ userId: USER, kind: 'apoio', title: 't', href: '//fora.example' }), /href/);
  const pool = fakePool(() => ({ rows: [{ id: N1 }] }));
  assert.equal(await notify(pool, { userId: USER, kind: 'apoio', title: 'Apoio' }), N1);
});

test('laço de e-mail: sem provedor desliga; provedor sem implementação deixa pendente; com provedor envia e conta falhas', async () => {
  const off = fakePool((text) => (text.includes("SET status = 'desligado'") ? { rowCount: 2 } : null));
  assert.deepEqual(await createMailer({ pool: off, env: {} }).tick(), { disabled: 2 });

  const warnings = [];
  const unknown = fakePool(() => null);
  const mailer = createMailer({ pool: unknown, env: { DM_MAIL_PROVIDER: 'ses' }, logger: { warn: (m) => warnings.push(m) } });
  assert.deepEqual(await mailer.tick(), { skipped: true });
  await mailer.tick();
  assert.equal(unknown.calls.length, 0, 'nada muda sem implementação');
  assert.equal(warnings.length, 1);

  const writes = [];
  const pool = fakePool((text, params) => {
    if (text.includes('RETURNING o.id')) {
      return { rows: [
        { id: 'o1', to_user_id: USER, attempts: 1, notification_id: N1, title: 'Demanda publicada', summary: '«Praça»', href: '/demandas/1' },
        { id: 'o2', to_user_id: USER, attempts: MAX_ATTEMPTS, notification_id: N1, title: 'x', summary: null, href: null },
      ] };
    }
    writes.push({ text, params });
    return { rowCount: 1 };
  });
  const sent = [];
  const provider = { async send(msg) { if (msg.subject === 'x') throw new Error('recusado'); sent.push(msg); } };
  assert.deepEqual(await sendPending(pool, provider, { from: 'avisos@dmconecta.org' }), { sent: 1, failed: 1 });
  assert.deepEqual(sent, [{ toUserId: USER, subject: 'Demanda publicada', text: '«Praça»', href: '/demandas/1', from: 'avisos@dmconecta.org' }]);
  assert.ok(writes.some((w) => /status = 'enviado'/.test(w.text)));
  assert.ok(writes.some((w) => /emailed_at = NOW\(\)/.test(w.text)));
  const failure = writes.find((w) => /'falhou'/.test(w.text));
  assert.deepEqual(failure.params, ['o2', MAX_ATTEMPTS, 'recusado']);
});
