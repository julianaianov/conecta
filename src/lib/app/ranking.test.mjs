import test from "node:test";
import assert from "node:assert/strict";
import { buildRanking } from "./ranking.ts";

const metric = (userId, values = {}) => ({
  userId,
  posts: 0,
  resolvedPosts: 0,
  reactionsReceived: 0,
  commentsReceived: 0,
  supportsReceived: 0,
  supports: 0,
  supportedPosts: 0,
  reactions: 0,
  comments: 0,
  financialAmount: 0,
  ...values,
});

test("ranking omite perfis sem atividade e pontua somente eventos persistidos", () => {
  const result = buildRanking([
    { userId: "partner-1", name: "Parceiro", role: "partner", city: "São Paulo" },
    { userId: "agent-1", name: "Agente", role: "agent", city: "São Paulo" },
    { userId: "member-1", name: "Voluntário", role: "member", city: "São Paulo" },
    { userId: "empty", name: "Sem atividade", role: "partner", city: "São Paulo" },
  ], [
    metric("partner-1", { supports: 2, supportedPosts: 1 }),
    metric("agent-1", { posts: 1, resolvedPosts: 1, reactionsReceived: 3 }),
    metric("member-1", { supports: 1, comments: 2 }),
  ]);

  assert.equal(result.partner[0].points, 25);
  assert.equal(result.agent[0].points, 38);
  assert.equal(result.volunteer[0].points, 16);
  assert.equal(result.partner.some((entry) => entry.userId === "empty"), false);
  assert.equal(result.partner[0].rank, 1);
  assert.match(result.partner[0].highlights[0].label, /2 apoios/);
});

// ── Engajamento, rankings e selos (T21) ────────────────────
// O espelho do frontend precisa concordar com
// `services/post-service/src/ranking/constants.js` e com o slide 22.
import { createRequire } from "node:module";
import {
  RANKING_BOARD_ICONS,
  RANKING_BOARD_IDS,
  RANKING_CONSENT_NOTICE,
  RANKING_DEFAULT_PERIOD,
  RANKING_GOVERNMENT_NOTICE,
  RANKING_METRIC_LABELS,
  RANKING_PERIOD_LABELS,
  RANKING_PERIODS,
  normalizeRankingPeriod,
  rankingDisplayName,
  rankingHighlights,
  SHARE_CHANNELS,
} from "./ranking.ts";

const require = createRequire(import.meta.url);
const server = require("../../../services/post-service/src/ranking/constants.js");

test("os sete rankings do slide 22 são os mesmos no frontend e no post-service", () => {
  assert.deepEqual(RANKING_BOARD_IDS, server.BOARD_IDS);
  assert.deepEqual(RANKING_BOARD_IDS, [
    "usuarios_mais_ativos",
    "maiores_apoiadores",
    "empresas_em_destaque",
    "voluntarios_mais_participativos",
    "maiores_patrocinadores",
    "bairros_mais_engajados",
    "projetos_mais_apoiados",
  ]);
  // Cada ranking tem ícone próprio na interface.
  for (const id of RANKING_BOARD_IDS) assert.ok(RANKING_BOARD_ICONS[id], id);
});

test("períodos, canais e avisos de governança são iguais nos dois lados", () => {
  assert.deepEqual(RANKING_PERIODS, server.PERIODS);
  assert.deepEqual(RANKING_PERIOD_LABELS, server.PERIOD_LABELS);
  assert.equal(RANKING_DEFAULT_PERIOD, server.DEFAULT_PERIOD);
  assert.deepEqual(SHARE_CHANNELS, server.SHARE_CHANNELS);
  assert.equal(RANKING_GOVERNMENT_NOTICE, server.GOVERNMENT_NOTICE);
  assert.equal(RANKING_CONSENT_NOTICE, server.CONSENT_NOTICE);
  assert.equal(normalizeRankingPeriod("semana"), "sempre");
  assert.equal(normalizeRankingPeriod("mes"), "mes");
});

test("linha sem consentimento não é identificada na interface", () => {
  const entry = {
    position: 1, tied: false, subjectKind: "usuario", subjectId: "u1", identified: false,
    displayName: null, avatarUrl: null, category: "parceiro", profileType: "empresa",
    place: null, points: 30, metrics: { confirmedSupports: 2, supportedDemands: 1 },
  };
  assert.equal(rankingDisplayName(entry), "Participante sem identificação pública");
  assert.deepEqual(rankingHighlights(entry), [
    `2 ${RANKING_METRIC_LABELS.confirmedSupports}`,
    `1 ${RANKING_METRIC_LABELS.supportedDemands}`,
  ]);
  assert.equal(
    rankingDisplayName({ ...entry, identified: true, displayName: "Construtora Horizonte" }),
    "Construtora Horizonte",
  );
  assert.equal(
    rankingDisplayName({ ...entry, subjectKind: "bairro" }),
    "Território sem identificação",
  );
});
