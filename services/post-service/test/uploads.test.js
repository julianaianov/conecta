const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const { S3Client } = require('@aws-sdk/client-s3');
const { createApp } = require('../src');
const U = require('../src/uploads');
const { POST_IMAGES_SQL, publicMediaUrl } = require('../src/upload-policy');
const { validateDemand } = require('../src/demand/validation');

// Uploads (T08) com S3 simulado: nenhum teste fala com a AWS.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OPERATOR = '33333333-3333-4333-8333-333333333333';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const UPLOAD = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const PDF = Uint8Array.from(Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1'));

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text)) return { rows: [] };
    const result = await handler(text, params);
    if (!result) throw new Error(`Consulta inesperada: ${text}`);
    return result;
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

/** Armazenamento em memória com a mesma interface de createUploadStorage. */
function memoryStorage(objects = new Map()) {
  const ops = [];
  return {
    ops,
    objects,
    bucket: 'dmconecta-uploads-test',
    async presignPut({ key, contentType, sha256 }) {
      ops.push(['presignPut', key, contentType, sha256]);
      return { url: `https://s3.test/${key}?put`, headers: { 'Content-Type': contentType }, expiresIn: 900 };
    },
    async presignGet({ key, disposition, expiresIn }) {
      ops.push(['presignGet', key, disposition, expiresIn]);
      return `https://s3.test/${key}?get`;
    },
    async head(key) {
      ops.push(['head', key]);
      const o = objects.get(key);
      return o ? { size: o.size ?? o.bytes.length, contentType: o.contentType, checksumSha256: o.checksum ?? null } : null;
    },
    async readPrefix(key, length) {
      ops.push(['readPrefix', key]);
      return objects.get(key).bytes.slice(0, length);
    },
    async copy(from, to) {
      ops.push(['copy', from, to]);
      objects.set(to, objects.get(from));
    },
    async remove(key) {
      ops.push(['remove', key]);
      objects.delete(key);
    },
  };
}

async function withServer(pool, storage, callback) {
  const server = createApp({
    pool,
    secret: SECRET,
    institutionStatus: async () => ({ canActInstitutionally: true }),
    uploadStorage: storage,
    operationUserIds: new Set([OPERATOR]),
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function headers(userId = AGENT, role = 'agent', profileType = 'associacao') {
  return {
    authorization: `Bearer ${jwt.sign({ userId, role, profileType, name: 'Ana' }, SECRET)}`,
    'content-type': 'application/json',
  };
}

const send = (base, method, p, body, h = headers()) => fetch(`${base}${p}`, {
  method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual',
});

function uploadRow(overrides = {}) {
  return {
    id: UPLOAD,
    owner_id: AGENT,
    purpose: 'demand_photo',
    status: 'pendente',
    tmp_key: `tmp/${UPLOAD}`,
    object_key: null,
    content_type: 'image/png',
    declared_size_bytes: '2048',
    size_bytes: null,
    sha256: null,
    original_name: 'foto da praça.png',
    demand_id: null,
    created_at: new Date('2026-09-22T12:00:00Z'),
    confirmed_at: null,
    ...overrides,
  };
}

// ── Módulo compartilhado ────────────────────────────────────────────────────

test('post-service e user-service usam a mesma cópia de src/uploads.js', () => {
  const read = (service) => fs.readFileSync(path.join(__dirname, '..', '..', service, 'src', 'uploads.js'), 'utf8');
  assert.equal(read('post-service'), read('user-service'));
});

test('finalidades: tipos e limites da T08', () => {
  const MB = 1024 * 1024;
  const P = U.PURPOSES;
  assert.deepEqual(Object.keys(P.demand_photo.types), ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
  assert.equal(P.demand_photo.maxBytes, 15 * MB);
  assert.deepEqual(Object.keys(P.demand_evidence_video.types), ['video/mp4', 'video/quicktime']);
  assert.equal(P.demand_evidence_video.maxBytes, 500 * MB);
  for (const purpose of ['demand_document', 'institution_proof']) {
    assert.deepEqual(Object.values(P[purpose].types).map((e) => e[0]), ['pdf', 'docx', 'xlsx', 'odt', 'ods', 'jpg', 'png']);
    assert.equal(P[purpose].maxBytes, 25 * MB);
  }
  // Documento da demanda: nível Institucional (Modelo §33, T-05-18); comprovação, privada.
  assert.equal(P.demand_document.visibility, 'institutional');
  assert.equal(P.institution_proof.visibility, 'private');
});

test('validateUploadRequest confere finalidade, tipo, tamanho, extensão e sha256', () => {
  const ok = U.validateUploadRequest({ purpose: 'demand_photo', contentType: 'image/JPG', size: 1000, fileName: 'C:\\fotos\\praça.jpeg' });
  assert.deepEqual(ok.fields, {});
  assert.equal(ok.value.contentType, 'image/jpeg');
  assert.equal(ok.value.fileName, 'praça.jpeg');

  assert.ok(U.validateUploadRequest({ purpose: 'avatar' }, ['demand_photo']).fields.purpose);
  assert.ok(U.validateUploadRequest({ purpose: 'institution_proof', contentType: 'image/png', size: 1 }, ['demand_photo']).fields.purpose);
  const bad = U.validateUploadRequest({ purpose: 'demand_photo', contentType: 'image/gif', size: 16 * 1024 * 1024, sha256: 'xyz' });
  assert.deepEqual(Object.keys(bad.fields).sort(), ['contentType', 'sha256', 'size']);
  assert.match(bad.fields.size, /15 MB/);
  assert.ok(U.validateUploadRequest({ purpose: 'demand_document', contentType: 'application/pdf', size: 10, fileName: 'x.exe' }).fields.fileName);
  assert.ok(U.validateUploadRequest({ purpose: 'demand_document', contentType: 'application/pdf', size: 0 }).fields.size);
  assert.ok(U.validateUploadRequest({ purpose: 'demand_evidence_video', contentType: 'video/quicktime', size: 400 * 1024 * 1024, fileName: 'depois.MOV' }).value);
  assert.deepEqual(U.validateUploadRequest({ purpose: 'demand_evidence_video', contentType: 'video/quicktime', size: 400 * 1024 * 1024, fileName: 'depois.MOV' }).fields, {});
  const sha = 'A'.repeat(64);
  assert.equal(U.validateUploadRequest({ purpose: 'demand_photo', contentType: 'image/png', size: 1, sha256: sha }).value.sha256, 'a'.repeat(64));
});

test('assinatura dos primeiros bytes', () => {
  assert.ok(U.matchesSignature('image/png', PNG));
  assert.ok(U.matchesSignature('application/pdf', PDF));
  assert.ok(U.matchesSignature('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])));
  assert.ok(U.matchesSignature('image/webp', Uint8Array.from(Buffer.from('RIFF\0\0\0\0WEBPVP8 ', 'latin1'))));
  assert.ok(U.matchesSignature('image/heic', Uint8Array.from(Buffer.from('\0\0\0\x18ftypheic', 'latin1'))));
  assert.ok(U.matchesSignature('video/mp4', Uint8Array.from(Buffer.from('\0\0\0\x20ftypisom', 'latin1'))));
  assert.ok(U.matchesSignature('video/quicktime', Uint8Array.from(Buffer.from('\0\0\0\x14ftypqt  ', 'latin1'))));
  assert.ok(U.matchesSignature('application/vnd.oasis.opendocument.text', Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0])));
  assert.ok(!U.matchesSignature('image/png', PDF));
  assert.ok(!U.matchesSignature('application/pdf', Uint8Array.from(Buffer.from('<html><script>', 'latin1'))));
  assert.ok(!U.matchesSignature('image/png', PNG.slice(0, 4)));
});

test('referências upload:<id>, chaves e Content-Disposition', () => {
  assert.equal(U.parseUploadRef(`upload:${UPLOAD}`), UPLOAD);
  assert.equal(U.parseUploadRef(UPLOAD.toUpperCase()), UPLOAD);
  assert.equal(U.parseUploadRef('https://exemplo.org/a.png'), null);
  assert.equal(U.parseUploadRef('upload:../../x'), null);
  assert.equal(U.tmpKey(UPLOAD), `tmp/${UPLOAD}`);
  assert.equal(U.finalKey('demand_photo', DEMAND, UPLOAD, 'image/jpeg'), `demands/${DEMAND}/photo/${UPLOAD}.jpg`);
  assert.equal(U.finalKey('institution_proof', DEMAND, UPLOAD, 'application/pdf'), `institutions/${DEMAND}/proof/${UPLOAD}.pdf`);
  assert.equal(
    U.contentDisposition('attachment', 'ata "eleição".pdf'),
    'attachment; filename="ata eleicao.pdf"; filename*=UTF-8\'\'ata%20%22elei%C3%A7%C3%A3o%22.pdf',
  );
  assert.equal(publicMediaUrl(`upload:${UPLOAD}`), `/api/posts/uploads/${UPLOAD}/content`);
  assert.equal(publicMediaUrl('https://exemplo.org/a.png'), 'https://exemplo.org/a.png');
  assert.equal(publicMediaUrl(null), null);
  assert.match(POST_IMAGES_SQL, /LIKE 'upload:%'.*\/api\/posts\/uploads\/.*AS images$/);
});

test('uploadsConfig: sem DM_UPLOADS_BUCKET não há armazenamento', () => {
  assert.equal(U.uploadsConfig({}), null);
  assert.equal(U.uploadsConfig({ DM_UPLOADS_BUCKET: '  ' }), null);
  assert.deepEqual(U.uploadsConfig({ DM_UPLOADS_BUCKET: 'b', DM_UPLOADS_REGION: 'us-east-2' }), { bucket: 'b', region: 'us-east-2' });
  assert.equal(U.createUploadStorage({}), null);
});

// ── Armazenamento S3 (cliente injetado) ─────────────────────────────────────

function staticClient(send) {
  const client = new S3Client({
    region: 'us-east-2',
    credentials: { accessKeyId: 'AKIDTESTE', secretAccessKey: 'segredo-de-teste' },
    requestChecksumCalculation: 'WHEN_REQUIRED',
  });
  if (send) client.send = send;
  return client;
}

test('URL de PUT assina Content-Type (e o sha256, quando informado) e não leva checksum automático', async () => {
  const storage = U.createUploadStorage({ bucket: 'dmconecta-uploads-test', region: 'us-east-2', client: staticClient() });
  const plain = await storage.presignPut({ key: `tmp/${UPLOAD}`, contentType: 'image/png' });
  const url = new URL(plain.url);
  assert.equal(url.hostname, 'dmconecta-uploads-test.s3.us-east-2.amazonaws.com');
  assert.equal(url.pathname, `/tmp/${UPLOAD}`);
  assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host');
  assert.equal(url.searchParams.get('X-Amz-Expires'), String(U.PUT_EXPIRES_SECONDS));
  assert.ok(![...url.searchParams.keys()].some((k) => /checksum/i.test(k)));
  assert.deepEqual(plain.headers, { 'Content-Type': 'image/png' });

  const sha = 'ab'.repeat(32);
  const withSha = await storage.presignPut({ key: `tmp/${UPLOAD}`, contentType: 'image/png', sha256: sha });
  assert.equal(new URL(withSha.url).searchParams.get('X-Amz-SignedHeaders'), 'content-type;host;x-amz-checksum-sha256');
  assert.equal(withSha.headers['x-amz-checksum-sha256'], Buffer.from(sha, 'hex').toString('base64'));

  const get = new URL(await storage.presignGet({ key: 'demands/x/documents/y.pdf', contentType: 'application/pdf', fileName: 'ata.pdf', disposition: 'attachment' }));
  assert.equal(get.searchParams.get('response-content-disposition'), 'attachment; filename="ata.pdf"; filename*=UTF-8\'\'ata.pdf');
  assert.equal(get.searchParams.get('X-Amz-Expires'), String(U.GET_EXPIRES_SECONDS));
});

test('HeadObject 403/404 (sem ListBucket) é arquivo ausente; cópia e remoção usam as chaves certas', async () => {
  const sent = [];
  const storage = U.createUploadStorage({
    bucket: 'b',
    region: 'us-east-2',
    client: staticClient(async (command) => {
      sent.push([command.constructor.name, command.input]);
      if (command.constructor.name === 'HeadObjectCommand') {
        if (command.input.Key === 'tmp/ok') return { ContentLength: 10, ContentType: 'image/png; charset=binary', ChecksumSHA256: 'abc=' };
        const err = new Error('Forbidden');
        err.name = command.input.Key === 'tmp/404' ? 'NotFound' : 'Forbidden';
        err.$metadata = { httpStatusCode: command.input.Key === 'tmp/404' ? 404 : 403 };
        throw err;
      }
      if (command.constructor.name === 'GetObjectCommand') {
        return { Body: { transformToByteArray: async () => PNG } };
      }
      if (command.constructor.name === 'DeleteObjectCommand') throw new Error('falhou');
      return {};
    }),
  });
  assert.deepEqual(await storage.head('tmp/ok'), { size: 10, contentType: 'image/png', checksumSha256: 'abc=' });
  assert.equal(await storage.head('tmp/403'), null);
  assert.equal(await storage.head('tmp/404'), null);
  assert.deepEqual([...(await storage.readPrefix('tmp/ok', 4))], [0x89, 0x50, 0x4e, 0x47]);
  await storage.copy('tmp/ok', 'demands/d/photo/u.png');
  await storage.remove('tmp/ok'); // falha ao apagar não propaga
  const byName = Object.fromEntries(sent.map(([name, input]) => [name, input]));
  assert.equal(byName.HeadObjectCommand.ChecksumMode, 'ENABLED');
  assert.equal(byName.GetObjectCommand.Range, 'bytes=0-3');
  assert.deepEqual(byName.CopyObjectCommand, {
    Bucket: 'b', Key: 'demands/d/photo/u.png', CopySource: 'b/tmp/ok', MetadataDirective: 'COPY',
  });
});

// ── Rotas ───────────────────────────────────────────────────────────────────

test('sem DM_UPLOADS_BUCKET as rotas respondem 503 uploads_unavailable', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, null, async (base) => {
    for (const [method, p] of [['POST', '/uploads/presign'], ['POST', `/uploads/${UPLOAD}/confirm`], ['GET', `/uploads/${UPLOAD}/content`]]) {
      const res = await send(base, method, p, method === 'POST' ? {} : undefined);
      assert.equal(res.status, 503, p);
      assert.equal((await res.json()).code, 'uploads_unavailable');
    }
  });
  assert.equal(pool.calls.length, 0);
});

test('presign: exige token e Agente; valida antes de gravar; grava pendente e devolve PUT', async () => {
  const storage = memoryStorage();
  const pool = fakePool((text, params) => {
    if (text.startsWith('DELETE FROM uploads')) return { rows: [] };
    if (/SELECT count\(\*\)::int AS n FROM uploads/.test(text)) return { rows: [{ n: 0 }] };
    if (text.startsWith('INSERT INTO uploads')) {
      assert.equal(params[1], AGENT);
      assert.equal(params[2], 'demand_photo');
      assert.equal(params[3], `tmp/${params[0]}`);
      assert.deepEqual(params.slice(4), ['image/png', 2048, null, 'praça.png']);
      return { rows: [] };
    }
    return null;
  });
  await withServer(pool, storage, async (base) => {
    const body = { purpose: 'demand_photo', contentType: 'image/png', size: 2048, fileName: 'praça.png' };
    assert.equal((await send(base, 'POST', '/uploads/presign', body, { 'content-type': 'application/json' })).status, 401);
    const member = await send(base, 'POST', '/uploads/presign', body, headers(OTHER, 'member', 'morador'));
    assert.equal(member.status, 403);
    const invalid = await send(base, 'POST', '/uploads/presign', { ...body, contentType: 'image/gif' });
    assert.equal(invalid.status, 422);
    assert.ok((await invalid.json()).fields.contentType);
    // Finalidade do user-service não é aceita aqui.
    assert.equal((await send(base, 'POST', '/uploads/presign', { ...body, purpose: 'institution_proof' })).status, 422);

    const res = await send(base, 'POST', '/uploads/presign', body);
    assert.equal(res.status, 201);
    const ticket = await res.json();
    assert.match(ticket.uploadId, /^[0-9a-f-]{36}$/);
    assert.equal(ticket.ref, `upload:${ticket.uploadId}`);
    assert.equal(ticket.method, 'PUT');
    assert.equal(ticket.url, `https://s3.test/tmp/${ticket.uploadId}?put`);
    assert.deepEqual(ticket.headers, { 'Content-Type': 'image/png' });
    assert.equal(ticket.maxBytes, 15 * 1024 * 1024);
  });
  assert.equal(pool.calls.filter(({ text }) => text.startsWith('INSERT')).length, 1);
});

test('presign: limite de envios pendentes por hora', async () => {
  const pool = fakePool((text) => {
    if (text.startsWith('DELETE FROM uploads')) return { rows: [] };
    if (/count\(\*\)/.test(text)) return { rows: [{ n: U.MAX_PENDING_PER_HOUR }] };
    return null;
  });
  await withServer(pool, memoryStorage(), async (base) => {
    const res = await send(base, 'POST', '/uploads/presign', { purpose: 'demand_photo', contentType: 'image/png', size: 10 });
    assert.equal(res.status, 429);
  });
});

function confirmPool(row, demand = { id: DEMAND, author_id: AGENT, status: 'em_analise', review_state: 'rascunho' }) {
  const state = { row: { ...row }, deleted: false };
  const pool = fakePool((text, params) => {
    if (/FROM uploads WHERE id = \$1 AND owner_id = \$2/.test(text)) {
      return { rows: params[1] === state.row.owner_id && !state.deleted ? [state.row] : [] };
    }
    if (/FROM demands WHERE id = \$1/.test(text) && text.includes('review_state')) return { rows: demand ? [demand] : [] };
    if (text.startsWith('UPDATE uploads')) {
      state.row = {
        ...state.row, status: 'confirmado', object_key: params[1], size_bytes: params[2], demand_id: params[3], confirmed_at: new Date(),
      };
      return { rows: [state.row] };
    }
    if (text.startsWith('DELETE FROM uploads WHERE id')) {
      state.deleted = true;
      return { rows: [] };
    }
    return null;
  });
  return { pool, state };
}

test('confirmação: confere, copia para demands/<id>/photo, apaga o tmp e vincula', async () => {
  const storage = memoryStorage(new Map([[`tmp/${UPLOAD}`, { bytes: PNG, size: 2048, contentType: 'image/png' }]]));
  const { pool, state } = confirmPool(uploadRow());
  await withServer(pool, storage, async (base) => {
    assert.equal((await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, {})).status, 422); // sem demandId
    assert.equal((await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND }, headers(OTHER))).status, 404);
    const res = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND });
    assert.equal(res.status, 200);
    const body = await res.json();
    const key = `demands/${DEMAND}/photo/${UPLOAD}.png`;
    assert.equal(body.status, 'confirmado');
    assert.equal(body.demandId, DEMAND);
    assert.equal(body.size, 2048);
    assert.equal(body.fileName, 'foto da praça.png');
    assert.equal(body.url, `https://s3.test/${key}?get`);
    assert.equal(state.row.object_key, key);
    assert.ok(storage.objects.has(key));
    assert.ok(!storage.objects.has(`tmp/${UPLOAD}`));
    assert.deepEqual(storage.ops.filter(([op]) => op === 'copy'), [['copy', `tmp/${UPLOAD}`, key]]);
    // Repetir a confirmação devolve o mesmo resultado, sem copiar de novo.
    const again = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND });
    assert.equal(again.status, 200);
    assert.equal(storage.ops.filter(([op]) => op === 'copy').length, 1);
  });
});

test('confirmação: demanda de outro autor é 404; fora de rascunho é 409', async () => {
  for (const [demand, status] of [
    [{ id: DEMAND, author_id: OTHER, status: 'em_analise', review_state: 'rascunho' }, 404],
    [{ id: DEMAND, author_id: AGENT, status: 'em_analise', review_state: 'aguardando_analise' }, 409],
    [{ id: DEMAND, author_id: AGENT, status: 'publicada', review_state: 'aprovada' }, 409],
  ]) {
    const storage = memoryStorage(new Map([[`tmp/${UPLOAD}`, { bytes: PNG, size: 2048, contentType: 'image/png' }]]));
    const { pool } = confirmPool(uploadRow(), demand);
    await withServer(pool, storage, async (base) => {
      assert.equal((await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND })).status, status);
    });
    assert.ok(!storage.ops.some(([op]) => op === 'copy'));
  }
});

test('confirmação: evidência do antes/depois só em demanda publicada', async () => {
  const video = Uint8Array.from(Buffer.from('\0\0\0\x20ftypisom\0\0\0\0', 'latin1'));
  const row = uploadRow({ purpose: 'demand_evidence_video', content_type: 'video/mp4', declared_size_bytes: '4096', original_name: 'antes.mp4' });
  const draft = confirmPool(row);
  await withServer(draft.pool, memoryStorage(new Map([[`tmp/${UPLOAD}`, { bytes: video, size: 4096, contentType: 'video/mp4' }]])), async (base) => {
    assert.equal((await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND })).status, 409);
  });
  const storage = memoryStorage(new Map([[`tmp/${UPLOAD}`, { bytes: video, size: 4096, contentType: 'video/mp4' }]]));
  const published = confirmPool(row, { id: DEMAND, author_id: AGENT, status: 'em_execucao', review_state: 'aprovada' });
  await withServer(published.pool, storage, async (base) => {
    const res = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND });
    assert.equal(res.status, 200);
    assert.equal(published.state.row.object_key, `demands/${DEMAND}/evidence/${UPLOAD}.mp4`);
  });
});

test('confirmação recusa arquivo ausente, tamanho, tipo, sha256 ou conteúdo diferentes', async () => {
  const cases = [
    [null, 409, 'upload_missing'],
    [{ bytes: PNG, size: 999, contentType: 'image/png' }, 422, 'upload_rejected'],
    [{ bytes: PNG, size: 16 * 1024 * 1024, contentType: 'image/png' }, 422, 'upload_rejected'],
    [{ bytes: PNG, size: 2048, contentType: 'image/jpeg' }, 422, 'upload_rejected'],
    [{ bytes: PDF, size: 2048, contentType: 'image/png' }, 422, 'upload_rejected'],
    [{ bytes: PNG, size: 2048, contentType: 'image/png', checksum: 'outro=' }, 422, 'upload_rejected', { sha256: 'ab'.repeat(32) }],
  ];
  for (const [object, status, code, extra = {}] of cases) {
    const objects = new Map(object ? [[`tmp/${UPLOAD}`, object]] : []);
    const storage = memoryStorage(objects);
    const { pool, state } = confirmPool(uploadRow(extra));
    await withServer(pool, storage, async (base) => {
      const res = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, { demandId: DEMAND });
      assert.equal(res.status, status, JSON.stringify(object));
      assert.equal((await res.json()).code, code);
    });
    assert.ok(!storage.ops.some(([op]) => op === 'copy'));
    if (status === 422) {
      assert.ok(!objects.has(`tmp/${UPLOAD}`), 'tmp recusado é apagado');
      assert.ok(state.deleted, 'registro recusado é apagado');
    }
  }
});

function readPool(row, demandStatus, { document = null, party = {}, events = [] } = {}) {
  return fakePool((text, params) => {
    if (/FROM uploads WHERE id = \$1$/.test(text.trim())) return { rows: row ? [row] : [] };
    if (/SELECT 1 FROM demands WHERE id = \$1 AND status = ANY/.test(text)) {
      return { rows: demandStatus && !['em_analise', 'arquivada'].includes(demandStatus) ? [{ '?column?': 1 }] : [] };
    }
    // Nível Institucional (T-05-18): documento que referencia o upload, demanda e partes.
    if (/FROM demand_documents d LEFT JOIN demand_document_access a/.test(text)) return { rows: document ? [document] : [] };
    if (/SELECT id, author_id, organization_id, status FROM demands WHERE id = \$1/.test(text)) {
      return { rows: [{ id: DEMAND, author_id: AGENT, organization_id: null, status: demandStatus }] };
    }
    if (/AS party,\s+EXISTS \(SELECT 1 FROM demand_interests/.test(text)) {
      return { rows: [{ party: Boolean(party.party), interested: Boolean(party.interested) }] };
    }
    if (/INSERT INTO demand_events/.test(text)) {
      events.push(params);
      return { rows: [] };
    }
    return null;
  });
}

test('leitura: /content só redireciona foto de demanda publicada; documento nunca é público', async () => {
  const confirmed = { status: 'confirmado', object_key: `demands/${DEMAND}/photo/${UPLOAD}.png`, size_bytes: '2048', demand_id: DEMAND };
  await withServer(readPool(uploadRow(confirmed), 'publicada'), memoryStorage(), async (base) => {
    const res = await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {});
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `https://s3.test/demands/${DEMAND}/photo/${UPLOAD}.png?get`);
    assert.match(res.headers.get('cache-control'), /max-age=600/);
    // Público também lê os metadados com qualquer conta.
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, headers(OTHER, 'member', 'morador'))).status, 200);
  });
  for (const status of ['em_analise', 'arquivada']) {
    await withServer(readPool(uploadRow(confirmed), status), memoryStorage(), async (base) => {
      assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {})).status, 404, status);
    });
  }
  const doc = uploadRow({ ...confirmed, purpose: 'demand_document', content_type: 'application/pdf', object_key: `demands/${DEMAND}/documents/${UPLOAD}.pdf` });
  await withServer(readPool(doc, 'publicada'), memoryStorage(), async (base) => {
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {})).status, 404);
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, headers(OTHER, 'agent'))).status, 404);
    const owner = await send(base, 'GET', `/uploads/${UPLOAD}`);
    assert.equal(owner.status, 200);
    assert.equal((await owner.json()).url, `https://s3.test/demands/${DEMAND}/documents/${UPLOAD}.pdf?get`);
    const operation = await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, headers(OPERATOR, 'member', 'morador'));
    assert.equal(operation.status, 200);
  });
  await withServer(readPool(null), memoryStorage(), async (base) => {
    assert.equal((await send(base, 'GET', '/uploads/nao-e-uuid')).status, 404);
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`)).status, 404);
  });
});

test('leitura no nível Institucional (T-05-18): parte lê e fica registrada; restrito e sem relação são 404; público abre sem token', async () => {
  const confirmed = {
    status: 'confirmado', purpose: 'demand_document', content_type: 'application/pdf',
    object_key: `demands/${DEMAND}/documents/${UPLOAD}.pdf`, size_bytes: '2048', demand_id: DEMAND,
  };
  const doc = (accessLevel, restrictedTo = []) => ({
    id: 'abababab-abab-4bab-8bab-abababababab', demand_id: DEMAND, position: 0, document_type: 'orcamento',
    title: 'Orçamento', description: null, reference: `upload:${UPLOAD}`, access_level: accessLevel, restricted_to: restrictedTo,
  });
  const partner = headers(OTHER, 'partner', 'empresa');

  const events = [];
  await withServer(readPool(uploadRow(confirmed), 'conectada', { document: doc('institucional'), party: { interested: true }, events }), memoryStorage(), async (base) => {
    const res = await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, partner);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).url, `https://s3.test/demands/${DEMAND}/documents/${UPLOAD}.pdf?get`);
    // Sem token, o institucional não abre.
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {})).status, 404);
  });
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'documento_consultado');
  assert.equal(events[0][2], 'parceiro');
  assert.equal(events[0][3], OTHER);

  await withServer(readPool(uploadRow(confirmed), 'conectada', { document: doc('institucional') }), memoryStorage(), async (base) => {
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, partner)).status, 404, 'sem relação');
  });
  await withServer(readPool(uploadRow(confirmed), 'conectada', { document: doc('restrito'), party: { interested: true } }), memoryStorage(), async (base) => {
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, partner)).status, 404, 'restrito fora da lista');
  });
  await withServer(readPool(uploadRow(confirmed), 'conectada', { document: doc('restrito', [OTHER]), party: { interested: true } }), memoryStorage(), async (base) => {
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}`, undefined, partner)).status, 200, 'restrito com a conta na lista');
  });
  await withServer(readPool(uploadRow(confirmed), 'publicada', { document: doc('publico') }), memoryStorage(), async (base) => {
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {})).status, 302);
  });
});

// ── Integração com a demanda ────────────────────────────────────────────────

test('validação da demanda aceita upload:<id> ou o id puro e normaliza', () => {
  const { value, errors } = validateDemand({ photoRef: UPLOAD, documents: [{ type: 'estatuto', title: 'Estatuto', reference: `upload:${UPLOAD}` }] });
  assert.deepEqual(errors, {});
  assert.equal(value.photoRef, `upload:${UPLOAD}`);
  assert.equal(value.documents[0].reference, `upload:${UPLOAD}`);
  assert.ok(validateDemand({ photoRef: 'ftp://x' }).errors.photoRef);
});

function demandRow(overrides = {}) {
  return {
    id: DEMAND, author_id: AGENT, status: 'em_analise', review_state: 'rascunho',
    budget_amount_cents: '0', agent_fee_bps: 400, platform_fee_bps: 600, agent_fee_cents: '0',
    platform_fee_cents: '0', total_amount_cents: '0', has_physical_execution: true,
    created_at: new Date('2026-09-22T12:00:00Z'), updated_at: new Date('2026-09-22T12:00:00Z'),
    ...overrides,
  };
}

test('PUT da demanda: photoRef de upload precisa estar confirmado, ser do autor e desta demanda', async () => {
  let usable = false;
  let photo = null;
  const pool = fakePool((text, params) => {
    if (/FROM demands d WHERE d.id = \$1/.test(text)) return { rows: [demandRow({ photo_ref: photo })] };
    if (/FROM uploads\s+WHERE id = \$1 AND owner_id = \$2 AND purpose = \$3 AND status = 'confirmado' AND demand_id = \$4/.test(text)) {
      assert.deepEqual(params, [UPLOAD, AGENT, 'demand_photo', DEMAND]);
      return { rows: usable ? [uploadRow({ status: 'confirmado', demand_id: DEMAND, object_key: 'k', size_bytes: '2048' })] : [] };
    }
    if (text.startsWith('UPDATE demands SET photo_ref')) {
      photo = params[1];
      return { rows: [] };
    }
    if (/FROM uploads WHERE id = ANY/.test(text)) {
      return { rows: [uploadRow({ status: 'confirmado', demand_id: DEMAND, object_key: `demands/${DEMAND}/photo/${UPLOAD}.png`, size_bytes: '2048' })] };
    }
    if (/FROM demand_/.test(text)) return { rows: [] };
    return null;
  });
  await withServer(pool, memoryStorage(), async (base) => {
    const refused = await send(base, 'PUT', `/demands/${DEMAND}`, { photoRef: `upload:${UPLOAD}` });
    assert.equal(refused.status, 422);
    assert.ok((await refused.json()).fields.photoRef);
    usable = true;
    const ok = await send(base, 'PUT', `/demands/${DEMAND}`, { photoRef: UPLOAD });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.photoRef, `upload:${UPLOAD}`);
    // Rascunho não é público: o autor recebe URL assinada curta.
    assert.equal(body.photoUrl, `https://s3.test/demands/${DEMAND}/photo/${UPLOAD}.png?get`);
    assert.equal(body.photoFile.fileName, 'foto da praça.png');
  });
});

test('criar rascunho com upload na foto é 422: o arquivo se vincula a uma demanda existente', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, memoryStorage(), async (base) => {
    const res = await send(base, 'POST', '/demands', { photoRef: `upload:${UPLOAD}` });
    assert.equal(res.status, 422);
    assert.match((await res.json()).fields.photoRef, /rascunho/);
  });
  assert.ok(!pool.calls.some(({ text }) => text.startsWith('INSERT')));
});

test('documento da demanda com upload: confere finalidade demand_document', async () => {
  const pool = fakePool((text, params) => {
    if (/FROM demands d WHERE d.id = \$1/.test(text)) return { rows: [demandRow()] };
    if (/FROM uploads\s+WHERE id = \$1 AND owner_id = \$2 AND purpose = \$3/.test(text)) {
      assert.equal(params[2], 'demand_document');
      return { rows: [] };
    }
    return null;
  });
  await withServer(pool, memoryStorage(), async (base) => {
    const res = await send(base, 'POST', `/demands/${DEMAND}/documents`, { type: 'estatuto', title: 'Estatuto', reference: `upload:${UPLOAD}` });
    assert.equal(res.status, 422);
    assert.ok((await res.json()).fields.reference);
  });
  assert.ok(!pool.calls.some(({ text }) => text.startsWith('INSERT')));
});

test('visão pública da demanda: foto por upload sai pelo endereço estável /content', async () => {
  const pool = fakePool((text) => {
    if (/FROM demands d\s+WHERE d.id = \$1 AND d.status = ANY/.test(text)) {
      return { rows: [demandRow({ status: 'publicada', photo_ref: `upload:${UPLOAD}`, published_at: new Date() })] };
    }
    if (/FROM demand_/.test(text)) return { rows: [] };
    return null;
  });
  await withServer(pool, memoryStorage(), async (base) => {
    const res = await send(base, 'GET', `/demands/${DEMAND}`, undefined, {});
    assert.equal(res.status, 200);
    assert.equal((await res.json()).photoUrl, `/api/posts/uploads/${UPLOAD}/content`);
  });
});

// ── Foto do sinal do feed (`post_photo`, migração 024) ──────────────────────

test('post_photo: quem publica no feed envia; a confirmação não exige demanda e fica sob o dono', async () => {
  const P = U.PURPOSES.post_photo;
  assert.equal(P.target, 'post');
  assert.equal(P.visibility, 'public');
  assert.equal(P.deferredTarget, true);
  assert.equal(U.finalKey('post_photo', AGENT, UPLOAD, 'image/jpeg'), `posts/${AGENT}/photo/${UPLOAD}.jpg`);

  const presignPool = fakePool((text) => {
    if (text.startsWith('DELETE FROM uploads')) return { rows: [] };
    if (/count\(\*\)::int AS n FROM uploads/.test(text)) return { rows: [{ n: 0 }] };
    if (text.startsWith('INSERT INTO uploads')) return { rows: [] };
    return null;
  });
  await withServer(presignPool, memoryStorage(), async (base) => {
    const body = { purpose: 'post_photo', contentType: 'image/png', size: 2048, fileName: 'buraco.png' };
    // Membro da Comunidade não publica no feed: não envia foto de sinal.
    assert.equal((await send(base, 'POST', '/uploads/presign', body, headers(OTHER, 'member', 'morador'))).status, 403);
    // Poder Público publica `message`: pode enviar.
    assert.equal((await send(base, 'POST', '/uploads/presign', body, headers(OTHER, 'government', 'prefeitura'))).status, 201);
    assert.equal((await send(base, 'POST', '/uploads/presign', body)).status, 201);
  });

  const state = { row: uploadRow({ purpose: 'post_photo', post_id: null }) };
  const pool = fakePool((text, params) => {
    if (/FROM uploads WHERE id = \$1 AND owner_id = \$2/.test(text)) {
      assert.match(text, /demand_id, post_id/);
      return { rows: params[1] === AGENT ? [state.row] : [] };
    }
    if (/FROM uploads WHERE id = \$1$/.test(text)) return { rows: [state.row] };
    if (text.startsWith('UPDATE uploads')) {
      assert.match(text, /post_id = \$4/);
      state.row = { ...state.row, status: 'confirmado', object_key: params[1], size_bytes: params[2], post_id: params[3], confirmed_at: new Date() };
      return { rows: [state.row] };
    }
    return null;
  });
  const storage = memoryStorage(new Map([[`tmp/${UPLOAD}`, { bytes: PNG, size: 2048, contentType: 'image/png' }]]));
  await withServer(pool, storage, async (base) => {
    const res = await send(base, 'POST', `/uploads/${UPLOAD}/confirm`, {});
    assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
    const body = await res.json();
    const key = `posts/${AGENT}/photo/${UPLOAD}.png`;
    assert.equal(body.status, 'confirmado');
    assert.equal(body.postId, null);
    assert.equal(body.demandId, null);
    assert.equal(state.row.object_key, key);
    assert.ok(storage.objects.has(key));
    // Sem post ainda, a foto não é pública; o dono lê.
    assert.equal((await send(base, 'GET', `/uploads/${UPLOAD}/content`, undefined, {})).status, 404);
  });
});

test('POST /posts com foto por upload: confere o upload confirmado do autor e grava o vínculo na mesma transação', async () => {
  const POST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const calls = [];
  const tx = [];
  const client = {
    async query(text, params = []) {
      tx.push({ text, params });
      if (text.includes('INSERT INTO posts')) return { rows: [{ id: POST_ID, images: params[10] }] };
      if (text.startsWith('UPDATE uploads SET post_id')) {
        assert.deepEqual(params, [POST_ID, [UPLOAD]]);
        return { rows: [] };
      }
      return { rows: [] };
    },
    release() {},
  };
  const usable = { current: true };
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (/FROM uploads\s+WHERE id = ANY/.test(text)) {
        assert.equal(params[1], AGENT);
        assert.equal(params[2], null);
        return { rows: usable.current ? [{ id: UPLOAD }] : [] };
      }
      throw new Error(`Consulta inesperada: ${text}`);
    },
    async connect() { return client; },
  };
  await withServer(pool, memoryStorage(), async (base) => {
    const body = { type: 'problem', title: 'Buraco', description: 'Na esquina', latitude: -23.02, longitude: -43.45, images: [`upload:${UPLOAD}`] };
    const created = await send(base, 'POST', '/', body);
    assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
    assert.deepEqual(tx.map((c) => c.text.split(' ')[0]), ['BEGIN', 'INSERT', 'UPDATE', 'COMMIT']);

    usable.current = false;
    const rejected = await send(base, 'POST', '/', body);
    assert.equal(rejected.status, 422);
    assert.ok((await rejected.json()).fields.images);
  });
});
