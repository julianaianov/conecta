import type { ProfileType, RankCategory, RankEntry, RankHighlight, UserRole } from "./types";

export interface RankingUser {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: UserRole;
  profileType?: ProfileType | null;
  city?: string | null;
}

export interface RankingMetrics {
  userId: string;
  posts: number;
  resolvedPosts: number;
  reactionsReceived: number;
  commentsReceived: number;
  supportsReceived: number;
  supports: number;
  supportedPosts: number;
  reactions: number;
  comments: number;
  financialAmount: number;
}

const CATEGORY_BY_ROLE: Partial<Record<UserRole, RankCategory>> = {
  partner: "partner",
  agent: "agent",
  member: "volunteer",
};

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function pointsFor(category: RankCategory, metrics: RankingMetrics): number {
  if (category === "partner") {
    return metrics.supports * 10 + metrics.supportedPosts * 5 + Math.round(Math.max(0, metrics.financialAmount));
  }
  if (category === "agent") {
    return metrics.posts * 10
      + metrics.resolvedPosts * 25
      + metrics.reactionsReceived
      + metrics.commentsReceived
      + metrics.supportsReceived * 5;
  }
  return metrics.supports * 10
    + metrics.supportedPosts * 5
    + metrics.reactions * 2
    + metrics.comments * 3;
}

function highlightsFor(category: RankCategory, metrics: RankingMetrics): RankHighlight[] {
  const highlights: RankHighlight[] = [];
  if (category === "partner") {
    if (metrics.supports > 0) highlights.push({ icon: "volunteer", label: `${metrics.supports} apoios registrados` });
    if (metrics.supportedPosts > 0) highlights.push({ icon: "location", label: `${metrics.supportedPosts} sinais apoiados` });
    if (metrics.financialAmount > 0) highlights.push({ icon: "payments", label: `R$ ${metrics.financialAmount.toLocaleString("pt-BR")} registrados` });
  } else if (category === "agent") {
    if (metrics.posts > 0) highlights.push({ icon: "megaphone", label: `${metrics.posts} sinais publicados` });
    if (metrics.resolvedPosts > 0) highlights.push({ icon: "check", label: `${metrics.resolvedPosts} sinais resolvidos` });
    if (metrics.supportsReceived > 0) highlights.push({ icon: "volunteer", label: `${metrics.supportsReceived} apoios recebidos` });
    if (metrics.reactionsReceived + metrics.commentsReceived > 0) {
      highlights.push({ icon: "heart", label: `${metrics.reactionsReceived + metrics.commentsReceived} interações recebidas` });
    }
  } else {
    if (metrics.supports > 0) highlights.push({ icon: "volunteer", label: `${metrics.supports} apoios registrados` });
    if (metrics.supportedPosts > 0) highlights.push({ icon: "location", label: `${metrics.supportedPosts} sinais apoiados` });
    if (metrics.reactions + metrics.comments > 0) {
      highlights.push({ icon: "heart", label: `${metrics.reactions + metrics.comments} interações registradas` });
    }
  }
  return highlights;
}

export function buildRanking(users: RankingUser[], rawMetrics: RankingMetrics[]): Record<RankCategory, RankEntry[]> {
  const metricsByUser = new Map(rawMetrics.map((metrics) => [metrics.userId, {
    ...metrics,
    posts: nonNegative(metrics.posts),
    resolvedPosts: nonNegative(metrics.resolvedPosts),
    reactionsReceived: nonNegative(metrics.reactionsReceived),
    commentsReceived: nonNegative(metrics.commentsReceived),
    supportsReceived: nonNegative(metrics.supportsReceived),
    supports: nonNegative(metrics.supports),
    supportedPosts: nonNegative(metrics.supportedPosts),
    reactions: nonNegative(metrics.reactions),
    comments: nonNegative(metrics.comments),
    financialAmount: Number.isFinite(metrics.financialAmount) ? Math.max(0, metrics.financialAmount) : 0,
  }]));
  const boards: Record<RankCategory, RankEntry[]> = { partner: [], agent: [], volunteer: [] };

  for (const user of users) {
    const category = CATEGORY_BY_ROLE[user.role];
    if (!category) continue;
    const metrics = metricsByUser.get(user.userId);
    if (!metrics) continue;
    const points = pointsFor(category, metrics);
    if (points <= 0) continue;
    boards[category].push({
      userId: user.userId,
      name: user.name,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role,
      profileType: user.profileType ?? null,
      city: user.city ?? null,
      points,
      rank: 0,
      highlights: highlightsFor(category, metrics),
    });
  }

  for (const category of Object.keys(boards) as RankCategory[]) {
    boards[category].sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "pt-BR"));
    boards[category] = boards[category].map((entry, index) => ({ ...entry, rank: index + 1 }));
  }
  return boards;
}
