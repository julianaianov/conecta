const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { createApp } = require('../src');
const P = require('../src/partner-profile');
const postDemand = require('../../post-service/src/demand/constants');
const postInterest = require('../../post-service/src/interest/constants');

// Perfil de apoio (T15) e vínculo conexão ↔ demanda.

const SECRET = 'test_jwt_secret';
const USER_ID = '11111111-1111-1111-1111-111111111111';
const AGENT_ID = '22222222-2222-2222-2222-222222222222';
const DEMAND_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const token = (role, profileType) => jwt.sign({ userId: USER_ID, name: 'Construtora Horizonte', role, profileType }, SECRET);

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, uploadStorage: null }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('vocabulários iguais aos da demanda no post-service', () => {
  assert.deepEqual(P.INTEREST_CATEGORIES, postDemand.CATEGORIES);
  assert.deepEqual(P.OFFERED_RESOURCES, postDemand.NEEDED_RESOURCE_TYPES);
  assert.deepEqual(P.INTEREST_CATEGORIES, postInterest.PARTNER_INTEREST_CATEGORIES);
  assert.deepEqual(P.OFFERED_RESOURCES, postInterest.PARTNER_OFFERED_RESOURCES);
  assert.deepEqual(P.PARTNER_PROFILE_ROLES, postInterest.OPPORTUNITY_ROLES);
  assert.equal(P.UFS.length, 27);
});

test('validatePartnerProfile normaliza e recusa valores fora da lista', () => {
  const { value, errors } = P.validatePartnerProfile({
    nationwide: false,
    ufs: ['rj', 'RJ', 'sp'],
    municipalities: ['  Rio  de Janeiro/rj ', 'rio de janeiro/RJ', 'Niterói/RJ'],
    territories: ['Recreio dos Bandeirantes', 'recreio dos bandeirantes', ' '],
    interestCategories: ['problema_urbano', 'problema_urbano'],
    offeredResources: ['materiais'],
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(value, {
    nationwide: false,
    ufs: ['RJ', 'SP'],
    municipalities: ['Rio de Janeiro/RJ', 'Niterói/RJ'],
    territories: ['Recreio dos Bandeirantes'],
    interestCategories: ['problema_urbano'],
    offeredResources: ['materiais'],
  });
  const bad = P.validatePartnerProfile({
    nationwide: 'sim', ufs: ['XX'], municipalities: ['Rio de Janeiro'], territories: 'Centro',
    interestCategories: ['esporte'], offeredResources: ['equipe'],
  });
  assert.deepEqual(Object.keys(bad.errors).sort(), [
    'interestCategories', 'municipalities', 'nationwide', 'offeredResources', 'territories', 'ufs',
  ]);
  assert.ok(P.validatePartnerProfile({ territories: Array.from({ length: 31 }, (_, i) => `Bairro ${i}`) }).errors.territories);
  assert.equal(P.canHavePartnerProfile({ role: 'partner', profileType: 'empresa' }), true);
  assert.equal(P.canHavePartnerProfile({ role: 'government', profileType: 'prefeitura' }), true);
  assert.equal(P.canHavePartnerProfile({ role: 'member', profileType: 'morador' }), false);
});

test('GET /me/partner-profile: sem perfil devolve listas vazias; exige token', async () => {
  const pool = {
    async query(text, params) {
      if (text.includes('FROM partner_profiles WHERE user_id = $1')) {
        assert.equal(params[0], USER_ID);
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    assert.equal((await fetch(`${base}/me/partner-profile`)).status, 401);
    const res = await fetch(`${base}/me/partner-profile`, { headers: { authorization: `Bearer ${token('member', 'morador')}` } });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.exists, false);
    assert.equal(body.editable, false);
    assert.deepEqual(body.offeredResources, []);
  });
});

test('PUT /me/partner-profile grava para Parceiro e recusa quem não filtra oportunidades', async () => {
  let saved = null;
  const pool = {
    async query(text, params) {
      if (text.includes('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO partner_profiles')) {
        saved = params;
        return { rows: [], rowCount: 1 };
      }
      if (text.includes('FROM partner_profiles WHERE user_id = $1')) {
        return {
          rows: [{
            user_id: USER_ID, nationwide: saved[1], ufs: saved[2], municipalities: saved[3], territories: saved[4],
            interest_categories: saved[5], offered_resources: saved[6], updated_at: new Date('2026-09-22T12:00:00Z'),
          }],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const put = (body, t) => fetch(`${base}/me/partner-profile`, {
      method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(body),
    });
    const member = await put({ ufs: ['RJ'] }, token('member', 'morador'));
    assert.equal(member.status, 403);
    assert.equal((await member.json()).code, 'partner_profile_forbidden');
    const invalid = await put({ municipalities: ['Rio'] }, token('partner', 'empresa'));
    assert.equal(invalid.status, 422);
    assert.ok((await invalid.json()).fields.municipalities);
    assert.equal(saved, null, 'nada gravado nas recusas');

    const ok = await put({
      municipalities: ['Rio de Janeiro/RJ'], territories: ['Recreio'], interestCategories: ['problema_urbano'],
      offeredResources: ['materiais', 'mao_de_obra'],
    }, token('partner', 'empresa'));
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.exists, true);
    assert.equal(body.editable, true);
    assert.deepEqual(body.municipalities, ['Rio de Janeiro/RJ']);
    assert.deepEqual(body.offeredResources, ['materiais', 'mao_de_obra']);
    assert.equal(body.updatedAt, '2026-09-22T12:00:00.000Z');
    assert.equal(saved[0], USER_ID);
  });
});

test('POST /connections guarda a demanda de origem e a devolve como demandId', async () => {
  let inserted = null;
  const pool = {
    async query(text, params) {
      if (text.includes('INSERT INTO profiles')) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO connections')) {
        inserted = params;
        return { rows: [{ id: 'cx-1' }] };
      }
      if (text.includes('FROM connections c') && text.includes('WHERE c.id = $1')) {
        assert.match(text, /c\.demand_id/);
        return {
          rows: [{
            id: 'cx-1', type: 'resources', status: 'pending', message: 'Oi', post_id: null, post_title: 'Calçada',
            demand_id: inserted[6], outcome: null, events: [], created_at: 'x', updated_at: 'x',
            from_user_id: USER_ID, to_user_id: AGENT_ID,
          }],
        };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  };
  await withServer(pool, async (base) => {
    const post = (body) => fetch(`${base}/connections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token('partner', 'empresa')}` },
      body: JSON.stringify(body),
    });
    assert.equal((await post({ toUserId: AGENT_ID, type: 'resources', message: 'Oi', demandId: 'x' })).status, 400);
    const res = await post({ toUserId: AGENT_ID, type: 'resources', message: 'Oi', postTitle: 'Calçada', demandId: DEMAND_ID.toUpperCase() });
    assert.equal(res.status, 201);
    assert.equal(inserted[6], DEMAND_ID);
    assert.equal((await res.json()).demandId, DEMAND_ID);
  });
});
