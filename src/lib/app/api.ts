/**
 * DM Conecta — cliente de API híbrido.
 * Tenta o gateway real (NEXT_PUBLIC_API_URL → nginx :8080) e cai para os dados
 * demo em memória quando indisponível, espelhando o useDemoFallback do app Flutter.
 * Social (recados/depoimentos/comunidades/amizades) é sempre demo (sem backend).
 */
import {
  type Post, type Comment, type SupportRecord, type SupportSummaryItem,
  type User, type Profile, type UserRole, type PostType, type PostStatus,
  type SupportType, type PaymentMethod, type Community, type Scrap, type Testimonial,
} from "./types";
import { demo, DEMO_TOKEN, DEMO_USERS } from "./demo";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/$/, "");
const HAS_API = BASE.length > 0;
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
  return raw ? (JSON.parse(raw) as User) : null;
}
export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_KEY) === "1";
}
function persist(user: User, token: string, isDemo: boolean) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  localStorage.setItem(DEMO_KEY, isDemo ? "1" : "0");
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
        ...(token && !isDemoMode() ? { Authorization: `Bearer ${token}` } : {}),
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

/** Executa via API real; em erro de rede usa o fallback demo. */
async function hybrid<T>(real: () => Promise<T>, fallback: () => T): Promise<T> {
  if (!HAS_API || isDemoMode()) return fallback();
  try {
    return await real();
  } catch (err) {
    if (err instanceof NetworkError) return fallback();
    throw err;
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
    role: (r.role as UserRole) ?? "citizen",
    avatarUrl: (r.avatar_url ?? r.avatarUrl ?? null) as string | null,
  };
}

// ════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════
export const api = {
  hasApi: HAS_API,

  async login(email: string, password: string): Promise<User> {
    if (HAS_API && !isDemoMode()) {
      try {
        const data = await request<{ user: RawPost; token: string }>("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        const user = mapUser(data.user);
        persist(user, data.token, false);
        return user;
      } catch (err) {
        if (!(err instanceof NetworkError)) throw err;
        // rede falhou → tenta demo
      }
    }
    return this.loginDemo(email, password);
  },

  loginDemo(email?: string, password?: string): User {
    const entry = email ? DEMO_USERS[email.toLowerCase().trim()] : undefined;
    if (email && (!entry || (password && entry.password !== password))) {
      throw new Error("Credenciais inválidas. Use uma conta demo (ex.: maria@recreio.conecta / demo123).");
    }
    const u = entry ?? DEMO_USERS["maria@recreio.conecta"];
    const user: User = { id: u.id, email: u.email, name: u.name, role: u.role, avatarUrl: u.avatarUrl };
    persist(user, DEMO_TOKEN, true);
    return user;
  },

  async register(input: { name: string; email: string; password: string; role: UserRole }): Promise<User> {
    if (HAS_API) {
      try {
        const data = await request<{ user: RawPost; token: string }>("/api/auth/register", {
          method: "POST",
          body: JSON.stringify(input),
        });
        const user = mapUser(data.user);
        persist(user, data.token, false);
        return user;
      } catch (err) {
        if (!(err instanceof NetworkError)) throw err;
      }
    }
    // fallback demo: cria sessão local
    const user: User = { id: `local-${Date.now()}`, email: input.email, name: input.name, role: input.role, avatarUrl: null };
    persist(user, DEMO_TOKEN, true);
    return user;
  },

  async verify(): Promise<User | null> {
    if (isDemoMode()) return getStoredUser();
    if (!HAS_API) return getStoredUser();
    try {
      const data = await request<{ user: RawPost }>("/api/auth/verify");
      return mapUser(data.user);
    } catch (err) {
      if (err instanceof NetworkError) return getStoredUser();
      return null; // token inválido
    }
  },

  logout() {
    clearSession();
  },

  // ── POSTS ────────────────────────────────────────────────
  listPosts(filter?: { type?: string; status?: string; neighborhood?: string; limit?: number; offset?: number }): Promise<Post[]> {
    return hybrid(
      async () => {
        const q = new URLSearchParams();
        if (filter?.type) q.set("type", filter.type);
        if (filter?.status) q.set("status", filter.status);
        if (filter?.neighborhood) q.set("neighborhood", filter.neighborhood);
        q.set("limit", String(filter?.limit ?? 20));
        q.set("offset", String(filter?.offset ?? 0));
        const data = await request<{ posts: RawPost[] }>(`/api/posts/?${q}`);
        return data.posts.map(mapPost);
      },
      () => demo.listPosts(filter),
    );
  },

  mapPosts(type?: string): Promise<Post[]> {
    return hybrid(
      async () => {
        const q = new URLSearchParams();
        if (type) q.set("type", type);
        const data = await request<RawPost[]>(`/api/posts/map?${q}`);
        return data.map(mapPost);
      },
      () => demo.mapPosts(type),
    );
  },

  getPost(id: string): Promise<Post | null> {
    return hybrid(
      async () => mapPost(await request<RawPost>(`/api/posts/${id}`)),
      () => demo.getPost(id),
    );
  },

  createPost(input: Partial<Post>, author: User): Promise<Post> {
    return hybrid(
      async () =>
        mapPost(
          await request<RawPost>("/api/posts/", {
            method: "POST",
            body: JSON.stringify({
              type: input.type, title: input.title, description: input.description,
              neighborhood: input.neighborhood, city: input.city,
              latitude: input.latitude, longitude: input.longitude, tags: input.tags ?? [],
              images: input.images ?? [],
            }),
          }),
        ),
      () => demo.createPost(input, author),
    );
  },

  updatePostStatus(id: string, status: PostStatus): Promise<Post | null> {
    return hybrid(
      async () => mapPost(await request<RawPost>(`/api/posts/${id}`, { method: "PUT", body: JSON.stringify({ status }) })),
      () => demo.updatePostStatus(id, status),
    );
  },

  // ── COMMENTS ─────────────────────────────────────────────
  listComments(postId: string): Promise<Comment[]> {
    return hybrid(
      async () => (await request<RawPost[]>(`/api/posts/${postId}/comments`)).map(mapComment),
      () => demo.listComments(postId),
    );
  },

  addComment(postId: string, author: User, content: string): Promise<Comment> {
    return hybrid(
      async () => mapComment(await request<RawPost>(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ content }) })),
      () => demo.addComment(postId, author, content),
    );
  },

  toggleReaction(postId: string): Promise<{ action: string; reactions_count: number }> {
    return hybrid(
      async () => request<{ action: string; reactions_count: number }>(`/api/posts/${postId}/reactions`, { method: "POST", body: "{}" }),
      () => demo.toggleReaction(postId),
    );
  },

  // ── SUPPORTS ─────────────────────────────────────────────
  postSupports(postId: string): Promise<{ summary: SupportSummaryItem[]; supports: SupportRecord[] }> {
    return hybrid(
      async () => {
        const data = await request<{ summary: { type: string; count: number }[]; supports: RawPost[] }>(`/api/posts/${postId}/supports`);
        return {
          summary: data.summary.map((s) => ({ type: s.type as SupportType, count: Number(s.count) })),
          supports: data.supports.map(mapSupport),
        };
      },
      () => {
        const d = demo.postSupports(postId);
        return { summary: d.summary.map((s) => ({ type: s.type as SupportType, count: s.count })), supports: d.supports };
      },
    );
  },

  mySupportsForPost(postId: string, userId: string): Promise<SupportRecord[]> {
    return hybrid(
      async () => (await request<RawPost[]>(`/api/posts/${postId}/supports/mine`)).map(mapSupport),
      () => demo.mySupportsForPost(postId, userId),
    );
  },

  addSupport(postId: string, user: User, input: Partial<SupportRecord>): Promise<{ support: SupportRecord; reactions_count: number }> {
    return hybrid(
      async () => {
        const data = await request<{ support: RawPost; reactions_count: number }>(`/api/posts/${postId}/supports`, {
          method: "POST",
          body: JSON.stringify({
            type: input.type, message: input.message ?? undefined,
            amount: input.amount ?? undefined, payment_method: input.paymentMethod ?? undefined,
            details: input.details ?? {}, status: input.status ?? "confirmed",
          }),
        });
        return { support: mapSupport(data.support), reactions_count: Number(data.reactions_count ?? 0) };
      },
      () => {
        const d = demo.addSupport(postId, user, input);
        return { support: d.support, reactions_count: d.reactions_count };
      },
    );
  },

  removeSupport(postId: string, userId: string, type: SupportType): Promise<{ reactions_count: number }> {
    return hybrid(
      async () => request<{ reactions_count: number }>(`/api/posts/${postId}/supports/${type}`, { method: "DELETE" }),
      () => demo.removeSupport(postId, userId, type),
    );
  },

  mySupports(userId: string): Promise<SupportRecord[]> {
    return hybrid(
      async () => (await request<RawPost[]>(`/api/posts/my/supports`)).map(mapSupport),
      () => demo.mySupports(userId),
    );
  },

  // ── PROFILE ──────────────────────────────────────────────
  async getProfile(userId: string): Promise<Profile | null> {
    // user-service tem GET /:id, mas os campos sociais (bio/cover/status) do demo
    // são mais ricos — combinamos. Sempre resolve (nunca rejeita): se o perfil real
    // não existir (ex.: usuário recém-cadastrado → 404), cai para o demo / sessão.
    const d = demo.getProfile(userId);
    if (!HAS_API || isDemoMode()) return d ?? this.profileFromSession(userId);
    try {
      const r = await request<RawPost>(`/api/users/${userId}`);
      return {
        userId,
        name: String(r.name ?? d?.name ?? "Usuário"),
        role: (r.role as string) ?? d?.role ?? "citizen",
        bio: (r.bio as string) ?? d?.bio ?? null,
        status: d?.status ?? null,
        city: (r.city as string) ?? d?.city ?? null,
        neighborhood: d?.neighborhood ?? null,
        website: (r.website as string) ?? d?.website ?? null,
        avatarUrl: (r.avatar_url as string) ?? d?.avatarUrl ?? null,
        coverUrl: d?.coverUrl ?? null,
        memberSince: d?.memberSince,
        friendCount: d?.friendCount ?? 0,
      };
    } catch {
      // 404 (sem perfil) ou rede → usa demo, ou sintetiza a partir da sessão
      return d ?? this.profileFromSession(userId);
    }
  },

  /** Perfil mínimo a partir do usuário logado (quando não há perfil no backend). */
  profileFromSession(userId: string): Profile | null {
    const u = getStoredUser();
    if (!u || u.id !== userId) return null;
    return {
      userId, name: u.name, role: u.role, email: u.email,
      bio: null, status: null, city: null, neighborhood: null, website: null,
      avatarUrl: u.avatarUrl ?? null, coverUrl: null, friendCount: 0,
    };
  },

  // ── SOCIAL (sempre demo — sem backend) ───────────────────
  postsByAuthor(userId: string): Promise<Post[]> {
    return hybrid(
      async () => {
        const data = await request<{ posts: RawPost[] }>(`/api/posts/?limit=50`);
        return data.posts.map(mapPost).filter((p) => p.authorId === userId);
      },
      () => demo.postsByAuthor(userId),
    );
  },
  scrapsFor(userId: string): Promise<Scrap[]> {
    return Promise.resolve(demo.scrapsFor(userId));
  },
  addScrap(target: string, author: User, content: string): Promise<Scrap> {
    return Promise.resolve(demo.addScrap(target, author, content));
  },
  testimonialsFor(userId: string): Promise<Testimonial[]> {
    return Promise.resolve(demo.testimonialsFor(userId));
  },
  addTestimonial(target: string, author: User, content: string): Promise<Testimonial> {
    return Promise.resolve(demo.addTestimonial(target, author, content));
  },
  communities(): Promise<Community[]> {
    return Promise.resolve(demo.communities());
  },
  friendsOf(userId: string): Promise<Profile[]> {
    return Promise.resolve(demo.friendsOf(userId));
  },
};
