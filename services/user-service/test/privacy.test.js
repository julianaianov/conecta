// Direitos do titular (T24): solicitação com protocolo e prazo, exportação
// entregue por URL assinada curta e eliminação/anonimização da conta.

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const express = require('express');
const privacyRoutes = require('../src/routes/privacy');
const {
  REQUEST_TYPES, RESPONSE_DEADLINE_DAYS, RETENTION_RULES, EXPORT_URL_TTL_SECONDS, ANONYMOUS_NAME,
} = require('../src/privacy/constants');
const { createAuth } = require('../src/security');

const SECRET = 'user-service-privacy-secret-0123456789ab';
const USER = '11111111-1111-4111-8111-111111111111';
const token = jwt.sign({ userId: USER, role: 'member', profileType: 'morador', name: 'Ana' }, SECRET);
const bearer = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

/** Pool simulado com a fila de solicitações em memória. */
function createPool({ anonymized = false } = {}) {
  const requests = [];
  const trail = [];
  const queries = [];
  let seq = 900000;
  return {
    requests,
    trail,
    queries,
    async query(text, params = []) {
      queries.push({ text, params });
      const sql = text.trim();
      if (sql.startsWith('WITH numero') && sql.includes('INSERT INTO data_subject_requests')) {
        seq += 1;
        const receivedAt = new Date('2026-09-22T12:00:00Z');
        const row = {
          id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
          protocol: `LGPD-2026-${String(seq).padStart(6, '0')}`,
          subject_user_id: params[0],
          request_type: params[1],
          channel: 'portal',
          description: params[2],
          received_at: receivedAt,
          due_at: new Date(receivedAt.getTime() + Number(params[3]) * 86_400_000),
          status: 'recebida',
          fulfilled_at: null,
          export_object_key: null,
          export_sha256: null,
          export_bytes: null,
          export_expires_at: null,
          gestao_request_id: null,
          imported_at: null,
          response: null,
          responded_at: null,
          closed_by: null,
          closed_at: null,
        };
        requests.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (sql.startsWith('UPDATE data_subject_requests')) {
        const row = requests.find((r) => r.id === params[0]);
        if (!row) return { rows: [], rowCount: 0 };
        row.fulfilled_at = new Date();
        if (row.status === 'recebida') row.status = 'em_andamento';
        if (params[1]) {
          row.export_object_key = params[1];
          row.export_sha256 = params[2];
          row.export_bytes = params[3];
          row.export_expires_at = params[4];
        }
        return { rows: [row], rowCount: 1 };
      }
      if (sql.includes('FROM data_subject_requests') && sql.includes('WHERE id = $1')) {
        const row = requests.find((r) => r.id === params[0] && r.subject_user_id === params[1]);
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('FROM data_subject_requests')) {
        return { rows: requests.filter((r) => r.subject_user_id === params[0]) };
      }
      if (sql.includes('INSERT INTO account_anonymizations')) {
        trail.push({ scope: params[3], summary: JSON.parse(params[4]) });
        return { rows: [], rowCount: 1 };
      }
      if (sql.includes('FROM account_anonymizations')) return { rows: [] };
      if (sql.includes('SELECT anonymized_at FROM profiles')) {
        return { rows: [{ anonymized_at: anonymized ? new Date() : null }] };
      }
      if (sql.startsWith('UPDATE profiles')) return { rows: [{ id: 'perfil' }], rowCount: 1 };
      if (sql.startsWith('DELETE FROM partner_profiles')) return { rows: [{ user_id: USER }], rowCount: 1 };
      if (sql.startsWith('DELETE FROM business_profiles')) return { rows: [{ user_id: USER }], rowCount: 1 };
      if (sql.startsWith('DELETE FROM media_profiles')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('DELETE FROM scraps')) return { rows: [{ id: 's1' }], rowCount: 1 };
      if (sql.startsWith('DELETE FROM testimonials')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('UPDATE connections')) return { rows: [{ id: 'c1' }], rowCount: 1 };
      // Conversa da conexão (T27): as mensagens do titular perdem o corpo.
      if (sql.startsWith('UPDATE connection_messages')) return { rows: [{ id: 'm1' }, { id: 'm2' }], rowCount: 2 };
      // Vínculos (T29): o ativo é encerrado e os convites, recusados.
      if (sql.startsWith('UPDATE organization_members')) return { rows: [{ id: 'v1' }], rowCount: 1 };
      if (sql.startsWith('UPDATE organization_representatives')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT')) return { rows: [] };
      throw new Error(`consulta inesperada: ${sql}`);
    },
  };
}

function createStorage() {
  const objects = new Map();
  return {
    objects,
    async put({ key, body, contentType }) { objects.set(key, { body, contentType }); },
    async presignGet({ key, expiresIn }) { return `https://bucket.example/${key}?X-Amz-Expires=${expiresIn}`; },
  };
}

function fakeServices({ passwordOk = true } = {}) {
  const calls = [];
  return {
    calls,
    authService: {
      accountData: async () => ({ conta: { id: USER, email: 'ana@example.com' }, consentimentos: [] }),
      checkPassword: async (_auth, password) => { calls.push(['checkPassword']); return passwordOk && password === 'senha'; },
      anonymize: async () => { calls.push(['authAnonymize']); return { anonymized: true, anonymizedAt: '2026-09-22T12:00:00Z' }; },
    },
    postService: {
      data: async () => ({ dados: { publicacoes: [] }, anonimizacao: null }),
      anonymize: async () => { calls.push(['postAnonymize']); return { summary: { publicacoes: 2 } }; },
    },
  };
}

async function withServer({ pool, storage = createStorage(), services = fakeServices() }, fn) {
  const app = express();
  app.use(express.json());
  app.use('/', privacyRoutes({
    pool, auth: createAuth(SECRET), storage, ...services,
  }));
  const server = app.listen(0);
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, { pool, storage, services });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('o painel traz o vocabulário, a regra de retenção e as solicitações da conta', async () => {
  await withServer({ pool: createPool() }, async (base) => {
    const body = await (await fetch(`${base}/me/privacy`, { headers: bearer })).json();
    assert.deepEqual(body.vocabulary.requestTypes.map((t) => t.value), REQUEST_TYPES);
    assert.equal(body.vocabulary.deadlineDays, 15);
    assert.equal(body.vocabulary.retentionRules.length, RETENTION_RULES.length);
    for (const rule of body.vocabulary.retentionRules) {
      assert.ok(['anonimiza', 'apaga', 'retem'].includes(rule.action));
      assert.ok(rule.basis.includes('LGPD'), 'cada regra declara a base legal');
    }
    assert.deepEqual(body.requests, []);
    assert.equal(body.anonymized, false);
  });
});

test('sem token, os direitos do titular respondem 401', async () => {
  await withServer({ pool: createPool() }, async (base) => {
    assert.equal((await fetch(`${base}/me/privacy`)).status, 401);
    assert.equal((await fetch(`${base}/me/privacy/requests`)).status, 401);
    assert.equal((await fetch(`${base}/me/privacy/erasure`, { method: 'POST' })).status, 401);
  });
});

test('a solicitação nasce com protocolo LGPD-AAAA-NNNNNN na faixa do portal e prazo de 15 dias', async () => {
  const pool = createPool();
  await withServer({ pool }, async (base) => {
    const res = await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'compartilhamento' }),
    });
    assert.equal(res.status, 201);
    const { request, download } = await res.json();
    assert.match(request.protocol, /^LGPD-2026-9\d{5}$/);
    assert.equal(request.type, 'compartilhamento');
    assert.equal(request.status, 'recebida');
    assert.equal(download, null, 'pedido de informação não gera arquivo automático');
    const dias = (new Date(request.dueAt) - new Date(request.receivedAt)) / 86_400_000;
    assert.equal(dias, RESPONSE_DEADLINE_DAYS);
  });
  // A solicitação guarda o id do titular, nunca nome, e-mail ou telefone.
  const insert = pool.queries.find((q) => q.text.includes('INSERT INTO data_subject_requests'));
  assert.ok(!/name|email|phone/i.test(insert.text));
});

test('tipo inválido e descrição gigante são recusados com 422', async () => {
  await withServer({ pool: createPool() }, async (base) => {
    const tipo = await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'tudo' }),
    });
    assert.equal(tipo.status, 422);
    assert.equal((await tipo.json()).code, 'validation_failed');

    const descricao = await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'correcao', description: 'x'.repeat(2001) }),
    });
    assert.equal(descricao.status, 422);
  });
});

test('a eliminação não passa pelo caminho comum: exige confirmação de senha', async () => {
  await withServer({ pool: createPool() }, async (base) => {
    const res = await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'eliminacao' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'erasure_requires_confirmation');
  });
});

test('acesso e portabilidade geram o arquivo e entregam por URL assinada curta', async () => {
  const storage = createStorage();
  await withServer({ pool: createPool(), storage }, async (base) => {
    const res = await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'acesso' }),
    });
    assert.equal(res.status, 201);
    const { request, download } = await res.json();
    assert.equal(request.status, 'em_andamento');
    assert.ok(request.fulfilledAt);
    assert.match(download.url, new RegExp(`X-Amz-Expires=${EXPORT_URL_TTL_SECONDS}`));
    assert.match(download.fileName, /\.json$/);
    assert.equal(download.sha256.length, 64);

    const [key] = [...storage.objects.keys()];
    assert.equal(key, `privacy/exports/${USER}/${request.id}.json`);
    const documento = JSON.parse(storage.objects.get(key).body.toString('utf8'));
    assert.equal(documento.protocolo, request.protocol);
    assert.equal(documento.titular.id, USER);
    assert.ok(documento.regraDeRetencao.length > 0);
    assert.ok(documento.aviso.includes('outras pessoas'));
  });
});

test('sem bucket configurado, a exportação avisa em vez de inventar armazenamento', async () => {
  await withServer({ pool: createPool(), storage: null }, async (base) => {
    const res = await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'portabilidade' }),
    });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'privacy_service_unavailable');
  });
});

test('a eliminação exige senha e confirmação escrita', async () => {
  await withServer({ pool: createPool() }, async (base) => {
    const vazio = await fetch(`${base}/me/privacy/erasure`, { method: 'POST', headers: bearer, body: '{}' });
    assert.equal(vazio.status, 422);
    const fields = (await vazio.json()).fields;
    assert.ok(fields.password && fields.confirmation);

    const senhaErrada = await fetch(`${base}/me/privacy/erasure`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ password: 'outra', confirmation: 'ELIMINAR' }),
    });
    assert.equal(senhaErrada.status, 401);
    assert.equal((await senhaErrada.json()).code, 'invalid_password');
  });
});

test('a eliminação anonimiza conteúdo, perfil e conta, nessa ordem, e registra a trilha', async () => {
  const pool = createPool();
  const services = fakeServices();
  await withServer({ pool, services }, async (base) => {
    const res = await fetch(`${base}/me/privacy/erasure`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ password: 'senha', confirmation: 'ELIMINAR' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.match(body.request.protocol, /^LGPD-2026-9\d{5}$/);
    assert.equal(body.request.type, 'eliminacao');
    assert.equal(body.anonymized.conta, true);
    assert.deepEqual(body.anonymized.conteudo, { publicacoes: 2 });
    assert.equal(body.retentionRules.length, RETENTION_RULES.length);
  });
  assert.deepEqual(services.calls.map(([c]) => c), ['checkPassword', 'postAnonymize', 'authAnonymize']);
  assert.deepEqual(pool.trail.map((t) => t.scope), ['conteudo', 'perfil', 'conta']);
  // O perfil é anonimizado com o mesmo rótulo do resto do portal.
  const perfil = pool.queries.find((q) => q.text.trim().startsWith('UPDATE profiles'));
  assert.equal(perfil.params[1], ANONYMOUS_NAME);
  assert.ok(/phone = NULL/.test(perfil.text) && /bio = NULL/.test(perfil.text));
  // Nada de DELETE em tabela de trilha ou de conteúdo público.
  for (const q of pool.queries.filter((x) => x.text.trim().startsWith('DELETE'))) {
    assert.match(q.text, /partner_profiles|business_profiles|media_profiles|scraps|testimonials/);
  }
  // A conversa da conexão (T27) é anonimizada, nunca excluída, com o mesmo rótulo do pedido.
  const mensagens = pool.queries.find((q) => q.text.trim().startsWith('UPDATE connection_messages'));
  assert.equal(mensagens.params[1], '[removido a pedido do titular]');
  assert.equal(pool.trail.find((t) => t.scope === 'perfil').summary.mensagensDeConexaoRemovidas, 2);
  // Perfis declarados (T-04-03) são apagados.
  assert.equal(pool.trail.find((t) => t.scope === 'perfil').summary.perfisDeclaradosRemovidos, 1);
});

test('conta já anonimizada não é anonimizada de novo', async () => {
  await withServer({ pool: createPool({ anonymized: true }) }, async (base) => {
    const res = await fetch(`${base}/me/privacy/erasure`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ password: 'senha', confirmation: 'ELIMINAR' }),
    });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'already_anonymized');
  });
});

test('solicitação de outra conta responde 404 e não vaza nada', async () => {
  const pool = createPool();
  await withServer({ pool }, async (base) => {
    const criada = await (await fetch(`${base}/me/privacy/requests`, {
      method: 'POST', headers: bearer, body: JSON.stringify({ type: 'correcao' }),
    })).json();
    const outro = jwt.sign({ userId: '22222222-2222-4222-8222-222222222222', role: 'member' }, SECRET);
    const res = await fetch(`${base}/me/privacy/requests/${criada.request.id}`, {
      headers: { authorization: `Bearer ${outro}` },
    });
    assert.equal(res.status, 404);
  });
});
