const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const {
  validateMessage, parseMessagesQuery, messageRecipients, serializeMessage, sideOfRole, MESSAGE_RECIPIENTS,
} = require('../src/process');

// Comunicação do Processo de Conexão (T-05-02) com banco simulado: quem lê e
// escreve, retrato do autor (instituição e cargo/perfil), destinatário,
// anexos conferidos e aviso ao outro lado. O ciclo contra PostgreSQL está em
// process-e2e.test.js.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const AGENT = '11111111-1111-4111-8111-111111111111';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const STRANGER = '33333333-3333-4333-8333-333333333333';
const GOV = '44444444-4444-4444-8444-444444444444';
const ORG = '55555555-5555-4555-8555-555555555555';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROCESS = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const UPLOAD = 'abababab-abab-4bab-8bab-abababababab';
const OTHER_UPLOAD = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

const baseRow = {
  id: PROCESS, protocol: 'DM-2026-000184', demand_id: DEMAND, sequence_in_demand: 1, party_kind: 'empresa',
  party_user_id: PARTNER, party_organization_id: null, party_name: 'Construtora Horizonte', party_profile_type: 'empresa',
  fee_applies: true, origin_kind: 'interesse', contribution_kinds: ['materiais'], contribution_description: null,
  contribution_amount_cents: null, status: 'em_analise', previous_status: null, status_note: null,
  status_changed_at: new Date('2026-09-25T12:00:00Z'), formalized_by_kind: 'agente', formalized_at: new Date('2026-09-25T12:00:00Z'),
  closed_at: null, demand_title: 'Calçada', demand_status: 'conectada', demand_author_id: AGENT,
};

const storedMessage = (over = {}) => ({
  id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', process_id: PROCESS, author_id: PARTNER, author_side: 'conectado',
  author_name: 'Construtora Horizonte', author_organization_name: null, author_role_label: 'Empresa',
  recipient_party: 'todos', body: 'Enviamos o orçamento.', attachments: [UPLOAD], created_at: new Date('2026-09-25T13:00:00Z'),
  ...over,
});

function fakePool({ row = baseRow, confirmedUploads = [UPLOAD], messages = [storedMessage()] } = {}) {
  const calls = [];
  let inserted = null;
  const query = async (text, params = []) => {
    calls.push({ text, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(text) || /SAVEPOINT/.test(text)) return { rows: [] };
    if (/FROM connection_processes p JOIN demands d/.test(text) && /WHERE p\.(id|protocol) = \$1/.test(text)) {
      return { rows: row && (params[0] === row.id || params[0] === row.protocol) ? [row] : [] };
    }
    if (/FROM uploads\s+WHERE id = ANY\(\$1::uuid\[\]\) AND owner_id/.test(text)) {
      return { rows: params[0].filter((id) => confirmedUploads.includes(id)).map((id) => ({ id })) };
    }
    if (/INSERT INTO connection_process_messages/.test(text)) {
      inserted = storedMessage({
        author_id: params[2], author_side: params[3], author_name: params[4], author_organization_name: params[5],
        author_role_label: params[6], recipient_party: params[7], body: params[8], attachments: params[9],
      });
      return { rows: [{ id: inserted.id }] };
    }
    if (/FROM connection_process_messages WHERE id = \$1/.test(text)) return { rows: inserted ? [inserted] : [] };
    if (/FROM connection_process_messages WHERE process_id = \$1/.test(text)) return { rows: [...messages].reverse() };
    if (/connection_process_message_reads/.test(text)) return { rows: [], rowCount: 1 };
    if (/notification_create/.test(text)) return { rows: [{ id: 'n1' }] };
    if (/UPDATE notifications SET read_at/.test(text)) return { rows: [], rowCount: 0 };
    if (/FROM uploads WHERE id = ANY\(\$1::uuid\[\]\) AND status = 'confirmado'/.test(text)) {
      return {
        rows: params[0].map((id) => ({
          id, owner_id: PARTNER, purpose: 'process_attachment', status: 'confirmado', content_type: 'application/pdf',
          size_bytes: 1000, original_name: 'Orçamento.pdf', process_id: PROCESS, object_key: `processes/${PROCESS}/attachments/${id}.pdf`,
        })),
      };
    }
    throw new Error(`Consulta inesperada: ${text}`);
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

async function withServer(callback, { pool = fakePool() } = {}) {
  const server = createApp({
    pool, secret: SECRET, dossierService: null, uploadStorage: null,
    institutionStatus: async (req) => (req.user.userId === GOV
      ? { kind: 'poder_publico', status: 'validada', canActInstitutionally: true, organizationId: ORG, organizationName: 'Secretaria de Obras', roleLabel: 'Coordenadora' }
      : req.user.userId === AGENT
        ? { kind: 'agente_transformacao', status: 'validada', canActInstitutionally: true, organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', organizationName: 'Associação Recreio Vivo', roleLabel: 'Presidente' }
        : { kind: null, status: null, canActInstitutionally: true, organizationId: null, organizationName: null, roleLabel: 'Empresa' }),
    partnerProfile: { get: async () => null },
    connections: { create: async () => null, get: async () => null, update: async () => null },
  }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const auth = (userId, role, profileType, name = 'Conta') => ({
  authorization: `Bearer ${jwt.sign({ userId, role, profileType, name }, SECRET)}`,
  'content-type': 'application/json',
});
const send = async (base, method, path, body, headers) => {
  const res = await fetch(`${base}${path}`, { method, headers: headers ?? { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

test('domínio: validação da mensagem, destinatário e quem recebe o aviso', () => {
  assert.deepEqual(MESSAGE_RECIPIENTS, ['agente', 'conectado', 'todos']);
  assert.equal(sideOfRole('agente'), 'agente');
  assert.equal(sideOfRole('parte'), 'conectado');
  const ok = validateMessage({ body: '  Olá  ', attachments: [`upload:${UPLOAD}`] });
  assert.deepEqual(ok.errors, {});
  assert.deepEqual(ok.value, { body: 'Olá', recipient: 'todos', attachments: [UPLOAD] });
  assert.ok(validateMessage({ body: '' }).errors.body);
  assert.ok(validateMessage({ body: 'a'.repeat(4001) }).errors.body);
  assert.ok(validateMessage({ body: 'x', recipient: 'gestao' }).errors.recipient);
  assert.ok(validateMessage({ body: 'x', attachments: ['https://exemplo.org/a.pdf'] }).errors.attachments);
  assert.ok(validateMessage({ body: 'x', attachments: [UPLOAD, UPLOAD] }).errors.attachments);
  assert.ok(validateMessage({ body: 'x', attachments: Array.from({ length: 11 }, () => UPLOAD) }).errors.attachments);
  assert.ok(parseMessagesQuery({ limit: '500' }).errors.limit);
  assert.ok(parseMessagesQuery({ before: 'ontem' }).errors.before);

  assert.deepEqual(messageRecipients(baseRow, 'agente', 'todos'), [{ userId: PARTNER }]);
  assert.deepEqual(messageRecipients(baseRow, 'conectado', 'agente'), [{ userId: AGENT }]);
  assert.deepEqual(messageRecipients(baseRow, 'agente', 'agente'), [], 'mensagem ao próprio lado não avisa o outro');
  const gov = { ...baseRow, party_kind: 'poder_publico', party_organization_id: ORG };
  assert.deepEqual(messageRecipients(gov, 'agente', 'conectado'), [{ organizationId: ORG }], 'o órgão inteiro é avisado');

  const shown = serializeMessage(storedMessage(), { viewerId: PARTNER });
  assert.equal(shown.mine, true);
  assert.deepEqual(shown.attachments.map((a) => a.ref), [`upload:${UPLOAD}`]);
  assert.equal(serializeMessage(storedMessage({ body: '[removido a pedido do titular]' })).anonymized, true);
});

test('mensagens: token, partes e terceiros (404)', async () => {
  await withServer(async (base) => {
    assert.equal((await send(base, 'GET', `/processes/${PROCESS}/messages`)).status, 401);
    const stranger = await send(base, 'GET', `/processes/${PROCESS}/messages`, undefined, auth(STRANGER, 'partner', 'marca'));
    assert.equal(stranger.status, 404);
    const strangerPost = await send(base, 'POST', `/processes/${PROCESS}/messages`, { body: 'Oi' }, auth(STRANGER, 'partner', 'marca'));
    assert.equal(strangerPost.status, 404);
    const gov = await send(base, 'GET', `/processes/${PROCESS}/messages`, undefined, auth(GOV, 'government', 'secretaria'));
    assert.equal(gov.status, 404, 'órgão não é parte de processo de Parceiro');
    const agent = await send(base, 'GET', `/processes/DM-2026-000184/messages`, undefined, auth(AGENT, 'agent', 'associacao'));
    assert.equal(agent.status, 200);
    assert.equal(agent.body.open, true);
    assert.equal(agent.body.messages[0].authorRoleLabel, 'Empresa');
    assert.equal(agent.body.messages[0].mine, false);
    assert.equal(agent.body.messages[0].attachments[0].fileName, 'Orçamento.pdf');
    assert.equal(agent.body.messages[0].attachments[0].url, null, 'sem bucket, sem URL');
    const bad = await send(base, 'GET', `/processes/${PROCESS}/messages?limit=0`, undefined, auth(AGENT, 'agent', 'associacao'));
    assert.equal(bad.status, 422);
  });
});

test('mensagem: retrato do autor, destinatário, anexo conferido e aviso ao outro lado', async () => {
  const pool = fakePool();
  await withServer(async (base) => {
    const h = auth(PARTNER, 'partner', 'empresa', 'Construtora Horizonte');
    const invalid = await send(base, 'POST', `/processes/${PROCESS}/messages`, { body: ' ', recipient: 'x' }, h);
    assert.equal(invalid.status, 422);
    assert.ok(invalid.body.fields.body && invalid.body.fields.recipient);
    const foreign = await send(base, 'POST', `/processes/${PROCESS}/messages`,
      { body: 'Segue', attachments: [`upload:${OTHER_UPLOAD}`] }, h);
    assert.equal(foreign.status, 422, 'anexo de outra demanda/processo');
    assert.ok(foreign.body.fields.attachments);
    const sent = await send(base, 'POST', `/processes/${PROCESS}/messages`,
      { body: 'Segue o orçamento.', recipient: 'agente', attachments: [`upload:${UPLOAD}`] }, h);
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.message.authorName, 'Construtora Horizonte');
    assert.equal(sent.body.message.authorRoleLabel, 'Empresa');
    assert.equal(sent.body.message.authorSide, 'conectado');
    assert.equal(sent.body.message.recipient, 'agente');
    assert.equal(sent.body.message.mine, true);
  }, { pool });
  const insert = pool.calls.find((c) => /INSERT INTO connection_process_messages/.test(c.text));
  assert.deepEqual(insert.params.slice(2, 9), [PARTNER, 'conectado', 'Construtora Horizonte', null, 'Empresa', 'agente', 'Segue o orçamento.']);
  const notice = pool.calls.find((c) => /notification_create\(/.test(c.text));
  assert.equal(notice.params[0], AGENT, 'o Agente é avisado');
  assert.equal(notice.params[1], 'nova_mensagem');
  assert.equal(notice.params[4], '/processos/DM-2026-000184');
});

test('mensagem do Agente ao órgão: instituição e cargo do cadastro; aviso ao órgão', async () => {
  const row = { ...baseRow, party_kind: 'poder_publico', party_user_id: GOV, party_organization_id: ORG, party_name: 'Secretaria de Obras' };
  const pool = fakePool({ row });
  await withServer(async (base) => {
    const sent = await send(base, 'POST', `/processes/${PROCESS}/messages`, { body: 'Podemos agendar a vistoria?' },
      auth(AGENT, 'agent', 'associacao', 'Ana'));
    assert.equal(sent.status, 201, JSON.stringify(sent.body));
    assert.equal(sent.body.message.authorOrganizationName, 'Associação Recreio Vivo');
    assert.equal(sent.body.message.authorRoleLabel, 'Presidente');
  }, { pool });
  assert.ok(pool.calls.some((c) => /notification_create_for_organization/.test(c.text) && c.params[0] === ORG));
});

test('processo encerrado não recebe mensagens (409)', async () => {
  await withServer(async (base) => {
    const res = await send(base, 'POST', `/processes/${PROCESS}/messages`, { body: 'Ainda dá?' }, auth(PARTNER, 'partner', 'empresa'));
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'process_closed');
  }, { pool: fakePool({ row: { ...baseRow, status: 'cancelada', closed_at: new Date() } }) });
});
