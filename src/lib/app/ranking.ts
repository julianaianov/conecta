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

// ── ENGAJAMENTO, RANKINGS E SELOS DE IMPACTO SOCIAL (T21) ──────────────────
// Espelho de `services/post-service/src/ranking/constants.js` (slide 22 da
// Apresentação Institucional: os sete rankings, e slide 13: o Poder Público e
// os políticos ficam fora do ranking competitivo). `ranking.test.mjs` compara
// este arquivo com o do post-service.
//
// O cálculo acontece no servidor, materializado: aqui só ficam rótulos, os
// critérios exibidos e os tipos da resposta.

export type RankingPeriod = "mes" | "ano" | "sempre";

export const RANKING_PERIODS: RankingPeriod[] = ["mes", "ano", "sempre"];

export const RANKING_PERIOD_LABELS: Record<RankingPeriod, string> = {
  mes: "Este mês",
  ano: "Este ano",
  sempre: "Desde o início",
};

export const RANKING_DEFAULT_PERIOD: RankingPeriod = "sempre";

export type RankingBoardId =
  | "usuarios_mais_ativos"
  | "maiores_apoiadores"
  | "empresas_em_destaque"
  | "voluntarios_mais_participativos"
  | "maiores_patrocinadores"
  | "bairros_mais_engajados"
  | "projetos_mais_apoiados";

export type RankingSubjectKind = "usuario" | "bairro" | "demanda";

export interface RankingBoardDefinition {
  id: RankingBoardId;
  label: string;
  subtitle: string;
  criteria: string;
  subjectKind: RankingSubjectKind;
}

/** Os sete rankings da fonte, na ordem do slide 22. */
export const RANKING_BOARD_IDS: RankingBoardId[] = [
  "usuarios_mais_ativos",
  "maiores_apoiadores",
  "empresas_em_destaque",
  "voluntarios_mais_participativos",
  "maiores_patrocinadores",
  "bairros_mais_engajados",
  "projetos_mais_apoiados",
];

export const RANKING_BOARD_ICONS: Record<RankingBoardId, string> = {
  usuarios_mais_ativos: "users",
  maiores_apoiadores: "volunteer",
  empresas_em_destaque: "building",
  voluntarios_mais_participativos: "heart",
  maiores_patrocinadores: "payments",
  bairros_mais_engajados: "location",
  projetos_mais_apoiados: "megaphone",
};

export interface RankingEntry {
  position: number;
  tied: boolean;
  subjectKind: RankingSubjectKind;
  subjectId: string;
  /** false quando não há consentimento: a linha conta, mas não se identifica. */
  identified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  category: string | null;
  profileType: string | null;
  place: string | null;
  points: number;
  metrics: Record<string, number | boolean>;
}

export interface RankingBoard extends RankingBoardDefinition {
  entries: RankingEntry[];
}

export interface RankingsResponse {
  period: RankingPeriod;
  periods: { id: RankingPeriod; label: string }[];
  computedAt: string | null;
  notices: { government: string; consent: string };
  boards: RankingBoard[];
}

export interface ImpactBadge {
  id: string;
  label: string;
  rule: string;
  awardedAt: string | null;
  evidenceCount: number;
}

export interface ProfileImpact {
  userId: string;
  category: string | null;
  /** false para Poder Público e políticos: indicadores no lugar do ranking. */
  ranked: boolean;
  badges: ImpactBadge[];
  indicators: { id: string; label: string; value: number }[];
  notice: string | null;
  computedAt: string | null;
}

export type ShareTargetKind = "post" | "demand";
export type ShareChannel = "web_share" | "copiar_link" | "outro";

export const SHARE_CHANNELS: ShareChannel[] = ["web_share", "copiar_link", "outro"];

/** Aviso obrigatório do slide 13, repetido na interface. */
export const RANKING_GOVERNMENT_NOTICE = "O Poder Público e os políticos não entram em ranking "
  + "competitivo de apoiadores: a neutralidade institucional é regra da plataforma. A atuação dos "
  + "órgãos é acompanhada por indicadores de atuação — respostas institucionais, encaminhamentos, "
  + "acompanhamentos e apoios oferecidos — publicados no perfil do órgão e na linha do tempo de "
  + "cada demanda, sem pontuação e sem comparação entre órgãos.";

export const RANKING_CONSENT_NOTICE = "O ranking mostra o nome apenas de quem consentiu. Nos "
  + "rankings de apoio vale o consentimento dado no próprio apoio; nos demais, a opção \"aparecer "
  + "com meu nome nos rankings públicos\" do perfil. Sem consentimento, a posição continua "
  + "contando, mas aparece sem nome, sem foto e sem link.";

/** Rótulo da métrica que compõe os pontos, para o resumo de cada linha. */
export const RANKING_METRIC_LABELS: Record<string, string> = {
  reactions: "curtidas",
  comments: "comentários",
  shares: "compartilhamentos",
  interests: "interesses registrados",
  supports: "apoios declarados",
  demands: "demandas publicadas",
  confirmedSupports: "apoios confirmados",
  supportedDemands: "demandas apoiadas",
  modalities: "modalidades de apoio",
  acceptedConnections: "conexões aceitas",
  amount: "valor declarado (R$)",
};

/** Como a linha se chama quando não há consentimento para exibir o nome. */
export function rankingDisplayName(entry: RankingEntry): string {
  if (entry.identified && entry.displayName) return entry.displayName;
  if (entry.subjectKind === "bairro") return "Território sem identificação";
  return "Participante sem identificação pública";
}

/** Resumo legível das métricas que somaram os pontos da linha. */
export function rankingHighlights(entry: RankingEntry): string[] {
  return Object.entries(entry.metrics)
    .filter(([key, value]) => RANKING_METRIC_LABELS[key] && typeof value === "number" && value > 0)
    .map(([key, value]) => `${Number(value).toLocaleString("pt-BR")} ${RANKING_METRIC_LABELS[key]}`);
}

/** Período válido da consulta; qualquer outro valor cai no padrão. */
export function normalizeRankingPeriod(value: unknown): RankingPeriod {
  return RANKING_PERIODS.includes(value as RankingPeriod) ? (value as RankingPeriod) : RANKING_DEFAULT_PERIOD;
}
