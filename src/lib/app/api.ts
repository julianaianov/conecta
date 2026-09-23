/** Cliente de API com suporte explícito aos ambientes local, homologação e produção. */
import {
  normalizeRole,
  type Post, type Comment, type SupportRecord, type SupportSummaryItem,
  type User, type Profile, type UserRole, type ProfileType, type PostType, type PostStatus,
  type SupportType, type PaymentMethod, type Community, type Scrap, type Testimonial,
  type AppNotification, type RankCategory, type RankEntry,
  type Connection, type ConnectionParty, type ConnectionStatus, type ConnectionType,
} from "./types";
import type { AdminSnapshot } from "./admin";
import { runtime } from "./runtime";

const BASE = runtime.apiBase;
const HAS_API = runtime.hasApi;
const TIMEOUT_MS = 6000;

// ── Estado de sessão (cliente) ─────────────────────────────
const TOKEN_KEY = "dmc_token";
const USER_KEY = "dmc_user";
const DEMO_KEY = "dmc_demo";

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
export function isDemoMode(): boolean {
  return false;
}
function persist(user: User, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.removeItem(DEMO_KEY);
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=604800; samesite=lax`;
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(DEMO_KEY);
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
  return {
    id: String(r.id),
    authorId: String(r.author_id ?? r.authorId ?? ""),
    authorName: String(r.author_name ?? r.authorName ?? "Usuário"),
    authorAvatar: (r.author_avatar ?? r.authorAvatar ?? null) as string | null,
    type: (r.type as PostType) ?? "problem",
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    status: (r.status as PostStatus) ?? "active",
    latitude: num(r.latitude),
    longitude: num(r.longitude),
    neighborhood: (r.neighborhood ?? null) as string | null,
    city: (r.city ?? null) as string | null,
    images: (r.images as string[]) ?? [],
    videos: (r.videos as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    reactionsCount: Number(r.reactions_count ?? r.reactionsCount ?? 0),
    commentsCount: Number(r.comments_count ?? r.commentsCount ?? 0),
    viewsCount: Number(r.views_count ?? r.viewsCount ?? 0),
    createdAt: String(r.created_at ?? r.createdAt ?? new Date().toISOString()),
  };
}
function mapComment(r: RawPost): Comment {
  return {
    id: String(r.id),
    postId: String(r.post_id ?? ""),
    authorId: String(r.author_id ?? ""),
    authorName: String(r.author_name ?? "Usuário"),
    content: String(r.content ?? ""),
    createdAt: String(r.created_at ?? new Date().toISOString()),
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
    status: String(r.status ?? "confirmed"),
    neighborhood: (r.neighborhood ?? null) as string | null,
    city: (r.city ?? null) as string | null,
    createdAt: String(r.created_at ?? new Date().toISOString()),
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

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
export const api = {
  hasApi: HAS_API,
  demoAllowed: false,

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

  async verify(): Promise<User | null> {
    if (!HAS_API || !getToken()) return null;
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
  listPosts(filter?: { type?: string; status?: string; neighborhood?: string; authorId?: string; limit?: number; offset?: number }): Promise<Post[]> {
    return (async () => {
      const q = new URLSearchParams();
      if (filter?.type) q.set("type", filter.type);
      if (filter?.status) q.set("status", filter.status);
      if (filter?.neighborhood) q.set("neighborhood", filter.neighborhood);
      if (filter?.authorId) q.set("author_id", filter.authorId);
      q.set("limit", String(filter?.limit ?? 20));
      q.set("offset", String(filter?.offset ?? 0));
      const data = await request<{ posts: RawPost[] }>(`/api/posts/?${q}`);
      return data.posts.map(mapPost);
    })();
  },

  mapPosts(type?: string): Promise<Post[]> {
    return (async () => {
      const q = new URLSearchParams();
      if (type) q.set("type", type);
      const data = await request<RawPost[]>(`/api/posts/map?${q}`);
      return data.map(mapPost);
    })();
  },

  getPost(id: string): Promise<Post | null> {
    return request<RawPost>(`/api/posts/${id}`).then(mapPost);
  },

  createPost(input: Partial<Post>, _author: User): Promise<Post> {
    return request<RawPost>("/api/posts/", {
      method: "POST",
      body: JSON.stringify({
        type: input.type, title: input.title, description: input.description,
        neighborhood: input.neighborhood, city: input.city,
        latitude: input.latitude, longitude: input.longitude, tags: input.tags ?? [],
        images: input.images ?? [],
        videos: input.videos ?? [],
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
    return request<RawPost>(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ content }) }).then(mapComment);
  },

  toggleReaction(postId: string): Promise<{ action: string; reactions_count: number }> {
    return request<{ action: string; reactions_count: number }>(`/api/posts/${postId}/reactions`, { method: "POST", body: "{}" });
  },

  // ── SUPPORTS ─────────────────────────────────────────────
  postSupports(postId: string): Promise<{ summary: SupportSummaryItem[]; supports: SupportRecord[] }> {
    return request<{ summary: { type: string; count: number }[]; supports: RawPost[] }>(`/api/posts/${postId}/supports`).then((data) => ({
      summary: data.summary.map((s) => ({ type: s.type as SupportType, count: Number(s.count) })),
      supports: data.supports.map(mapSupport),
    }));
  },

  mySupportsForPost(postId: string, _userId: string): Promise<SupportRecord[]> {
    return request<RawPost[]>(`/api/posts/${postId}/supports/mine`).then((rows) => rows.map(mapSupport));
  },

  addSupport(postId: string, _user: User, input: Partial<SupportRecord>): Promise<{ support: SupportRecord; reactions_count: number }> {
    return request<{ support: RawPost; reactions_count: number }>(`/api/posts/${postId}/supports`, {
      method: "POST",
      body: JSON.stringify({
        type: input.type, message: input.message ?? undefined,
        amount: input.amount ?? undefined, payment_method: input.paymentMethod ?? undefined,
        details: input.details ?? {}, status: input.status ?? "confirmed",
      }),
    }).then((data) => ({ support: mapSupport(data.support), reactions_count: Number(data.reactions_count ?? 0) }));
  },

  removeSupport(postId: string, _userId: string, type: SupportType): Promise<{ reactions_count: number }> {
    return request<{ reactions_count: number }>(`/api/posts/${postId}/supports/${type}`, { method: "DELETE" });
  },

  mySupports(_userId: string): Promise<SupportRecord[]> {
    return request<RawPost[]>(`/api/posts/my/supports`).then((rows) => rows.map(mapSupport));
  },

  // ── NOTIFICAÇÕES (derivadas — sem backend dedicado) ──────
  async notifications(_userId: string): Promise<AppNotification[]> {
    return [];
  },

  // ── PROFILE ──────────────────────────────────────────────
  async getProfile(userId: string): Promise<Profile | null> {
    try {
      const r = await request<RawPost>(`/api/users/${userId}`);
      return {
        userId,
        name: String(r.name ?? "Usuário"),
        role: normalizeRole(r.role as string, r.profile_type as string),
        profileType: (r.profile_type ?? null) as ProfileType | null,
        bio: (r.bio as string) ?? null,
        status: (r.status as string) ?? null,
        city: (r.city as string) ?? null,
        neighborhood: (r.neighborhood as string) ?? null,
        website: (r.website as string) ?? null,
        avatarUrl: (r.avatar_url as string) ?? null,
        coverUrl: (r.cover_url as string) ?? null,
        memberSince: (r.member_since as string) ?? undefined,
        friendCount: Number(r.friend_count ?? 0),
      };
    } catch (err) {
      if (err instanceof NetworkError) throw new Error("Não foi possível carregar o perfil. Tente novamente.");
      throw err;
    }
  },

  /** Perfil mínimo a partir do usuário logado (quando não há perfil no backend). */
  profileFromSession(userId: string): Profile | null {
    const u = getStoredUser();
    if (!u || u.id !== userId) return null;
    return {
      userId, name: u.name, role: u.role, profileType: u.profileType ?? null, email: u.email,
      bio: null, status: null, city: null, neighborhood: null, website: null,
      avatarUrl: u.avatarUrl ?? null, coverUrl: null, friendCount: 0,
    };
  },

  // ── SOCIAL ──────────────────────────────────────────────
  postsByAuthor(userId: string): Promise<Post[]> {
    const q = new URLSearchParams({ author_id: userId, limit: "5000", offset: "0" });
    return request<{ posts: RawPost[] }>(`/api/posts/?${q}`).then((data) => data.posts.map(mapPost));
  },
  scrapsFor(_userId: string): Promise<Scrap[]> {
    return Promise.resolve([]);
  },
  addScrap(_target: string, _author: User, _content: string): Promise<Scrap> {
    return Promise.reject(new Error("Recados ainda não estão disponíveis até a integração do serviço."));
  },
  testimonialsFor(_userId: string): Promise<Testimonial[]> {
    return Promise.resolve([]);
  },
  addTestimonial(_target: string, _author: User, _content: string): Promise<Testimonial> {
    return Promise.reject(new Error("Depoimentos ainda não estão disponíveis até a integração do serviço."));
  },
  communities(): Promise<Community[]> {
    return Promise.resolve([]);
  },
  friendsOf(_userId: string): Promise<Profile[]> {
    return Promise.resolve([]);
  },

  /** Ranking sem endpoint persistente: não inventa resultados. */
  ranking(): Promise<Record<RankCategory, RankEntry[]>> {
    return Promise.resolve({ partner: [], agent: [], volunteer: [] });
  },

  // ── CONEXÕES ────────────────────────────────────────────
  connectionsFor(_userId: string): Promise<Connection[]> {
    return Promise.resolve([]);
  },
  getConnection(_id: string): Promise<Connection | null> {
    return Promise.resolve(null);
  },
  connectionTargets(_userId: string): Promise<ConnectionParty[]> {
    return Promise.resolve([]);
  },
  createConnection(_input: { from: User; toUserId: string; type: ConnectionType; message: string; postId?: string | null }): Promise<Connection> {
    return Promise.reject(new Error("Conexões ainda não estão disponíveis até a integração do serviço."));
  },
  updateConnection(_id: string, _status: ConnectionStatus, _outcome?: string): Promise<Connection | null> {
    return Promise.reject(new Error("Conexões ainda não estão disponíveis até a integração do serviço."));
  },

  /** Sem endpoint agregador: o painel permanece vazio até a integração real. */
  adminSnapshot(): Promise<AdminSnapshot> {
    return Promise.resolve({
      posts: [], supports: [], comments: [], users: [], communities: [],
      scraps: [], testimonials: [], connections: [],
    });
  },
};
