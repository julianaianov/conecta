// Perfil empresarial (Parceiro) e perfil da Comunicação (T-04-03; decisão 18).
// Os perfis abaixo existem só neste teste.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const {
  validateBusinessProfile, validateMediaProfile, publicDeclaredProfile, declaredKindForUser, DECLARATION_NOTICE,
} = require('../src/declared-profiles');

const SECRET = 'user-service-test-secret-0123456789abcdef';
const EMPRESA = '11111111-1111-4111-8111-111111111111';
const JORNAL = '22222222-2222-4222-8222-222222222222';
const MORADOR = '33333333-3333-4333-8333-333333333333';

const headers = (userId, role, profileType) => ({
  authorization: `Bearer ${jwt.sign({ userId, name: 'Pessoa', role, profileType }, SECRET)}`,
  'content-type': 'application/json',
});

function createPool() {
  const state = {
    profiles: {
      [EMPRESA]: { role: 'partner', profile_type: 'empresa', anonymized_at: null },
      [JORNAL]: { role: 'media', profile_type: 'jornalista', anonymized_at: null },
      [MORADOR]: { role: 'member', profile_type: 'morador', anonymized_at: null },
    },
    business_profiles: {},
    media_profiles: {},
  };
  const query = async (text, params = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();
    if (sql.startsWith('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
    const upsert = /^INSERT INTO (business_profiles|media_profiles) \(user_id, ([^)]+)\)/.exec(sql);
    if (upsert) {
      const cols = upsert[2].split(',').map((c) => c.trim());
      const row = { updated_at: '2026-09-25T12:00:00.000Z' };
      cols.forEach((c, i) => { row[c] = params[i + 1]; });
      state[upsert[1]][params[0]] = row;
      return { rows: [row] };
    }
    const select = /FROM (business_profiles|media_profiles) WHERE user_id = \$1$/.exec(sql);
    if (select) {
      const row = state[select[1]][params[0]];
      return { rows: row ? [row] : [] };
    }
    if (sql.startsWith('SELECT p.role, p.profile_type')) {
      const p = state.profiles[params[0]];
      if (!p || p.anonymized_at) return { rows: [] };
      const b = state.business_profiles[params[0]] ?? {};
      const m = state.media_profiles[params[0]] ?? {};
      return {
        rows: [{
          role: p.role, profile_type: p.profile_type,
          company_name: b.company_name ?? null, cnpj: b.cnpj ?? null, segment: b.segment ?? null,
          business_description: b.description ?? null, business_website: b.website ?? null,
          outlet_name: m.outlet_name ?? null, coverage_area: m.coverage_area ?? null,
          media_description: m.description ?? null, media_website: m.website ?? null,
        }],
      };
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  };
  return { query, connect: async () => ({ query, release() {} }), state };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, operationUserIds: new Set() }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('validação do perfil empresarial e do perfil da Comunicação', () => {
  const ok = validateBusinessProfile({
    companyName: ' Padaria do Bairro Ltda ', cnpj: '11.222.333/0001-81', segment: 'Alimentação', website: 'https://padaria.com.br',
  });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.value.company_name, 'Padaria do Bairro Ltda');
  assert.equal(ok.value.cnpj, '11222333000181');
  assert.equal(validateBusinessProfile({ companyName: 'X' }).value.cnpj, null, 'CNPJ é opcional');
  const bad = validateBusinessProfile({ cnpj: '11.222.333/0001-82', website: 'padaria.com', description: 'x'.repeat(2001) });
  assert.deepEqual(Object.keys(bad.errors).sort(), ['cnpj', 'companyName', 'description', 'website']);

  const media = validateMediaProfile({ outletName: 'Jornal do Bairro', professionalRegistry: 'MTb 12345', coverageArea: 'Zona Oeste' });
  assert.deepEqual(media.errors, {});
  assert.ok(validateMediaProfile({}).errors.outletName);

  assert.equal(declaredKindForUser({ role: 'partner', profileType: 'empresa' }), 'empresarial');
  assert.equal(declaredKindForUser({ role: 'media', profileType: 'imprensa' }), 'comunicacao');
  assert.equal(declaredKindForUser({ role: 'member', profileType: 'morador' }), null);

  const pub = publicDeclaredProfile('comunicacao', { outlet_name: 'Jornal', professional_registry: 'MTb 1', coverage_area: 'Centro' });
  assert.equal('professionalRegistry' in pub, false, 'registro profissional não é público');
  assert.equal(pub.declaration, DECLARATION_NOTICE);
  assert.equal(publicDeclaredProfile('empresarial', { company_name: 'X', cnpj: '11222333000181' }).cnpj, '11.222.333/0001-81');
});

test('Parceiro grava e lê o perfil empresarial; outras categorias recebem 403', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const h = headers(EMPRESA, 'partner', 'empresa');
    let res = await fetch(`${base}/me/business-profile`, { headers: h });
    assert.deepEqual(await res.json(), { exists: false, profile: null });

    res = await fetch(`${base}/me/business-profile`, { method: 'PUT', headers: h, body: JSON.stringify({ cnpj: '123' }) });
    assert.equal(res.status, 422);
    assert.deepEqual(Object.keys((await res.json()).fields).sort(), ['cnpj', 'companyName']);

    res = await fetch(`${base}/me/business-profile`, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ companyName: 'Padaria do Bairro Ltda', cnpj: '11222333000181', segment: 'Alimentação' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.profile.companyName, 'Padaria do Bairro Ltda');
    assert.equal(body.profile.declaration, 'informado pela própria conta');

    res = await fetch(`${base}/me/business-profile`, {
      method: 'PUT', headers: headers(JORNAL, 'media', 'jornalista'), body: JSON.stringify({ companyName: 'X' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).code, 'business_profile_forbidden');
    res = await fetch(`${base}/me/media-profile`, {
      method: 'PUT', headers: headers(MORADOR, 'member', 'morador'), body: JSON.stringify({ outletName: 'X' }),
    });
    assert.equal(res.status, 403);
    assert.equal((await fetch(`${base}/me/business-profile`)).status, 401);

    // Público: nome, CNPJ formatado e segmento, com o aviso; sem token.
    res = await fetch(`${base}/profiles/${EMPRESA}/declared`);
    assert.equal(res.status, 200);
    const pub = await res.json();
    assert.deepEqual(pub, {
      kind: 'empresarial', name: 'Padaria do Bairro Ltda', cnpj: '11.222.333/0001-81', segment: 'Alimentação',
      description: null, website: null, declaration: 'informado pela própria conta',
    });
  });
});

test('Comunicação grava o perfil profissional; a projeção pública não traz o registro', async () => {
  const pool = createPool();
  await withServer(pool, async (base) => {
    const h = headers(JORNAL, 'media', 'jornalista');
    const res = await fetch(`${base}/me/media-profile`, {
      method: 'PUT', headers: h,
      body: JSON.stringify({ outletName: 'Jornal do Bairro', professionalRegistry: 'MTb 12345', coverageArea: 'Zona Oeste', website: 'https://jornal.org' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).profile.professionalRegistry, 'MTb 12345');
    const own = await (await fetch(`${base}/me/media-profile`, { headers: h })).json();
    assert.equal(own.exists, true);

    const pub = await (await fetch(`${base}/profiles/${JORNAL}/declared`)).json();
    assert.equal(pub.kind, 'comunicacao');
    assert.equal(pub.name, 'Jornal do Bairro');
    assert.equal(pub.coverageArea, 'Zona Oeste');
    assert.equal('professionalRegistry' in pub, false);

    // Sem perfil, conta de outra categoria, anonimizada ou id inválido: 404.
    assert.equal((await fetch(`${base}/profiles/${EMPRESA}/declared`)).status, 404);
    assert.equal((await fetch(`${base}/profiles/${MORADOR}/declared`)).status, 404);
    assert.equal((await fetch(`${base}/profiles/nao-e-uuid/declared`)).status, 404);
    pool.state.profiles[JORNAL].anonymized_at = new Date();
    assert.equal((await fetch(`${base}/profiles/${JORNAL}/declared`)).status, 404);
  });
});
