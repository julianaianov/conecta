/** Cliente de API com suporte explícito aos ambientes local, homologação e produção. */
import {
  normalizePostStatus,
  normalizeRole,
  type Post, type Comment, type SupportRecord, type SupportSummaryItem,
  type User, type Profile, type UserRole, type ProfileType, type PostType,
  type SupportType, type PaymentMethod, type Community, type Scrap, type Testimonial,
  type AppNotification, type RankCategory, type RankEntry,
  type Connection, type ConnectionEvent, type ConnectionParty, type ConnectionStatus, type ConnectionType,
  type AdminSnapshot,
} from "./types";
import { buildRanking, type RankingMetrics, type RankingUser } from "./ranking";
import { runtime } from "./runtime";
import { normalizeCoordinates } from "./location";
import { buildPostQuery, type PostListFilter } from "./post-query";
import { mapPublicInstitutionRecord, normalizeCep } from "./institution";
import { resolveMediaUrl } from "./uploads";
import type {
  CnaeEntry, Institution, InstitutionAccess, InstitutionFieldErrors, InstitutionInput,
  InstitutionKind, InstitutionValidationEvent, InstitutionValidationStatus, GovernmentSphere,
  PublicInstitution,
} from "./types";
import type {
  Demand, DemandAgentAction, DemandComposition, DemandEvent, DemandFieldErrors, DemandInput,
  DemandItemInputs, DemandItemKind, DemandItems, DemandListFilter, DemandPage, DemandReview,
  DemandTimelineEvent, DemandValidation, PublicDemand, DemandBudgetItemInput,
} from "./types";
import type { UploadedFile, UploadPurpose, UploadService, UploadTicket } from "./types";

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

/**
 * Erro HTTP da API com status e código (ex.: 403 `institution_not_validated`
 * do Poder Público sem cadastro validado; ver lib/app/institution.ts).
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly validationStatus: string | null = null,
  ) {
    super(message);
  }
}

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
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; validationStatus?: string };
      throw new ApiError(body.error ?? `Erro ${res.status}`, res.status, body.code ?? null, body.validationStatus ?? null);
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
    status: normalizePostStatus(r.status),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    neighborhood: (r.neighborhood ?? null) as string | null,
    city: (r.city ?? null) as string | null,
    images: ((r.images as string[]) ?? []).map((url) => resolveMediaUrl(url, BASE)),
    videos: (r.videos as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    reactionsCount: Number(r.reactions_count ?? r.reactionsCount ?? 0),
    commentsCount: Number(r.comments_count ?? r.commentsCount ?? 0),
    viewsCount: Number(r.views_count ?? r.viewsCount ?? 0),
    createdAt: String(r.created_at ?? r.createdAt ?? ""),
    demandId: (r.demand_id ?? r.demandId ?? null) as string | null,
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
// ── Cadastro institucional (T04) ───────────────────────────
/** Erro do cadastro institucional com status HTTP, código e erros por campo. */
export class InstitutionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly fields: InstitutionFieldErrors = {},
    readonly validationStatus: InstitutionValidationStatus | null = null,
  ) {
    super(message);
  }
}

async function institutionRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
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
    if (res.status === 404) return null;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new InstitutionRequestError(
        String(body.error ?? `Erro ${res.status}`),
        res.status,
        (body.code as string) ?? null,
        (body.fields as InstitutionFieldErrors) ?? {},
        (body.validationStatus as InstitutionValidationStatus) ?? null,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new NetworkError("timeout");
    if (err instanceof TypeError) throw new NetworkError("network");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

function mapCnaeList(v: unknown): CnaeEntry[] {
  return Array.isArray(v)
    ? v.map((item) => ({ code: String((item as RawPost).code ?? ""), description: str((item as RawPost).description) }))
    : [];
}

function mapInstitutionData(r: RawPost) {
  return {
    cnpj: String(r.cnpj ?? ""),
    legalName: String(r.legal_name ?? ""),
    tradeName: str(r.trade_name),
    cnaePrimary: str(r.cnae_primary),
    cnaePrimaryDescription: str(r.cnae_primary_description),
    cnaeSecondary: mapCnaeList(r.cnae_secondary),
    governmentSphere: (str(r.government_sphere) as GovernmentSphere | null),
    department: str(r.department),
    competenceAreas: Array.isArray(r.competence_areas) ? (r.competence_areas as string[]) : [],
    territory: str(r.territory),
    municipality: str(r.municipality),
    uf: str(r.uf),
    website: str(r.website),
  };
}

export function mapInstitution(r: RawPost): Institution {
  const rep = r.representative as RawPost | null | undefined;
  return {
    ...mapInstitutionData(r),
    id: String(r.id),
    kind: r.institution_kind as InstitutionKind,
    cep: str(r.cep),
    street: str(r.street),
    addressNumber: str(r.address_number),
    addressComplement: str(r.address_complement),
    district: str(r.district),
    municipalityIbgeCode: str(r.municipality_ibge_code),
    institutionalEmail: str(r.institutional_email),
    institutionalPhone: str(r.institutional_phone),
    status: r.validation_status as InstitutionValidationStatus,
    validationNote: str(r.validation_note),
    reviewedAt: str(r.validation_reviewed_at),
    submittedAt: str(r.submitted_at),
    createdAt: String(r.created_at ?? ""),
    updatedAt: str(r.updated_at),
    representative: rep
      ? {
        fullName: String(rep.full_name ?? ""),
        position: String(rep.position ?? ""),
        institutionalEmail: String(rep.institutional_email ?? ""),
        institutionalPhone: String(rep.institutional_phone ?? ""),
        proofDocumentRef: str(rep.proof_document_ref),
        proofDescription: str(rep.proof_description),
        proofDocument: (rep.proof_document as UploadedFile | null | undefined) ?? null,
      }
      : null,
    events: Array.isArray(r.events)
      ? (r.events as RawPost[]).map((e): InstitutionValidationEvent => ({
        fromStatus: (str(e.from_status) as InstitutionValidationStatus | null),
        toStatus: e.to_status as InstitutionValidationStatus,
        note: str(e.note),
        actorType: e.actor_type === "gestao" ? "gestao" : "titular",
        createdAt: String(e.created_at ?? ""),
      }))
      : [],
  };
}

export function mapPublicInstitution(r: RawPost): PublicInstitution {
  return mapPublicInstitutionRecord(r);
}

/** Endereço devolvido pela consulta de CEP (preenche a ficha; o titular confere). */
export interface CepAddress {
  cep: string;
  street: string | null;
  district: string | null;
  municipality: string | null;
  uf: string | null;
  municipalityIbgeCode: string | null;
}

export interface InstitutionReference {
  cnaeReference: { code: string; description: string }[];
  competenceAreaSuggestions: string[];
  ufs: string[];
  governmentSpheres: GovernmentSphere[];
}

// ── Demanda (T07) ──────────────────────────────────────────
/**
 * Erro da API de demanda: 422 traz `fields` (campo → mensagem), 403
 * `institution_not_validated`/`demand_author_not_agent`, 409 estado inválido
 * (`demand_not_editable`, `invalid_transition`, `invalid_state`).
 */
export class DemandRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly fields: DemandFieldErrors = {},
    readonly validationStatus: string | null = null,
  ) {
    super(message);
  }
}

const DEMANDS = "/api/posts/demands";

/** Requisição da API de demanda; 404 vira `null`. */
async function demandRequest<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const token = getToken();
  try {
    const res = await fetch(`${BASE}${DEMANDS}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    if (res.status === 404) return null;
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new DemandRequestError(
        String(body.error ?? `Erro ${res.status}`),
        res.status,
        (body.code as string) ?? null,
        (body.fields as DemandFieldErrors) ?? {},
        (body.validationStatus as string) ?? null,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new NetworkError("timeout");
    if (err instanceof TypeError) throw new NetworkError("network");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function demandRequired<T>(path: string, init: RequestInit = {}): Promise<T> {
  const body = await demandRequest<T>(path, init);
  if (body === null) throw new DemandRequestError("Demanda não encontrada", 404);
  return body;
}

export function buildDemandQuery(filter: DemandListFilter = {}): string {
  const q = new URLSearchParams();
  if (filter.category?.length) q.set("category", filter.category.join(","));
  if (filter.priority?.length) q.set("priority", filter.priority.join(","));
  if (filter.status?.length) q.set("status", filter.status.join(","));
  if (filter.territory) q.set("territory", filter.territory);
  if (filter.municipality) q.set("municipality", filter.municipality);
  if (filter.uf) q.set("uf", filter.uf);
  if (filter.q) q.set("q", filter.q);
  if (filter.bbox) q.set("bbox", filter.bbox.join(","));
  if (filter.limit) q.set("limit", String(filter.limit));
  if (filter.cursor) q.set("cursor", filter.cursor);
  return q.toString();
}

const json = (body: unknown): RequestInit => ({ body: JSON.stringify(body ?? {}) });

// ── Upload de arquivos (T08) ───────────────────────────────
/** Erro do fluxo de upload; `code` (ex.: `uploads_unavailable`) e `fields` do servidor. */
export class UploadRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** A confirmação copia o arquivo no S3 (vídeos de até 500 MB): prazo maior. */
const UPLOAD_API_TIMEOUT_MS = 60_000;

async function uploadRequest<T>(service: UploadService, path: string, init: RequestInit = {}): Promise<T> {
  if (!HAS_API) throw new UploadRequestError("O envio de arquivos está indisponível.", 503, "uploads_unavailable");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), UPLOAD_API_TIMEOUT_MS);
  const token = getToken();
  try {
    const res = await fetch(`${BASE}/api/${service}/uploads${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const fields = (body.fields as Record<string, string>) ?? {};
      const detail = Object.values(fields)[0];
      throw new UploadRequestError(
        detail ?? String(body.error ?? `Erro ${res.status}`),
        res.status,
        (body.code as string) ?? null,
        fields,
      );
    }
    return body as T;
  } catch (err) {
    if (err instanceof UploadRequestError) throw err;
    throw new UploadRequestError("Não foi possível falar com o serviço de arquivos. Tente de novo.", 0, "network");
  } finally {
    clearTimeout(timer);
  }
}

export interface UploadProgress {
  loaded: number;
  total: number;
}

/**
 * Envia o arquivo direto ao S3 pela URL pré-assinada, com progresso
 * (XMLHttpRequest: `fetch` não informa o progresso do envio).
 */
export function putToStorage(
  ticket: UploadTicket,
  file: Blob,
  { onProgress, signal }: { onProgress?: (progress: UploadProgress) => void; signal?: AbortSignal } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method, ticket.url);
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.({ loaded: event.loaded, total: event.total });
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300
      ? resolve()
      : reject(new UploadRequestError(`O armazenamento recusou o arquivo (erro ${xhr.status}). Tente de novo.`, xhr.status, "storage_rejected")));
    xhr.onerror = () => reject(new UploadRequestError("A conexão caiu durante o envio. Tente de novo.", 0, "network"));
    xhr.onabort = () => reject(new UploadRequestError("Envio cancelado.", 0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

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

  // ── UPLOAD (T08) ─────────────────────────────────────────
  /** Autorização de envio: URL pré-assinada de PUT para `tmp/<id>`. */
  presignUpload(
    service: UploadService,
    input: { purpose: UploadPurpose; contentType: string; size: number; fileName?: string | null; sha256?: string | null },
  ): Promise<UploadTicket> {
    return uploadRequest<UploadTicket>(service, "/presign", { method: "POST", body: JSON.stringify(input) });
  },

  /** Confirma o envio e vincula o arquivo (`demandId` nos arquivos da demanda). */
  confirmUpload(service: UploadService, uploadId: string, target: { demandId?: string } = {}): Promise<UploadedFile> {
    return uploadRequest<UploadedFile>(service, `/${encodeURIComponent(uploadId)}/confirm`, { method: "POST", body: JSON.stringify(target) });
  },

  /** Metadados e URL de leitura nova (a anterior expira em minutos). */
  getUpload(service: UploadService, uploadId: string): Promise<UploadedFile> {
    return uploadRequest<UploadedFile>(service, `/${encodeURIComponent(uploadId)}`);
  },

  // ── CADASTRO INSTITUCIONAL (T04) ─────────────────────────
  /** Cadastro do próprio titular, com parecer e trilha; `null` se ainda não existe. */
  async getMyInstitution(): Promise<Institution | null> {
    const raw = await institutionRequest<RawPost>("/api/users/me/institution");
    return raw ? mapInstitution(raw) : null;
  },

  /** Cria ou atualiza (pendente, devolvida ou revogada). 422 traz `fields`. */
  async saveMyInstitution(input: InstitutionInput): Promise<Institution> {
    const raw = await institutionRequest<RawPost>("/api/users/me/institution", {
      method: "PUT",
      body: JSON.stringify(input),
    });
    if (!raw) throw new InstitutionRequestError("Cadastro institucional não encontrado", 404);
    return mapInstitution(raw);
  },

  /** Envia para validação da equipe (→ em_analise). */
  async submitMyInstitution(): Promise<Institution> {
    const raw = await institutionRequest<RawPost>("/api/users/me/institution/submit", { method: "POST", body: "{}" });
    if (!raw) throw new InstitutionRequestError("Cadastro institucional não encontrado", 404);
    return mapInstitution(raw);
  },

  async myInstitutionAccess(): Promise<InstitutionAccess> {
    const raw = await institutionRequest<InstitutionAccess>("/api/users/me/institution/status");
    return raw ?? { kind: null, status: null, requiredKind: null, canActInstitutionally: false };
  },

  /** Instituição validada vinculada a um perfil; `null` se não houver. */
  async getPublicInstitution(userId: string): Promise<PublicInstitution | null> {
    const raw = await institutionRequest<RawPost>(`/api/users/${encodeURIComponent(userId)}/institution`);
    return raw ? mapPublicInstitution(raw) : null;
  },

  /**
   * Consulta pública de CEP (ViaCEP) para agilizar o endereço da ficha. Envia
   * só o CEP; se o serviço falhar, o titular preenche o endereço à mão.
   */
  async lookupCep(value: string): Promise<CepAddress | null> {
    const cep = normalizeCep(value);
    if (cep.length !== 8) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: ctrl.signal });
      if (!res.ok) return null;
      const r = (await res.json()) as Record<string, unknown>;
      if (r.erro) return null;
      return {
        cep,
        street: str(r.logradouro),
        district: str(r.bairro),
        municipality: str(r.localidade),
        uf: str(r.uf),
        municipalityIbgeCode: str(r.ibge),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },

  async institutionReference(): Promise<InstitutionReference> {
    const raw = await institutionRequest<InstitutionReference>("/api/users/institutions/reference");
    if (!raw) throw new InstitutionRequestError("Referência indisponível", 404);
    return raw;
  },
  // ── DEMANDA (T07) ────────────────────────────────────────
  /** Demandas publicadas em diante (paginação por `nextCursor`). */
  async listPublicDemands(filter?: DemandListFilter): Promise<DemandPage> {
    const page = (await demandRequest<DemandPage>(`/?${buildDemandQuery(filter)}`)) ?? { demands: [], nextCursor: null };
    return { ...page, demands: page.demands.map((d) => ({ ...d, photoUrl: d.photoUrl ? resolveMediaUrl(d.photoUrl, BASE) : null })) };
  },

  async getPublicDemand(id: string): Promise<PublicDemand | null> {
    const demand = await demandRequest<PublicDemand>(`/${encodeURIComponent(id)}`);
    return demand && { ...demand, photoUrl: demand.photoUrl ? resolveMediaUrl(demand.photoUrl, BASE) : null };
  },

  async publicDemandTimeline(id: string): Promise<DemandTimelineEvent[]> {
    const body = await demandRequest<{ events: DemandTimelineEvent[] }>(`/${encodeURIComponent(id)}/timeline`);
    return body?.events ?? [];
  },

  /** Demandas do próprio Agente, em qualquer estado (sem os itens). */
  async myDemands(): Promise<Demand[]> {
    return (await demandRequired<{ demands: Demand[] }>("/mine")).demands;
  },

  getMyDemand(id: string): Promise<Demand | null> {
    return demandRequest<Demand>(`/mine/${encodeURIComponent(id)}`);
  },

  async myDemandEvents(id: string): Promise<DemandEvent[]> {
    return (await demandRequired<{ events: DemandEvent[] }>(`/mine/${encodeURIComponent(id)}/events`)).events;
  },

  myDemandReview(id: string): Promise<DemandReview | null> {
    return demandRequest<DemandReview>(`/mine/${encodeURIComponent(id)}/review`);
  },

  /** Cria o rascunho (não exige instituição validada). */
  createDemand(input: DemandInput = {}): Promise<Demand> {
    return demandRequired<Demand>("/", { method: "POST", ...json(input) });
  },

  /** Atualiza só os campos enviados (rascunho ou devolvida). */
  updateDemand(id: string, input: DemandInput): Promise<Demand> {
    return demandRequired<Demand>(`/${encodeURIComponent(id)}`, { method: "PUT", ...json(input) });
  },

  addDemandItem<K extends DemandItemKind>(
    id: string, kind: K, input: DemandItemInputs[K],
  ): Promise<{ item: DemandItems[K]; composition: DemandComposition }> {
    return demandRequired(`/${encodeURIComponent(id)}/${kind}`, { method: "POST", ...json(input) });
  },

  updateDemandItem<K extends DemandItemKind>(
    id: string, kind: K, itemId: string, input: DemandItemInputs[K],
  ): Promise<{ item: DemandItems[K]; composition: DemandComposition }> {
    return demandRequired(`/${encodeURIComponent(id)}/${kind}/${encodeURIComponent(itemId)}`, { method: "PUT", ...json(input) });
  },

  removeDemandItem(id: string, kind: DemandItemKind, itemId: string): Promise<{ deleted: string; composition: DemandComposition }> {
    return demandRequired(`/${encodeURIComponent(id)}/${kind}/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  },

  /** Composição 4%/6% da planilha antes de gravar. */
  previewDemandComposition(
    budgetItems: DemandBudgetItemInput[],
  ): Promise<{ items: { totalCents: number }[]; composition: DemandComposition }> {
    return demandRequired("/composition/preview", { method: "POST", ...json({ budgetItems }) });
  },

  /** Validação completa de envio (não grava). */
  validateDemand(id: string): Promise<DemandValidation> {
    return demandRequired<DemandValidation>(`/${encodeURIComponent(id)}/validate`, { method: "POST", body: "{}" });
  },

  /** Envia para análise; 403 `institution_not_validated`, 422 `demand_incomplete` com `fields`. */
  submitDemand(id: string): Promise<Demand> {
    return demandRequired<Demand>(`/${encodeURIComponent(id)}/submit`, { method: "POST", body: "{}" });
  },

  transitionDemand(id: string, action: DemandAgentAction): Promise<Demand> {
    return demandRequired<Demand>(`/${encodeURIComponent(id)}/transitions`, { method: "POST", ...json({ action }) });
  },
};
