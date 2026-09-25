/** Cliente de API com suporte explícito aos ambientes local, homologação e produção. */
import {
  normalizePostStatus,
  normalizeRole,
  type Post, type Comment, type SupportRecord, type SupportSummaryItem,
  type User, type Profile, type UserRole, type ProfileType, type PostType,
  type SupportType, type PaymentMethod, type Community,
  type NotificationFeed, type NotificationKind, type NotificationPreference, type RankCategory, type RankEntry,
  type Connection, type ConnectionEvent, type ConnectionParty, type ConnectionStatus, type ConnectionType,
  type ConnectionMessage, type ConnectionMessagePage,
  type AgendaCandidate, type MediaAgendaItem, type MediaAgendaItemUpdate,
  type OrganizationTeam, type OrganizationMember, type MemberCandidate, type MyMemberships, type Membership,
  type AdminSnapshot,
} from "./types";
import { buildRanking, type RankingMetrics, type RankingUser } from "./ranking";
import { emptyProfileActivity, normalizeProfileActivity, type ProfileActivity } from "./profile";
import { runtime } from "./runtime";
import { normalizeCoordinates } from "./location";
import { buildPostQuery, type PostListFilter } from "./post-query";
import { mapPublicInstitutionRecord, normalizeCep } from "./institution";
import { resolveMediaUrl } from "./uploads";
import type {
  ProcessDetail, ProcessResponsibleInput, ProcessStatus, ProcessSummary, PublicProcess,
} from "./process";
import type { DeadlineInput, PendingItem } from "./deadlines";
import {
  buildNotificationQuery, completePreferences, groupIdsBySource, mergeNotificationFeeds,
} from "./notifications";
import type { AppNotification } from "./types";
import type {
  CnaeEntry, Institution, InstitutionAccess, InstitutionFieldErrors, InstitutionInput,
  InstitutionKind, InstitutionValidationEvent, InstitutionValidationStatus, GovernmentSphere,
  PublicInstitution, InstitutionDocument, InstitutionDocumentKind, OrganizationType,
  BusinessProfile, MediaProfile, DeclaredProfileKind, PublicDeclaredProfile,
} from "./types";
import type {
  Demand, DemandAgentAction, DemandComposition, DemandEvent, DemandFieldErrors, DemandInput,
  DemandItemInputs, DemandItemKind, DemandItems, DemandListFilter, DemandPage, DemandReview,
  DemandTimelineEvent, DemandValidation, PublicDemand, DemandBudgetItemInput,
} from "./types";
import type { UploadedFile, UploadPurpose, UploadService, UploadTicket } from "./types";
import type { MapTerritory, MapView } from "./types";
import { buildMapQuery, type MapFilterState, type MapQueryOptions } from "./map";
import {
  normalizeRankingPeriod,
  type ProfileImpact, type RankingPeriod, type RankingsResponse,
  type ShareChannel, type ShareTargetKind,
} from "./ranking";
import type { DemandDossierDownload, DemandDossierList, DossierVerification, PublicDossierInfo } from "./types";
import type { MyReport, ReportContext, ReportInput, ReportTargetKind } from "./report";
import type {
  AiEditalMatch, AiGovernmentReportData, AiPartnerMatch, AiResult, AiStatus, AiSuggestion,
  GovernmentReportSuggestion, OrganizationSuggestion, UrgencySuggestion,
} from "./ai";
import type {
  EventAgendaFilter, EventAttendee, EventInput, EventSignupContext, EventSignupSummary,
  EventTerritory, MyEventSignup, OrganizerEvent, PublicEvent,
} from "./event";
import { buildEventAgendaQuery } from "./event";
import type {
  InstitutionalContext, InstitutionalDemandFilter, InstitutionalDemandPage, InstitutionalDemandView,
  InstitutionalOfferInput, InstitutionalResponseInput, InstitutionalStatus, InstitutionalTrack,
  ForwardingDirection, ForwardingInboxItem, ForwardingInput, ForwardingStatus, ForwardingUpdateKind, ForwardingView,
  GovernmentOrganization,
  PublicDemandInstitutional, PublicDemandSummary,
} from "./types";
import { buildInstitutionalQuery } from "./institutional";
import type {
  AgentDemandInterest, DemandInterest, DemandInterestContext, InterestInput, InterestSummary, MyInterestItem,
  OpportunityFilter, OpportunityPage, PartnerProfile, PartnerProfileInput, PotentialPartnersResponse,
} from "./types";
import { buildOpportunityQuery } from "./interest";
import type {
  AgentDemandSupport, DemandSupport, DemandSupportContext, DemandSupportHistory, MySupportItem,
  SupportConsentInput, SupportInput, SupportReceiptInput,
} from "./types";
import type {
  DemandEvidence, DemandEvidenceInput, DemandExecution, DemandProgressInput,
  DemandProgressUpdate, PublicDemandExecution, DemandIncident, DemandIncidentInput,
  DemandExecutionDocument, DemandExecutionDocumentInput,
} from "./types";
import type {
  DemandAccountabilityDocumentInput, DemandAccountabilityInput, DemandAccountabilityResultInput,
  DemandAccountabilityView, PublicDemandAccountabilityView,
} from "./types";
import type {
  AccountErasureResult, DataExportDownload, DataSubjectRequest, MyConsents, PrivacyPanel,
} from "./types";
import type { ConsentDocumentKey, DataSubjectRequestType } from "./privacy";

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
    /** Erros por campo (422 `validation_failed`), quando o serviço os devolve. */
    readonly fields: Record<string, string> = {},
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
      const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; validationStatus?: string; fields?: Record<string, string> };
      throw new ApiError(
        body.error ?? `Erro ${res.status}`, res.status, body.code ?? null, body.validationStatus ?? null,
        body.fields && typeof body.fields === "object" ? body.fields : {},
      );
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
    sharesCount: Number(r.shares_count ?? r.sharesCount ?? 0),
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
    demandId: (r.demandId ?? r.demand_id ?? null) as string | null,
    outcome: (r.outcome ?? null) as string | null,
    createdAt: String(r.createdAt ?? r.created_at ?? ""),
    updatedAt: String(r.updatedAt ?? r.updated_at ?? ""),
    events: Array.isArray(r.events) ? (r.events as ConnectionEvent[]) : [],
    messagesCount: Number(r.messagesCount ?? r.messages_count ?? 0),
    lastMessageAt: (r.lastMessageAt ?? r.last_message_at ?? null) as string | null,
  };
}

function mapConnectionMessage(r: RawPost): ConnectionMessage {
  return {
    id: String(r.id),
    connectionId: String(r.connectionId ?? ""),
    authorId: String(r.authorId ?? ""),
    authorName: String(r.authorName ?? ""),
    authorAvatarUrl: (r.authorAvatarUrl ?? null) as string | null,
    mine: Boolean(r.mine),
    body: String(r.body ?? ""),
    createdAt: String(r.createdAt ?? ""),
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

/** Documento institucional (T-05-19) → modelo do app. */
function mapInstitutionDocument(d: RawPost): InstitutionDocument {
  return {
    id: String(d.id),
    kind: d.kind as InstitutionDocumentKind,
    title: String(d.title ?? ""),
    uploadId: String(d.upload_id ?? ""),
    createdAt: String(d.created_at ?? ""),
    file: (d.file as UploadedFile | null | undefined) ?? null,
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
    organizationType: (str(r.organization_type) as OrganizationType | null),
    additionalInformation: str(r.additional_information),
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
    documents: Array.isArray(r.documents) ? (r.documents as RawPost[]).map(mapInstitutionDocument) : [],
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
  /** T-05-19: tipos de organização e de documento aceitos (espelho em lib/app/institution.ts). */
  organizationTypes?: OrganizationType[];
  documentKinds?: InstitutionDocumentKind[];
  maxDocuments?: number;
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
/** Eventos e inscrições (T25): outra base do post-service. */
const EVENTS = "/api/posts/events";
/** Inteligência artificial (T23): rotas na raiz do post-service. */
const POSTS_ROOT = "/api/posts";

/** Requisição da API de demanda; 404 vira `null`. `prefix`: outra base do post-service (T13). */
async function demandRequest<T>(path: string, init: RequestInit = {}, prefix: string = DEMANDS): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const token = getToken();
  try {
    const res = await fetch(`${BASE}${prefix}${path}`, {
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

async function demandRequired<T>(path: string, init: RequestInit = {}, prefix: string = DEMANDS): Promise<T> {
  const body = await demandRequest<T>(path, init, prefix);
  if (body === null) throw new DemandRequestError("Demanda não encontrada", 404);
  return body;
}

/** Área institucional do Poder Público (T13): mesmos erros da demanda (`DemandRequestError`). */
const INSTITUTIONAL = "/api/posts/institutional";

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

  async register(input: { name: string; email: string; password: string; role: UserRole; profileType: ProfileType; consents: ConsentDocumentKey[] }): Promise<User> {
    if (!HAS_API) throw new Error("O cadastro está indisponível neste momento.");
    try {
      const data = await request<{ user: RawPost; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: input.name, email: input.email, password: input.password,
          role: input.role, profile_type: input.profileType,
          // Consentimento versionado (T24): sem o aceite dos documentos
          // vigentes o auth-service recusa o cadastro (422 consent_required).
          consents: input.consents,
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

  /**
   * Camada de conteúdos do feed no mapa (T20). `bbox` e `limit` existem para
   * o movimento do mapa não varrer a tabela inteira (teto de 500 no servidor).
   */
  mapPosts(type?: string, options: { bbox?: [number, number, number, number] | null; limit?: number } = {}): Promise<Post[]> {
    const q = new URLSearchParams();
    if (type) q.set("type", type);
    if (options.bbox) q.set("bbox", options.bbox.join(","));
    if (options.limit) q.set("limit", String(options.limit));
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

  // ── NOTIFICAÇÕES (central persistente, T-05-16) ──────────
  /**
   * Avisos da conta, juntando post-service e user-service. `institution`
   * inclui os avisos do órgão (Poder Público validado). Uma fonte fora do ar
   * não esconde a outra (`partial`); as duas fora, erro.
   */
  async notifications(options: {
    unreadOnly?: boolean; limit?: number; kinds?: NotificationKind[]; before?: string | null; institution?: boolean;
  } = {}): Promise<NotificationFeed> {
    const limit = options.limit ?? 30;
    type Raw = { notifications?: Record<string, unknown>[]; unreadCount?: number; hasMore?: boolean };
    const [posts, users] = await Promise.allSettled([
      request<Raw>(`/api/posts/notifications${buildNotificationQuery({ ...options, limit })}`),
      request<Raw>(`/api/users/notifications${buildNotificationQuery({ ...options, limit, institution: false })}`),
    ]);
    if (posts.status === "rejected" && users.status === "rejected") throw posts.reason;
    return mergeNotificationFeeds(
      posts.status === "fulfilled" ? posts.value : null,
      users.status === "fulfilled" ? users.value : null,
      limit,
    );
  },

  /** Marca como lidos (cada aviso no serviço que o guarda) ou todos. */
  async markNotificationsRead(
    target: Pick<AppNotification, "id" | "source">[] | "all", options: { institution?: boolean } = {},
  ): Promise<void> {
    const institution = options.institution ? "?institution=1" : "";
    if (target === "all") {
      await Promise.all([
        request(`/api/posts/notifications/read${institution}`, { method: "POST", body: JSON.stringify({ all: true }) }),
        request("/api/users/notifications/read", { method: "POST", body: JSON.stringify({ all: true }) }),
      ]);
      return;
    }
    const ids = groupIdsBySource(target);
    await Promise.all([
      ids.posts.length ? request(`/api/posts/notifications/read${institution}`, { method: "POST", body: JSON.stringify({ ids: ids.posts }) }) : null,
      ids.users.length ? request("/api/users/notifications/read", { method: "POST", body: JSON.stringify({ ids: ids.users }) }) : null,
    ]);
  },

  /** Preferências por tipo (aplicativo e e-mail); o post-service é a referência. */
  async notificationPreferences(): Promise<NotificationPreference[]> {
    const data = await request<{ preferences: NotificationPreference[] }>("/api/posts/notifications/preferences");
    return completePreferences(data.preferences);
  },

  /** Grava nos dois serviços (cada um aplica aos avisos que gera). */
  async saveNotificationPreferences(preferences: NotificationPreference[]): Promise<NotificationPreference[]> {
    const body = JSON.stringify({ preferences });
    const [posts] = await Promise.all([
      request<{ preferences: NotificationPreference[] }>("/api/posts/notifications/preferences", { method: "PUT", body }),
      request("/api/users/notifications/preferences", { method: "PUT", body }),
    ]);
    return completePreferences(posts.preferences);
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
  communities(): Promise<Community[]> {
    return request<RawPost[]>("/api/users/communities").then((rows) => rows.map(mapCommunity));
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
  createConnection(input: {
    from: User; toUserId: string; type: ConnectionType; message: string; postId?: string | null; postTitle?: string | null; demandId?: string | null;
  }): Promise<Connection> {
    return request<RawPost>("/api/users/connections", {
      method: "POST",
      body: JSON.stringify({
        toUserId: input.toUserId, type: input.type, message: input.message, postId: input.postId ?? null,
        postTitle: input.postTitle ?? null, demandId: input.demandId ?? null,
      }),
    }).then(mapConnection);
  },
  /**
   * Responde a uma conexão. Aceite ou recusa de conexão vinda de uma demanda
   * (T15) passa pela rota da demanda no post-service, que confere o vínculo e
   * leva a demanda a "Conectada"; se a conexão não é de uma demanda sua, segue
   * a rota comum de conexões.
   */
  async respondToConnection(connection: Connection, status: ConnectionStatus, outcome?: string): Promise<Connection | null> {
    if (connection.demandId && (status === "accepted" || status === "declined")) {
      const path = `/mine/${encodeURIComponent(connection.demandId)}/connections/${encodeURIComponent(connection.id)}/${status === "accepted" ? "accept" : "decline"}`;
      try {
        const done = await demandRequest(path, { method: "POST", body: "{}" });
        if (done !== null) return this.getConnection(connection.id);
      } catch (err) {
        const code = err instanceof DemandRequestError ? err.code : null;
        if (code !== "connection_not_linked" && code !== "demand_author_not_agent") throw err;
      }
    }
    return this.updateConnection(connection.id, status, outcome);
  },
  updateConnection(id: string, status: ConnectionStatus, outcome?: string): Promise<Connection | null> {
    return request<RawPost>(`/api/users/connections/${id}`, {
      method: "PUT",
      body: JSON.stringify({ status, outcome }),
    }).then(mapConnection);
  },
  // ── CONVERSA DA CONEXÃO (T27) ────────────────────────────
  /** Mensagens em ordem cronológica; `before` pagina para trás. A leitura marca a conversa como lida. */
  connectionMessages(id: string, options: { before?: string | null; limit?: number } = {}): Promise<ConnectionMessagePage> {
    const params = new URLSearchParams();
    if (options.before) params.set("before", options.before);
    if (options.limit) params.set("limit", String(options.limit));
    const query = params.toString();
    return request<{ messages: RawPost[]; hasMore: boolean; open: boolean }>(
      `/api/users/connections/${encodeURIComponent(id)}/messages${query ? `?${query}` : ""}`,
    ).then((body) => ({
      messages: (body.messages ?? []).map(mapConnectionMessage),
      hasMore: Boolean(body.hasMore),
      open: Boolean(body.open),
    }));
  },
  sendConnectionMessage(id: string, body: string): Promise<ConnectionMessage> {
    return request<RawPost>(`/api/users/connections/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }).then(mapConnectionMessage);
  },

  // ── PROCESSO DE CONEXÃO (T-05-01) ──────────────────────────
  // Protocolo DM-AAAA-NNNNNN, status do Modelo §16, responsável atual e linha
  // do tempo. `ref` = id ou protocolo; terceiros recebem 404.
  myProcesses(): Promise<ProcessSummary[]> {
    return request<{ processes: ProcessSummary[] }>("/api/posts/processes/mine")
      .then((body) => (Array.isArray(body.processes) ? body.processes : []));
  },
  getProcess(ref: string): Promise<ProcessDetail> {
    return request<ProcessDetail>(`/api/posts/processes/${encodeURIComponent(ref)}`);
  },
  processByConnection(connectionId: string): Promise<ProcessSummary | null> {
    return request<{ process: ProcessSummary | null }>(`/api/posts/processes/by-connection/${encodeURIComponent(connectionId)}`)
      .then((body) => body.process ?? null);
  },
  changeProcessStatus(ref: string, status: ProcessStatus, note?: string | null): Promise<ProcessDetail> {
    return request<ProcessDetail>(`/api/posts/processes/${encodeURIComponent(ref)}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note: note ?? null }),
    });
  },
  setProcessResponsible(ref: string, input: ProcessResponsibleInput): Promise<ProcessDetail> {
    return request<ProcessDetail>(`/api/posts/processes/${encodeURIComponent(ref)}/responsible`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },
  // Prazos por etapa e pendências (T-05-03, Modelo de Conexão §15).
  setProcessDeadline(ref: string, input: DeadlineInput): Promise<ProcessDetail> {
    return request<ProcessDetail>(`/api/posts/processes/${encodeURIComponent(ref)}/deadlines`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  fulfillProcessDeadline(ref: string, deadlineId: string, note?: string | null): Promise<ProcessDetail> {
    return request<ProcessDetail>(
      `/api/posts/processes/${encodeURIComponent(ref)}/deadlines/${encodeURIComponent(deadlineId)}/fulfill`,
      { method: "POST", body: JSON.stringify({ note: note ?? null }) },
    );
  },
  pendingDeadlines(): Promise<PendingItem[]> {
    return request<{ pending: PendingItem[] }>("/api/posts/processes/pending")
      .then((body) => (Array.isArray(body.pending) ? body.pending : []));
  },
  demandProcesses(demandId: string): Promise<PublicProcess[]> {
    return request<{ processes: PublicProcess[] }>(`/api/posts/demands/${encodeURIComponent(demandId)}/processes`)
      .then((body) => (Array.isArray(body.processes) ? body.processes : []));
  },
  /** Formalização pelo órgão do Poder Público (acompanhamento → processo). */
  formalizeInstitutionalProcess(demandId: string): Promise<InstitutionalDemandView> {
    return request<InstitutionalDemandView>(
      `/api/posts/institutional/demands/${encodeURIComponent(demandId)}/formalize`,
      { method: "POST", body: JSON.stringify({}) },
    );
  },

  // ── PAUTAS DA COMUNICAÇÃO (T28) ──────────────────────────
  /** Pautas sugeridas pelos sinais do território (só Comunicação). */
  discoverAgenda(): Promise<AgendaCandidate[]> {
    return request<{ candidates: AgendaCandidate[] }>("/api/posts/media/agenda/discover")
      .then((body) => (Array.isArray(body.candidates) ? body.candidates : []));
  },
  myAgenda(status?: MediaAgendaItem["status"]): Promise<MediaAgendaItem[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return request<{ items: MediaAgendaItem[] }>(`/api/posts/media/agenda${query}`)
      .then((body) => (Array.isArray(body.items) ? body.items : []));
  },
  createAgendaItem(input: { targetKind: "demanda" | "evento"; targetId: string; angle?: string | null }): Promise<MediaAgendaItem> {
    return request<{ item: MediaAgendaItem }>("/api/posts/media/agenda", {
      method: "POST",
      body: JSON.stringify(input),
    }).then((body) => body.item);
  },
  updateAgendaItem(id: string, input: MediaAgendaItemUpdate): Promise<MediaAgendaItem> {
    return request<{ item: MediaAgendaItem }>(`/api/posts/media/agenda/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    }).then((body) => body.item);
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

  // Documentação institucional (T-05-19): anexa um upload confirmado
  // `institution_document`; só com a ficha editável (409 `institution_not_editable`).
  async addInstitutionDocument(input: { kind: InstitutionDocumentKind; title: string; uploadRef: string }): Promise<InstitutionDocument> {
    const raw = await institutionRequest<RawPost>("/api/users/me/institution/documents", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (!raw) throw new InstitutionRequestError("Cadastro institucional não encontrado", 404);
    return mapInstitutionDocument(raw);
  },

  async removeInstitutionDocument(id: string): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const token = getToken();
    try {
      const res = await fetch(`${BASE}/api/users/me/institution/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
        signal: ctrl.signal,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 204 || res.status === 404) return;
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      throw new InstitutionRequestError(String(body.error ?? `Erro ${res.status}`), res.status, (body.code as string) ?? null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") throw new NetworkError("timeout");
      if (err instanceof TypeError) throw new NetworkError("network");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  },

  async myInstitutionAccess(): Promise<InstitutionAccess> {
    const raw = await institutionRequest<InstitutionAccess>("/api/users/me/institution/status");
    if (!raw) return { kind: null, status: null, requiredKind: null, canActInstitutionally: false, delegation: null };
    const d = raw.delegation;
    return {
      ...raw,
      // Vínculo (T29): permissões delegadas, ou null.
      delegation: d && typeof d === "object" && Array.isArray(d.permissions)
        ? { memberId: String(d.memberId ?? ""), level: String(d.level ?? ""), permissions: d.permissions.map(String), organizationName: String(d.organizationName ?? "") }
        : null,
    };
  },

  // ── VÍNCULO A ORGANIZAÇÕES (T29) ─────────────────────────
  /** Equipe da instituição que a conta administra (titular ou gestor). */
  organizationTeam(): Promise<OrganizationTeam> {
    return request<OrganizationTeam>("/api/users/me/organization/members");
  },
  memberCandidates(q: string): Promise<MemberCandidate[]> {
    return request<{ candidates: MemberCandidate[] }>(`/api/users/me/organization/members/candidates?q=${encodeURIComponent(q)}`)
      .then((body) => (Array.isArray(body.candidates) ? body.candidates : []));
  },
  inviteMember(input: { userId: string; level: string }): Promise<OrganizationMember> {
    return request<{ member: OrganizationMember }>("/api/users/me/organization/members", { method: "POST", body: JSON.stringify(input) })
      .then((body) => body.member);
  },
  changeMemberLevel(id: string, level: string): Promise<OrganizationMember> {
    return request<{ member: OrganizationMember }>(`/api/users/me/organization/members/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ level }) })
      .then((body) => body.member);
  },
  removeMember(id: string): Promise<OrganizationMember> {
    return request<{ member: OrganizationMember }>(`/api/users/me/organization/members/${encodeURIComponent(id)}/remove`, { method: "POST", body: "{}" })
      .then((body) => body.member);
  },
  /** Convites em aberto e vínculo ativo da própria conta. */
  myMemberships(): Promise<MyMemberships> {
    return request<MyMemberships>("/api/users/me/memberships")
      .then((body) => ({ active: body.active ?? null, invites: Array.isArray(body.invites) ? body.invites : [] }));
  },
  respondMembership(id: string, action: "accept" | "decline" | "leave"): Promise<Membership> {
    return request<{ membership: Membership }>(`/api/users/me/memberships/${encodeURIComponent(id)}/${action}`, { method: "POST", body: "{}" })
      .then((body) => body.membership);
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

  // ── PERFIS DECLARADOS (T-04-03) ──────────────────────────
  // Perfil empresarial (Parceiro) e da Comunicação: 422 traz `fields`
  // (InstitutionRequestError), 403 para outra categoria.
  async getMyDeclaredProfile(kind: DeclaredProfileKind): Promise<BusinessProfile | MediaProfile | null> {
    const raw = await institutionRequest<{ profile: BusinessProfile | MediaProfile | null }>(
      kind === "empresarial" ? "/api/users/me/business-profile" : "/api/users/me/media-profile",
    );
    return raw?.profile ?? null;
  },
  async saveMyDeclaredProfile(kind: DeclaredProfileKind, input: Record<string, string | null>): Promise<BusinessProfile | MediaProfile> {
    const raw = await institutionRequest<{ profile: BusinessProfile | MediaProfile }>(
      kind === "empresarial" ? "/api/users/me/business-profile" : "/api/users/me/media-profile",
      { method: "PUT", body: JSON.stringify(input) },
    );
    if (!raw?.profile) throw new InstitutionRequestError("Perfil não encontrado", 404);
    return raw.profile;
  },
  /** Perfil declarado público de uma conta; `null` se não houver. */
  getPublicDeclaredProfile(userId: string): Promise<PublicDeclaredProfile | null> {
    return institutionRequest<PublicDeclaredProfile>(`/api/users/profiles/${encodeURIComponent(userId)}/declared`);
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

  // ── ATUAÇÃO INSTITUCIONAL DO PODER PÚBLICO (T13) ─────────
  /** Órgão, recorte territorial e contagem dos acompanhamentos por status. */
  institutionalContext(): Promise<InstitutionalContext> {
    return demandRequired<InstitutionalContext>("/me", {}, INSTITUTIONAL);
  },

  /** Demandas publicadas com o acompanhamento do órgão (paginação por `nextCursor`). */
  async institutionalDemands(filter?: InstitutionalDemandFilter): Promise<InstitutionalDemandPage> {
    const page = await demandRequired<InstitutionalDemandPage>(`/demands?${buildInstitutionalQuery(filter)}`, {}, INSTITUTIONAL);
    return { ...page, demands: page.demands.map((d) => ({ ...d, photoUrl: d.photoUrl ? resolveMediaUrl(d.photoUrl, BASE) : null })) };
  },

  /** Acompanhamentos do órgão (fila), do mais recente para o mais antigo. */
  async institutionalTracks(status?: InstitutionalStatus[]): Promise<{ track: InstitutionalTrack; demand: PublicDemandSummary }[]> {
    const query = status?.length ? `?status=${encodeURIComponent(status.join(","))}` : "";
    return (await demandRequired<{ tracks: { track: InstitutionalTrack; demand: PublicDemandSummary }[] }>(`/tracks${query}`, {}, INSTITUTIONAL)).tracks;
  },

  getInstitutionalDemand(id: string): Promise<InstitutionalDemandView | null> {
    return demandRequest<InstitutionalDemandView>(`/demands/${encodeURIComponent(id)}`, {}, INSTITUTIONAL);
  },

  /** Abre o acompanhamento (Recebida); repetir devolve o existente. */
  openInstitutionalTrack(id: string): Promise<InstitutionalDemandView> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/track`, { method: "POST", body: "{}" }, INSTITUTIONAL);
  },

  setInstitutionalResponsible(id: string, input: {
    responsibleName?: string | null; responsibleRole?: string | null;
    responsibleSector?: string | null; responsibleDueOn?: string | null;
  }): Promise<InstitutionalDemandView> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/track`, { method: "PUT", ...json(input) }, INSTITUTIONAL);
  },

  /** Muda o status institucional; 409 `invalid_transition`, 422 com `fields.note`. */
  changeInstitutionalStatus(id: string, status: InstitutionalStatus, note: string | null): Promise<InstitutionalDemandView> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/status`, { method: "POST", ...json({ status, note }) }, INSTITUTIONAL);
  },

  addInstitutionalResponse(id: string, input: InstitutionalResponseInput): Promise<InstitutionalDemandView> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/responses`, { method: "POST", ...json(input) }, INSTITUTIONAL);
  },

  addInstitutionalOffer(id: string, input: InstitutionalOfferInput): Promise<InstitutionalDemandView> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/offers`, { method: "POST", ...json(input) }, INSTITUTIONAL);
  },

  // ── ENCAMINHAMENTOS (T14) ────────────────────────────────
  /** Órgãos do Poder Público validados (destino do encaminhamento), sem o próprio órgão. */
  async governmentOrganizations(filter: { q?: string; sphere?: string; municipality?: string; uf?: string } = {}): Promise<GovernmentOrganization[]> {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(filter)) if (value) q.set(key, value);
    return (await demandRequired<{ organizations: GovernmentOrganization[] }>(`/organizations?${q.toString()}`, {}, INSTITUTIONAL)).organizations;
  },

  /** Encaminha a demanda; devolve a visão do órgão com o encaminhamento e o status atualizado. */
  forwardDemand(id: string, input: ForwardingInput): Promise<InstitutionalDemandView & { forwardingId: string }> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/forwardings`, { method: "POST", ...json(input) }, INSTITUTIONAL);
  },

  /** Caixa do órgão: encaminhamentos recebidos ou enviados, do mais recente ao mais antigo. */
  async institutionalForwardings(direction: ForwardingDirection, status?: ForwardingStatus[]): Promise<ForwardingInboxItem[]> {
    const q = new URLSearchParams({ direction });
    if (status?.length) q.set("status", status.join(","));
    return (await demandRequired<{ forwardings: ForwardingInboxItem[] }>(`/forwardings?${q.toString()}`, {}, INSTITUTIONAL)).forwardings;
  },

  /** Recebido, aceito ou devolvido (motivo obrigatório); 403 `forwarding_forbidden` fora de quem responde. */
  changeForwardingStatus(forwardingId: string, status: ForwardingStatus, note: string | null): Promise<ForwardingView> {
    return demandRequired(`/forwardings/${encodeURIComponent(forwardingId)}/status`, { method: "POST", ...json({ status, note }) }, INSTITUTIONAL);
  },

  /** Providência realizada ou atualização posterior (órgão de origem ou de destino). */
  addForwardingUpdate(forwardingId: string, kind: Exclude<ForwardingUpdateKind, "status">, body: string): Promise<ForwardingView> {
    return demandRequired(`/forwardings/${encodeURIComponent(forwardingId)}/updates`, { method: "POST", ...json({ kind, body }) }, INSTITUTIONAL);
  },

  /** Respostas institucionais e status por órgão (público); `null` se a demanda não é pública. */
  publicDemandInstitutional(id: string): Promise<PublicDemandInstitutional | null> {
    return demandRequest<PublicDemandInstitutional>(`/${encodeURIComponent(id)}/institutional`);
  },

  // ── DOSSIÊ DA DEMANDA (T10) ──────────────────────────────
  /** Versões do dossiê (autor ou operação), com o estado da geração. */
  myDemandDossiers(id: string): Promise<DemandDossierList> {
    return demandRequired<DemandDossierList>(`/${encodeURIComponent(id)}/dossiers`);
  },

  /** URL assinada curta (60 s) de uma versão gerada; 409 `dossier_not_generated`. */
  demandDossierDownload(id: string, dossierId: string): Promise<DemandDossierDownload> {
    return demandRequired<DemandDossierDownload>(`/${encodeURIComponent(id)}/dossiers/${encodeURIComponent(dossierId)}/download`);
  },

  /** Gera agora o que ficou pendente ou falhou; 503 `uploads_unavailable` sem bucket. */
  regenerateDemandDossiers(id: string): Promise<DemandDossierList & { generated?: number; failed?: number }> {
    return demandRequired(`/${encodeURIComponent(id)}/dossiers/regenerate`, { method: "POST", body: "{}" });
  },

  /** Versão pública da publicação; `null` se a demanda não é pública. */
  publicDossierInfo(id: string): Promise<PublicDossierInfo | null> {
    return demandRequest<PublicDossierInfo>(`/${encodeURIComponent(id)}/dossie-publico/info`);
  },

  /** Verificação pública por SHA-256; `null` quando nenhum dossiê tem o hash. */
  verifyDossier(hash: string): Promise<DossierVerification | null> {
    return demandRequest<DossierVerification>(`/dossiers/verify/${encodeURIComponent(hash)}`);
  },

  // ── INTERESSE, CONEXÃO E OPORTUNIDADES (T15) ─────────────
  /** Oportunidades de apoio (Parceiro e Poder Público) com compatibilidade. */
  opportunities(filter?: OpportunityFilter): Promise<OpportunityPage> {
    return demandRequired<OpportunityPage>(`/opportunities?${buildOpportunityQuery(filter)}`);
  },

  /** Manifestações da conta, com a demanda. */
  async myInterests(): Promise<MyInterestItem[]> {
    return (await demandRequired<{ interests: MyInterestItem[] }>("/interests/mine")).interests;
  },

  /** Contagens públicas; `null` se a demanda não é pública. */
  demandInterestSummary(id: string): Promise<InterestSummary | null> {
    return demandRequest<InterestSummary>(`/${encodeURIComponent(id)}/interests/summary`);
  },

  /** Manifestações da conta nesta demanda, tipos permitidos e compatibilidade. */
  demandInterestContext(id: string): Promise<DemandInterestContext | null> {
    return demandRequest<DemandInterestContext>(`/${encodeURIComponent(id)}/interests/mine`);
  },

  async registerInterest(id: string, input: InterestInput): Promise<DemandInterest> {
    return (await demandRequired<{ interest: DemandInterest }>(`/${encodeURIComponent(id)}/interests`, { method: "POST", ...json(input) })).interest;
  },

  /** Pede conexão ao Agente (user-service), vinculada à demanda. */
  requestInterestConnection(id: string, interestId: string, input: { type?: ConnectionType; message: string }): Promise<{ interest: DemandInterest }> {
    return demandRequired(`/${encodeURIComponent(id)}/interests/${encodeURIComponent(interestId)}/connection`, { method: "POST", ...json(input) });
  },

  async withdrawInterest(id: string, interestId: string): Promise<DemandInterest> {
    return (await demandRequired<{ interest: DemandInterest }>(`/${encodeURIComponent(id)}/interests/${encodeURIComponent(interestId)}/withdraw`, { method: "POST", body: "{}" })).interest;
  },

  /** Agente autor: quem se interessou. */
  agentDemandInterests(id: string): Promise<{ interests: AgentDemandInterest[]; summary: InterestSummary }> {
    return demandRequired(`/mine/${encodeURIComponent(id)}/interests`);
  },

  // ── POTENCIAIS PARCEIROS (T30) ───────────────────────────
  /** Perfis de apoio compatíveis com a demanda do Agente, pontuados; `available: false` antes da publicação. */
  potentialPartners(id: string): Promise<PotentialPartnersResponse> {
    return demandRequired<PotentialPartnersResponse>(`/mine/${encodeURIComponent(id)}/potential-partners`)
      .then((body) => ({ ...body, candidates: Array.isArray(body.candidates) ? body.candidates : [] }));
  },

  /** Agente autor aceita a conexão vinculada à demanda; a demanda vai para `conectada`. */
  acceptDemandConnection(id: string, connectionId: string): Promise<{ demand: { id: string; status: Demand["status"] }; transitioned: boolean; interest: AgentDemandInterest | null }> {
    return demandRequired(`/mine/${encodeURIComponent(id)}/connections/${encodeURIComponent(connectionId)}/accept`, { method: "POST", body: "{}" });
  },

  declineDemandConnection(id: string, connectionId: string): Promise<{ interest: AgentDemandInterest | null }> {
    return demandRequired(`/mine/${encodeURIComponent(id)}/connections/${encodeURIComponent(connectionId)}/decline`, { method: "POST", body: "{}" });
  },

  /** Perfil de apoio (user-service), base da compatibilidade. */
  getPartnerProfile(): Promise<PartnerProfile> {
    return demandRequired<PartnerProfile>("/me/partner-profile", {}, "/api/users");
  },

  savePartnerProfile(input: PartnerProfileInput): Promise<PartnerProfile> {
    return demandRequired<PartnerProfile>("/me/partner-profile", { method: "PUT", ...json(input) }, "/api/users");
  },
  // ── APOIO À DEMANDA: MODALIDADES E TRANSPARÊNCIA (T16) ───
  /** Histórico público de apoio e totais; `null` se a demanda não é pública. */
  demandSupportHistory(id: string): Promise<DemandSupportHistory | null> {
    return demandRequest<DemandSupportHistory>(`/${encodeURIComponent(id)}/supports`);
  },

  /** Meus apoios nesta demanda, modalidades permitidas e se ela está aberta. */
  demandSupportContext(id: string): Promise<DemandSupportContext | null> {
    return demandRequest<DemandSupportContext>(`/${encodeURIComponent(id)}/supports/mine`);
  },

  /** Registra o apoio realizado (Parceiro e Poder Público validado). */
  async registerSupport(id: string, input: SupportInput): Promise<DemandSupport> {
    return (await demandRequired<{ support: DemandSupport }>(`/${encodeURIComponent(id)}/supports`, { method: "POST", ...json(input) })).support;
  },

  /** Consentimento de exibição no histórico público (revogável). */
  async updateSupportConsent(id: string, supportId: string, input: SupportConsentInput): Promise<DemandSupport> {
    return (await demandRequired<{ support: DemandSupport }>(
      `/${encodeURIComponent(id)}/supports/${encodeURIComponent(supportId)}/consent`, { method: "PUT", ...json(input) },
    )).support;
  },

  async cancelSupport(id: string, supportId: string): Promise<DemandSupport> {
    return (await demandRequired<{ support: DemandSupport }>(
      `/${encodeURIComponent(id)}/supports/${encodeURIComponent(supportId)}/cancel`, { method: "POST", body: "{}" },
    )).support;
  },

  /** "Meus apoios": andamento das demandas apoiadas. */
  async mySupportedDemands(): Promise<MySupportItem[]> {
    return (await demandRequired<{ supports: MySupportItem[] }>("/supports/mine")).supports;
  },

  /** Agente autor: apoios declarados na demanda. */
  agentDemandSupports(id: string): Promise<{ supports: AgentDemandSupport[]; totals: DemandSupportHistory["totals"] }> {
    return demandRequired(`/mine/${encodeURIComponent(id)}/supports`);
  },

  /** Dupla confirmação: o Agente confirma o recebimento, com evidência opcional. */
  async confirmSupportReceipt(id: string, supportId: string, input: SupportReceiptInput = {}): Promise<AgentDemandSupport> {
    return (await demandRequired<{ support: AgentDemandSupport }>(
      `/mine/${encodeURIComponent(id)}/supports/${encodeURIComponent(supportId)}/confirm`, { method: "POST", ...json(input) },
    )).support;
  },

  async contestSupportReceipt(id: string, supportId: string, input: SupportReceiptInput): Promise<AgentDemandSupport> {
    return (await demandRequired<{ support: AgentDemandSupport }>(
      `/mine/${encodeURIComponent(id)}/supports/${encodeURIComponent(supportId)}/contest`, { method: "POST", ...json(input) },
    )).support;
  },

  // ── EXECUÇÃO, EVIDÊNCIAS E ACOMPANHAMENTO (T17) ──────────────────────────
  /** Histórico visual e acompanhamento públicos da execução. */
  publicDemandExecution(id: string): Promise<PublicDemandExecution | null> {
    return demandRequest<PublicDemandExecution>(`/${encodeURIComponent(id)}/execution`);
  },

  /** Agente autor: evidências, andamento, execução orçamentária e pendências. */
  myDemandExecution(id: string): Promise<DemandExecution> {
    return demandRequired<DemandExecution>(`/mine/${encodeURIComponent(id)}/execution`);
  },

  /** Registra uma foto ou um vídeo do antes, do acompanhamento ou do depois. */
  async registerDemandEvidence(id: string, input: DemandEvidenceInput): Promise<DemandEvidence> {
    return (await demandRequired<{ evidence: DemandEvidence }>(
      `/mine/${encodeURIComponent(id)}/evidences`, { method: "POST", ...json(input) },
    )).evidence;
  },

  /** Legenda e pareamento antes↔depois (o par registrado não é desfeito). */
  async updateDemandEvidence(
    id: string,
    evidenceId: string,
    input: { caption?: string | null; pairEvidenceId?: string | null },
  ): Promise<DemandEvidence> {
    return (await demandRequired<{ evidence: DemandEvidence }>(
      `/mine/${encodeURIComponent(id)}/evidences/${encodeURIComponent(evidenceId)}`, { method: "PUT", ...json(input) },
    )).evidence;
  },

  /** Atualização de andamento e execução orçamentária (só inserção). */
  async registerDemandProgress(id: string, input: DemandProgressInput): Promise<DemandProgressUpdate> {
    return (await demandRequired<{ progress: DemandProgressUpdate }>(
      `/mine/${encodeURIComponent(id)}/progress`, { method: "POST", ...json(input) },
    )).progress;
  },

  /** Anexa laudo, certificado, nota fiscal ou registro técnico durante a execução (§20). */
  async registerDemandExecutionDocument(id: string, input: DemandExecutionDocumentInput): Promise<DemandExecutionDocument> {
    return (await demandRequired<{ document: DemandExecutionDocument }>(
      `/mine/${encodeURIComponent(id)}/execution-documents`, { method: "POST", ...json(input) },
    )).document;
  },

  /** Registra uma ocorrência da execução (Modelo de Conexão §19). */
  async registerDemandIncident(id: string, input: DemandIncidentInput): Promise<DemandIncident> {
    return (await demandRequired<{ incident: DemandIncident }>(
      `/mine/${encodeURIComponent(id)}/incidents`, { method: "POST", ...json(input) },
    )).incident;
  },

  /** Resolução da ocorrência, gravada uma vez. */
  async resolveDemandIncident(id: string, incidentId: string, resolution: string): Promise<DemandIncident> {
    return (await demandRequired<{ incident: DemandIncident }>(
      `/mine/${encodeURIComponent(id)}/incidents/${encodeURIComponent(incidentId)}/resolve`,
      { method: "POST", ...json({ resolution }) },
    )).incident;
  },

  /** Justifica que não há execução física a registrar (slide 12). */
  waiveDemandRecord(id: string, reason: string): Promise<{ recordWaiverReason: string; recordWaiverAt: string | null }> {
    return demandRequired(`/mine/${encodeURIComponent(id)}/record-waiver`, { method: "POST", ...json({ reason }) });
  },

  // ── PRESTAÇÃO DE CONTAS E RESULTADOS (T18) ───────────────────────────────
  /** Resultados e prestação de contas públicos (só depois de concluída). */
  publicDemandAccountability(id: string): Promise<PublicDemandAccountabilityView | null> {
    return demandRequest<PublicDemandAccountabilityView>(`/${encodeURIComponent(id)}/accountability`);
  },

  /** Agente autor: rascunho, metas, anexos e o que a conclusão exige. */
  myDemandAccountability(id: string): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(`/mine/${encodeURIComponent(id)}/accountability`);
  },

  /** Grava os campos enviados do registro final (cria na primeira gravação). */
  saveDemandAccountability(id: string, input: DemandAccountabilityInput): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(
      `/mine/${encodeURIComponent(id)}/accountability`, { method: "PUT", ...json(input) },
    );
  },

  /** Resultado alcançado de uma meta declarada na T06 (um por meta). */
  saveDemandAccountabilityResult(
    id: string,
    goalId: string,
    input: DemandAccountabilityResultInput,
  ): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(
      `/mine/${encodeURIComponent(id)}/accountability/results/${encodeURIComponent(goalId)}`,
      { method: "PUT", ...json(input) },
    );
  },

  removeDemandAccountabilityResult(id: string, goalId: string): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(
      `/mine/${encodeURIComponent(id)}/accountability/results/${encodeURIComponent(goalId)}`,
      { method: "DELETE" },
    );
  },

  /** Comprovante financeiro, relatório ou registro da ação (upload da T08). */
  addDemandAccountabilityDocument(
    id: string,
    input: DemandAccountabilityDocumentInput,
  ): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(
      `/mine/${encodeURIComponent(id)}/accountability/documents`, { method: "POST", ...json(input) },
    );
  },

  removeDemandAccountabilityDocument(id: string, documentId: string): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(
      `/mine/${encodeURIComponent(id)}/accountability/documents/${encodeURIComponent(documentId)}`,
      { method: "DELETE" },
    );
  },

  /** Conclui a prestação: publica os resultados e gera a versão do dossiê. */
  concludeDemandAccountability(id: string): Promise<DemandAccountabilityView> {
    return demandRequired<DemandAccountabilityView>(
      `/mine/${encodeURIComponent(id)}/accountability/conclude`, { method: "POST", ...json({}) },
    );
  },

  // ── MAPA INTELIGENTE (T20) ───────────────────────────────
  /** Pontos (ou agrupamento) e contagens do recorte atual do mapa. */
  demandMap(filter: MapFilterState, options: MapQueryOptions = {}): Promise<MapView> {
    return demandRequired<MapView>(`/map?${buildMapQuery(filter, options)}`);
  },

  /** Territórios com demanda publicada, para a página pública por território. */
  async mapTerritories(filter?: MapFilterState): Promise<MapTerritory[]> {
    const query = filter ? `?${buildMapQuery(filter)}` : "";
    const body = await demandRequest<{ territories: MapTerritory[] }>(`/map/territories${query}`);
    return body?.territories ?? [];
  },

  // ── DENÚNCIA DE CONTEÚDO E DE PERFIL (T6.3) ──────────────
  /**
   * Registra a denúncia. A resposta confirma só o recebimento: o desfecho
   * fica com a moderação e não volta para quem denunciou nem chega a quem
   * foi denunciado.
   */
  report(input: ReportInput): Promise<MyReport & { notice: string }> {
    return request<MyReport & { notice: string }>("/api/posts/reports", { method: "POST", ...json(input) });
  },

  /** Posso denunciar este alvo? Já denunciei e a análise segue em aberto? */
  reportContext(targetKind: ReportTargetKind, targetId: string): Promise<ReportContext> {
    const query = new URLSearchParams({ targetKind, targetId });
    return request<ReportContext>(`/api/posts/reports/context?${query.toString()}`);
  },

  /** Minhas denúncias, sem o desfecho (em apuração ou analisada). */
  async myReports(): Promise<MyReport[]> {
    const body = await request<{ reports: MyReport[] }>("/api/posts/reports/mine");
    return body?.reports ?? [];
  },

  // ── ENGAJAMENTO, RANKINGS E SELOS (T21) ──────────────────
  /**
   * Os sete rankings da fonte (slide 22), já calculados e materializados pelo
   * post-service. O Poder Público e os políticos não entram (slide 13).
   */
  rankings(period?: RankingPeriod, options: { limit?: number; board?: string } = {}): Promise<RankingsResponse> {
    const query = new URLSearchParams({ period: normalizeRankingPeriod(period) });
    if (options.limit) query.set("limit", String(options.limit));
    if (options.board) query.set("board", options.board);
    return request<RankingsResponse>(`/api/posts/rankings?${query.toString()}`);
  },

  /** Selos de impacto do perfil ou, para o Poder Público, indicadores de atuação. */
  profileImpact(userId: string): Promise<ProfileImpact> {
    return request<ProfileImpact>(`/api/posts/profiles/${encodeURIComponent(userId)}/impact`);
  },

  /** Atuação territorial pública do perfil (demandas, apoios recebidos e realizados). */
  async profileActivity(userId: string): Promise<ProfileActivity> {
    const data = await request<unknown>(`/api/posts/profiles/${encodeURIComponent(userId)}/activity`);
    return normalizeProfileActivity(data) ?? emptyProfileActivity(userId);
  },

  /** Consentimento de aparecer com o nome nos rankings públicos (LGPD). */
  rankingConsent(): Promise<{ consent: boolean; updatedAt: string | null; notice: string }> {
    return request("/api/posts/rankings/consent");
  },

  setRankingConsent(consent: boolean): Promise<{ consent: boolean; updatedAt: string | null; notice: string }> {
    return request("/api/posts/rankings/consent", { method: "PUT", ...json({ consent }) });
  },

  /** Registra o compartilhamento (um por conteúdo e por dia, append-only). */
  registerShare(targetKind: ShareTargetKind, targetId: string, channel: ShareChannel): Promise<{ counted: boolean; sharesCount: number }> {
    return request("/api/posts/shares", { method: "POST", ...json({ targetKind, targetId, channel }) });
  },

  // ── PRIVACIDADE E DIREITOS DO TITULAR (T24) ──────────────
  /** Documentos vigentes e o que esta conta já aceitou (auth-service). */
  myConsents(): Promise<MyConsents> {
    return request<MyConsents>("/api/auth/me/consents");
  },

  /** Aceita as versões vigentes; a trilha do consentimento é append-only. */
  acceptConsents(documents: ConsentDocumentKey[], origin: "nova_versao" | "reaceite" = "reaceite"): Promise<MyConsents> {
    return request<MyConsents>("/api/auth/me/consents", { method: "POST", ...json({ documents, origin }) });
  },

  /** Painel de privacidade: solicitações abertas e estado da conta. */
  privacyPanel(): Promise<PrivacyPanel> {
    return request<PrivacyPanel>("/api/users/me/privacy");
  },

  /**
   * Abre uma solicitação do art. 18 (protocolo + prazo de 15 dias). Acesso e
   * portabilidade já voltam com o arquivo pronto (`download`).
   */
  createPrivacyRequest(type: DataSubjectRequestType, description?: string): Promise<{ request: DataSubjectRequest; download: DataExportDownload | null }> {
    return request("/api/users/me/privacy/requests", { method: "POST", ...json({ type, description }) });
  },

  /** Gera de novo o arquivo da exportação e devolve um link novo. */
  refreshPrivacyExport(id: string): Promise<{ request: DataSubjectRequest; download: DataExportDownload }> {
    return request(`/api/users/me/privacy/requests/${encodeURIComponent(id)}/export`, { method: "POST" });
  },

  /** Eliminação/anonimização da conta, com senha e confirmação escrita. */
  requestAccountErasure(input: { password: string; confirmation: string; description?: string }): Promise<AccountErasureResult> {
    return request<AccountErasureResult>("/api/users/me/privacy/erasure", { method: "POST", ...json(input) });
  },
  // ── EVENTOS E INSCRIÇÕES (T25) ───────────────────────────
  // Fonte: slide 9 (Membro da Comunidade inscreve-se em eventos e oferece
  // voluntariado), slide 18 (conteúdos do território) e slide 20 ("Financiar
  // eventos"). Decisão 5: evento pago declara o valor; a plataforma não cobra.
  // Erros de campo chegam como `DemandRequestError.fields`.

  /** Agenda pública (sem login): próximos eventos do território. */
  async events(filter: EventAgendaFilter = {}): Promise<{ events: PublicEvent[]; nextCursor: string | null }> {
    const query = buildEventAgendaQuery(filter);
    const body = await demandRequest<{ events: PublicEvent[]; nextCursor: string | null }>(
      query ? `/?${query}` : "/", {}, EVENTS,
    );
    return { events: body?.events ?? [], nextCursor: body?.nextCursor ?? null };
  },

  /** Territórios com evento próximo (agenda por território). */
  async eventTerritories(): Promise<EventTerritory[]> {
    const body = await demandRequest<{ territories: EventTerritory[] }>("/territories", {}, EVENTS);
    return body?.territories ?? [];
  },

  /** O evento público; `null` quando não existe ou ainda é rascunho. */
  event(id: string): Promise<{ event: PublicEvent; signups: EventSignupSummary } | null> {
    return demandRequest(`/${encodeURIComponent(id)}`, {}, EVENTS);
  },

  /** O que esta conta pode fazer neste evento (inscrever-se, cancelar). */
  eventSignupContext(id: string): Promise<EventSignupContext | null> {
    return demandRequest<EventSignupContext>(`/${encodeURIComponent(id)}/signups/mine`, {}, EVENTS);
  },

  /** Inscreve-se (vaga ou lista de espera quando o organizador a habilitou). */
  signUpForEvent(id: string, note?: string): Promise<{ signup: MyEventSignup; summary: EventSignupSummary }> {
    return demandRequired(`/${encodeURIComponent(id)}/signups`, { method: "POST", ...json({ note }) }, EVENTS);
  },

  /** Cancela a própria inscrição (abre a vaga para a fila de espera). */
  cancelEventSignup(id: string): Promise<{ signup: MyEventSignup; summary: EventSignupSummary }> {
    return demandRequired(`/${encodeURIComponent(id)}/signups/cancel`, { method: "POST" }, EVENTS);
  },

  /** Minhas inscrições, com o evento de cada uma. */
  async myEventSignups(): Promise<Array<MyEventSignup & { event: PublicEvent | null }>> {
    const body = await demandRequest<{ signups: Array<MyEventSignup & { event: PublicEvent | null }> }>(
      "/signups/mine", {}, EVENTS,
    );
    return body?.signups ?? [];
  },

  // Organizador (Agente de Transformação e Poder Público validado)
  async myEvents(status?: string): Promise<OrganizerEvent[]> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    const body = await demandRequest<{ events: OrganizerEvent[] }>(`/mine${query}`, {}, EVENTS);
    return body?.events ?? [];
  },

  myEvent(id: string): Promise<{ event: OrganizerEvent } | null> {
    return demandRequest(`/mine/${encodeURIComponent(id)}`, {}, EVENTS);
  },

  createEvent(input: EventInput): Promise<{ event: OrganizerEvent }> {
    return demandRequired("/", { method: "POST", ...json(input) }, EVENTS);
  },

  updateEvent(id: string, input: EventInput): Promise<{ event: OrganizerEvent }> {
    return demandRequired(`/${encodeURIComponent(id)}`, { method: "PUT", ...json(input) }, EVENTS);
  },

  publishEvent(id: string): Promise<{ event: OrganizerEvent }> {
    return demandRequired(`/${encodeURIComponent(id)}/publish`, { method: "POST" }, EVENTS);
  },

  cancelEvent(id: string, reason: string): Promise<{ event: OrganizerEvent }> {
    return demandRequired(`/${encodeURIComponent(id)}/cancel`, { method: "POST", ...json({ reason }) }, EVENTS);
  },

  /** Lista de presença do organizador (LGPD: nome, categoria e estado). */
  eventAttendees(id: string, status?: string): Promise<{ attendees: EventAttendee[]; summary: EventSignupSummary }> {
    const query = status ? `?status=${encodeURIComponent(status)}` : "";
    return demandRequired(`/mine/${encodeURIComponent(id)}/signups${query}`, {}, EVENTS);
  },

  markEventAttendance(id: string, signupId: string, attended: boolean): Promise<{ attendee: EventAttendee; summary: EventSignupSummary }> {
    return demandRequired(
      `/mine/${encodeURIComponent(id)}/signups/${encodeURIComponent(signupId)}/attendance`,
      { method: "PUT", ...json({ attended }) },
      EVENTS,
    );
  },
  // ── INTELIGÊNCIA ARTIFICIAL (T23) ────────────────────────
  // Fonte: slide 23 (organização automática de demandas, detecção de urgência,
  // sugestão de editais, conexão com patrocinadores ideais e relatórios para
  // governo). Decisão 6: flag desligada por padrão; a IA nunca bloqueia o
  // fluxo. Todas as respostas trazem `available`: quando é `false`, a tela
  // mostra `message` e segue sem sugestão — nunca um resultado inventado.
  // Tudo que volta daqui é sugestão marcada como IA, para uma pessoa revisar;
  // aceitar registra a decisão e **não** altera a demanda.

  /** Estado do recurso: ligado, disponível, modelo e o que está em desenvolvimento. */
  aiStatus(): Promise<AiStatus | null> {
    return demandRequest<AiStatus>("/ai/status", {}, POSTS_ROOT);
  },

  /** Sugere categoria e território da demanda (Agente autor). */
  aiOrganizeDemand(id: string): Promise<AiResult<OrganizationSuggestion>> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/ai/organization`, { method: "POST" }, POSTS_ROOT);
  },

  /** Sugere o nível de prioridade, com justificativa (Agente autor). */
  aiDetectUrgency(id: string): Promise<AiResult<UrgencySuggestion>> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/ai/urgency`, { method: "POST" }, POSTS_ROOT);
  },

  /** Editais divulgados com aderência à demanda (em desenvolvimento: depende de cadastro). */
  aiSuggestEditais(id: string): Promise<AiResult & { editais: AiEditalMatch[] }> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/ai/editais`, { method: "POST" }, POSTS_ROOT);
  },

  /** Ordena os interessados já registrados; a compatibilidade da T15 vem junto. */
  aiSuggestPartners(id: string): Promise<AiResult & { partners: AiPartnerMatch[] }> {
    return demandRequired(`/demands/${encodeURIComponent(id)}/ai/partners`, { method: "POST" }, POSTS_ROOT);
  },

  /** Sugestões já geradas para a demanda (Agente autor). */
  async aiDemandSuggestions(id: string): Promise<AiSuggestion[]> {
    const body = await demandRequest<{ suggestions: AiSuggestion[] }>(
      `/demands/${encodeURIComponent(id)}/ai/suggestions`, {}, POSTS_ROOT,
    );
    return body?.suggestions ?? [];
  },

  /** Desfecho humano: aceitar ou ignorar. `applied` é sempre `false`. */
  aiReviewSuggestion(
    id: string, suggestionId: string, status: "aceita" | "ignorada", note?: string,
  ): Promise<{ suggestion: AiSuggestion; applied: boolean; message: string }> {
    return demandRequired(
      `/demands/${encodeURIComponent(id)}/ai/suggestions/${encodeURIComponent(suggestionId)}/review`,
      { method: "POST", ...json({ status, note }) },
      POSTS_ROOT,
    );
  },

  /** Rascunho de relatório do órgão a partir dos indicadores da T22. */
  aiGovernmentReport(filter: Record<string, string> = {}): Promise<
    AiResult<GovernmentReportSuggestion> & { report: AiGovernmentReportData }
  > {
    return demandRequired("/government/ai/report", { method: "POST", ...json(filter) }, POSTS_ROOT);
  },

  /** Rascunhos já gerados pelo próprio órgão. */
  async aiGovernmentSuggestions(): Promise<AiSuggestion<GovernmentReportSuggestion>[]> {
    const body = await demandRequest<{ suggestions: AiSuggestion<GovernmentReportSuggestion>[] }>(
      "/government/ai/suggestions", {}, POSTS_ROOT,
    );
    return body?.suggestions ?? [];
  },
};
