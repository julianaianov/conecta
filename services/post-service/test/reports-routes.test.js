const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');

// Rotas da denúncia (T6.3) com banco simulado: token obrigatório, validação
// antes do banco, limite de taxa, uma denúncia em aberto por alvo e a resposta
// que nunca revela o desfecho. O ciclo completo com a gestão despachando está
// em report-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const POST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function pool({ usage = { last_hour: 0, last_day: 0, oldest_hour: null }, open = [], target, onInsert } = {}) {
  return {
    async query(text, params = []) {
      if (/FROM content_reports\s+WHERE reporter_id/.test(text) && /count\(\*\)/.test(text)) {
        return { rows: [usage] };
      }
      if (/SELECT id, created_at FROM content_reports/.test(text)) return { rows: open };
      if (/FROM posts WHERE id = \$1 AND visibility/.test(text)) {
        return { rows: target === undefined ? [{ author_id: OTHER, title: 'Buraco na rua' }] : target };
      }
      if (/INSERT INTO content_reports/.test(text)) {
        if (onInsert) onInsert(params);
        return {
          rows: [{
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            target_kind: params[0], target_id: params[1], reason: params[7],
            status: 'pendente', created_at: new Date('2026-09-22T12:00:00Z'),
          }],
        };
      }
      if (/FROM content_reports WHERE reporter_id = \$1\s*\n\s*ORDER BY/.test(text)) return { rows: [] };
      throw new Error(`Consulta inesperada: ${text} ${JSON.stringify(params)}`);
    },
    async connect() { throw new Error('a denúncia não abre transação'); },
  };
}

async function withServer(callback, options = {}) {
  const server = createApp({
    pool: pool(options), secret: SECRET, dossierService: null, uploadStorage: null, rankings: null,
    institutionStatus: async () => ({ kind: null, status: null, canActInstitutionally: true, organizationId: null }),
    partnerProfile: { get: async () => null },
    connections: { create: async () => null, get: async () => null, update: async () => null },
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (userId = USER) => ({
  authorization: `Bearer ${jwt.sign({ userId, role: 'member', profileType: 'morador', name: 'Conta' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers = auth()) => {
  const res = await fetch(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const VALID = { targetKind: 'publicacao', targetId: POST, reason: 'spam' };

test('denunciar exige sessão e campos válidos', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', '/reports', VALID, {})).status, 401);
    assert.equal((await send(base, 'GET', '/reports/mine', undefined, {})).status, 401);

    const ruim = await send(base, 'POST', '/reports', { targetKind: 'evento', targetId: 'x', reason: 'nao_gostei' });
    assert.equal(ruim.status, 422);
    assert.equal(ruim.body.code, 'validation_failed');
    assert.deepEqual(Object.keys(ruim.body.fields).sort(), ['reason', 'targetId', 'targetKind']);

    const outro = await send(base, 'POST', '/reports', { ...VALID, reason: 'outro' });
    assert.equal(outro.status, 422);
    assert.ok(outro.body.fields.description);
  });
});

test('a denúncia é registrada e a resposta não revela desfecho algum', async () => {
  let gravado = null;
  await withServer(async (base) => {
    const res = await send(base, 'POST', '/reports', { ...VALID, reason: 'discurso_de_odio', description: 'Ataque' });
    assert.equal(res.status, 201);
    assert.equal(res.body.state, 'em_apuracao');
    assert.match(res.body.notice, /não é divulgado/);
    // Nada do desfecho volta para quem denunciou.
    for (const leak of ['status', 'resolution', 'resolutionNote', 'resolvedBy', 'resolvedAt']) {
      assert.equal(res.body[leak], undefined, `vazou ${leak}`);
    }
    // Retrato do alvo gravado: dono e resumo.
    assert.equal(gravado[2], OTHER);
    assert.equal(gravado[3], 'Buraco na rua');
    assert.equal(gravado[5], 'member');
  }, { onInsert: (params) => { gravado = params; } });
});

test('ninguém denuncia o próprio conteúdo nem o próprio perfil', async () => {
  await withServer(async (base) => {
    const proprioPost = await send(base, 'POST', '/reports', VALID);
    assert.equal(proprioPost.status, 422);
    assert.ok(proprioPost.body.fields.targetId);
  }, { target: [{ author_id: USER, title: 'Meu post' }] });

  await withServer(async (base) => {
    const proprioPerfil = await send(base, 'POST', '/reports', { targetKind: 'perfil', targetId: USER, reason: 'spam' });
    assert.equal(proprioPerfil.status, 422);
    assert.ok(proprioPerfil.body.fields.targetId);
  });
});

test('conteúdo inexistente ou já oculto não é denunciado', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', '/reports', VALID)).status, 404);
  }, { target: [] });
});

test('uma denúncia em aberto por (denunciante, alvo)', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'POST', '/reports', VALID);
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'report_already_open');

    const context = await send(base, 'GET', `/reports/context?targetKind=publicacao&targetId=${POST}`);
    assert.equal(context.status, 200);
    assert.equal(context.body.alreadyReported, true);
    assert.equal(context.body.canReport, false);
  }, { open: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', created_at: new Date() }] });
});

test('limite de taxa por conta: hora e dia', async () => {
  const oldest = new Date(Date.now() - 600_000);
  await withServer(async (base) => {
    const res = await send(base, 'POST', '/reports', VALID);
    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'report_rate_limited');
    assert.ok(res.body.retryAfterSeconds > 0);
  }, { usage: { last_hour: 5, last_day: 9, oldest_hour: oldest } });

  await withServer(async (base) => {
    assert.equal((await send(base, 'POST', '/reports', VALID)).status, 429);
  }, { usage: { last_hour: 0, last_day: 20, oldest_hour: null } });
});

test('o contexto do alvo traz o vocabulário e o que resta do limite', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'GET', `/reports/context?targetKind=publicacao&targetId=${POST}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.canReport, true);
    assert.equal(res.body.remaining.hour, 5);
    assert.equal(res.body.remaining.day, 20);
    assert.equal(res.body.reasons.length, 6);
    assert.equal(res.body.reasons.find((r) => r.value === 'outro').requiresDescription, true);

    const ruim = await send(base, 'GET', '/reports/context?targetKind=perfil&targetId=123');
    assert.equal(ruim.status, 422);
  });
});

test('não há rota que exponha as denúncias de um alvo ao denunciado', async () => {
  await withServer(async (base) => {
    for (const path of [`/reports/target/${POST}`, `/reports/${POST}`, '/reports']) {
      const res = await send(base, 'GET', path);
      assert.notEqual(res.status, 200, `${path} respondeu 200`);
    }
  });
});
