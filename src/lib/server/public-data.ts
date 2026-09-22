import {
  normalizePostStatus,
  normalizeRole,
  type Comment,
  type Community,
  type Post,
  type Profile,
  type ProfileType,
  type PublicDemand,
  type PublicDemandSummary,
  type DemandTimelineEvent,
  type DossierVerification,
  type PublicDossierInfo,
  type PublicInstitution,
  type RankCategory,
  type RankEntry,
  type SupportSummaryItem,
} from "../app/types.ts";
import { buildRanking, type RankingMetrics, type RankingUser } from "../app/ranking.ts";
import { normalizeCoordinates } from "../app/location.ts";
import { mapPublicInstitutionRecord } from "../app/institution.ts";
import { resolveMediaUrl } from "../app/uploads.ts";
import { runtime } from "../app/runtime.ts";
import { boundedPublicLimit, fetchPublicJson, MAX_PUBLIC_LIST_LIMIT } from "./public-api.ts";

type RawRecord = Record<string, unknown>;

const emptyRanking = (): Record<RankCategory, RankEntry[]> => ({ partner: [], agent: [], volunteer: [] });

function numberValue(value: unknown, fallbackValue = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function mapPost(record: RawRecord): Post {
  const coordinates = normalizeCoordinates(record.latitude, record.longitude);
  return {
    id: String(record.id ?? ""),
    authorId: String(record.author_id ?? record.authorId ?? ""),
    authorName: String(record.author_name ?? record.authorName ?? ""),
    authorAvatar: (record.author_avatar ?? record.authorAvatar ?? null) as string | null,
    type: record.type as Post["type"],
    title: String(record.title ?? ""),
    description: String(record.description ?? ""),
    status: normalizePostStatus(record.status),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    neighborhood: (record.neighborhood ?? null) as string | null,
    city: (record.city ?? null) as string | null,
    // Foto por upload (T08) vem como /api/posts/uploads/<id>/content: o navegador
    // a busca pela base pública da API, não pelo endereço interno do SSR.
    images: Array.isArray(record.images)
      ? record.images.filter((value): value is string => typeof value === "string").map((url) => resolveMediaUrl(url, runtime.apiBase))
      : [],
    videos: Array.isArray(record.videos) ? record.videos.filter((value): value is string => typeof value === "string") : [],
    tags: Array.isArray(record.tags) ? record.tags.filter((value): value is string => typeof value === "string") : [],
    reactionsCount: numberValue(record.reactions_count ?? record.reactionsCount),
    commentsCount: numberValue(record.comments_count ?? record.commentsCount),
    viewsCount: numberValue(record.views_count ?? record.viewsCount),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
    demandId: typeof record.demand_id === "string" ? record.demand_id : null,
  };
}

function mapComment(record: RawRecord): Comment {
  return {
    id: String(record.id ?? ""),
    postId: String(record.post_id ?? record.postId ?? ""),
    authorId: String(record.author_id ?? record.authorId ?? ""),
    authorName: String(record.author_name ?? record.authorName ?? ""),
    content: String(record.content ?? ""),
    createdAt: String(record.created_at ?? record.createdAt ?? ""),
  };
}

export interface PublicSupportRecord {
  id: string;
  type: SupportSummaryItem["type"];
  createdAt: string;
}

function mapProfile(record: RawRecord, userId: string): Profile {
  const profileType = (record.profile_type ?? record.profileType ?? null) as ProfileType | null;
  return {
    userId,
    name: String(record.name ?? ""),
    role: normalizeRole((record.role as string | null) ?? null, profileType),
    profileType,
    bio: (record.bio ?? null) as string | null,
    status: (record.status ?? null) as string | null,
    city: (record.city ?? null) as string | null,
    neighborhood: (record.neighborhood ?? null) as string | null,
    website: (record.website ?? null) as string | null,
    avatarUrl: (record.avatar_url ?? record.avatarUrl ?? null) as string | null,
    coverUrl: (record.cover_url ?? record.coverUrl ?? null) as string | null,
    memberSince: (record.member_since ?? record.memberSince) as string | undefined,
    friendCount: numberValue(record.friend_count ?? record.friendCount),
  };
}

function mapCommunity(record: RawRecord): Community {
  return {
    id: String(record.id ?? ""),
    name: String(record.name ?? ""),
    description: String(record.description ?? ""),
    category: String(record.category ?? ""),
    memberCount: numberValue(record.member_count ?? record.memberCount),
    imageUrl: (record.image_url ?? record.imageUrl ?? null) as string | null,
  };
}

export interface PublicPostFilters {
  type?: string;
  status?: string;
  neighborhood?: string;
  authorId?: string;
  limit?: number;
  offset?: number;
}

export async function getPublicPosts(filters: PublicPostFilters = {}): Promise<Post[]> {
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.status) query.set("status", filters.status);
  if (filters.neighborhood) query.set("neighborhood", filters.neighborhood);
  if (filters.authorId) query.set("author_id", filters.authorId);
  query.set("limit", String(boundedPublicLimit(filters.limit)));
  query.set("offset", String(Math.max(0, Math.trunc(filters.offset ?? 0))));

  const data = await fetchPublicJson<{ posts?: RawRecord[] }>("posts", `?${query.toString()}`);
  return (data?.posts ?? []).map(mapPost);
}

export async function getPublicMapPosts(type?: string): Promise<Post[]> {
  const query = type ? `?type=${encodeURIComponent(type)}` : "";
  const data = await fetchPublicJson<RawRecord[]>("posts", `/map${query}`);
  return data?.map(mapPost) ?? [];
}

export async function getPublicPost(id: string): Promise<Post | null> {
  const data = await fetchPublicJson<RawRecord>("posts", `/${encodeURIComponent(id)}`);
  return data ? mapPost(data) : null;
}

export async function getPublicComments(postId: string): Promise<Comment[]> {
  const data = await fetchPublicJson<RawRecord[]>("posts", `/${encodeURIComponent(postId)}/comments`);
  return data?.map(mapComment) ?? [];
}

export async function getPublicSupports(postId: string): Promise<{ summary: SupportSummaryItem[]; supports: PublicSupportRecord[] }> {
  const data = await fetchPublicJson<{ summary?: RawRecord[]; supports?: RawRecord[] }>("posts", `/${encodeURIComponent(postId)}/supports`);
  if (data) {
    return {
      summary: (data.summary ?? []).map((item) => ({ type: String(item.type) as SupportSummaryItem["type"], count: numberValue(item.count) })),
      supports: (data.supports ?? []).map((record) => ({
        id: String(record.id ?? ""),
        type: String(record.type) as PublicSupportRecord["type"],
        createdAt: String(record.created_at ?? record.createdAt ?? ""),
      })),
    };
  }
  return { summary: [], supports: [] };
}

export async function getPublicProfile(userId: string): Promise<Profile | null> {
  const data = await fetchPublicJson<RawRecord>("users", `/${encodeURIComponent(userId)}`);
  return data ? mapProfile(data, userId) : null;
}

/**
 * Instituição validada vinculada ao perfil (selo público). O user-service só
 * responde cadastro `validada`, sem contatos nem representante.
 */
export async function getPublicInstitution(userId: string): Promise<PublicInstitution | null> {
  const data = await fetchPublicJson<RawRecord>("users", `/${encodeURIComponent(userId)}/institution`);
  if (!data || data.validation_status !== "validada") return null;
  return mapPublicInstitutionRecord(data);
}

export function getPublicPostsByAuthor(userId: string): Promise<Post[]> {
  return getPublicPosts({ authorId: userId, limit: MAX_PUBLIC_LIST_LIMIT });
}

export async function getPublicRanking(): Promise<Record<RankCategory, RankEntry[]>> {
  const [userData, metricsData] = await Promise.all([
    fetchPublicJson<Record<string, unknown>>("users", "/ranking"),
    fetchPublicJson<RawRecord[]>("posts", "/ranking"),
  ]);
  if (!userData || !Array.isArray(metricsData)) return emptyRanking();

  const users: RankingUser[] = ["partner", "agent", "volunteer"]
    .flatMap((category) => Array.isArray(userData[category]) ? userData[category] : [])
    .filter((record): record is RawRecord => typeof record === "object" && record !== null)
    .map((record) => ({
      userId: String(record.userId ?? record.user_id ?? ""),
      name: String(record.name ?? ""),
      avatarUrl: (record.avatarUrl ?? record.avatar_url ?? null) as string | null,
      role: normalizeRole((record.role as string | null) ?? null, (record.profileType ?? record.profile_type ?? null) as string | null),
      profileType: (record.profileType ?? record.profile_type ?? null) as ProfileType | null,
      city: (record.city ?? null) as string | null,
    }));
  const metrics: RankingMetrics[] = metricsData.map((record) => ({
    userId: String(record.userId ?? record.user_id ?? ""),
    posts: Number(record.posts ?? 0),
    resolvedPosts: Number(record.resolvedPosts ?? record.resolved_posts ?? 0),
    reactionsReceived: Number(record.reactionsReceived ?? record.reactions_received ?? 0),
    commentsReceived: Number(record.commentsReceived ?? record.comments_received ?? 0),
    supportsReceived: Number(record.supportsReceived ?? record.supports_received ?? 0),
    supports: Number(record.supports ?? 0),
    supportedPosts: Number(record.supportedPosts ?? record.supported_posts ?? 0),
    reactions: Number(record.reactions ?? 0),
    comments: Number(record.comments ?? 0),
    financialAmount: Number(record.financialAmount ?? record.financial_amount ?? 0),
  }));
  return buildRanking(users, metrics);
}

export async function getPublicCommunities(): Promise<Community[]> {
  const data = await fetchPublicJson<RawRecord[]>("users", "/communities");
  return data?.map(mapCommunity) ?? [];
}

// ── Demanda (T09) ──────────────────────────────────────────
// O post-service já responde a projeção pública em camelCase (sem CEP, rua,
// número, instituição, parecer, responsável do cronograma nem link de
// documento). Aqui só a foto ganha a base pública da API.

function withPublicPhoto<T extends { photoUrl: string | null }>(record: T): T {
  return { ...record, photoUrl: record.photoUrl ? resolveMediaUrl(record.photoUrl, runtime.apiBase) : null };
}

export async function getPublicDemand(id: string): Promise<PublicDemand | null> {
  const data = await fetchPublicJson<PublicDemand>("posts", `/demands/${encodeURIComponent(id)}`);
  return data && typeof data.id === "string" ? withPublicPhoto(data) : null;
}

export async function getPublicDemandTimeline(id: string): Promise<DemandTimelineEvent[]> {
  const data = await fetchPublicJson<{ events?: DemandTimelineEvent[] }>("posts", `/demands/${encodeURIComponent(id)}/timeline`);
  return Array.isArray(data?.events) ? data.events : [];
}

/** Demandas publicadas em diante, percorrendo o cursor até `max`. */
export async function getPublicDemandSummaries(max = 500): Promise<PublicDemandSummary[]> {
  const out: PublicDemandSummary[] = [];
  let cursor: string | null = null;
  do {
    const query = new URLSearchParams({ limit: "50" });
    if (cursor) query.set("cursor", cursor);
    const page: { demands?: PublicDemandSummary[]; nextCursor?: string | null } | null =
      await fetchPublicJson("posts", `/demands?${query.toString()}`);
    if (!page || !Array.isArray(page.demands)) break;
    out.push(...page.demands.map(withPublicPhoto));
    cursor = page.nextCursor ?? null;
  } while (cursor && out.length < max);
  return out.slice(0, max);
}

// ── Dossiê da Demanda (T10) ────────────────────────────────

/** Versão pública do dossiê (só demanda publicada em diante). */
export async function getPublicDossierInfo(id: string): Promise<PublicDossierInfo | null> {
  const data = await fetchPublicJson<PublicDossierInfo>("posts", `/demands/${encodeURIComponent(id)}/dossie-publico/info`);
  return data && typeof data.available === "boolean" ? data : null;
}

/** Verificação por SHA-256 do conteúdo ou do arquivo; `null` quando não há dossiê com o hash. */
export async function verifyDossierHash(hash: string): Promise<DossierVerification | null> {
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  const data = await fetchPublicJson<DossierVerification>("posts", `/demands/dossiers/verify/${hash}`);
  return data && data.valid === true ? data : null;
}
