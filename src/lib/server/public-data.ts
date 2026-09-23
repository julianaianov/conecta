/**
 * Leituras públicas para Server Components. Este módulo nunca envia sessão:
 * ações mutáveis continuam no cliente autenticado e no backend protegido.
 */
import {
  MAX_PUBLIC_LIST_LIMIT,
  publicFallback,
  readServerApiEnv,
  requestPublicJson,
} from "./public-api.ts";
import { demo } from "../app/demo.ts";
import {
  normalizeRole,
  type Comment,
  type Community,
  type Post,
  type Profile,
  type RankCategory,
  type RankEntry,
  type SupportRecord,
  type SupportSummaryItem,
  type ProfileType,
  type PostStatus,
  type PostType,
  type SupportType,
  type PaymentMethod,
} from "../app/types.ts";


export { publicFallback } from "./public-api.ts";

type RawRecord = Record<string, unknown>;

type PublicPostFilters = {
  type?: string;
  status?: string;
  neighborhood?: string;
  authorId?: string;
  limit?: number;
  offset?: number;
};

type PublicMapFilters = { type?: string; status?: string };

function cappedLimit(limit: number | undefined): number {
  return Math.min(Math.max(Math.trunc(limit ?? 20), 1), MAX_PUBLIC_LIST_LIMIT);
}

function nonNegativeOffset(offset: number | undefined): number {
  return Math.max(Math.trunc(offset ?? 0), 0);
}

function listQuery(filters: PublicPostFilters): string {
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.status) query.set("status", filters.status);
  if (filters.neighborhood) query.set("neighborhood", filters.neighborhood);
  if (filters.authorId) query.set("author_id", filters.authorId);
  query.set("limit", String(cappedLimit(filters.limit)));
  query.set("offset", String(nonNegativeOffset(filters.offset)));
  return `/?${query}`;
}

function mapPost(raw: RawRecord): Post {
  const images = Array.isArray(raw.images) ? raw.images.map(String) : [];
  const videos = Array.isArray(raw.videos) ? raw.videos.map(String) : [];
  const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];

  return {
    id: String(raw.id ?? ""),
    authorId: String(raw.author_id ?? raw.authorId ?? ""),
    authorName: String(raw.author_name ?? raw.authorName ?? "Usuário"),
    authorAvatar: (raw.author_avatar ?? raw.authorAvatar ?? null) as string | null,
    type: (raw.type as PostType) ?? "problem",
    title: String(raw.title ?? ""),
    description: String(raw.description ?? ""),
    status: (raw.status as PostStatus) ?? "active",
    latitude: raw.latitude == null ? null : Number(raw.latitude),
    longitude: raw.longitude == null ? null : Number(raw.longitude),
    neighborhood: (raw.neighborhood ?? null) as string | null,
    city: (raw.city ?? null) as string | null,
    images,
    videos,
    tags,
    reactionsCount: Number(raw.reactions_count ?? raw.reactionsCount ?? 0),
    commentsCount: Number(raw.comments_count ?? raw.commentsCount ?? 0),
    viewsCount: Number(raw.views_count ?? raw.viewsCount ?? 0),
    createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
}

function mapComment(raw: RawRecord): Comment {
  return {
    id: String(raw.id ?? ""),
    postId: String(raw.post_id ?? raw.postId ?? ""),
    authorId: String(raw.author_id ?? raw.authorId ?? ""),
    authorName: String(raw.author_name ?? raw.authorName ?? "Usuário"),
    content: String(raw.content ?? ""),
    createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
}

function mapSupport(raw: RawRecord): SupportRecord {
  return {
    id: String(raw.id ?? ""),
    postId: String(raw.post_id ?? raw.postId ?? ""),
    postTitle: (raw.post_title ?? raw.postTitle) as string | undefined,
    postType: (raw.post_type ?? raw.postType) as string | undefined,
    userId: String(raw.user_id ?? raw.userId ?? ""),
    userName: (raw.user_name ?? raw.userName) as string | undefined,
    type: raw.type as SupportType,
    message: (raw.message ?? null) as string | null,
    amount: raw.amount == null ? null : Number(raw.amount),
    paymentMethod: (raw.payment_method ?? raw.paymentMethod ?? null) as PaymentMethod | null,
    details: (raw.details as Record<string, unknown>) ?? {},
    status: String(raw.status ?? "confirmed"),
    neighborhood: (raw.neighborhood ?? null) as string | null,
    city: (raw.city ?? null) as string | null,
    createdAt: String(raw.created_at ?? raw.createdAt ?? new Date().toISOString()),
  };
}

function mapProfile(userId: string, raw: RawRecord, fallback: Profile | null = null): Profile {
  const profileType = (raw.profile_type ?? raw.profileType ?? fallback?.profileType ?? null) as ProfileType | null;
  const role = normalizeRole(
    (raw.role as string | null) ?? fallback?.role,
    profileType,
  );

  return {
    userId,
    name: String(raw.name ?? fallback?.name ?? "Usuário"),
    role,
    profileType,
    bio: (raw.bio as string) ?? fallback?.bio ?? null,
    status: (raw.status as string) ?? fallback?.status ?? null,
    city: (raw.city as string) ?? fallback?.city ?? null,
    neighborhood: (raw.neighborhood as string) ?? fallback?.neighborhood ?? null,
    website: (raw.website as string) ?? fallback?.website ?? null,
    avatarUrl: (raw.avatar_url as string) ?? (raw.avatarUrl as string) ?? fallback?.avatarUrl ?? null,
    coverUrl: (raw.cover_url as string) ?? (raw.coverUrl as string) ?? fallback?.coverUrl ?? null,
    memberSince: (raw.member_since as string) ?? (raw.memberSince as string) ?? fallback?.memberSince,
    friendCount: Number(raw.friend_count ?? raw.friendCount ?? fallback?.friendCount ?? 0),
  };
}

function demoEnabled() {
  const env = readServerApiEnv();
  return { production: env.production, demoAllowed: env.demoAllowed };
}

function demoList<T>(demoValue: T): T | [] {
  return publicFallback({ ...demoEnabled(), demoValue });
}

function demoPostFilters(filters: PublicPostFilters) {
  const posts = demo.listPosts(filters);
  return filters.authorId ? posts.filter((post) => post.authorId === filters.authorId) : posts;
}

export async function getPublicPosts(filters: PublicPostFilters = {}): Promise<Post[]> {
  const data = await requestPublicJson<{ posts?: RawRecord[] }>("posts", listQuery(filters));
  if (data && Array.isArray(data.posts)) return data.posts.map(mapPost);
  return demoList(demoPostFilters(filters)) as Post[];
}

export async function getPublicMapPosts(filters: PublicMapFilters = {}): Promise<Post[]> {
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.status) query.set("status", filters.status);
  const data = await requestPublicJson<RawRecord[]>("posts", `/map${query.toString() ? `?${query}` : ""}`);
  if (Array.isArray(data)) return data.map(mapPost);
  return demoList(demo.mapPosts(filters.type)) as Post[];
}

export async function getPublicPost(id: string): Promise<Post | null> {
  const data = await requestPublicJson<RawRecord>("posts", `/${encodeURIComponent(id)}`);
  if (data) return mapPost(data);
  const fallback = demoEnabled();
  return !fallback.production && fallback.demoAllowed ? demo.getPost(id) : null;
}

export async function getPublicComments(postId: string): Promise<Comment[]> {
  const data = await requestPublicJson<RawRecord[]>("posts", `/${encodeURIComponent(postId)}/comments`);
  if (Array.isArray(data)) return data.map(mapComment);
  return demoList(demo.listComments(postId)) as Comment[];
}

export async function getPublicSupports(
  postId: string,
): Promise<{ summary: SupportSummaryItem[]; supports: SupportRecord[] }> {
  const data = await requestPublicJson<{
    summary?: { type: string; count: number }[];
    supports?: RawRecord[];
  }>("posts", `/${encodeURIComponent(postId)}/supports`);
  if (data) {
    return {
      summary: (data.summary ?? []).map((item) => ({ type: item.type as SupportType, count: Number(item.count) })),
      supports: (data.supports ?? []).map(mapSupport),
    };
  }
  return demoList(demo.postSupports(postId)) as { summary: SupportSummaryItem[]; supports: SupportRecord[] };
}

export async function getPublicProfile(userId: string): Promise<Profile | null> {
  const fallback = demo.getProfile(userId);
  const data = await requestPublicJson<RawRecord>("users", `/${encodeURIComponent(userId)}`);
  if (data) return mapProfile(userId, data, fallback);
  const env = demoEnabled();
  return !env.production && env.demoAllowed ? fallback : null;
}

export async function getPublicPostsByAuthor(userId: string): Promise<Post[]> {
  return getPublicPosts({ authorId: userId, limit: MAX_PUBLIC_LIST_LIMIT });
}

export async function getPublicRanking(): Promise<Record<RankCategory, RankEntry[]>> {
  return demoList(demo.ranking()) as Record<RankCategory, RankEntry[]>;
}

export async function getPublicCommunities(): Promise<Community[]> {
  return demoList(demo.communities()) as Community[];
}
