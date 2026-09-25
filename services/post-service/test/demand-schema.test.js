const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../src/demand/constants');

// Os enums da migração 007 e as listas do domínio precisam ser as mesmas.
const sql = fs.readFileSync(path.join(__dirname, '../migrations/007-demands.sql'), 'utf8');

function enumValues(type) {
  const match = new RegExp(`CREATE TYPE ${type} AS ENUM \\(([^)]*)\\)`).exec(sql);
  assert.ok(match, `enum ${type} ausente`);
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

// Valores acrescentados depois da 007 por `ALTER TYPE ... ADD VALUE`.
function addedValues(file, type) {
  const text = fs.readFileSync(path.join(__dirname, '../migrations', file), 'utf8');
  return [...text.matchAll(new RegExp(`ALTER TYPE ${type} ADD VALUE IF NOT EXISTS '([a-z_]+)'`, 'g'))].map((m) => m[1]);
}

test('enums da migração 007 = constantes do domínio', () => {
  assert.deepEqual(
    [...enumValues('demand_category'), ...addedValues('031-demand-categories.sql', 'demand_category')],
    C.CATEGORIES,
  );
  assert.deepEqual(enumValues('demand_status'), C.STATUSES);
  assert.deepEqual(enumValues('demand_review_state'), C.REVIEW_STATES);
  assert.deepEqual(enumValues('demand_priority'), C.PRIORITIES);
  assert.deepEqual(enumValues('demand_record_milestone'), C.RECORD_MILESTONES);
  assert.deepEqual(enumValues('demand_resource_kind'), C.RESOURCE_KINDS);
  assert.deepEqual(enumValues('demand_document_type'), C.DOCUMENT_TYPES);
  assert.deepEqual(
    [...enumValues('demand_resource_type')].sort(),
    [...new Set([...C.NEEDED_RESOURCE_TYPES, ...C.COUNTERPART_RESOURCE_TYPES])].sort(),
  );
});

test('Modelo §03: 12 tipos de demanda, cada um numa das 5 classes do slide 19 (decisão 15)', () => {
  assert.equal(C.CATEGORIES.length, 12);
  assert.deepEqual(Object.keys(C.CATEGORY_LABELS), C.CATEGORIES);
  assert.deepEqual(Object.values(C.CATEGORY_LABELS), [
    'Projeto Social', 'Projeto Ambiental', 'Necessidade de Patrocínio', 'Problema Urbano', 'Problema Urgente',
    'Obra ou melhoria de infraestrutura', 'Revitalização de espaço', 'Recuperação ambiental', 'Apoio técnico',
    'Apoio com serviços', 'Apoio com materiais', 'Outras demandas territoriais',
  ]);
  assert.deepEqual(Object.keys(C.CATEGORY_MAP_CLASS).sort(), [...C.CATEGORIES].sort());
  for (const c of C.CATEGORIES) assert.ok(C.MAP_CLASSES.includes(C.CATEGORY_MAP_CLASS[c]), c);
  assert.deepEqual(new Set(Object.values(C.CATEGORY_MAP_CLASS)), new Set(C.MAP_CLASSES));
  assert.equal(C.mapClassOf('recuperacao_ambiental'), 'acoes_ambientais');
  assert.equal(C.mapClassOf('nao_existe'), null);
});

test('demand_map_class (migração 031) repete CATEGORY_MAP_CLASS', () => {
  const text = fs.readFileSync(path.join(__dirname, '../migrations/031-demand-categories.sql'), 'utf8');
  const body = /FUNCTION demand_map_class[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(text)[1];
  const pairs = Object.fromEntries([...body.matchAll(/WHEN '([a-z_]+)' THEN '([a-z_]+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pairs, C.CATEGORY_MAP_CLASS);
  const post = /FUNCTION demand_post_type[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(text)[1];
  const postType = Object.fromEntries([...post.matchAll(/WHEN '([a-z_]+)' THEN '([a-z_]+)'/g)].map((m) => [m[1], m[2]]));
  assert.equal(postType.apoio_com_materiais, 'need');
  assert.equal(postType.outras_demandas_territoriais, 'problem');
  assert.equal(postType.recuperacao_ambiental, undefined, 'obra, revitalização e recuperação caem no ELSE project');
  assert.match(post, /ELSE 'project'/);
  assert.match(text, /BEFORE INSERT ON posts/);
});

test('fonte: 7 status canônicos + arquivada, 9 recursos e 8 contrapartidas', () => {
  assert.deepEqual(C.STATUSES.slice(0, 7), [
    'em_analise', 'publicada', 'em_busca_de_parceiro', 'conectada', 'em_execucao', 'concluida', 'prestacao_de_contas',
  ]);
  assert.equal(C.STATUSES[7], 'arquivada');
  assert.equal(C.NEEDED_RESOURCE_TYPES.length, 9);
  assert.equal(C.COUNTERPART_RESOURCE_TYPES.length, 8);
  assert.equal(C.DOCUMENT_TYPES.length, 8);
  assert.deepEqual([C.AGENT_FEE_BPS, C.PLATFORM_FEE_BPS], [400, 600]);
});

test('o CHECK de recursos por tipo repete as listas do domínio', () => {
  const block = /demand_resources_type_by_kind CHECK \(([\s\S]*?)\n  \)\n\);/.exec(sql)[1];
  const [needed, counterpart] = block.split("kind = 'contrapartida'");
  assert.deepEqual([...needed.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((v) => v !== 'necessario'), C.NEEDED_RESOURCE_TYPES);
  assert.deepEqual([...counterpart.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]), C.COUNTERPART_RESOURCE_TYPES);
});

test('trilha só inserção e demanda sem exclusão', () => {
  assert.match(sql, /BEFORE UPDATE OR DELETE ON demand_events/);
  assert.match(sql, /BEFORE TRUNCATE ON demand_events/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON demands/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS demand_id UUID REFERENCES demands\(id\)/);
  assert.match(sql, /BEFORE UPDATE OR DELETE ON posts/, 'post-vitrine protegido');
});
