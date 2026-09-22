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
