// Consentimento versionado e direitos do titular sobre a conta (T24).

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { CONSENT_DOCUMENTS, CONSENT_KEYS, pendingConsents, normalizeConsentKeys } = require('../src/consents');

const SECRET = 'auth-service-consents-secret-0123456789ab';
const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'ana@example.com',
  name: 'Ana',
  role: 'member',
  profile_type: 'morador',
  avatar_url: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  anonymized_at: null,
};
const token = jwt.sign(
  { userId: USER.id, email: USER.email, name: USER.name, role: USER.role, profileType: USER.profile_type },
  SECRET,
);

/** Pool simulado com a tabela append-only de consentimentos em memória. */
function createPool({ consents = [], password = 'senha-correta' } = {}) {
  const hash = bcrypt.hashSync(password, 4);
  const rows = [...consents];
  const queries = [];
  return {
    queries,
    consents: rows,
    async query(text, params = []) {
      queries.push({ text, params });
      if (text.includes('INSERT INTO user_consents') && text.includes('unnest')) {
        const [, docs, versions, dates, origin] = text.includes('nova_conta')
          ? [null, params[5], params[6], params[7], 'cadastro']
          : [null, params[1], params[2], params[3], params[4]];
        docs.forEach((document, i) => {
          if (rows.some((r) => r.document === document && r.version === versions[i])) return;
          rows.push({ document, version: versions[i], document_date: dates[i], origin, accepted_at: new Date() });
        });
        return { rows: text.includes('nova_conta') ? [{ ...USER }] : [], rowCount: docs.length };
      }
      if (text.includes('FROM user_consents')) return { rows };
      if (text.includes('SELECT password_hash FROM users')) return { rows: [{ password_hash: hash }] };
      if (text.includes('SELECT id FROM users WHERE email=$1')) return { rows: [] };
      if (text.startsWith('UPDATE users')) {
        USER.anonymized_at = new Date('2026-09-22T12:00:00Z');
        return { rows: [{ id: USER.id, anonymized_at: USER.anonymized_at }], rowCount: 1 };
      }
      if (text.includes('FROM users WHERE id=$1')) return { rows: [{ ...USER }] };
      throw new Error(`consulta inesperada: ${text}`);
    },
  };
}

async function withServer(pool, fn) {
  const server = createApp({ pool, secret: SECRET }).listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const bearer = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

test('os documentos vigentes têm chave, versão, data e página', async () => {
  await withServer(createPool(), async (base) => {
    const body = await (await fetch(`${base}/consents`)).json();
    assert.deepEqual(body.documents.map((d) => d.key), CONSENT_KEYS);
    for (const doc of body.documents) {
      assert.match(doc.version, /^\d+\.\d+$/);
      assert.match(doc.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(doc.path, /^\//);
      assert.ok(doc.label);
    }
  });
});

test('o cadastro sem aceite dos documentos é recusado com 422', async () => {
  await withServer(createPool(), async (base) => {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'nova@example.com', password: 'senha123', name: 'Nova', role: 'member', profile_type: 'morador',
      }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.code, 'consent_required');
    assert.ok(body.fields.consents);
  });
});

test('o cadastro público recusa novas contas de Comunicação antes de consultar o banco', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'comunicacao@example.com', password: 'senha123', name: 'Comunicacao',
        role: 'media', profile_type: 'imprensa', consents: CONSENT_KEYS,
      }),
    });
    assert.equal(res.status, 400);
  });
  assert.deepEqual(pool.queries, []);
});

test('o cadastro com aceite parcial também é recusado', async () => {
  await withServer(createPool(), async (base) => {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'nova@example.com', password: 'senha123', name: 'Nova', role: 'member', profile_type: 'morador',
        consents: ['termos_de_uso'],
      }),
    });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, 'consent_required');
  });
});

test('o cadastro grava os aceites com versão, data e origem "cadastro", na mesma instrução da conta', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'nova@example.com', password: 'senha123', name: 'Nova', role: 'member', profile_type: 'morador',
        consents: CONSENT_KEYS,
      }),
    });
    assert.equal(res.status, 201);
  });
  assert.deepEqual(pool.consents.map((c) => c.document).sort(), [...CONSENT_KEYS].sort());
  for (const row of pool.consents) {
    assert.equal(row.origin, 'cadastro');
    const doc = CONSENT_DOCUMENTS.find((d) => d.key === row.document);
    assert.equal(row.version, doc.version);
    assert.equal(row.document_date, doc.date);
  }
  const insert = pool.queries.find((q) => q.text.includes('INSERT INTO user_consents'));
  assert.ok(insert.text.includes('INSERT INTO users'), 'conta e aceite são gravados juntos');
  // Minimização: o aceite não guarda IP nem user agent.
  assert.ok(!/ip|user_agent/i.test(insert.text));
});

test('uma versão nova do documento vira aceite pendente e é registrada como "nova_versao"', async () => {
  const antigo = CONSENT_DOCUMENTS.map((d) => ({
    document: d.key, version: '0.9', document_date: '2026-01-01', origin: 'cadastro', accepted_at: new Date(),
  }));
  assert.equal(pendingConsents(antigo).length, CONSENT_DOCUMENTS.length);

  const pool = createPool({ consents: antigo });
  await withServer(pool, async (base) => {
    const before = await (await fetch(`${base}/me/consents`, { headers: bearer })).json();
    assert.deepEqual(before.pending.map((d) => d.key), CONSENT_KEYS);

    const res = await fetch(`${base}/me/consents`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ documents: CONSENT_KEYS, origin: 'nova_versao' }),
    });
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).pending, []);
  });
  assert.ok(pool.consents.some((c) => c.origin === 'nova_versao'));
  // O aceite antigo continua na trilha: nada é atualizado nem removido.
  assert.equal(pool.consents.filter((c) => c.version === '0.9').length, CONSENT_DOCUMENTS.length);
});

test('o aceite não pode ser gravado com origem "cadastro" fora do cadastro, nem com documento desconhecido', async () => {
  await withServer(createPool(), async (base) => {
    const comOrigem = await fetch(`${base}/me/consents`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ documents: CONSENT_KEYS, origin: 'cadastro' }),
    });
    assert.equal(comOrigem.status, 422);
    const inventado = await fetch(`${base}/me/consents`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ documents: ['politica_inventada'] }),
    });
    assert.equal(inventado.status, 422);
  });
  assert.equal(normalizeConsentKeys(['politica_inventada']), null);
  assert.deepEqual(normalizeConsentKeys(CONSENT_KEYS), CONSENT_KEYS);
});

test('sem token, os consentimentos da conta e a anonimização respondem 401', async () => {
  await withServer(createPool(), async (base) => {
    assert.equal((await fetch(`${base}/me/consents`)).status, 401);
    assert.equal((await fetch(`${base}/me/account-data`)).status, 401);
    assert.equal((await fetch(`${base}/me/anonymize`, { method: 'POST' })).status, 401);
  });
});

test('a confirmação de senha aceita a correta e recusa a errada', async () => {
  await withServer(createPool(), async (base) => {
    const ok = await fetch(`${base}/me/password-check`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ password: 'senha-correta' }),
    });
    assert.equal(ok.status, 204);
    const nao = await fetch(`${base}/me/password-check`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ password: 'outra' }),
    });
    assert.equal(nao.status, 401);
    assert.equal((await nao.json()).code, 'invalid_password');
  });
});

test('a exportação da conta traz os dados e os consentimentos, nunca o hash da senha', async () => {
  await withServer(createPool({ consents: [{
    document: 'termos_de_uso', version: '1.0', document_date: '2026-09-22', origin: 'cadastro', accepted_at: new Date(),
  }] }), async (base) => {
    const body = await (await fetch(`${base}/me/account-data`, { headers: bearer })).json();
    assert.equal(body.conta.id, USER.id);
    assert.equal(body.consentimentos.length, 1);
    assert.ok(!JSON.stringify(body).includes('password'));
  });
});

test('a eliminação anonimiza a conta sem excluir a linha e encerra a sessão', async () => {
  const pool = createPool();
  USER.anonymized_at = null;
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/anonymize`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ protocol: 'LGPD-2026-900001' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).anonymized, true);

    // Token antigo deixa de valer: a conta está anonimizada.
    const verify = await fetch(`${base}/verify`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(verify.status, 401);
    assert.equal((await verify.json()).code, 'account_anonymized');
  });
  const update = pool.queries.find((q) => q.text.trim().startsWith('UPDATE users'));
  assert.ok(/anonymized_at = COALESCE/.test(update.text), 'a anonimização é idempotente');
  assert.ok(!pool.queries.some((q) => /DELETE FROM users/.test(q.text)), 'a conta não é excluída');
  USER.anonymized_at = null;
});
