const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const { validateInstitution } = require('../src/institution');
const { AGENT_INPUT } = require('./institution-fixtures');

// Comprovação da representação institucional por upload (T08), S3 simulado.
// O módulo compartilhado (src/uploads.js) é testado no post-service, que
// também confere que as duas cópias são iguais.

const SECRET = 'user-service-test-secret-0123456789abcdef';
const ANA = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const UPLOAD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PDF = Uint8Array.from(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));

const headers = (userId = ANA, role = 'agent', profileType = 'associacao') => ({
  authorization: `Bearer ${jwt.sign({ userId, name: 'Ana', role, profileType }, SECRET)}`,
  'content-type': 'application/json',
});

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    const sql = text.replace(/\s+/g, ' ').trim();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    const result = await handler(sql, params);
    if (!result) throw new Error(`Consulta inesperada: ${sql}`);
    return result;
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

function memoryStorage(objects = new Map()) {
  const ops = [];
  return {
    ops,
    objects,
    async presignPut({ key, contentType }) {
      return { url: `https://s3.test/${key}?put`, headers: { 'Content-Type': contentType }, expiresIn: 900 };
    },
    async presignGet({ key, disposition }) {
      ops.push(['presignGet', key, disposition]);
      return `https://s3.test/${key}?get`;
    },
    async head(key) {
      const o = objects.get(key);
      return o ? { size: o.bytes.length, contentType: o.contentType, checksumSha256: null } : null;
    },
    async readPrefix(key, length) { return objects.get(key).bytes.slice(0, length); },
    async copy(from, to) { ops.push(['copy', from, to]); objects.set(to, objects.get(from)); },
    async remove(key) { ops.push(['remove', key]); objects.delete(key); },
  };
}

async function withServer(pool, storage, callback) {
  const server = createApp({ pool, secret: SECRET, uploadStorage: storage }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const send = (base, method, p, body, h = headers()) => fetch(`${base}${p}`, {
  method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
});

function uploadRow(overrides = {}) {
  return {
    id: UPLOAD, owner_id: ANA, purpose: 'institution_proof', status: 'pendente', tmp_key: `tmp/${UPLOAD}`,
    object_key: null, content_type: 'application/pdf', declared_size_bytes: String(PDF.length), size_bytes: null,
    sha256: null, original_name: 'ata-eleicao.pdf', organization_id: null,
    created_at: new Date('2026-09-22T12:00:00Z'), confirmed_at: null,
    ...overrides,
  };
}

test('sem DM_UPLOADS_BUCKET: 503 uploads_unavailable', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, null, async (base) => {
    const res = await send(base, 'POST', '/uploads/presign', { purpose: 'institution_proof' });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).code, 'uploads_unavailable');
  });
});

test('presign: só Agente e Poder Público, só a finalidade institution_proof', async () => {
  const pool = fakePool((sql) => {
    if (sql.startsWith('DELETE FROM uploads')) return { rows: [] };
    if (sql.includes('count(*)')) return { rows: [{ n: 0 }] };
    if (sql.startsWith('INSERT INTO uploads')) return { rows: [] };
    return null;
  });
  await withServer(pool, memoryStorage(), async (base) => {
    const body = { purpose: 'institution_proof', contentType: 'application/pdf', size: 1000, fileName: 'ata.pdf' };
    assert.equal((await send(base, 'POST', '/uploads/presign', body, headers(OTHER, 'member', 'morador'))).status, 403);
    assert.equal((await send(base, 'POST', '/uploads/presign', { ...body, purpose: 'demand_photo' })).status, 422);
    assert.equal((await send(base, 'POST', '/uploads/presign', { ...body, size: 26 * 1024 * 1024 })).status, 422);
    const res = await send(base, 'POST', '/uploads/presign', body, headers(ANA, 'government', 'prefeitura'));
    assert.equal(res.status, 201);
    assert.equal((await res.json()).maxBytes, 25 * 1024 * 1024);
  });
});

function confirmPool(org) {
  const state = { row: uploadRow() };
  const pool = fakePool((sql, params) => {
    if (/FROM uploads WHERE id = \$1 AND owner_id = \$2/.test(sql)) return { rows: params[1] === ANA ? [state.row] : [] };
    if (sql.startsWith('SELECT o.id, o.validation_status FROM organizations')) return { rows: org ? [org] : [] };
    if (sql.startsWith('UPDATE uploads')) {
      state.row = { ...state.row, status: 'confirmado', object_key: params[1], size_bytes: params[2], organization_id: params[3], confirmed_at: new Date() };
      return { rows: [state.row] };
    }
    if (/^SELECT .* FROM uploads WHERE id = \$1$/.test(sql)) return { rows: [state.row] };
    return null;
  });
  return { pool, state };
}

test('confirmação: exige cadastro salvo e editável; vincula em institutions/<id>/proof', async () => {
  const tmp = () => new Map([[`tmp/${UPLOAD}`, { bytes: PDF, contentType: 'application/pdf' }]]);
  const none = confirmPool(null);
  await withServer(none.pool, memoryStorage(tmp()), async (base) => {
    const res = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, {});
    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'institution_required');
  });
  const analysis = confirmPool({ id: ORG, validation_status: 'em_analise' });
  await withServer(analysis.pool, memoryStorage(tmp()), async (base) => {
    assert.equal((await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, {})).status, 409);
  });

  const storage = memoryStorage(tmp());
  const ok = confirmPool({ id: ORG, validation_status: 'devolvida' });
  await withServer(ok.pool, storage, async (base) => {
    const res = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, {});
    assert.equal(res.status, 200);
    const body = await res.json();
    const key = `institutions/${ORG}/proof/${UPLOAD}.pdf`;
    assert.equal(body.organizationId, ORG);
    assert.equal(body.url, `https://s3.test/${key}?get`);
    assert.ok(storage.objects.has(key) && !storage.objects.has(`tmp/${UPLOAD}`));
    // Documento privado: baixa como anexo, nunca tem endereço público.
    assert.deepEqual(storage.ops.find(([op]) => op === 'presignGet'), ['presignGet', key, 'attachment']);
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {})).status, 404);
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, headers(OTHER, 'agent'))).status, 404);
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`)).status, 200);
  });
});

test('validação normaliza a comprovação por upload e mantém referência antiga', () => {
  const withUpload = validateInstitution('agente_transformacao', {
    ...AGENT_INPUT, representative: { ...AGENT_INPUT.representative, proofDocumentRef: UPLOAD },
  });
  assert.equal(withUpload.value.representative.proof_document_ref, `upload:${UPLOAD}`);
  const legacy = validateInstitution('agente_transformacao', {
    ...AGENT_INPUT, representative: { ...AGENT_INPUT.representative, proofDocumentRef: 'https://exemplo.org/ata.pdf' },
  });
  assert.equal(legacy.value.representative.proof_document_ref, 'https://exemplo.org/ata.pdf');
});

test('PUT /me/institution recusa upload que não é do titular ou não está vinculado ao cadastro', async () => {
  const pool = fakePool((sql, params) => {
    if (sql.startsWith('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT id FROM profiles')) return { rows: [{ id: 'p-ana' }] };
    if (sql.startsWith('SELECT id, institution_kind, validation_status FROM organizations')) {
      return { rows: [{ id: ORG, institution_kind: 'agente_transformacao', validation_status: 'pendente' }] };
    }
    if (sql.startsWith('UPDATE organizations')) return { rows: [], rowCount: 1 };
    if (/FROM uploads WHERE id = \$1 AND owner_id = \$2 AND purpose = \$3 AND status = 'confirmado' AND organization_id = \$4/.test(sql)) {
      assert.deepEqual(params, [UPLOAD, ANA, 'institution_proof', ORG]);
      return { rows: [] };
    }
    return null;
  });
  await withServer(pool, memoryStorage(), async (base) => {
    const res = await send(base, 'PUT', '/me/institution', {
      ...AGENT_INPUT, representative: { ...AGENT_INPUT.representative, proofDocumentRef: `upload:${UPLOAD}` },
    });
    assert.equal(res.status, 422);
    assert.ok((await res.json()).fields['representative.proofDocumentRef']);
  });
  assert.ok(!pool.calls.some(({ text }) => text.includes('INSERT INTO organization_representatives')));
  assert.ok(pool.calls.some(({ text }) => text === 'ROLLBACK'));
});
