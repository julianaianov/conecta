const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I = require('../src/interest');
const { CATEGORIES, NEEDED_RESOURCE_TYPES } = require('../src/demand/constants');
const {
  createPartnerProfileClient, createConnectionsClient, createUserServiceCaller,
} = require('../src/interest/user-service');

// Vocabulário, validação e compatibilidade do interesse (T15).
const sql = fs.readFileSync(path.join(__dirname, '../migrations/012-demand-interests.sql'), 'utf8');
const userSql = fs.readFileSync(path.join(__dirname, '../../user-service/migrations/010-partner-profiles.sql'), 'utf8');

function enumValues(type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('enums da migração 012 = constantes do domínio (fonte: slides 9–11 e 22)', () => {
  assert.deepEqual(enumValues('demand_interest_kind'), I.INTEREST_KINDS);
  assert.deepEqual(enumValues('demand_interest_offer'), I.OFFER_TYPES);
  assert.deepEqual(enumValues('demand_interest_connection_status'), I.CONNECTION_STATUSES);
  assert.deepEqual(Object.keys(I.INTEREST_KIND_LABELS), I.INTEREST_KINDS);
  assert.deepEqual(Object.keys(I.OFFER_TYPE_LABELS), I.OFFER_TYPES);
  assert.deepEqual(I.OFFER_TYPES, ['recursos', 'produtos', 'servicos', 'conhecimento', 'estrutura', 'investimento']);
  // Estados abertos = os do trigger demand_interests_assert_open.
  const open = /st NOT IN \(([^)]*)\)/.exec(sql)[1];
  assert.deepEqual([...open.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), I.INTEREST_OPEN_STATUSES);
  for (const type of [...I.INTEREST_EVENT_TYPES, ...I.PRIVATE_INTEREST_EVENT_TYPES]) {
    assert.ok(sql.includes(`'${type}'`), `${type} gravado pelo trigger`);
  }
});

test('permissões por categoria seguem os slides 9–11', () => {
  assert.deepEqual(I.KINDS_BY_ROLE.partner, ['apoio']);
  assert.deepEqual(I.KINDS_BY_ROLE.government, ['apoio']);
  assert.deepEqual(I.KINDS_BY_ROLE.member, ['participacao', 'voluntariado']);
  assert.deepEqual(I.KINDS_BY_ROLE.agent, []);
  assert.deepEqual(I.KINDS_BY_ROLE.media, []);
  assert.deepEqual(I.OPPORTUNITY_ROLES, ['partner', 'government']);
  // CHECK demand_interests_kind_category igual ao mapa.
  assert.match(sql, /kind = 'apoio' AND user_category IN \('parceiro', 'poder_publico'\)/);
  assert.match(sql, /kind IN \('participacao', 'voluntariado'\) AND user_category = 'comunidade'/);
});

test('perfil de apoio no user_db usa os vocabulários da demanda', () => {
  const list = (name) => {
    const m = new RegExp(`CONSTRAINT partner_profiles_${name} CHECK \\(\\w+ <@ ARRAY\\[([^\\]]*)\\]`).exec(userSql);
    assert.ok(m, name);
    return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
  };
  assert.deepEqual(list('categories'), CATEGORIES);
  assert.deepEqual(list('resources'), NEEDED_RESOURCE_TYPES);
  assert.deepEqual(I.PARTNER_INTEREST_CATEGORIES, CATEGORIES);
  assert.deepEqual(I.PARTNER_OFFERED_RESOURCES, NEEDED_RESOURCE_TYPES);
});

test('validateInterest: tipo por papel, oferta obrigatória só no apoio, mensagem', () => {
  assert.deepEqual(I.validateInterest({ offerTypes: ['recursos', 'recursos', 'servicos'] }, 'partner'), {
    value: { kind: 'apoio', offerTypes: ['recursos', 'servicos'], message: null }, errors: {},
  });
  assert.ok(I.validateInterest({ kind: 'apoio' }, 'partner').errors.offerTypes);
  assert.ok(I.validateInterest({ kind: 'apoio', offerTypes: ['dinheiro'] }, 'partner').errors.offerTypes);
  assert.ok(I.validateInterest({ kind: 'voluntariado' }, 'partner').errors.kind);
  assert.ok(I.validateInterest({}, 'member').errors.kind, 'membro escolhe entre participar e voluntariar');
  assert.ok(I.validateInterest({ kind: 'participacao', offerTypes: ['recursos'] }, 'member').errors.offerTypes);
  assert.deepEqual(I.validateInterest({ kind: 'voluntariado', message: '  Sábados  ' }, 'member').value.message, 'Sábados');
  assert.ok(I.validateInterest({ kind: 'participacao', message: 'x'.repeat(2001) }, 'member').errors.message);
  assert.ok(I.validateInterest({ kind: 'apoio', offerTypes: ['recursos'] }, 'media').errors.kind);
  assert.ok(I.validateInterest({ kind: 'apoio', offerTypes: ['recursos'] }, 'agent').errors.kind);
});

test('validateConnectionRequest e tipo sugerido', () => {
  assert.deepEqual(I.validateConnectionRequest({ message: ' Olá ' }, 'resources'), { value: { type: 'resources', message: 'Olá' }, errors: {} });
  assert.ok(I.validateConnectionRequest({ message: '' }).errors.message);
  assert.ok(I.validateConnectionRequest({ message: 'x', type: 'foo' }).errors.type);
  assert.equal(I.connectionTypeFor('apoio', ['investimento', 'recursos']), 'sponsorship');
  assert.equal(I.connectionTypeFor('apoio', ['produtos']), 'resources');
  assert.equal(I.connectionTypeFor('apoio', ['conhecimento']), 'partnership');
  assert.equal(I.connectionTypeFor('voluntariado'), 'support');
});

const DEMAND = {
  territory: 'Recreio dos Bandeirantes', district: 'Recreio', municipality: 'Rio de Janeiro', uf: 'RJ',
  category: 'problema_urbano', neededResources: ['materiais', 'mao_de_obra', 'equipamentos'],
};

test('compatibilidade: território, categoria e recursos com motivos', () => {
  const full = I.computeCompatibility({
    municipalities: ['Rio de Janeiro/RJ'], territories: ['recreio dos bandeirantes'],
    interestCategories: ['problema_urbano'], offeredResources: ['materiais', 'mao_de_obra', 'equipamentos'],
  }, DEMAND);
  assert.equal(full.score, 100);
  assert.equal(full.maxScore, 100);
  assert.equal(full.level, 'alta');
  assert.equal(full.profileComplete, true);
  assert.deepEqual(full.reasons.map((r) => [r.criterion, r.points, r.maxPoints, r.matched]), [
    ['territorio', 40, 40, true], ['categoria', 30, 30, true], ['recursos', 30, 30, true],
  ]);
  assert.match(full.reasons[1].text, /Problema Urbano/);

  // Sem acento e sem diferença de caixa; município exige a UF.
  const accents = I.computeCompatibility({ municipalities: ['RIO DE JANEIRO/rj'] }, { ...DEMAND, municipality: 'Rio de Janeiro' });
  assert.equal(accents.reasons[0].points, 30);
  assert.equal(I.computeCompatibility({ municipalities: ['Rio de Janeiro/SP'] }, DEMAND).reasons[0].points, 0);
  assert.equal(I.computeCompatibility({ ufs: ['RJ'] }, DEMAND).reasons[0].points, 20);
  assert.equal(I.computeCompatibility({ nationwide: true }, DEMAND).reasons[0].points, 10);
  // Bairro de mesmo nome em outro município não conta.
  assert.equal(I.computeCompatibility({ territories: ['Recreio'], municipalities: ['Niterói/RJ'] }, DEMAND).reasons[0].points, 0);
  assert.equal(I.computeCompatibility({ territories: ['Recreio'] }, DEMAND).reasons[0].points, 40);
  assert.equal(I.normalizePlace('  Niterói '), 'niteroi');

  const partial = I.computeCompatibility({ offeredResources: ['materiais'], interestCategories: ['projeto_social'] }, DEMAND);
  assert.equal(partial.score, 10);
  assert.equal(partial.level, 'baixa');
  assert.match(partial.reasons[2].text, /1 de 3 recursos necessários: Materiais/);
  assert.match(partial.reasons[1].text, /não está entre as suas áreas/);

  const none = I.computeCompatibility(null, DEMAND);
  assert.equal(none.score, 0);
  assert.equal(none.level, 'nenhuma');
  assert.equal(none.profileComplete, false);
  assert.ok(none.reasons.every((r) => /perfil de apoio/.test(r.text)));

  const noNeeds = I.computeCompatibility({ offeredResources: ['materiais'] }, { ...DEMAND, neededResources: [] });
  assert.equal(noNeeds.reasons[2].text, 'A demanda não lista recursos necessários');
  assert.equal(I.computeCompatibility({ ufs: ['RJ'], interestCategories: ['problema_urbano'] }, DEMAND).level, 'media');
});

test('cliente do perfil de apoio: 404 e exists=false viram null; falha lança', async () => {
  const req = { headers: { authorization: 'Bearer t' } };
  const replies = [
    { status: 200, body: { exists: true, ufs: ['RJ'] } },
    { status: 200, body: { exists: false } },
    { status: 404, body: null },
    { status: 500, body: null },
  ];
  const calls = [];
  const client = createPartnerProfileClient({ call: async (r, method, p) => { calls.push([r, method, p]); return replies.shift(); } });
  assert.deepEqual(await client.get(req), { exists: true, ufs: ['RJ'] });
  assert.equal(await client.get(req), null);
  assert.equal(await client.get(req), null);
  await assert.rejects(client.get(req), /500/);
  assert.deepEqual(calls[0], [req, 'GET', '/me/partner-profile']);
});

test('cliente de conexões: repassa o token e traduz os erros do user-service', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    if (init.method === 'POST') {
      return { status: 201, json: async () => ({ id: 'c1', type: 'resources', status: 'pending', from: { userId: 'p' }, to: { userId: 'a' }, demandId: 'd1' }) };
    }
    if (url.endsWith('/forbidden')) return { status: 403, json: async () => ({ error: 'Validação', code: 'institution_not_validated' }) };
    if (url.endsWith('/conflict')) return { status: 409, json: async () => ({ error: 'Não permitido' }) };
    if (url.endsWith('/missing')) return { status: 404, json: async () => ({ error: 'Conexão não encontrada' }) };
    return { status: 502, json: async () => ({}) };
  };
  const client = createConnectionsClient({ baseUrl: 'http://user:3002/', fetchImpl });
  const req = { headers: { authorization: 'Bearer abc' } };
  const created = await client.create(req, { toUserId: 'a', demandId: 'd1' });
  assert.deepEqual(created, { id: 'c1', type: 'resources', status: 'pending', fromUserId: 'p', toUserId: 'a', demandId: 'd1', postId: null });
  assert.equal(seen[0].url, 'http://user:3002/connections');
  assert.equal(seen[0].init.headers.authorization, 'Bearer abc');
  assert.equal(JSON.parse(seen[0].init.body).demandId, 'd1');
  assert.equal(await client.get(req, 'missing'), null);
  await assert.rejects(client.get(req, 'forbidden'), (err) => err.status === 403 && err.body.code === 'institution_not_validated');
  await assert.rejects(client.update(req, 'conflict', 'accepted'), (err) => err.status === 409 && err.body.code === 'connection_conflict');
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(client.get(req, 'down'), (err) => err.status === 503 && err.body.code === 'connections_unavailable');
    const noUrl = createConnectionsClient({ baseUrl: '' });
    await assert.rejects(noUrl.get(req, 'x'), (err) => err.status === 503);
  } finally {
    console.error = originalError;
  }
  assert.equal(typeof createUserServiceCaller(), 'function');
});
