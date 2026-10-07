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
  type DemandCoverage,
  type PublicDemandInstitutional,
  type PublicDemandExecution,
  type PublicDemandAccountabilityView,
  type DossierVerification,
  type PublicDossierInfo,
  type MapTerritory,
  type ThemeIntelligence,
  type MapView,
  type PublicInstitution,
  type RankCategory,
  type RankEntry,
  type SupportSummaryItem,
} from "../app/types.ts";
import {
  buildRanking, normalizeRankingPeriod,
  RANKING_CONSENT_NOTICE, RANKING_DEFAULT_PERIOD, RANKING_GOVERNMENT_NOTICE,
  RANKING_PERIOD_LABELS, RANKING_PERIODS,
  type ProfileImpact, type RankingMetrics, type RankingPeriod, type RankingsResponse, type RankingUser,
} from "../app/ranking.ts";
import { normalizeCoordinates } from "../app/location.ts";
import { mapPublicInstitutionRecord } from "../app/institution.ts";
import { resolveMediaUrl } from "../app/uploads.ts";
import { runtime } from "../app/runtime.ts";
import { boundedPublicLimit, fetchPublicJson, MAX_PUBLIC_LIST_LIMIT } from "./public-api.ts";
import { normalizeMapView, normalizeThemeIntelligence } from "../app/landing.ts";
import { buildMapQuery, emptyMapFilter, type MapFilterState, type MapQueryOptions } from "../app/map.ts";
import type {
  EventAgendaFilter, EventSignupSummary, EventTerritory, PublicEvent,
} from "../app/event.ts";
import { buildEventAgendaQuery } from "../app/event.ts";
import { normalizeProfileActivity, type ProfileActivity } from "../app/profile.ts";

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
    sharesCount: numberValue(record.shares_count ?? record.sharesCount),
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

/** Divulgações publicadas pela Comunicação (T28): veículo, endereço e data; `[]` sem cobertura ou sem serviço. */
export async function getPublicDemandCoverage(id: string): Promise<DemandCoverage[]> {
  const data = await fetchPublicJson<{ coverages?: DemandCoverage[] }>("posts", `/demands/${encodeURIComponent(id)}/coverage`);
  return Array.isArray(data?.coverages) ? data.coverages : [];
}

/** Respostas institucionais, status por órgão (T13) e tramitação (T14); `null` se a demanda não é pública. */
export async function getPublicDemandInstitutional(id: string): Promise<PublicDemandInstitutional | null> {
  const data = await fetchPublicJson<PublicDemandInstitutional>("posts", `/demands/${encodeURIComponent(id)}/institutional`);
  if (!data || !Array.isArray(data.organizations)) return null;
  return { ...data, forwardings: Array.isArray(data.forwardings) ? data.forwardings : [] };
}

/**
 * Histórico visual (antes/depois) e acompanhamento da execução (T17); `null`
 * quando a demanda não é pública. As URLs dos registros são resolvidas para a
 * base pública da API, como a foto da demanda.
 */
export async function getPublicDemandExecution(id: string): Promise<PublicDemandExecution | null> {
  const data = await fetchPublicJson<PublicDemandExecution>("posts", `/demands/${encodeURIComponent(id)}/execution`);
  if (!data || !Array.isArray(data.evidences)) return null;
  const withUrl = <T extends { url: string | null }>(e: T): T => (
    { ...e, url: e.url ? resolveMediaUrl(e.url, runtime.apiBase) : null }
  );
  return {
    ...data,
    evidences: data.evidences.map(withUrl),
    pairs: (Array.isArray(data.pairs) ? data.pairs : []).map((pair) => ({
      ...pair, before: withUrl(pair.before), after: withUrl(pair.after),
    })),
    progress: Array.isArray(data.progress) ? data.progress : [],
    schedule: Array.isArray(data.schedule) ? data.schedule : [],
  };
}

/**
 * Resultados e prestação de contas públicos (T18); `null` quando a demanda não
 * é pública. `accountability` é `null` enquanto a prestação não é concluída.
 */
export async function getPublicDemandAccountability(id: string): Promise<PublicDemandAccountabilityView | null> {
  const data = await fetchPublicJson<PublicDemandAccountabilityView>(
    "posts", `/demands/${encodeURIComponent(id)}/accountability`,
  );
  if (!data || !Array.isArray(data.results)) return null;
  return {
    ...data,
    accountability: data.accountability ?? null,
    documents: Array.isArray(data.documents) ? data.documents : [],
  };
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

// ── Mapa inteligente (T20) ─────────────────────────────────
// SSR da página pública do mapa (`/mapa` e `/mapa/<territorio>`): pontos,
// contagens e territórios. Tudo vem da projeção pública do post-service, sem
// token e sem dado pessoal.

const EMPTY_MAP_VIEW: MapView = {
  mode: "points",
  zoom: 12,
  cellSize: 0,
  counts: {
    total: 0,
    category: {
      projeto_social: 0, projeto_ambiental: 0, necessidade_de_patrocinio: 0,
      problema_urbano: 0, problema_urgente: 0,
      obra_ou_melhoria_de_infraestrutura: 0, revitalizacao_de_espaco: 0, recuperacao_ambiental: 0,
      apoio_tecnico: 0, apoio_com_servicos: 0, apoio_com_materiais: 0, outras_demandas_territoriais: 0,
    },
    mapClass: { problemas_urgentes: 0, problemas_urbanos: 0, projetos_sociais: 0, acoes_ambientais: 0, necessidades: 0 },
    priority: { baixa: 0, media: 0, alta: 0, urgente: 0 },
    status: {
      em_analise: 0, publicada: 0, em_busca_de_parceiro: 0, conectada: 0,
      em_execucao: 0, concluida: 0, prestacao_de_contas: 0, arquivada: 0, encerrada: 0,
    },
  },
  points: [],
  clusters: [],
  truncated: false,
};

export async function getPublicDemandMapSnapshot(
  filter: MapFilterState = emptyMapFilter(),
  options: MapQueryOptions = {},
): Promise<MapView | null> {
  return normalizeMapView(await fetchPublicJson<MapView>("posts", `/demands/map?${buildMapQuery(filter, options)}`));
}

export async function getPublicDemandMap(
  filter: MapFilterState = emptyMapFilter(),
  options: MapQueryOptions = {},
): Promise<MapView> {
  return (await getPublicDemandMapSnapshot(filter, options)) ?? EMPTY_MAP_VIEW;
}

export async function getPublicMapTerritories(filter?: MapFilterState): Promise<MapTerritory[]> {
  const query = filter ? `?${buildMapQuery(filter)}` : "";
  const data = await fetchPublicJson<{ territories?: MapTerritory[] }>("posts", `/demands/map/territories${query}`);
  return Array.isArray(data?.territories) ? data.territories : [];
}

/** Inteligência territorial por eixo temático (T26, slide 26); `null` sem resposta. */
export async function getPublicThemeIntelligence(filter?: MapFilterState): Promise<ThemeIntelligence | null> {
  const query = filter ? `?${buildMapQuery(filter)}` : "";
  return normalizeThemeIntelligence(
    await fetchPublicJson<ThemeIntelligence>("posts", `/demands/themes/intelligence${query}`),
  );
}

// ── Engajamento, rankings e selos (T21) ────────────────────
// A agregação já vem pronta do post-service (materializada): o SSR só lê.

const EMPTY_RANKINGS = (period: RankingPeriod): RankingsResponse => ({
  period,
  periods: RANKING_PERIODS.map((id) => ({ id, label: RANKING_PERIOD_LABELS[id] })),
  computedAt: null,
  notices: { government: RANKING_GOVERNMENT_NOTICE, consent: RANKING_CONSENT_NOTICE },
  boards: [],
});

export async function getPublicRankings(
  period: RankingPeriod = RANKING_DEFAULT_PERIOD,
  limit = 10,
): Promise<RankingsResponse> {
  const query = new URLSearchParams({ period: normalizeRankingPeriod(period), limit: String(limit) });
  const data = await fetchPublicJson<RankingsResponse>("posts", `/rankings?${query.toString()}`);
  if (!data || !Array.isArray(data.boards)) return EMPTY_RANKINGS(normalizeRankingPeriod(period));
  return data;
}

export async function getPublicProfileImpact(userId: string): Promise<ProfileImpact | null> {
  const data = await fetchPublicJson<ProfileImpact>(
    "posts", `/profiles/${encodeURIComponent(userId)}/impact`,
  );
  return data && Array.isArray(data.badges) ? data : null;
}

/** Atuação territorial pública do perfil: demandas, apoios recebidos e realizados. */
export async function getPublicProfileActivity(userId: string): Promise<ProfileActivity | null> {
  const data = await fetchPublicJson<unknown>("posts", `/profiles/${encodeURIComponent(userId)}/activity`);
  return normalizeProfileActivity(data);
}

// ── Eventos do território (T25) ────────────────────────────
// Agenda e página pública do evento no SSR: só GET público, sem token.

export async function getPublicEvents(filter: EventAgendaFilter = {}): Promise<PublicEvent[]> {
  const query = buildEventAgendaQuery(filter);
  const data = await fetchPublicJson<{ events?: PublicEvent[] }>("posts", `/events${query ? `?${query}` : ""}`);
  return Array.isArray(data?.events) ? data.events : [];
}

export async function getPublicEvent(id: string): Promise<{ event: PublicEvent; signups: EventSignupSummary } | null> {
  const data = await fetchPublicJson<{ event?: PublicEvent; signups?: EventSignupSummary }>(
    "posts", `/events/${encodeURIComponent(id)}`,
  );
  if (!data?.event?.id) return null;
  return {
    event: data.event,
    signups: data.signups ?? {
      capacity: data.event.capacity, signupsCount: data.event.signupsCount,
      waitlistCount: data.event.waitlistCount, seatsLeft: data.event.seatsLeft, full: false,
    },
  };
}

export async function getPublicEventTerritories(): Promise<EventTerritory[]> {
  const data = await fetchPublicJson<{ territories?: EventTerritory[] }>("posts", "/events/territories");
  return Array.isArray(data?.territories) ? data.territories : [];
}
