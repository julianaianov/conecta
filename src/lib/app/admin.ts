/**
 * DM Conecta — métricas do painel administrativo (visão dos donos da plataforma).
 *
 * Tudo aqui é derivado: recebe a base bruta (`AdminSnapshot`) e devolve os
 * números prontos para exibição. Nenhuma métrica é digitada à mão — se um
 * número aparece no painel, ele foi contado a partir de publicações, apoios,
 * comentários ou contas.
 */
import type { AdminSnapshot, DirectoryUser } from "./demo";
import {
  PAYMENT_METHODS, POST_STATUS_LABELS, POST_TYPE_LABELS, PROFILE_LABELS,
  ROLE_LABELS, ROLES, SUPPORT_TYPES, SUPPORT_TYPE_META,
  type PaymentMethod, type PostStatus, type PostType, type ProfileType,
  type SupportType, type UserRole,
} from "./types";

// ── Período ────────────────────────────────────────────────
export type PeriodKey = "7" | "30" | "90" | "all";

export const PERIODS: { key: PeriodKey; label: string; days: number | null }[] = [
  { key: "7", label: "7 dias", days: 7 },
  { key: "30", label: "30 dias", days: 30 },
  { key: "90", label: "90 dias", days: 90 },
  { key: "all", label: "Todo o período", days: null },
];

// ── Formato dos resultados ─────────────────────────────────
export interface Slice {
  key: string;
  label: string;
  value: number;
  /** rótulo secundário (ex.: "R$ 1.200" ou "32%") */
  hint?: string;
  color?: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  hint: string;
  count: number;
  /** % em relação à primeira etapa */
  ofTotal: number;
  /** % em relação à etapa anterior */
  ofPrevious: number;
}

export interface NeighborhoodRow {
  name: string;
  city: string;
  posts: number;
  supports: number;
  amount: number;
  resolved: number;
  users: number;
  /** participação do bairro no total de publicações (0–1) */
  share: number;
}

export interface SeriesPoint {
  date: string;
  posts: number;
  supports: number;
}

export interface ActivityItem {
  id: string;
  kind: "post" | "support" | "comment";
  icon: string;
  actor: string;
  text: string;
  neighborhood?: string | null;
  amount?: number | null;
  at: string;
}

export interface TopPost {
  id: string;
  title: string;
  type: PostType;
  status: PostStatus;
  author: string;
  neighborhood: string;
  supports: number;
  amount: number;
  engagement: number;
}

export interface TopSupporter {
  id: string;
  name: string;
  role: UserRole;
  operations: number;
  amount: number;
  types: number;
}

export interface AdminMetrics {
  period: { key: PeriodKey; label: string; days: number | null; from: string | null; to: string };
  users: {
    total: number;
    newInPeriod: number;
    byRole: Slice[];
    byProfile: Slice[];
    activeInPeriod: number;
  };
  content: {
    posts: number;
    postsInPeriod: number;
    geolocated: number;
    withMedia: number;
    resolved: number;
    resolutionRate: number;
    byType: Slice[];
    byStatus: Slice[];
  };
  operations: {
    total: number;
    inPeriod: number;
    byType: Slice[];
    financialCount: number;
    amount: number;
    avgTicket: number;
    byMethod: Slice[];
    nonFinancial: number;
  };
  engagement: {
    reactions: number;
    comments: number;
    views: number;
    scraps: number;
    testimonials: number;
    communities: number;
    members: number;
    activityVolume: number;
  };
  coverage: {
    neighborhoods: NeighborhoodRow[];
    cities: string[];
    served: number;
    withOperations: number;
  };
  funnel: FunnelStage[];
  series: SeriesPoint[];
  topPosts: TopPost[];
  topSupporters: TopSupporter[];
  recent: ActivityItem[];
}

// ── Utilitários ────────────────────────────────────────────
const dayKey = (iso: string) => iso.slice(0, 10);

function countBy<T>(rows: T[], key: (row: T) => string): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** Lista de dias entre dois ISO (inclusive), no máximo `cap` pontos. */
function dayRange(fromISO: string, toISO: string, cap = 120): string[] {
  const out: string[] = [];
  const from = new Date(`${dayKey(fromISO)}T00:00:00Z`);
  const to = new Date(`${dayKey(toISO)}T00:00:00Z`);
  for (let d = from; d <= to && out.length < cap; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ── Construção das métricas ────────────────────────────────
export function buildAdminMetrics(
  snap: AdminSnapshot,
  periodKey: PeriodKey = "all",
  now: Date = new Date(),
): AdminMetrics {
  const period = PERIODS.find((p) => p.key === periodKey) ?? PERIODS[3];
  const from = period.days == null ? null : new Date(now.getTime() - period.days * 864e5).toISOString();
  const inPeriod = (iso: string) => (from == null ? true : iso >= from);

  const posts = snap.posts.filter((p) => inPeriod(p.createdAt));
  const supports = snap.supports.filter((s) => inPeriod(s.createdAt));
  const comments = snap.comments.filter((c) => inPeriod(c.createdAt));
  const newUsers = snap.users.filter((u) => inPeriod(u.memberSince));

  // ── Usuários ──
  const roleCount = countBy(snap.users, (u) => u.role);
  const profileCount = countBy(snap.users, (u) => u.profileType);
  const activeIds = new Set<string>([
    ...posts.map((p) => p.authorId),
    ...supports.map((s) => s.userId),
    ...comments.map((c) => c.authorId),
  ]);

  const byRole: Slice[] = ROLES.map((role) => ({
    key: role,
    label: ROLE_LABELS[role],
    value: roleCount.get(role) ?? 0,
    hint: `${Math.round(pct(roleCount.get(role) ?? 0, snap.users.length) * 100)}%`,
  })).sort((a, b) => b.value - a.value);

  const byProfile: Slice[] = [...profileCount.entries()]
    .map(([type, value]) => ({
      key: type,
      label: PROFILE_LABELS[type as ProfileType] ?? type,
      value,
      hint: ROLE_LABELS[(snap.users.find((u) => u.profileType === type)?.role ?? "citizen") as UserRole],
    }))
    .sort((a, b) => b.value - a.value);

  // ── Conteúdo ──
  const typeCount = countBy(posts, (p) => p.type);
  const statusCount = countBy(posts, (p) => p.status);
  const geolocated = posts.filter((p) => p.latitude != null && p.longitude != null).length;
  const withMedia = posts.filter((p) => (p.images?.length ?? 0) + (p.videos?.length ?? 0) > 0).length;
  const resolved = statusCount.get("resolved") ?? 0;

  const byType: Slice[] = (Object.keys(POST_TYPE_LABELS) as PostType[])
    .map((type) => ({ key: type, label: POST_TYPE_LABELS[type], value: typeCount.get(type) ?? 0 }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const byStatus: Slice[] = (Object.keys(POST_STATUS_LABELS) as PostStatus[])
    .map((status) => ({
      key: status,
      label: POST_STATUS_LABELS[status],
      value: statusCount.get(status) ?? 0,
      hint: `${Math.round(pct(statusCount.get(status) ?? 0, posts.length) * 100)}%`,
    }))
    .filter((s) => s.value > 0);

  // ── Operações de apoio ──
  const supportTypeCount = countBy(supports, (s) => s.type);
  const financial = supports.filter((s) => s.type === "financial" && s.amount != null);
  const amount = financial.reduce((sum, s) => sum + (s.amount ?? 0), 0);
  const methodCount = countBy(financial, (s) => (s.paymentMethod ?? "pix") as string);

  const opsByType: Slice[] = SUPPORT_TYPES
    .map((meta) => ({
      key: meta.type,
      label: meta.label,
      value: supportTypeCount.get(meta.type) ?? 0,
      hint: meta.icon,
    }))
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value);

  const byMethod: Slice[] = PAYMENT_METHODS
    .map((m) => ({
      key: m.method,
      label: m.label,
      value: methodCount.get(m.method) ?? 0,
      hint: `R$ ${financial
        .filter((s) => (s.paymentMethod ?? "pix") === m.method)
        .reduce((sum, s) => sum + (s.amount ?? 0), 0)
        .toLocaleString("pt-BR")}`,
    }))
    .filter((s) => s.value > 0);

  // ── Bairros atendidos ──
  const rows = new Map<string, NeighborhoodRow>();
  const row = (name: string, city: string) => {
    const key = name.toLowerCase();
    if (!rows.has(key)) rows.set(key, { name, city, posts: 0, supports: 0, amount: 0, resolved: 0, users: 0, share: 0 });
    return rows.get(key)!;
  };
  for (const p of posts) {
    const r = row(p.neighborhood ?? "Sem bairro", p.city ?? "—");
    r.posts += 1;
    if (p.status === "resolved") r.resolved += 1;
  }
  for (const s of supports) {
    const r = row(s.neighborhood ?? "Sem bairro", s.city ?? "—");
    r.supports += 1;
    r.amount += s.amount ?? 0;
  }
  for (const u of snap.users) row(u.neighborhood, u.city).users += 1;
  const neighborhoods = [...rows.values()]
    .map((r) => ({ ...r, share: pct(r.posts, posts.length) }))
    .sort((a, b) => b.posts - a.posts || b.supports - a.supports || b.users - a.users);

  // ── Funil (as 6 etapas do fluxo: publicar → geolocalizar → ver → conectar → executar → registrar) ──
  const supportedIds = new Set(supports.map((s) => s.postId));
  const engagedIds = new Set(posts.filter((p) => p.reactionsCount > 0 || p.commentsCount > 0).map((p) => p.id));
  const executing = posts.filter((p) => p.status === "in_progress" || p.status === "resolved").length;
  const stageCounts: [string, string, string, number][] = [
    ["published", "Publicadas", "demandas, projetos e eventos criados", posts.length],
    ["geolocated", "Geolocalizadas", "com ponto no mapa", geolocated],
    ["engaged", "Com engajamento", "receberam curtida ou comentário", engagedIds.size],
    ["supported", "Com apoio", "receberam ao menos uma operação de apoio", supportedIds.size],
    ["executing", "Em execução", "status em andamento ou resolvido", executing],
    ["registered", "Impacto registrado", "marcadas como resolvidas", resolved],
  ];
  const funnel: FunnelStage[] = stageCounts.map(([key, label, hint, count], i) => ({
    key, label, hint, count,
    ofTotal: pct(count, stageCounts[0][3]),
    ofPrevious: i === 0 ? 1 : pct(count, stageCounts[i - 1][3]),
  }));

  // ── Série temporal ──
  const allDates = [...posts.map((p) => p.createdAt), ...supports.map((s) => s.createdAt)].sort();
  const series: SeriesPoint[] = allDates.length
    ? dayRange(from ?? allDates[0], now.toISOString() > allDates[allDates.length - 1] ? now.toISOString() : allDates[allDates.length - 1])
        .map((date) => ({
          date,
          posts: posts.filter((p) => dayKey(p.createdAt) === date).length,
          supports: supports.filter((s) => dayKey(s.createdAt) === date).length,
        }))
    : [];

  // ── Destaques ──
  const supportsByPost = new Map<string, { count: number; amount: number }>();
  for (const s of supports) {
    const cur = supportsByPost.get(s.postId) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += s.amount ?? 0;
    supportsByPost.set(s.postId, cur);
  }
  const topPosts: TopPost[] = posts
    .map((p) => {
      const s = supportsByPost.get(p.id) ?? { count: 0, amount: 0 };
      return {
        id: p.id, title: p.title, type: p.type, status: p.status,
        author: p.authorName, neighborhood: p.neighborhood ?? "—",
        supports: s.count, amount: s.amount,
        engagement: p.reactionsCount + p.commentsCount * 3 + s.count * 5,
      };
    })
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 6);

  const supporters = new Map<string, TopSupporter & { typeSet: Set<SupportType> }>();
  for (const s of supports) {
    const cur = supporters.get(s.userId) ?? {
      id: s.userId,
      name: s.userName ?? "Conta sem nome",
      role: (snap.users.find((u) => u.id === s.userId)?.role ?? "citizen") as UserRole,
      operations: 0, amount: 0, types: 0, typeSet: new Set<SupportType>(),
    };
    cur.operations += 1;
    cur.amount += s.amount ?? 0;
    cur.typeSet.add(s.type);
    supporters.set(s.userId, cur);
  }
  const topSupporters: TopSupporter[] = [...supporters.values()]
    .map(({ typeSet, ...rest }) => ({ ...rest, types: typeSet.size }))
    .sort((a, b) => b.amount - a.amount || b.operations - a.operations)
    .slice(0, 6);

  // ── Atividade recente (auditoria) ──
  const recent: ActivityItem[] = [
    ...posts.map((p) => ({
      id: `p-${p.id}`, kind: "post" as const, icon: "megaphone", actor: p.authorName,
      text: `publicou «${p.title}»`, neighborhood: p.neighborhood, amount: null, at: p.createdAt,
    })),
    ...supports.map((s) => ({
      id: `s-${s.id}`, kind: "support" as const,
      icon: SUPPORT_TYPE_META[s.type]?.icon ?? "heart",
      actor: s.userName ?? "Conta sem nome",
      text: `apoiou «${s.postTitle ?? "publicação"}» com ${SUPPORT_TYPE_META[s.type]?.label.toLowerCase() ?? "apoio"}`,
      neighborhood: s.neighborhood, amount: s.amount ?? null, at: s.createdAt,
    })),
    ...comments.map((c) => ({
      id: `c-${c.id}`, kind: "comment" as const, icon: "comment", actor: c.authorName,
      text: "comentou em uma publicação", neighborhood: null, amount: null, at: c.createdAt,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12);

  const reactions = posts.reduce((sum, p) => sum + p.reactionsCount, 0);
  const views = posts.reduce((sum, p) => sum + p.viewsCount, 0);

  return {
    period: { key: period.key, label: period.label, days: period.days, from, to: now.toISOString() },
    users: {
      total: snap.users.length,
      newInPeriod: newUsers.length,
      byRole,
      byProfile,
      activeInPeriod: activeIds.size,
    },
    content: {
      posts: snap.posts.length,
      postsInPeriod: posts.length,
      geolocated,
      withMedia,
      resolved,
      resolutionRate: pct(resolved, posts.length),
      byType,
      byStatus,
    },
    operations: {
      total: snap.supports.length,
      inPeriod: supports.length,
      byType: opsByType,
      financialCount: financial.length,
      amount,
      avgTicket: financial.length ? amount / financial.length : 0,
      byMethod,
      nonFinancial: supports.length - financial.length,
    },
    engagement: {
      reactions,
      comments: comments.length,
      views,
      scraps: snap.scraps.length,
      testimonials: snap.testimonials.length,
      communities: snap.communities.length,
      members: snap.communities.reduce((sum, c) => sum + c.memberCount, 0),
      activityVolume: posts.length + supports.length + comments.length + reactions,
    },
    coverage: {
      neighborhoods,
      cities: [...new Set(snap.posts.map((p) => p.city ?? "—"))],
      served: neighborhoods.filter((n) => n.posts > 0).length,
      withOperations: neighborhoods.filter((n) => n.supports > 0).length,
    },
    funnel,
    series,
    topPosts,
    topSupporters,
    recent,
  };
}

// ── Exportação ─────────────────────────────────────────────
/** CSV dos bairros — o recorte que a gestão mais leva para fora do painel. */
export function neighborhoodsCsv(rows: NeighborhoodRow[]): string {
  const head = ["Bairro", "Cidade", "Publicacoes", "Resolvidas", "Apoios", "Valor (R$)", "Usuarios"];
  const body = rows.map((r) => [r.name, r.city, r.posts, r.resolved, r.supports, r.amount, r.users].join(";"));
  return [head.join(";"), ...body].join("\n");
}

export type { DirectoryUser, PaymentMethod };
