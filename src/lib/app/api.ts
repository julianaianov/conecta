/** Cliente de API com suporte explícito aos ambientes local, homologação e produção. */
import {
  normalizeRole,
  type Post, type Comment, type SupportRecord, type SupportSummaryItem,
  type User, type Profile, type UserRole, type ProfileType, type PostType, type PostStatus,
  type SupportType, type PaymentMethod, type Community, type Scrap, type Testimonial,
  type AppNotification, type RankCategory, type RankEntry,
  type Connection, type ConnectionEvent, type ConnectionParty, type ConnectionStatus, type ConnectionType,
  type AdminSnapshot,
} from "./types";
import { buildRanking, type RankingMetrics, type RankingUser } from "./ranking";
import { runtime } from "./runtime";
import { normalizeCoordinates } from "./location";
import { buildPostQuery, type PostListFilter } from "./post-query";

const BASE = runtime.apiBase;
const HAS_API = runtime.hasApi;
const TIMEOUT_MS = 6000;

// ── Estado de sessão (cliente) ─────────────────────────────
const TOKEN_KEY = "dmc_token";
const USER_KEY = "dmc_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  const user = JSON.parse(raw) as User;
  // Sessões gravadas antes da mudança de perfis guardam a categoria antiga.
  return { ...user, role: normalizeRole(user.role, user.profileType) };
}
function persist(user: User, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=604800; samesite=lax`;
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`;
}

// ── fetch com timeout ──────────────────────────────────────
class NetworkError extends Error {}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const token = getToken();
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Erro ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new NetworkError("timeout");
    if (err instanceof TypeError) throw new NetworkError("network"); // fetch falhou (offline/CORS)
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Mapeamento snake_case → camelCase ──────────────────────
const num = (v: unknown): number | null => (v == null ? null : Number(v));

type RawPost = Record<string, unknown>;
function mapPost(r: RawPost): Post {
  const coordinates = normalizeCoordinates(r.latitude, r.longitude);
  return {
    id: String(r.id),
    authorId: String(r.author_id ?? r.authorId ?? ""),
    authorName: String(r.author_name ?? r.authorName ?? ""),
    authorAvatar: (r.author_avatar ?? r.authorAvatar ?? null) as string | null,
    type: r.type as PostType,
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    status: r.status as PostStatus,
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    neighborhood: (r.neighborhood ?? null) as string | null,
    city: (r.city ?? null) as string | null,
    images: (r.images as string[]) ?? [],
    videos: (r.videos as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    reactionsCount: Number(r.reactions_count ?? r.reactionsCount ?? 0),
    commentsCount: Number(r.comments_count ?? r.commentsCount ?? 0),
    viewsCount: Number(r.views_count ?? r.viewsCount ?? 0),
    createdAt: String(r.created_at ?? r.createdAt ?? ""),
  };
}
function mapComment(r: RawPost): Comment {
  return {
    id: String(r.id),
    postId: String(r.post_id ?? ""),
    authorId: String(r.author_id ?? ""),
    authorName: String(r.author_name ?? ""),
    content: String(r.content ?? ""),
    createdAt: String(r.created_at ?? ""),
  };
}
function mapSupport(r: RawPost): SupportRecord {
  return {
    id: String(r.id),
    postId: String(r.post_id ?? ""),
    postTitle: (r.post_title as string) ?? undefined,
    postType: (r.post_type as string) ?? undefined,
    userId: String(r.user_id ?? ""),
    userName: (r.user_name as string) ?? undefined,
    type: r.type as SupportType,
    message: (r.message ?? null) as string | null,
    amount: num(r.amount),
    paymentMethod: (r.payment_method ?? null) as PaymentMethod | null,
    details: (r.details as Record<string, unknown>) ?? {},
    status: String(r.status ?? ""),
    neighborhood: (r.neighborhood ?? null) as string | null,
    city: (r.city ?? null) as string | null,
    createdAt: String(r.created_at ?? ""),
  };
}
function mapUser(r: RawPost): User {
  return {
    id: String(r.id),
    email: String(r.email ?? ""),
    name: String(r.name ?? ""),
    role: normalizeRole(r.role as string | null, (r.profile_type ?? r.profileType ?? null) as string | null),
    profileType: (r.profile_type ?? r.profileType ?? null) as ProfileType | null,
    avatarUrl: (r.avatar_url ?? r.avatarUrl ?? null) as string | null,
  };
}
function mapCommunity(r: RawPost): Community {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    category: String(r.category ?? ""),
    memberCount: Number(r.member_count ?? r.memberCount ?? 0),
    imageUrl: (r.image_url ?? r.imageUrl ?? null) as string | null,
  };
}

function mapConnectionParty(r: RawPost): ConnectionParty {
  const role = (r.role as string | null) ?? null;
  const profileType = (r.profileType ?? r.profile_type ?? null) as ProfileType | null;
  return {
    userId: String(r.userId ?? r.user_id ?? ""),
    name: String(r.name ?? ""),
    avatarUrl: (r.avatarUrl ?? r.avatar_url ?? null) as string | null,
    role: role || profileType ? normalizeRole(role, profileType) : null,
    profileType,
  };
}

function mapConnection(r: RawPost): Connection {
  return {
    id: String(r.id),
    type: r.type as ConnectionType,
    status: r.status as ConnectionStatus,
    from: mapConnectionParty((r.from as RawPost) ?? {}),
    to: mapConnectionParty((r.to as RawPost) ?? {}),
    message: String(r.message ?? ""),
    postId: (r.postId ?? r.post_id ?? null) as string | null,
    postTitle: (r.postTitle ?? r.post_title ?? null) as string | null,
    outcome: (r.outcome ?? null) as string | null,
    createdAt: String(r.createdAt ?? r.created_at ?? ""),
    updatedAt: String(r.updatedAt ?? r.updated_at ?? ""),
    events: Array.isArray(r.events) ? (r.events as ConnectionEvent[]) : [],
  };
}

function mapScrap(r: RawPost): Scrap {
  return {
    id: String(r.id),
    authorId: String(r.authorId ?? r.author_id ?? ""),
    authorName: String(r.authorName ?? r.author_name ?? ""),
    authorAvatar: (r.authorAvatar ?? r.author_avatar ?? null) as string | null,
    targetUserId: String(r.targetUserId ?? r.target_user_id ?? ""),
    content: String(r.content ?? ""),
    createdAt: String(r.createdAt ?? r.created_at ?? ""),
  };
}

function mapTestimonial(r: RawPost): Testimonial {
  return {
    id: String(r.id),
    authorId: String(r.authorId ?? r.author_id ?? ""),
    authorName: String(r.authorName ?? r.author_name ?? ""),
    authorAvatar: (r.authorAvatar ?? r.author_avatar ?? null) as string | null,
    targetUserId: String(r.targetUserId ?? r.target_user_id ?? ""),
    content: String(r.content ?? ""),
    createdAt: String(r.createdAt ?? r.created_at ?? ""),
  };
}

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
export const api = {
  hasApi: HAS_API,

  async login(email: string, password: string): Promise<User> {
    if (!HAS_API) throw new Error("O serviço de autenticação está indisponível.");
    try {
      const data = await request<{ user: RawPost; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const user = mapUser(data.user);
      persist(user, data.token);
      return user;
    } catch (err) {
      if (err instanceof NetworkError) throw new Error("Não foi possível conectar ao serviço. Tente novamente.");
      throw err;
    }
  },

  async register(input: { name: string; email: string; password: string; role: UserRole; profileType: ProfileType }): Promise<User> {
    if (!HAS_API) throw new Error("O cadastro está indisponível neste momento.");
    try {
      const data = await request<{ user: RawPost; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: input.name, email: input.email, password: input.password,
          role: input.role, profile_type: input.profileType,
        }),
      });
      const user = mapUser(data.user);
      persist(user, data.token);
      return user;
    } catch (err) {
      if (err instanceof NetworkError) throw new Error("Não foi possível conectar ao serviço. Tente novamente.");
      throw err;
    }
  },

  /**
   * Garante a linha do perfil no user-service (idempotente). O cadastro grava a
   * conta só no auth-service; sem o perfil a conta não aparece no ranking nem
   * consegue criar conexões, recados ou depoimentos.
   */
  async provisionProfile(): Promise<void> {
    if (!HAS_API || !getToken()) return;
    await request<RawPost>("/api/users/me/provision", { method: "POST", body: "{}" });
  },

  async verify(): Promise<User | null> {
    if (!HAS_API) {
      clearSession();
      return null;
    }
    try {
      const data = await request<{ user: RawPost }>("/api/auth/verify");
      return mapUser(data.user);
    } catch {
      return null; // token inválido
    }
  },

  logout() {
    clearSession();
  },

  // ── POSTS ────────────────────────────────────────────────
  listPosts(filter?: PostListFilter): Promise<Post[]> {
    return request<{ posts: RawPost[] }>(`/api/posts/?${buildPostQuery(filter)}`)
      .then((data) => data.posts.map(mapPost));
  },

  mapPosts(type?: string): Promise<Post[]> {
    const q = new URLSearchParams();
    if (type) q.set("type", type);
    return request<RawPost[]>(`/api/posts/map?${q}`).then((data) => data.map(mapPost));
  },

  getPost(id: string): Promise<Post | null> {
    return request<RawPost>(`/api/posts/${id}`)
      .then(mapPost)
      .catch((err) => {
        if (err instanceof Error && err.message.includes("Post não encontrado")) return null;
        throw err;
      });
  },

  createPost(input: Partial<Post>, _author: User): Promise<Post> {
    void _author;
    const coordinates = normalizeCoordinates(input.latitude, input.longitude);
    return request<RawPost>("/api/posts/", {
      method: "POST",
      body: JSON.stringify({
        type: input.type, title: input.title, description: input.description,
        neighborhood: input.neighborhood, city: input.city,
        latitude: coordinates?.latitude, longitude: coordinates?.longitude, tags: input.tags ?? [],
        images: input.images ?? [],
        videos: input.videos ?? [],
      }),
    }).then(mapPost);
  },

  updatePostLocation(id: string, latitude: number | null, longitude: number | null): Promise<Post | null> {
    const coordinates = normalizeCoordinates(latitude, longitude);
    return request<RawPost>(`/api/posts/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          latitude: coordinates?.latitude ?? null,
          longitude: coordinates?.longitude ?? null,
        }),
      }).then(mapPost);
  },

  updatePostStatus(id: string, status: PostStatus): Promise<Post | null> {
    return request<RawPost>(`/api/posts/${id}`, { method: "PUT", body: JSON.stringify({ status }) }).then(mapPost);
  },

  // ── COMMENTS ─────────────────────────────────────────────
  listComments(postId: string): Promise<Comment[]> {
    return request<RawPost[]>(`/api/posts/${postId}/comments`).then((rows) => rows.map(mapComment));
  },

  addComment(postId: string, _author: User, content: string): Promise<Comment> {
    return request<RawPost>(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ content }) })
      .then(mapComment);
  },

  toggleReaction(postId: string): Promise<{ action: string; reactions_count: number }> {
    return request<{ action: string; reactions_count: number }>(`/api/posts/${postId}/reactions`, { method: "POST", body: "{}" });
  },

  // ── SUPPORTS ─────────────────────────────────────────────
  postSupports(postId: string): Promise<{ summary: SupportSummaryItem[]; supports: SupportRecord[] }> {
    return request<{ summary: { type: string; count: number }[]; supports: RawPost[] }>(`/api/posts/${postId}/supports`)
      .then((data) => ({
        summary: data.summary.map((s) => ({ type: s.type as SupportType, count: Number(s.count) })),
        supports: data.supports.map(mapSupport),
      }));
  },

  mySupportsForPost(postId: string, userId: string): Promise<SupportRecord[]> {
    void userId;
    return request<RawPost[]>(`/api/posts/${postId}/supports/mine`).then((rows) => rows.map(mapSupport));
  },

  addSupport(postId: string, _user: User, input: Partial<SupportRecord>): Promise<{ support: SupportRecord; reactions_count: number }> {
    return request<{ support: RawPost; reactions_count: number }>(`/api/posts/${postId}/supports`, {
      method: "POST",
      body: JSON.stringify({
        type: input.type, message: input.message ?? undefined,
        amount: input.amount ?? undefined, payment_method: input.paymentMethod ?? undefined,
        details: input.details ?? {},
      }),
    }).then((data) => ({ support: mapSupport(data.support), reactions_count: Number(data.reactions_count ?? 0) }));
  },

  removeSupport(postId: string, userId: string, type: SupportType): Promise<{ reactions_count: number }> {
    void userId;
    return request<{ reactions_count: number }>(`/api/posts/${postId}/supports/${type}`, { method: "DELETE" });
  },

  mySupports(userId: string): Promise<SupportRecord[]> {
    void userId;
    return request<RawPost[]>(`/api/posts/my/supports`).then((rows) => rows.map(mapSupport));
  },

  // ── NOTIFICAÇÕES ─────────────────────────────────────────
  async notifications(userId: string): Promise<AppNotification[]> {
    void userId;
    return request<AppNotification[]>("/api/users/notifications");
  },

  // ── PROFILE ──────────────────────────────────────────────
  async getProfile(userId: string): Promise<Profile | null> {
    try {
      const r = await request<RawPost>(`/api/users/${userId}`);
      return {
        userId,
        name: String(r.name ?? ""),
        role: normalizeRole((r.role as string) ?? null, (r.profile_type as string) ?? null),
        profileType: (r.profile_type ?? null) as ProfileType | null,
        email: r.email as string | undefined,
        bio: (r.bio as string) ?? null,
        status: (r.status as string) ?? null,
        city: (r.city as string) ?? null,
        neighborhood: (r.neighborhood as string) ?? null,
        website: (r.website as string) ?? null,
        avatarUrl: (r.avatar_url as string) ?? null,
        coverUrl: (r.cover_url as string) ?? null,
        memberSince: r.member_since as string | undefined,
        friendCount: Number(r.friend_count ?? 0),
      };
    } catch (err) {
      if (err instanceof NetworkError) throw new Error("Não foi possível carregar o perfil. Tente novamente.");
      throw err;
    }
  },

  // ── DADOS DE PERFIL E ATUAÇÃO ────────────────────────────
  postsByAuthor(userId: string): Promise<Post[]> {
    return request<{ posts: RawPost[] }>(`/api/posts/?${buildPostQuery({ authorId: userId, limit: 5000 })}`)
      .then((data) => data.posts.map(mapPost));
  },
  scrapsFor(userId: string): Promise<Scrap[]> {
    return request<RawPost[]>(`/api/users/scraps/${userId}`).then((rows) => rows.map(mapScrap));
  },
  addScrap(target: string, _author: User, content: string): Promise<Scrap> {
    return request<RawPost>("/api/users/scraps", {
      method: "POST",
      body: JSON.stringify({ targetUserId: target, content }),
    }).then(mapScrap);
  },
  testimonialsFor(userId: string): Promise<Testimonial[]> {
    return request<RawPost[]>(`/api/users/testimonials/${userId}`).then((rows) => rows.map(mapTestimonial));
  },
  addTestimonial(target: string, _author: User, content: string): Promise<Testimonial> {
    return request<RawPost>("/api/users/testimonials", {
      method: "POST",
      body: JSON.stringify({ targetUserId: target, content }),
    }).then(mapTestimonial);
  },
  communities(): Promise<Community[]> {
    return request<RawPost[]>("/api/users/communities").then((rows) => rows.map(mapCommunity));
  },
  friendsOf(userId: string): Promise<Profile[]> {
    return this.connectionsFor(userId).then((connections) => connections
      .filter((connection) => connection.status === "accepted")
      .map((connection) => connection.from.userId === userId ? connection.to : connection.from)
      .map((party) => ({
        userId: party.userId,
        name: party.name,
        role: party.role ?? "",
        profileType: party.profileType ?? null,
        avatarUrl: party.avatarUrl ?? null,
        friendCount: 0,
      })));
  },

  /** Ranking calculado a partir dos perfis e da atividade persistida. */
  async ranking(): Promise<Record<RankCategory, RankEntry[]>> {
    const [userData, metricsData] = await Promise.all([
      request<Record<string, RawPost[]>>("/api/users/ranking"),
      request<RawPost[]>("/api/posts/ranking"),
    ]);
    const users: RankingUser[] = ["partner", "agent", "volunteer"]
      .flatMap((category) => userData[category] ?? [])
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
  },

  // ── CONEXÕES ─────────────────────────────────────────────
  connectionsFor(userId: string): Promise<Connection[]> {
    void userId;
    return request<RawPost[]>("/api/users/connections").then((rows) => rows.map(mapConnection));
  },
  getConnection(id: string): Promise<Connection | null> {
    return request<RawPost>(`/api/users/connections/${id}`)
      .then(mapConnection)
      .catch((err) => {
        if (err instanceof Error && err.message.includes("Conexão não encontrada")) return null;
        throw err;
      });
  },
  connectionTargets(userId: string): Promise<ConnectionParty[]> {
    void userId;
    return request<RawPost[]>("/api/users/connections/targets").then((rows) => rows.map(mapConnectionParty));
  },
  createConnection(input: { from: User; toUserId: string; type: ConnectionType; message: string; postId?: string | null }): Promise<Connection> {
    return request<RawPost>("/api/users/connections", {
      method: "POST",
      body: JSON.stringify({ toUserId: input.toUserId, type: input.type, message: input.message, postId: input.postId ?? null }),
    }).then(mapConnection);
  },
  updateConnection(id: string, status: ConnectionStatus, outcome?: string): Promise<Connection | null> {
    return request<RawPost>(`/api/users/connections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status, outcome }),
    }).then(mapConnection);
  },

  /** Base bruta do painel administrativo, agregada pelos serviços persistentes. */
  async adminSnapshot(): Promise<AdminSnapshot> {
    const [userData, postData] = await Promise.all([
      request<Omit<AdminSnapshot, "posts" | "supports" | "comments">>("/api/users/admin-snapshot"),
      request<{ posts: RawPost[]; supports: RawPost[]; comments: RawPost[] }>("/api/posts/admin-snapshot"),
    ]);
    return {
      ...userData,
      posts: postData.posts.map(mapPost),
      supports: postData.supports.map(mapSupport),
      comments: postData.comments.map(mapComment),
    };
  },
};
