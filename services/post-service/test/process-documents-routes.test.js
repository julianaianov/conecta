const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const {
  DOCUMENT_TYPES, ACCESS_LEVELS, validateDocument, validateArchive, serializeDocument, groupDocuments,
} = require('../src/process/documents');
const { canOpenProcessDocument } = require('../src/process/upload-access');

// Documentos do Processo de Conexão (T-05-04) com banco simulado: validação,
// versões agrupadas, quem abre (§33: público, institucional, restrito) e URL
// assinada de 60 s. O ciclo contra PostgreSQL está em process-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
// Envolvido na demanda (interesse com conexão aceita, T-05-18), sem ser parte deste processo.
const STRANGER = '33333333-3333-4333-8333-333333333333';
const OUTSIDER = '44444444-4444-4444-8444-444444444444';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROCESS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const GROUP = '99999999-9999-4999-8999-999999999999';
const UPLOAD = 'abababab-abab-4bab-8bab-abababababab';
const DOC_V1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
const DOC_V2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
const DOC_RESTRICTED = 'a3a3a3a3-a3a3-4a3a-8a3a-a3a3a3a3a3a3';

const processRow = {
  id: PROCESS, protocol: 'DM-2026-000184', demand_id: DEMAND, sequence_in_demand: 1, party_kind: 'empresa',
  party_user_id: PARTNER, party_organization_id: null, party_name: 'Construtora Horizonte', party_profile_type: 'empresa',
  fee_applies: true, origin_kind: 'interesse', contribution_kinds: [], status: 'em_analise', closed_at: null,
  status_changed_at: new Date('2026-09-25T12:00:00Z'), formalized_at: new Date('2026-09-25T12:00:00Z'),
  demand_title: 'Calçada', demand_status: 'conectada', demand_author_id: AGENT,
};

const doc = (over = {}) => ({
  id: DOC_V1, process_id: PROCESS, demand_id: DEMAND, document_group_id: GROUP, version: 1, name: 'Orçamento',
  document_type: 'orcamento', organization_name: null, uploaded_by: PARTNER, uploaded_by_name: 'Construtora Horizonte',
  uploaded_by_side: 'conectado', upload_id: UPLOAD, status: 'substituido', access_level: 'institucional', restricted_to: [],
  archived_at: null, archived_by: null, archive_reason: null, created_at: new Date('2026-09-25T13:00:00Z'),
  original_name: 'Orçamento.xlsx', content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size_bytes: '2048', object_key: `processes/${PROCESS}/documents/${UPLOAD}.xlsx`, ...over,
});

const DOCS = [
  doc(),
  doc({ id: DOC_V2, version: 2, status: 'vigente', created_at: new Date('2026-09-25T14:00:00Z') }),
  doc({ id: DOC_RESTRICTED, document_group_id: 'b0b0b0b0-b0b0-4b0b-8b0b-b0b0b0b0b0b0', name: 'Contrato', document_type: 'contrato',
    status: 'vigente', access_level: 'restrito', restricted_to: [STRANGER] }),
];

function fakePool() {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || /SAVEPOINT/.test(text)) return { rows: [] };
    if (/FROM connection_processes p JOIN demands d/.test(text) && /WHERE p\.(id|protocol) = \$1/.test(text)) {
      return { rows: params[0] === PROCESS || params[0] === processRow.protocol ? [processRow] : [] };
    }
    if (/FROM connection_process_documents d JOIN uploads u/.test(text)) {
      if (/WHERE d\.process_id = \$1 ORDER BY/.test(text)) return { rows: DOCS };
      return { rows: DOCS.filter((d) => d.id === params[0]) };
    }
    // Regra do envolvido (src/access/process-party.js).
    if (/FROM demands WHERE id = \$1/.test(text) && /author_id, organization_id, status/.test(text)) {
      return { rows: [{ id: DEMAND, author_id: AGENT, organization_id: null, status: 'conectada' }] };
    }
    if (/AS party,/.test(text) && /AS interested/.test(text)) {
      return { rows: [{ party: false, interested: params[1] === STRANGER }] };
    }
    if (/INSERT INTO demand_events/.test(text)) return { rows: [] };
    throw new Error(`Consulta inesperada: ${text}`);
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

const fakeStorage = {
  async presignGet({ key, expiresIn, disposition }) { return `https://s3.test/${key}?ttl=${expiresIn}&d=${disposition}`; },
};

async function withServer(callback, { pool = fakePool(), uploadStorage = fakeStorage } = {}) {
  const server = createApp({
    pool, secret: SECRET, dossierService: null, uploadStorage,
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

const auth = (userId, role = 'partner', profileType = 'empresa') => ({
  authorization: `Bearer ${jwt.sign({ userId, role, profileType, name: 'Conta' }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers) => {
  const res = await fetch(`${base}${path}`, { method, headers: headers ?? { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('domínio: tipos da fonte, validação, versões e acesso (§17, §33)', () => {
  assert.ok(['projeto_tecnico', 'orcamento', 'parecer_tecnico', 'termo_de_parceria', 'relatorio_de_execucao', 'comprovante']
    .every((t) => DOCUMENT_TYPES.includes(t)), 'exemplos do §17');
  assert.deepEqual(ACCESS_LEVELS, ['publico', 'institucional', 'restrito']);
  const ok = validateDocument({ name: ' Orçamento ', documentType: 'orcamento', uploadId: `upload:${UPLOAD}` });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.accessLevel, 'institucional', 'padrão institucional');
  assert.equal(ok.value.uploadId, UPLOAD);
  const bad = validateDocument({ documentType: 'x', accessLevel: 'secreto' });
  assert.ok(bad.errors.name && bad.errors.documentType && bad.errors.uploadId && bad.errors.accessLevel);
  assert.ok(validateDocument({ name: 'a', documentType: 'outro', uploadId: UPLOAD, accessLevel: 'restrito' }).errors.restrictedTo);
  assert.ok(validateDocument({ name: 'a', documentType: 'outro', uploadId: UPLOAD, restrictedTo: [AGENT] }).errors.restrictedTo);
  assert.ok(validateDocument({ name: 'a', documentType: 'outro', uploadId: UPLOAD, replacesGroupId: 'x' }).errors.replacesGroupId);
  assert.ok(validateArchive({}).errors.reason);

  // Regra do envolvido (src/access/process-party.js, T-05-18; decisão 13).
  const institutional = doc();
  assert.equal(canOpenProcessDocument(institutional, { userId: AGENT, role: 'autor' }), true);
  assert.equal(canOpenProcessDocument(institutional, { userId: STRANGER, role: 'interessado' }), true, 'envolvido abre o institucional');
  assert.equal(canOpenProcessDocument(institutional, { userId: OUTSIDER, role: null }), false);
  assert.equal(canOpenProcessDocument(doc({ access_level: 'publico' }), { userId: OUTSIDER, role: null }), true);
  assert.equal(canOpenProcessDocument(doc({ access_level: 'publico' }), { userId: null }), false, 'público pede sessão');
  const restricted = DOCS[2];
  assert.equal(canOpenProcessDocument(restricted, { userId: STRANGER, role: 'interessado' }), true, 'autorizado na lista');
  assert.equal(canOpenProcessDocument(restricted, { userId: AGENT, role: 'autor' }), true, 'restrito = autor + lista');
  assert.equal(canOpenProcessDocument(restricted, { userId: PARTNER, role: 'parte' }), true, 'quem enviou abre');
  assert.equal(canOpenProcessDocument(restricted, { userId: OUTSIDER, role: 'parte' }), false, 'parte fora da lista não abre');
  const orgRestricted = doc({ access_level: 'restrito', restricted_to: ['55555555-5555-4555-8555-555555555555'] });
  assert.equal(canOpenProcessDocument(orgRestricted,
    { userId: OUTSIDER, role: 'orgao', organizationId: '55555555-5555-4555-8555-555555555555' }), true, 'órgão autorizado');

  const groups = groupDocuments(DOCS.slice(0, 2).map((d) => serializeDocument(d)));
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].versions.map((v) => [v.version, v.status]), [[2, 'vigente'], [1, 'substituido']]);
  assert.equal(groups[0].latestVersion, 2);
});

test('lista: só as partes do processo, versão vigente primeiro; terceiro 404', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', `/processes/${PROCESS}/documents`)).status, 401);
    assert.equal((await send(base, 'GET', `/processes/${PROCESS}/documents`, undefined, auth(STRANGER))).status, 404);
    const agent = await send(base, 'GET', `/processes/${PROCESS}/documents`, undefined, auth(AGENT, 'agent', 'associacao'));
    assert.equal(agent.status, 200);
    assert.equal(agent.body.groups.length, 2, 'o autor vê também o restrito (decisão 13)');
    const budget = agent.body.groups.find((g) => g.documentType === 'orcamento');
    assert.deepEqual(budget.versions.map((v) => [v.version, v.status]), [[2, 'vigente'], [1, 'substituido']]);
    assert.equal(budget.versions[0].canOpen, true);
    const contract = agent.body.groups.find((g) => g.documentType === 'contrato');
    assert.deepEqual(contract.versions[0].restrictedTo, [], 'só quem enviou vê a lista de autorizados');
    const partner = await send(base, 'GET', `/processes/${PROCESS}/documents`, undefined, auth(PARTNER));
    const own = partner.body.groups.find((g) => g.documentType === 'contrato');
    assert.deepEqual(own.versions[0].restrictedTo, [STRANGER]);
  });
});

test('arquivo: URL de 60 s conforme o acesso; 404 para quem não pode; 503 sem bucket', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const url = `/processes/${PROCESS}/documents/${DOC_V2}/file`;
    const ok = await send(base, 'GET', url, undefined, auth(AGENT, 'agent', 'associacao'));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.expiresIn, 60);
    assert.match(ok.body.url, /ttl=60&d=attachment/);
    assert.equal((await send(base, 'GET', url, undefined, auth(OUTSIDER))).status, 404, 'institucional: terceiro recebe 404');
    assert.equal((await send(base, 'GET', url, undefined, auth(STRANGER))).status, 200, 'institucional: envolvido na demanda abre');
    const restricted = `/processes/${PROCESS}/documents/${DOC_RESTRICTED}/file`;
    assert.equal((await send(base, 'GET', restricted, undefined, auth(STRANGER))).status, 200, 'autorizado no restrito');
    assert.equal((await send(base, 'GET', restricted, undefined, auth(OUTSIDER))).status, 404);
  }, { pool });
  assert.ok(pool.calls.some((c) => /INSERT INTO demand_events/.test(c.text) && /documento_consultado/.test(JSON.stringify(c.params))),
    'a consulta por envolvido que não é autor vira evento privado');
  await withServer(async (base) => {
    const res = await send(base, 'GET', `/processes/${PROCESS}/documents/${DOC_V2}/file`, undefined, auth(PARTNER));
    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'uploads_unavailable');
  }, { uploadStorage: null });
});

test('envio e arquivamento: validação antes do banco; só quem enviou arquiva', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const invalid = await send(base, 'POST', `/processes/${PROCESS}/documents`, { name: '' }, auth(PARTNER));
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.fields.name && invalid.body.fields.documentType && invalid.body.fields.uploadId);
    const noReason = await send(base, 'POST', `/processes/${PROCESS}/documents/${DOC_V2}/archive`, {}, auth(PARTNER));
    assert.equal(noReason.status, 422);
    const other = await send(base, 'POST', `/processes/${PROCESS}/documents/${DOC_V2}/archive`, { reason: 'Errado' },
      auth(AGENT, 'agent', 'associacao'));
    assert.equal(other.status, 403);
    assert.equal(other.body.code, 'forbidden_archive');
  }, { pool });
  assert.ok(!pool.calls.some((c) => /INSERT INTO connection_process_documents|UPDATE connection_process_documents/.test(c.text)));
});
