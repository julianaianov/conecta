/**
 * DM Conecta — modelos de domínio da plataforma web.
 * Espelha os models do app Flutter (user_model, post_model, social_models,
 * support_type, support_record, payment_method) e o contrato da API.
 */

// ── Papéis de usuário ──────────────────────────────────────
/** As 4 categorias de perfil. Cada uma agrupa subperfis (ver ROLE_PROFILES). */
export type UserRole = "community" | "citizen" | "partner" | "institutional";

export const ROLES: UserRole[] = ["community", "citizen", "partner", "institutional"];

export const ROLE_LABELS: Record<UserRole, string> = {
  community: "Comunidade",
  citizen: "Cidadão / Morador",
  partner: "Parceiro",
  institutional: "Institucional",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  community: "#1b4f72",
  citizen: "#2e7ba8",
  partner: "#f4841a",
  institutional: "#0d2d42",
};

export const ROLE_ICONS: Record<UserRole, string> = {
  community: "users",
  citizen: "person",
  partner: "building",
  institutional: "shield",
};

/**
 * Papéis anteriores (5 opções) que ainda existem em contas antigas e no JWT.
 * Lidos de volta como as 4 categorias atuais.
 */
const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  organization: "community",
  association: "community",
  business: "partner",
  government: "institutional",
  citizen: "citizen",
};

/** Normaliza qualquer role vinda da API/localStorage para as 4 categorias. */
export function normalizeRole(role: string | null | undefined): UserRole {
  if (!role) return "citizen";
  if ((ROLES as string[]).includes(role)) return role as UserRole;
  return LEGACY_ROLE_MAP[role] ?? "citizen";
}

// ── Subperfis ──────────────────────────────────────────────
export type ProfileType =
  // Comunidade
  | "associacao" | "ong" | "projeto_social" | "coletivo" | "lider_comunitario" | "representante_bairro"
  // Cidadão / Morador
  | "morador" | "voluntario" | "jovem" | "participante"
  // Parceiro
  | "empresa" | "patrocinador" | "comercio_local" | "marca"
  // Institucional
  | "prefeitura" | "secretaria" | "politico" | "imprensa";

export const ROLE_PROFILES: Record<UserRole, { type: ProfileType; label: string }[]> = {
  community: [
    { type: "associacao", label: "Associação" },
    { type: "ong", label: "ONG" },
    { type: "projeto_social", label: "Projeto Social" },
    { type: "coletivo", label: "Coletivo" },
    { type: "lider_comunitario", label: "Líder Comunitário" },
    { type: "representante_bairro", label: "Representante de Bairro" },
  ],
  citizen: [
    { type: "morador", label: "Morador" },
    { type: "voluntario", label: "Voluntário" },
    { type: "jovem", label: "Jovens" },
    { type: "participante", label: "Participante da comunidade" },
  ],
  partner: [
    { type: "empresa", label: "Empresa" },
    { type: "patrocinador", label: "Patrocinador" },
    { type: "comercio_local", label: "Comércio local" },
    { type: "marca", label: "Marca" },
  ],
  institutional: [
    { type: "prefeitura", label: "Prefeitura" },
    { type: "secretaria", label: "Secretaria" },
    { type: "politico", label: "Político" },
    { type: "imprensa", label: "Imprensa" },
  ],
};

export const PROFILE_LABELS: Record<ProfileType, string> = Object.fromEntries(
  Object.values(ROLE_PROFILES).flatMap((list) => list.map((p) => [p.type, p.label])),
) as Record<ProfileType, string>;

/** A qual categoria um subperfil pertence. */
export const PROFILE_ROLE: Record<ProfileType, UserRole> = Object.fromEntries(
  Object.entries(ROLE_PROFILES).flatMap(([role, list]) => list.map((p) => [p.type, role])),
) as Record<ProfileType, UserRole>;

// ── Permissões ─────────────────────────────────────────────
/**
 * Capacidades aplicadas no app. As listas de permissões da especificação
 * descrevem o que cada categoria faz de característico, não uma whitelist
 * fechada — por isso `interact` (curtir/comentar/compartilhar) e a leitura do
 * feed/mapa valem para todos, e só o que a spec distingue é bloqueado.
 */
export type Permission =
  | "publish"        // publicar demandas, projetos e eventos
  | "update_results" // atualizar resultados dos próprios projetos
  | "interact"       // curtir, comentar, compartilhar
  | "connect"        // solicitar conexão / contato
  | "support"        // apoiar projetos
  | "express_interest"
  | "ranking";

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  community: ["publish", "update_results", "interact", "connect"],
  citizen: ["interact", "connect", "support"],
  partner: ["interact", "connect", "express_interest", "ranking"],
  institutional: ["publish", "interact", "connect"],
};

export function can(role: string | null | undefined, permission: Permission): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].includes(permission);
}

/** Texto exibido no cadastro — espelha a especificação de Tipos de Perfis. */
export const ROLE_PERMISSION_LABELS: Record<UserRole, string[]> = {
  community: [
    "Criar perfil", "Publicar demandas", "Publicar projetos", "Publicar eventos",
    "Receber solicitações de conexão", "Atualizar resultados",
  ],
  citizen: [
    "Criar perfil", "Curtir", "Comentar", "Compartilhar",
    "Solicitar conexão", "Apoiar projetos",
  ],
  partner: [
    "Visualizar demandas", "Solicitar conexão", "Demonstrar interesse",
    "Participar do ranking",
  ],
  institutional: [
    "Visualizar mapa", "Interagir", "Solicitar contato",
    "Publicar respostas institucionais",
  ],
};

export const ROLE_RESTRICTIONS: Partial<Record<UserRole, string>> = {
  citizen: "Não publica oficialmente em nome de comunidades",
};

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  profileType?: ProfileType | null;
  avatarUrl?: string | null;
}

// ── Publicações ────────────────────────────────────────────
export type PostType = "problem" | "project" | "need" | "event" | "action" | "message";
export type PostStatus = "active" | "in_progress" | "resolved" | "cancelled";

export const POST_TYPE_LABELS: Record<PostType, string> = {
  problem: "Problema",
  project: "Projeto",
  need: "Necessidade",
  event: "Evento",
  action: "Ação",
  message: "Mensagem",
};

/** Cores de tipo (badges) — alinhadas ao Manual de Marca DM Conecta */
export const POST_TYPE_COLORS: Record<PostType, string> = {
  problem: "#e53935",
  project: "#2e9e5b",
  need: "#f4841a",
  event: "#1b4f72",
  action: "#2e7ba8",
  message: "#5a9bc4",
};

/** Cores dos pinos do mapa (Pitch Deck §Mapa Inteligente) */
export const MAP_PIN_COLORS: Record<PostType, string> = {
  problem: "#e53935", // urgentes
  project: "#2e9e5b", // projetos sociais
  action: "#2e7ba8", // ações ambientais
  need: "#f89b45", // oportunidades
  event: "#1b4f72",
  message: "#5a9bc4",
};

export const POST_STATUS_LABELS: Record<PostStatus, string> = {
  active: "Ativo",
  in_progress: "Em andamento",
  resolved: "Resolvido",
  cancelled: "Cancelado",
};

export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  active: "#2e7ba8",
  in_progress: "#f4841a",
  resolved: "#2e9e5b",
  cancelled: "#868e96",
};

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  type: PostType;
  title: string;
  description: string;
  status: PostStatus;
  latitude?: number | null;
  longitude?: number | null;
  neighborhood?: string | null;
  city?: string | null;
  images: string[];
  tags: string[];
  reactionsCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

// ── Apoios ─────────────────────────────────────────────────
export type SupportType =
  | "financial"
  | "materials"
  | "labor"
  | "volunteering"
  | "equipment"
  | "space"
  | "food"
  | "transport"
  | "knowledge"
  | "sharing";

export interface SupportTypeMeta {
  type: SupportType;
  label: string;
  subtitle: string;
  icon: string; // chave de ícone (ver Icon component)
}

export const SUPPORT_TYPES: SupportTypeMeta[] = [
  { type: "financial", label: "Apoio financeiro", subtitle: "Doação em dinheiro ou PIX", icon: "payments" },
  { type: "materials", label: "Materiais e insumos", subtitle: "Ferramentas, tinta, telas, etc.", icon: "inventory" },
  { type: "labor", label: "Mão de obra", subtitle: "Trabalho técnico ou operacional", icon: "construction" },
  { type: "volunteering", label: "Voluntariado", subtitle: "Disponibilidade de tempo", icon: "volunteer" },
  { type: "equipment", label: "Equipamentos", subtitle: "Emprestar ou doar equipamentos", icon: "handyman" },
  { type: "space", label: "Espaço / local", subtitle: "Ceder sala, galpão ou área", icon: "home_work" },
  { type: "food", label: "Alimentos", subtitle: "Doação de comida ou bebidas", icon: "restaurant" },
  { type: "transport", label: "Transporte", subtitle: "Veículo, frete ou logística", icon: "shipping" },
  { type: "knowledge", label: "Conhecimento", subtitle: "Mentoria, consultoria ou palestra", icon: "school" },
  { type: "sharing", label: "Divulgação", subtitle: "Compartilhar nas redes e grupos", icon: "share" },
];

export const SUPPORT_TYPE_META: Record<SupportType, SupportTypeMeta> = Object.fromEntries(
  SUPPORT_TYPES.map((s) => [s.type, s]),
) as Record<SupportType, SupportTypeMeta>;

export type PaymentMethod = "pix" | "debit" | "credit";

export const PAYMENT_METHODS: { method: PaymentMethod; label: string; subtitle: string; icon: string }[] = [
  { method: "pix", label: "PIX", subtitle: "Pagamento instantâneo", icon: "pix" },
  { method: "debit", label: "Cartão de débito", subtitle: "Débito em conta", icon: "card" },
  { method: "credit", label: "Cartão de crédito", subtitle: "Parcelamento disponível", icon: "card" },
];

export const PAYMENT_CONFIG = {
  pixKey: "recreio.verde@pix.demo",
  pixName: "Associação Bairro Verde",
};

export interface SupportSummaryItem {
  type: SupportType;
  count: number;
}

export interface SupportRecord {
  id: string;
  postId: string;
  postTitle?: string;
  postType?: PostType | string;
  userId: string;
  userName?: string;
  type: SupportType;
  message?: string | null;
  amount?: number | null;
  paymentMethod?: PaymentMethod | null;
  details: Record<string, unknown>;
  status: string; // pending | confirmed | completed | cancelled
  neighborhood?: string | null;
  city?: string | null;
  createdAt: string;
}

// ── Social (estilo Orkut) ──────────────────────────────────
export interface Profile {
  userId: string;
  name: string;
  email?: string;
  role: UserRole | string;
  profileType?: ProfileType | null;
  bio?: string | null;
  status?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  website?: string | null;
  avatarUrl?: string | null;
  coverUrl?: string | null;
  memberSince?: string;
  friendCount?: number;
}

export interface Scrap {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  targetUserId: string;
  content: string;
  createdAt: string;
}

export interface Testimonial {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  targetUserId: string;
  content: string;
  createdAt: string;
}

export interface Community {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  category: string;
  imageUrl?: string | null;
}

// ── Defaults ───────────────────────────────────────────────
export const DEFAULT_NEIGHBORHOOD = "Centro";
export const DEFAULT_CITY = "Rio de Janeiro";
export const MAP_CENTER: [number, number] = [-23.0247, -43.4567];
