// Domínio dos rankings, do engajamento e dos selos (T21): o vocabulário é o do
// slide 22 da Apresentação Institucional, as fórmulas são as publicadas na
// interface, o empate divide a posição e o Poder Público fica fora (slide 13).

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BOARDS, BOARD_IDS, BADGES, PERIODS, EXCLUDED_CATEGORY, GOVERNMENT_INDICATORS,
  normalizeActorCategory, GOVERNMENT_NOTICE, CONSENT_NOTICE, COMPANY_PROFILE_TYPES,
} = require('../src/ranking/constants');
const { normalizePeriod, periodStart, pointsFor, rankEntries } = require('../src/ranking/scoring');
const { buildBoards, placeKey, placeLabel } = require('../src/ranking/store');

test('os sete rankings são os do slide 22, na ordem da fonte', () => {
  assert.deepEqual(BOARD_IDS, [
    'usuarios_mais_ativos',
    'maiores_apoiadores',
    'empresas_em_destaque',
    'voluntarios_mais_participativos',
    'maiores_patrocinadores',
    'bairros_mais_engajados',
    'projetos_mais_apoiados',
  ]);
  assert.deepEqual(BOARDS.map((b) => b.label), [
    'Usuários mais ativos',
    'Maiores apoiadores',
    'Empresas em destaque',
    'Voluntários mais participativos',
    'Maiores patrocinadores',
    'Bairros mais engajados',
    'Projetos mais apoiados',
  ]);
  // Todo ranking explica o critério na interface: sem texto, não vai para a tela.
  for (const board of BOARDS) {
    assert.ok(board.criteria.length > 60, board.id);
    assert.ok(['usuario', 'bairro', 'demanda'].includes(board.subjectKind), board.id);
  }
});

test('o aviso de governança repete a restrição do slide 13', () => {
  assert.match(GOVERNMENT_NOTICE, /não entram em ranking/);
  assert.match(GOVERNMENT_NOTICE, /indicadores de atuação/);
  assert.match(CONSENT_NOTICE, /consentiu/);
  assert.deepEqual(GOVERNMENT_INDICATORS.map((i) => i.id).sort(),
    ['concluded', 'forwardings', 'offers', 'responses', 'tracks']);
});

test('as categorias do token e do apoio viram a categoria do ranking', () => {
  assert.equal(normalizeActorCategory('government'), EXCLUDED_CATEGORY);
  assert.equal(normalizeActorCategory('poder_publico'), EXCLUDED_CATEGORY);
  assert.equal(normalizeActorCategory('partner'), 'parceiro');
  assert.equal(normalizeActorCategory('member'), 'comunidade');
  assert.equal(normalizeActorCategory('agent'), 'agente');
  assert.equal(normalizeActorCategory('desconhecido'), null);
  assert.equal(normalizeActorCategory(null), null);
});

test('período: mês e ano são o corrente; sempre não recorta', () => {
  assert.deepEqual(PERIODS, ['mes', 'ano', 'sempre']);
  assert.equal(normalizePeriod('semana'), 'sempre');
  assert.equal(normalizePeriod('mes'), 'mes');
  const now = new Date('2026-09-22T15:00:00Z');
  assert.equal(periodStart('mes', now).toISOString(), '2026-09-01T00:00:00.000Z');
  assert.equal(periodStart('ano', now).toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(periodStart('sempre', now), null);
});

test('as fórmulas são as publicadas no critério de cada ranking', () => {
  assert.equal(pointsFor('usuarios_mais_ativos', {
    reactions: 2, comments: 1, shares: 1, interests: 1, supports: 1, demands: 1,
  }), 2 + 3 + 5 + 8 + 10 + 15);
  assert.equal(pointsFor('maiores_apoiadores', { confirmedSupports: 3, supportedDemands: 2 }), 40);
  assert.equal(pointsFor('empresas_em_destaque', { confirmedSupports: 1, supportedDemands: 1, modalities: 2 }), 25);
  assert.equal(pointsFor('voluntarios_mais_participativos', {
    interests: 2, acceptedConnections: 1, confirmedSupports: 1,
  }), 10 + 15 + 10);
  // Valor declarado (decisão 5): 1 ponto por real, sempre para baixo.
  assert.equal(pointsFor('maiores_patrocinadores', { amount: 1500.75 }), 1500);
  assert.equal(pointsFor('bairros_mais_engajados', {
    demands: 2, confirmedSupports: 1, interests: 1, shares: 1,
  }), 20 + 5 + 3 + 2);
  assert.equal(pointsFor('projetos_mais_apoiados', {
    confirmedSupports: 1, interests: 1, shares: 1, reactions: 2, comments: 1,
  }), 10 + 5 + 3 + 2 + 1);
  assert.throws(() => pointsFor('inexistente', {}), /ranking desconhecido/);
  // Nada de número negativo ou inventado.
  assert.equal(pointsFor('maiores_apoiadores', { confirmedSupports: -5 }), 0);
  assert.equal(pointsFor('maiores_patrocinadores', { amount: Number.NaN }), 0);
});

test('empate divide a posição e a lista é estável', () => {
  const ranked = rankEntries([
    { subjectId: 'b', points: 10 },
    { subjectId: 'a', points: 10 },
    { subjectId: 'c', points: 4 },
    { subjectId: 'd', points: 0 },
  ]);
  assert.deepEqual(ranked.map((e) => [e.subjectId, e.position, e.tied]), [
    ['a', 1, true], ['b', 1, true], ['c', 3, false],
  ]);
  // Quem não pontuou não ocupa posição nenhuma.
  assert.equal(ranked.some((e) => e.subjectId === 'd'), false);
});

// ── Montagem dos rankings a partir das métricas agregadas ──────────────────

const GOV = 'gggggggg-gggg-4ggg-8ggg-gggggggggggg';
const PARTNER = '11111111-1111-4111-8111-111111111111';
const MEMBER = '22222222-2222-4222-8222-222222222222';
const UNKNOWN = '33333333-3333-4333-8333-333333333333';

function actors(overrides = {}) {
  const base = new Map([
    [GOV, {
      userId: GOV, government: true, category: EXCLUDED_CATEGORY, name: 'Secretaria',
      avatar: null, profileType: 'secretaria', supportConsent: true, profileConsent: true,
    }],
    [PARTNER, {
      userId: PARTNER, government: false, category: 'parceiro', name: 'Empresa Local',
      avatar: null, profileType: 'empresa', supportConsent: false, profileConsent: false,
    }],
    [MEMBER, {
      userId: MEMBER, government: false, category: 'comunidade', name: 'Voluntária',
      avatar: null, profileType: 'voluntario', supportConsent: false, profileConsent: true,
    }],
    [UNKNOWN, {
      userId: UNKNOWN, government: false, category: null, name: 'Sem categoria',
      avatar: null, profileType: null, supportConsent: false, profileConsent: true,
    }],
  ]);
  for (const [key, value] of Object.entries(overrides)) base.set(key, value);
  return base;
}

const metrics = (over = {}) => ({
  activity: { rows: [] },
  supporters: { rows: [] },
  volunteers: { rows: [] },
  places: { rows: [] },
  demands: { rows: [] },
  ...over,
});

test('o Poder Público e a conta sem categoria conhecida ficam fora dos rankings de pessoas', () => {
  const boards = buildBoards(actors(), metrics({
    activity: {
      rows: [
        { user_id: GOV, kind: 'comments', total: 50 },
        { user_id: UNKNOWN, kind: 'comments', total: 50 },
        { user_id: PARTNER, kind: 'comments', total: 2 },
      ],
    },
    supporters: {
      rows: [{
        user_id: GOV, confirmed_supports: 9, supported_demands: 9, modalities: 3,
        volunteering_supports: 0, sponsor_supports: 9, sponsor_amount: '9000', display_consent: true,
      }],
    },
  }));
  const active = boards.get('usuarios_mais_ativos');
  assert.deepEqual(active.map((e) => e.subjectId), [PARTNER]);
  assert.equal(boards.get('maiores_apoiadores').length, 0);
  assert.equal(boards.get('maiores_patrocinadores').length, 0);
});

test('sem consentimento a linha conta, mas não se identifica', () => {
  const boards = buildBoards(actors(), metrics({
    supporters: {
      rows: [{
        user_id: PARTNER, confirmed_supports: 2, supported_demands: 2, modalities: 1,
        volunteering_supports: 0, sponsor_supports: 0, sponsor_amount: '0', display_consent: false,
      }],
    },
  }));
  const [entry] = boards.get('maiores_apoiadores');
  assert.equal(entry.points, 30);
  assert.equal(entry.identified, false);
  assert.equal(entry.displayName, null);
  assert.equal(entry.avatarUrl, null);
});

test('o consentimento do próprio apoio (T16) identifica o apoiador', () => {
  const boards = buildBoards(actors(), metrics({
    supporters: {
      rows: [{
        user_id: PARTNER, confirmed_supports: 1, supported_demands: 1, modalities: 1,
        volunteering_supports: 0, sponsor_supports: 1, sponsor_amount: '250.50', display_consent: true,
      }],
    },
  }));
  assert.equal(boards.get('maiores_apoiadores')[0].identified, true);
  assert.equal(boards.get('maiores_apoiadores')[0].displayName, 'Empresa Local');
  // "Empresas em destaque" é restrito à categoria Parceiro.
  assert.equal(boards.get('empresas_em_destaque')[0].subjectId, PARTNER);
  assert.equal(boards.get('empresas_em_destaque')[0].metrics.company, true);
  assert.ok(COMPANY_PROFILE_TYPES.includes('empresa'));
  // Patrocínio só entra com nome e valor autorizados: por isso sempre identificado.
  assert.equal(boards.get('maiores_patrocinadores')[0].identified, true);
  assert.equal(boards.get('maiores_patrocinadores')[0].points, 250);
});

test('voluntários vêm só da Comunidade; bairros e projetos não levam dado pessoal', () => {
  const boards = buildBoards(actors(), metrics({
    volunteers: { rows: [{ user_id: MEMBER, interests: 2, accepted_connections: 1 }] },
    places: {
      rows: [
        { uf: 'RJ', municipality: 'Rio de Janeiro', district: 'Recreio', kind: 'demands', total: '2' },
        { uf: 'RJ', municipality: 'Rio de Janeiro', district: 'Recreio', kind: 'shares', total: '3' },
      ],
    },
    demands: {
      rows: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', title: 'Praça viva',
        category: 'projeto_social', status: 'publicada', district: 'Recreio',
        municipality: 'Rio de Janeiro', uf: 'RJ', territory: 'Recreio',
        confirmed_supports: 1, interests: 2, shares: 0, reactions: 0, comments: 0,
      }],
    },
  }));
  const [volunteer] = boards.get('voluntarios_mais_participativos');
  assert.equal(volunteer.subjectId, MEMBER);
  assert.equal(volunteer.points, 25);
  assert.equal(volunteer.identified, true);

  const [place] = boards.get('bairros_mais_engajados');
  assert.equal(place.subjectKind, 'bairro');
  assert.equal(place.subjectId, placeKey('RJ', 'Rio de Janeiro', 'Recreio'));
  assert.equal(place.displayName, placeLabel('RJ', 'Rio de Janeiro', 'Recreio'));
  assert.equal(place.points, 26);
  assert.equal(place.avatarUrl, null);

  const [project] = boards.get('projetos_mais_apoiados');
  assert.equal(project.subjectKind, 'demanda');
  assert.equal(project.displayName, 'Praça viva');
  assert.equal(project.points, 20);
});

test('os selos têm regra objetiva e verificável, sem nada fictício', () => {
  assert.deepEqual(BADGES.map((b) => b.id), [
    'apoiador_confirmado', 'apoiador_recorrente', 'patrocinador',
    'voluntario_participante', 'agente_com_demanda_concluida',
    'prestacao_de_contas_publicada', 'registro_antes_e_depois', 'divulgador',
  ]);
  for (const badge of BADGES) {
    assert.ok(badge.rule.length > 30, badge.id);
    assert.ok(Number.isInteger(badge.threshold) && badge.threshold >= 1, badge.id);
  }
});
