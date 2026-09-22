const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src');
const {
  AUDIENCES, CLUSTER_THRESHOLD, LEGEND, cellSizeDegrees, territorySlug,
} = require('../src/map/constants');
const { CATEGORIES, PUBLIC_STATUSES } = require('../src/demand/constants');

// Mapa inteligente (T20) com banco simulado: legenda, filtros, agrupamento e
// agregação por território. A projeção pública não leva dado pessoal.

const SECRET = 'post-service-test-secret-0123456789abcdef';
const DEMAND = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function fakePool(handler) {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    const result = await handler(text, params);
    if (!result) throw new Error(`Consulta inesperada: ${text}`);
    return result;
  };
  return { calls, query, async connect() { return { query, release() {} }; } };
}

async function withServer(pool, callback) {
  const server = createApp({ pool, secret: SECRET, institutionStatus: async () => null }).listen(0);
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const get = (base, path) => fetch(`${base}${path}`);

function countRow(total, overrides = {}) {
  const row = { total };
  for (const c of CATEGORIES) row[`cat_${c}`] = 0;
  for (const p of ['baixa', 'media', 'alta', 'urgente']) row[`pri_${p}`] = 0;
  for (const s of PUBLIC_STATUSES) row[`sta_${s}`] = 0;
  return { ...row, ...overrides };
}

test('a legenda tem as cinco classes da fonte e os quatro atalhos de leitura', async () => {
  const pool = fakePool(() => null);
  await withServer(pool, async (base) => {
    const res = await get(base, '/demands/map/legend');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.legend.map((l) => l.label), [
      'Problemas urgentes', 'Problemas urbanos', 'Projetos sociais',
      'Ações ambientais', 'Necessidades (Oportunidades de patrocínio)',
    ]);
    // Uma classe por categoria da demanda, sem sobra dos dois lados.
    assert.deepEqual([...body.legend.map((l) => l.category)].sort(), [...CATEGORIES].sort());
    assert.deepEqual(body.audiences.map((a) => a.id), ['governo', 'empresas', 'imprensa', 'comunidade']);
    assert.equal(body.clusterThreshold, CLUSTER_THRESHOLD);
    assert.equal(body.feedLayer.id, 'feed');
  });
});

test('o atalho de empresas pré-aplica patrocínio e demandas abertas a parceria', () => {
  const empresas = AUDIENCES.find((a) => a.id === 'empresas');
  assert.ok(empresas.filter.category.includes('necessidade_de_patrocinio'));
  assert.deepEqual(empresas.filter.status, ['publicada', 'em_busca_de_parceiro']);
  const governo = AUDIENCES.find((a) => a.id === 'governo');
  assert.deepEqual(governo.filter.category, ['problema_urgente', 'problema_urbano']);
  assert.deepEqual(governo.filter.priority, ['alta', 'urgente']);
});

test('GET /demands/map devolve pontos sem dado pessoal e com contagens por classe', async () => {
  const pool = fakePool((text) => {
    if (/count\(\*\)::int AS total/.test(text)) {
      return { rows: [countRow(1, { cat_problema_urgente: 1, sta_publicada: 1 })] };
    }
    if (/FROM demands d/.test(text)) {
      return {
        rows: [{
          id: DEMAND,
          category: 'problema_urgente',
          priority: 'urgente',
          status: 'publicada',
          title: 'Poste apagado',
          district: 'Centro',
          municipality: 'Rio de Janeiro',
          uf: 'RJ',
          territory: 'Barra',
          latitude: '-23.01',
          longitude: '-43.45',
          published_at: new Date('2026-09-20T10:00:00Z'),
          post_id: null,
          author_id: 'não deve sair',
        }],
      };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await get(base, '/demands/map?category=problema_urgente,projeto_social&status=publicada');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.mode, 'points');
    assert.equal(body.counts.total, 1);
    assert.equal(body.counts.category.problema_urgente, 1);
    assert.equal(body.counts.status.publicada, 1);
    assert.equal(body.points.length, 1);
    assert.deepEqual(Object.keys(body.points[0]).sort(), [
      'category', 'district', 'id', 'latitude', 'longitude', 'municipality',
      'postId', 'priority', 'publishedAt', 'status', 'territory', 'title', 'uf',
    ]);
    assert.equal(body.points[0].latitude, -23.01);
    assert.equal(body.truncated, false);
  });
});

test('o mapa só mostra status público e exige coordenada', async () => {
  let countParams = null;
  let where = '';
  const pool = fakePool((text, params) => {
    if (/count\(\*\)::int AS total/.test(text)) {
      countParams = params;
      where = text;
      return { rows: [countRow(0)] };
    }
    return { rows: [] };
  });
  await withServer(pool, async (base) => {
    await get(base, '/demands/map');
  });
  assert.deepEqual(countParams[0], PUBLIC_STATUSES);
  assert.match(where, /latitude IS NOT NULL AND d\.longitude IS NOT NULL/);
});

test('acima do limiar a resposta vem agrupada em células com a contagem por classe', async () => {
  const pool = fakePool((text) => {
    if (/count\(\*\)::int AS total,\n/.test(text) && /GROUP BY cell_x/.test(text)) {
      return {
        rows: [{
          cell_x: -496, cell_y: -263, total: 400, latitude: -23.0, longitude: -43.4,
          cat_problema_urgente: 100, cat_problema_urbano: 100, cat_projeto_social: 100,
          cat_projeto_ambiental: 50, cat_necessidade_de_patrocinio: 50,
        }],
      };
    }
    if (/count\(\*\)::int AS total/.test(text)) return { rows: [countRow(900)] };
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await get(base, '/demands/map?zoom=12');
    const body = await res.json();
    assert.equal(body.mode, 'clusters');
    assert.equal(body.truncated, true);
    assert.equal(body.points.length, 0);
    assert.equal(body.cellSize, cellSizeDegrees(12));
    assert.equal(body.clusters[0].total, 400);
    assert.equal(body.clusters[0].category.problema_urgente, 100);
  });
});

test('filtro inválido responde 422 com o campo', async () => {
  const pool = fakePool(() => ({ rows: [countRow(0)] }));
  await withServer(pool, async (base) => {
    for (const [query, field] of [
      ['bbox=1,2,3', 'bbox'], ['zoom=99', 'zoom'], ['limit=9999', 'limit'],
      ['status=rascunho', 'status'], ['category=nao_existe', 'category'],
      ['uf=Rio', 'uf'], ['from=20-09-2026', 'from'],
    ]) {
      const res = await get(base, `/demands/map?${query}`);
      assert.equal(res.status, 422, query);
      const body = await res.json();
      assert.equal(body.code, 'validation_failed');
      assert.ok(body.fields[field], `${query} → ${JSON.stringify(body.fields)}`);
    }
  });
});

test('o bbox e o período entram na consulta parametrizados', async () => {
  let params = null;
  let sql = '';
  const pool = fakePool((text, values) => {
    if (/count\(\*\)::int AS total/.test(text)) { params = values; sql = text; return { rows: [countRow(0)] }; }
    return { rows: [] };
  });
  await withServer(pool, async (base) => {
    await get(base, '/demands/map?bbox=-43.6,-23.1,-43.2,-22.9&from=2026-01-01&to=2026-09-30&uf=rj');
  });
  assert.match(sql, /d\.latitude BETWEEN \$\d+ AND \$\d+/);
  assert.match(sql, /d\.published_at >= \$\d+::date/);
  assert.match(sql, /d\.published_at < \(\$\d+::date \+ 1\)/);
  assert.ok(params.includes(-23.1) && params.includes(-43.2));
  assert.ok(params.includes('RJ'));
});

test('a agregação por território devolve slug estável e contagem por classe', async () => {
  const pool = fakePool((text) => {
    if (/GROUP BY d\.territory/.test(text)) {
      return {
        rows: [{
          territory: 'Vila Kennedy', municipality: 'Rio de Janeiro', uf: 'RJ', total: 7,
          last_published_at: new Date('2026-09-21T12:00:00Z'), latitude: -22.87, longitude: -43.37,
          cat_problema_urgente: 3, cat_problema_urbano: 2, cat_projeto_social: 1,
          cat_projeto_ambiental: 1, cat_necessidade_de_patrocinio: 0,
        }],
      };
    }
    return null;
  });
  await withServer(pool, async (base) => {
    const res = await get(base, '/demands/map/territories');
    const body = await res.json();
    assert.equal(body.territories.length, 1);
    const [row] = body.territories;
    assert.equal(row.slug, 'vila-kennedy-rio-de-janeiro-rj');
    assert.equal(row.total, 7);
    assert.equal(row.category.problema_urgente, 3);
    assert.equal(row.lastPublishedAt, '2026-09-21T12:00:00.000Z');
  });
});

test('territorySlug ignora acento e pontuação e é estável', () => {
  assert.equal(
    territorySlug({ territory: 'Jardim São José', municipality: 'Duque de Caxias', uf: 'RJ' }),
    'jardim-sao-jose-duque-de-caxias-rj',
  );
  assert.equal(territorySlug({ territory: '   ', municipality: null, uf: null }), '');
});

test('a legenda usa só cores do manual de marca', () => {
  const PALETTE = new Set(['#1B4F72', '#0D2D42', '#2E7BA8', '#5A9BC4', '#D6EAF8', '#F4841A', '#F89B45', '#343A40', '#868E96', '#E53935', '#2E9E5B']);
  for (const item of LEGEND) assert.ok(PALETTE.has(item.color), `${item.id}: ${item.color}`);
  // Cor e forma distintas: o mapa continua legível sem depender só de cor.
  assert.equal(new Set(LEGEND.map((l) => l.color)).size, LEGEND.length);
  assert.equal(new Set(LEGEND.map((l) => l.shape)).size, LEGEND.length);
});

test('a camada de conteúdos do feed aceita bbox e limite', async () => {
  let sql = '';
  const pool = fakePool((text) => {
    if (/FROM posts/.test(text)) { sql = text; return { rows: [] }; }
    return null;
  });
  await withServer(pool, async (base) => {
    const ok = await get(base, '/map?bbox=-43.6,-23.1,-43.2,-22.9&limit=50');
    assert.equal(ok.status, 200);
    assert.match(sql, /LIMIT \$\d+/);
    const bad = await get(base, '/map?limit=99999');
    assert.equal(bad.status, 422);
    assert.ok((await bad.json()).fields.limit);
  });
});
