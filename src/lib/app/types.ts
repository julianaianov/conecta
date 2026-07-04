/**
 * DM Conecta — modelos de domínio da plataforma web.
 * Espelha os models do app Flutter (user_model, post_model, social_models,
 * support_type, support_record, payment_method) e o contrato da API.
 */

// ── Papéis de usuário ──────────────────────────────────────
export type UserRole =
  | "citizen"
  | "organization"
  | "association"
  | "government"
  | "business";

export const ROLE_LABELS: Record<UserRole, string> = {
  citizen: "Cidadão / Morador",
  organization: "ONG",
  association: "Associação",
  government: "Governo / Prefeitura",
  business: "Empresa / Patrocinador",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  citizen: "#2e7ba8",
  organization: "#5a9bc4",
  association: "#1b4f72",
  government: "#0d2d42",
  business: "#f4841a",
};

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
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
  need: "#f4b400", // oportunidades
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
