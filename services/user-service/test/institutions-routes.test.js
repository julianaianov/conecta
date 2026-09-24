const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const {
  PUBLIC_ORG_COLUMNS, OWNER_ORG_COLUMNS, DIRECTORY_COLUMNS, governmentDirectoryQuery,
} = require('../src/routes/institutions');
const { AGENT_INPUT, GOV_INPUT } = require('./institution-fixtures');

const SECRET = 'user-service-test-secret-0123456789abcdef';
const ANA = '11111111-1111-1111-1111-111111111111';
const PREF = '22222222-2222-2222-2222-222222222222';
const OTHER = '33333333-3333-3333-3333-333333333333';

const token = (userId, role, profileType) => jwt.sign({ userId, name: 'Pessoa', role, profileType }, SECRET);
const headers = (userId, role, profileType) => ({
  authorization: `Bearer ${token(userId, role, profileType)}`,
  'content-type': 'application/json',
});

/**
 * Banco em memória que responde às consultas das rotas institucionais e imita
 * o trigger da migração 008 no envio (submitted_at, evento do titular).
 */
function createPool({ orgs = [], failStatus = false } = {}) {
  const state = {
    profiles: [{ id: 'p-ana', user_id: ANA }, { id: 'p-pref', user_id: PREF }],
    orgs: orgs.map((o) => ({ ...o })),
    reps: [],
    events: [],
    calls: [],
  };
  const byUser = (userId) => {
    const profile = state.profiles.find((p) => p.user_id === userId);
    return state.orgs.find((o) => profile && o.profile_id === profile.id && o.institution_kind);
  };
  const query = async (text, params = []) => {
    state.calls.push({ text, params });
    const sql = text.replace(/\s+/g, ' ').trim();
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.startsWith('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
    if (sql.startsWith('SELECT id FROM profiles WHERE user_id')) {
      return { rows: state.profiles.filter((p) => p.user_id === params[0]).map((p) => ({ id: p.id })) };
    }
    if (sql.startsWith('SELECT id, institution_kind, validation_status FROM organizations')) {
      return { rows: state.orgs.filter((o) => o.profile_id === params[0] && o.institution_kind) };
    }
    // Vínculo ativo (T29): nenhum nas fixturas deste arquivo.
    if (sql.startsWith('SELECT m.id AS member_id')) return { rows: [] };
    if (sql.startsWith('SELECT o.institution_kind, o.validation_status')) {
      if (failStatus) throw new Error('banco indisponível');
      const org = byUser(params[0]);
      return { rows: org ? [{ ...org, organization_id: org.id }] : [] };
    }
    if (sql.startsWith('SELECT o.id, o.institution_kind, o.validation_status')) {
      const org = byUser(params[0]);
      return { rows: org ? [org] : [] };
    }
    if (sql.startsWith('INSERT INTO organizations')) {
      const cols = sql.match(/\(([^)]+)\) VALUES/)[1].split(',').map((c) => c.trim());
      const org = { id: `org-${state.orgs.length + 1}`, validation_status: 'pendente' };
      cols.forEach((c, i) => { if (i < params.length) org[c] = params[i]; });
      org.validation_status = 'pendente';
      state.orgs.push(org);
      state.events.push({ organization_id: org.id, from_status: null, to_status: 'pendente', actor_type: 'titular' });
      return { rows: [{ id: org.id }] };
    }
    if (sql.startsWith('UPDATE organizations SET validation_status')) {
      const org = state.orgs.find((o) => o.id === params[0]);
      state.events.push({ organization_id: org.id, from_status: org.validation_status, to_status: 'em_analise', actor_type: 'titular' });
      Object.assign(org, { validation_status: 'em_analise', validation_note: null, submitted_at: 'agora' });
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('UPDATE organizations')) {
      const org = state.orgs.find((o) => o.id === params[0]);
      const sets = sql.match(/SET (.+) WHERE/)[1].split(',').map((s) => s.trim());
      for (const set of sets) {
        const m = set.match(/^(\w+) = \$(\d+)$/);
        if (m) org[m[1]] = params[Number(m[2]) - 1];
      }
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith('INSERT INTO organization_representatives')) {
      const [organization_id, user_id, full_name, position, institutional_email, institutional_phone,
        proof_document_ref, proof_description] = params;
      const rep = { organization_id, user_id, full_name, position, institutional_email, institutional_phone, proof_document_ref, proof_description };
      state.reps = state.reps.filter((r) => r.organization_id !== organization_id).concat(rep);
      return { rows: [] };
    }
    if (sql.startsWith('SELECT 1 FROM organization_representatives')) {
      return { rows: state.reps.filter((r) => r.organization_id === params[0]).map(() => ({ '?column?': 1 })) };
    }
    if (sql.includes('FROM organization_representatives WHERE organization_id')) {
      return { rows: state.reps.filter((r) => r.organization_id === params[0]) };
    }
    if (sql.includes('FROM organization_validation_events')) {
      return { rows: state.events.filter((e) => e.organization_id === params[0]) };
    }
    if (sql.startsWith(`SELECT ${OWNER_ORG_COLUMNS.map((c) => `o.${c}`).join(', ')}`)) {
      const org = byUser(params[0]);
      return { rows: org ? [Object.fromEntries(OWNER_ORG_COLUMNS.map((c) => [c, org[c] ?? null]))] : [] };
    }
    if (sql.startsWith('SELECT o.id AS organization_id')) {
      // Diretório do Poder Público (T14): só validados; por id ($1) ou busca.
      const list = state.orgs.filter((o) => o.institution_kind === 'poder_publico' && o.validation_status === 'validada'
        && sql.includes("o.validation_status = 'validada'") && sql.includes("o.institution_kind = 'poder_publico'"));
      const project = (o) => ({ organization_id: o.id, ...Object.fromEntries(DIRECTORY_COLUMNS.map((c) => [c, o[c] ?? null])) });
      if (sql.includes('WHERE o.id = $1')) return { rows: list.filter((o) => o.id === params[0]).map(project) };
      return { rows: list.map(project) };
    }
    if (sql.startsWith(`SELECT ${PUBLIC_ORG_COLUMNS.map((c) => `o.${c}`).join(', ')}`)) {
      if (sql.includes('FROM organization_members m')) return { rows: [] };
      const org = byUser(params[0]);
      if (!org || org.validation_status !== 'validada' || !sql.includes("validation_status = 'validada'")) return { rows: [] };
      return { rows: [Object.fromEntries(PUBLIC_ORG_COLUMNS.map((c) => [c, org[c] ?? null]))] };
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  const pool = { query, connect: async () => ({ query, release() {} }), state };
  return pool;
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, operationUserIds: new Set() }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('Agente cria o cadastro (pendente), lê com trilha e envia para validação', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const h = headers(ANA, 'agent', 'associacao');
    let res = await fetch(`${base}/me/institution`, { headers: h });
    assert.equal(res.status, 404);

    res = await fetch(`${base}/me/institution`, { method: 'PUT', headers: h, body: JSON.stringify(AGENT_INPUT) });
    assert.equal(res.status, 201);
    let body = await res.json();
    assert.equal(body.institution_kind, 'agente_transformacao');
    assert.equal(body.validation_status, 'pendente');
    assert.equal(body.cnpj, '11222333000181');
    assert.equal(body.cnae_primary, '9430800');
    assert.equal(body.representative.full_name, 'Ana Souza');
    assert.equal(body.representative.institutional_phone, '21999990000');
    assert.deepEqual(body.events.map((e) => e.to_status), ['pendente']);
    const org = pool.state.orgs[0];
    assert.equal(org.org_name, 'AMBV', 'org_name alimenta a listagem atual do dm-gestao');
    assert.equal(org.category, 'associacao');
    assert.match(org.address, /Rua da Assembleia, 10 — Centro — Rio de Janeiro\/RJ — CEP 20040-020/);

    res = await fetch(`${base}/me/institution`, {
      method: 'PUT', headers: h, body: JSON.stringify({ ...AGENT_INPUT, tradeName: 'AMBV Rio' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).trade_name, 'AMBV Rio');

    res = await fetch(`${base}/me/institution/submit`, { method: 'POST', headers: h });
    assert.equal(res.status, 200);
    body = await res.json();
    assert.equal(body.validation_status, 'em_analise');
    assert.deepEqual(body.events.map((e) => e.to_status), ['pendente', 'em_analise']);
    assert.equal(body.validation_reviewed_by, undefined, 'quem validou não sai para o titular');

    // Em análise: não edita nem reenvia.
    res = await fetch(`${base}/me/institution`, { method: 'PUT', headers: h, body: JSON.stringify(AGENT_INPUT) });
    assert.equal(res.status, 409);
    res = await fetch(`${base}/me/institution/submit`, { method: 'POST', headers: h });
    assert.equal(res.status, 409);
    assert.equal((await res.json()).validationStatus, 'em_analise');
  });
});

test('PUT valida o payload (422 com erros por campo) e recusa categorias sem cadastro institucional', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    let res = await fetch(`${base}/me/institution`, {
      method: 'PUT', headers: headers(ANA, 'agent', 'ong'), body: JSON.stringify({ ...AGENT_INPUT, cnpj: '11.222.333/0001-80' }),
    });
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.ok(body.fields.cnpj);
    res = await fetch(`${base}/me/institution`, {
      method: 'PUT', headers: headers(ANA, 'partner', 'empresa'), body: JSON.stringify(AGENT_INPUT),
    });
    assert.equal(res.status, 403);
    res = await fetch(`${base}/me/institution`, {
      method: 'PUT', headers: headers(ANA, 'member', 'morador'), body: JSON.stringify(AGENT_INPUT),
    });
    assert.equal(res.status, 403);
  });
  assert.equal(pool.state.orgs.length, 0);
});

test('Líder Comunitário vincula o perfil a uma instituição com CNPJ (decisão 3)', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/institution`, {
      method: 'PUT',
      headers: headers(ANA, 'agent', 'lider_comunitario'),
      body: JSON.stringify({
        ...AGENT_INPUT,
        representative: { ...AGENT_INPUT.representative, position: 'Líder comunitário vinculado', proofDocumentRef: 'uploads/declaracao.pdf' },
      }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.institution_kind, 'agente_transformacao');
    assert.equal(body.representative.proof_document_ref, 'uploads/declaracao.pdf');
    assert.equal(pool.state.orgs[0].category, 'lider_comunitario');
  });
});

test('Poder Público: cadastro com esfera, território, competência e representante', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const h = headers(PREF, 'government', 'prefeitura');
    const res = await fetch(`${base}/me/institution`, { method: 'PUT', headers: h, body: JSON.stringify(GOV_INPUT) });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.institution_kind, 'poder_publico');
    assert.equal(body.government_sphere, 'municipal');
    assert.deepEqual(body.competence_areas, ['Meio ambiente', 'Saneamento']);
    assert.equal(body.department, 'Secretaria de Meio Ambiente');
    assert.equal(body.representative.institutional_email, 'carlos@exemplo.sp.gov.br');

    const status = await (await fetch(`${base}/me/institution/status`, { headers: h })).json();
    assert.deepEqual(status, {
      kind: 'poder_publico', status: 'pendente', requiredKind: 'poder_publico', canActInstitutionally: false, organizationId: body.id,
      // Sem vínculo (T29): a delegação vem nula.
      delegation: null,
    });
  });
});

test('cadastro validado não é editado pelo titular; devolvido e revogado voltam a ser editáveis', async () => {
  for (const [status, expected] of [['validada', 409], ['devolvida', 200], ['revogada', 200]]) {
    const pool = createPool({ orgs: [{ id: 'org-1', profile_id: 'p-ana', institution_kind: 'agente_transformacao', validation_status: status }] });
    await withServer(pool, async (base) => {
      const res = await fetch(`${base}/me/institution`, {
        method: 'PUT', headers: headers(ANA, 'agent', 'ong'), body: JSON.stringify(AGENT_INPUT),
      });
      assert.equal(res.status, expected, status);
    });
  }
});

test('tipo do cadastro não muda com a categoria do token', async () => {
  const pool = createPool({ orgs: [{ id: 'org-1', profile_id: 'p-ana', institution_kind: 'agente_transformacao', validation_status: 'pendente' }] });
  await withServer(pool, async (base) => {
    const res = await fetch(`${base}/me/institution`, {
      method: 'PUT', headers: headers(ANA, 'government', 'secretaria'), body: JSON.stringify(GOV_INPUT),
    });
    assert.equal(res.status, 409);
  });
});

test('rota pública mostra só instituição validada e nunca contatos ou representante', async () => {
  const validated = {
    id: 'org-1', profile_id: 'p-pref', institution_kind: 'poder_publico', validation_status: 'validada',
    cnpj: '12ABC34501DE35', legal_name: 'Prefeitura', institutional_email: 'privado@exemplo.gov.br',
    institutional_phone: '1133334444', street: 'Rua Privada', validation_note: 'nota interna',
    validation_reviewed_by: 'admin@gestao',
  };
  await withServer(createPool({ orgs: [validated] }), async (base) => {
    const res = await fetch(`${base}/${PREF}/institution`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.cnpj, '12ABC34501DE35');
    for (const key of ['institutional_email', 'institutional_phone', 'street', 'cep', 'validation_note',
      'validation_reviewed_by', 'representative', 'id']) {
      assert.ok(!(key in body), `${key} não pode ser público`);
    }
  });
  await withServer(createPool({ orgs: [{ ...validated, validation_status: 'em_analise' }] }), async (base) => {
    assert.equal((await fetch(`${base}/${PREF}/institution`)).status, 404);
    assert.equal((await fetch(`${base}/nao-e-uuid/institution`)).status, 404);
  });
  for (const column of ['institutional_email', 'institutional_phone', 'street', 'address_number', 'cep', 'validation_note']) {
    assert.ok(!PUBLIC_ORG_COLUMNS.includes(column), column);
  }
});

test('referência do formulário é pública', async () => {
  await withServer(createPool(), async (base) => {
    const body = await (await fetch(`${base}/institutions/reference`)).json();
    assert.deepEqual(body.validationStatuses, ['pendente', 'em_analise', 'validada', 'devolvida', 'revogada']);
    assert.deepEqual(body.governmentSpheres, ['municipal', 'estadual', 'federal']);
    assert.ok(body.cnaeReference.length > 0);
    assert.equal(body.ufs.length, 27);
  });
});

test('Poder Público sem validação não solicita conexão; validado passa pelo gate', async () => {
  const request = (base, h) => fetch(`${base}/connections`, {
    method: 'POST', headers: h, body: JSON.stringify({ toUserId: OTHER, type: 'support', message: 'Olá' }),
  });
  // Sem cadastro e em análise: 403 antes de qualquer escrita.
  for (const orgs of [[], [{ id: 'o', profile_id: 'p-pref', institution_kind: 'poder_publico', validation_status: 'em_analise' }]]) {
    const pool = createPool({ orgs });
    await withServer(pool, async (base) => {
      const res = await request(base, headers(PREF, 'government', 'prefeitura'));
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.code, 'institution_not_validated');
      assert.equal(body.validationStatus, orgs[0]?.validation_status ?? null);
    });
    assert.ok(!pool.state.calls.some(({ text }) => text.includes('INSERT INTO connections')));
  }
  // Validado: o gate libera e a rota segue (o banco em memória não conhece conexões).
  const pool = createPool({ orgs: [{ id: 'o', profile_id: 'p-pref', institution_kind: 'poder_publico', validation_status: 'validada' }] });
  await withServer(pool, async (base) => {
    await request(base, headers(PREF, 'government', 'prefeitura'));
  });
  assert.ok(pool.state.calls.some(({ text }) => text.includes('INSERT INTO connections')));
  // Falha ao consultar: fechado (503).
  await withServer(createPool({ failStatus: true }), async (base) => {
    assert.equal((await request(base, headers(PREF, 'government', 'orgao_publico'))).status, 503);
  });
  // Outras categorias não passam pelo gate institucional.
  const memberPool = createPool();
  await withServer(memberPool, async (base) => {
    await request(base, headers(ANA, 'member', 'morador'));
  });
  assert.ok(!memberPool.state.calls.some(({ text }) => text.includes('o.institution_kind, o.validation_status')));
});

test('diretório do Poder Público (T14): só órgão validado, sem contatos, para o Poder Público validado', async () => {
  const GOV_ORG = '44444444-4444-4444-8444-444444444444';
  const orgs = [
    { id: 'org-pref', profile_id: 'p-pref', institution_kind: 'poder_publico', validation_status: 'validada', legal_name: 'Prefeitura de Niterói' },
    {
      id: GOV_ORG, profile_id: 'p-outro', institution_kind: 'poder_publico', validation_status: 'validada',
      legal_name: 'Secretaria de Obras', trade_name: 'SMO', government_sphere: 'municipal', municipality: 'Niterói', uf: 'RJ',
      institutional_email: 'privado@exemplo.gov.br', institutional_phone: '2133334444', cnpj: '12ABC34501DE35',
    },
    { id: 'org-analise', profile_id: 'p-x', institution_kind: 'poder_publico', validation_status: 'em_analise', legal_name: 'Em análise' },
    { id: 'org-agente', profile_id: 'p-ana', institution_kind: 'agente_transformacao', validation_status: 'validada', legal_name: 'ONG' },
  ];
  await withServer(createPool({ orgs }), async (base) => {
    const member = await fetch(`${base}/institutions/government`, { headers: headers(OTHER, 'member', 'morador') });
    assert.equal(member.status, 403);
    assert.equal((await member.json()).code, 'not_government');
    assert.equal((await fetch(`${base}/institutions/government`)).status, 401);
    const res = await fetch(`${base}/institutions/government`, { headers: headers(PREF, 'government', 'prefeitura') });
    assert.equal(res.status, 200);
    const { organizations } = await res.json();
    assert.deepEqual(organizations.map((o) => o.organization_id).sort(), [GOV_ORG, 'org-pref'].sort());
    for (const o of organizations) {
      for (const key of ['institutional_email', 'institutional_phone', 'cnpj', 'street', 'representative']) {
        assert.ok(!(key in o), `${key} não sai no diretório`);
      }
    }
    const one = await fetch(`${base}/institutions/government/${GOV_ORG}`, { headers: headers(PREF, 'government', 'prefeitura') });
    assert.equal(one.status, 200);
    assert.equal((await one.json()).trade_name, 'SMO');
    assert.equal((await fetch(`${base}/institutions/government/nao-e-uuid`, { headers: headers(PREF, 'government', 'prefeitura') })).status, 404);
    const missing = await fetch(`${base}/institutions/government/55555555-5555-4555-8555-555555555555`, { headers: headers(PREF, 'government', 'prefeitura') });
    assert.equal(missing.status, 404);
    const bad = await fetch(`${base}/institutions/government?sphere=distrital`, { headers: headers(PREF, 'government', 'prefeitura') });
    assert.equal(bad.status, 422);
  });
  // Poder Público sem validação não consulta o diretório.
  const pending = orgs.map((o) => (o.id === 'org-pref' ? { ...o, validation_status: 'em_analise' } : o));
  await withServer(createPool({ orgs: pending }), async (base) => {
    const res = await fetch(`${base}/institutions/government`, { headers: headers(PREF, 'government', 'prefeitura') });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'institution_not_validated');
  });
  for (const column of ['institutional_email', 'institutional_phone', 'cnpj', 'street', 'cep']) {
    assert.ok(!DIRECTORY_COLUMNS.includes(column), column);
  }
});

test('busca do diretório: filtros parametrizados, curinga escapado e ordem alfabética', () => {
  const { sql, params, errors } = governmentDirectoryQuery({ q: '50%_obras', sphere: 'municipal', municipality: 'Niterói', uf: 'rj', limit: '5' });
  assert.deepEqual(errors, {});
  assert.deepEqual(params, ['%50\\%\\_obras%', 'municipal', '%Niterói%', 'RJ', 5]);
  assert.match(sql, /o.validation_status = 'validada'/);
  assert.match(sql, /ORDER BY lower\(coalesce\(o.trade_name, o.legal_name\)\), o.id/);
  assert.ok(!/SELECT \*/.test(sql));
  const bad = governmentDirectoryQuery({ uf: 'Rio', limit: '500', sphere: 'x' });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['limit', 'sphere', 'uf']);
});
