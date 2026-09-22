/**
 * DM Conecta — modelos de domínio da plataforma web.
 * Espelha os models do app Flutter (user_model, post_model, interaction_models,
 * support_type, support_record, payment_method) e o contrato da API.
 */

// ── Perfis do ecossistema ──────────────────────────────────
/**
 * As 5 categorias de perfil, organizadas pela função de cada participante no
 * fluxo DEMANDA → PROJETO → CONEXÃO → APOIO → ARTICULAÇÃO → AMPLIFICAÇÃO →
 * EXECUÇÃO → RESULTADO → IMPACTO. Cada categoria agrupa subperfis
 * (ver ROLE_PROFILES). Especificação: docs/perfis-e-permissoes.md.
 */
export type UserRole = "agent" | "member" | "partner" | "government" | "media";

export const ROLES: UserRole[] = ["agent", "member", "partner", "government", "media"];

export const ROLE_LABELS: Record<UserRole, string> = {
  agent: "Agente de Transformação",
  member: "Membro da Comunidade",
  partner: "Parceiro",
  government: "Poder Público",
  media: "Comunicação",
};

/** O papel da categoria no ecossistema, em uma palavra. */
export const ROLE_FUNCTIONS: Record<UserRole, string> = {
  agent: "Iniciadores",
  member: "Participantes",
  partner: "Apoiadores",
  government: "Articulação",
  media: "Amplificação",
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  agent: "Identificam necessidades no território e transformam demandas em projetos e ações.",
  member: "Participam, acompanham, apoiam e fortalecem iniciativas do território.",
  partner: "Oferecem recursos, produtos, serviços, conhecimento, estrutura ou investimento para demandas e projetos.",
  government: "Acompanham demandas, respondem institucionalmente e encaminham ou viabilizam soluções dentro de sua competência.",
  media: "Amplificam demandas, projetos e resultados, aumentando a visibilidade e o potencial de conexão.",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  agent: "#1b4f72",
  member: "#2e7ba8",
  partner: "#f4841a",
  government: "#0d2d42",
  media: "#2e9e5b",
};

export const ROLE_ICONS: Record<UserRole, string> = {
  agent: "users",
  member: "person",
  partner: "building",
  government: "shield",
  media: "megaphone",
};

// ── Subperfis ──────────────────────────────────────────────
export type ProfileType =
  // Agentes de Transformação
  | "associacao" | "ong" | "instituto" | "projeto_social" | "coletivo" | "lider_comunitario" | "representante_bairro"
  // Membros da Comunidade
  | "morador" | "voluntario" | "jovem" | "participante"
  // Parceiros
  | "empresa" | "marca" | "comercio_local" | "patrocinador"
  // Poder Público
  | "prefeitura" | "secretaria" | "orgao_publico" | "representante_poder_publico" | "politico"
  // Comunicação
  | "imprensa" | "veiculo_comunicacao" | "jornalista";

export const ROLE_PROFILES: Record<UserRole, { type: ProfileType; label: string }[]> = {
  agent: [
    { type: "associacao", label: "Associação" },
    { type: "ong", label: "ONG" },
    { type: "instituto", label: "Instituto" },
    { type: "projeto_social", label: "Projeto Social" },
    { type: "coletivo", label: "Coletivo" },
    { type: "lider_comunitario", label: "Líder Comunitário" },
    { type: "representante_bairro", label: "Representante de Bairro" },
  ],
  member: [
    { type: "morador", label: "Morador" },
    { type: "voluntario", label: "Voluntário" },
    { type: "jovem", label: "Jovem" },
    { type: "participante", label: "Participante da Comunidade" },
  ],
  partner: [
    { type: "empresa", label: "Empresa" },
    { type: "marca", label: "Marca" },
    { type: "comercio_local", label: "Comércio Local" },
    { type: "patrocinador", label: "Patrocinador" },
  ],
  government: [
    { type: "prefeitura", label: "Prefeitura" },
    { type: "secretaria", label: "Secretaria" },
    { type: "orgao_publico", label: "Órgão Público" },
    { type: "representante_poder_publico", label: "Representante do Poder Público" },
    { type: "politico", label: "Político" },
  ],
  media: [
    { type: "imprensa", label: "Imprensa" },
    { type: "veiculo_comunicacao", label: "Veículo de Comunicação" },
    { type: "jornalista", label: "Jornalista" },
  ],
};

/** Subperfis previstos na especificação, liberados em versões futuras. */
export const ROLE_FUTURE_PROFILES: Partial<Record<UserRole, string[]>> = {
  partner: ["Investidores e financiadores"],
  media: ["Criadores de conteúdo"],
};

export const PROFILE_LABELS: Record<ProfileType, string> = Object.fromEntries(
  Object.values(ROLE_PROFILES).flatMap((list) => list.map((p) => [p.type, p.label])),
) as Record<ProfileType, string>;

/** A qual categoria um subperfil pertence. */
export const PROFILE_ROLE: Record<ProfileType, UserRole> = Object.fromEntries(
  Object.entries(ROLE_PROFILES).flatMap(([role, list]) => list.map((p) => [p.type, role])),
) as Record<ProfileType, UserRole>;

/**
 * Categorias anteriores que ainda podem chegar do JWT, do localStorage ou de
 * bancos não migrados. `institutional` foi dividida em Poder Público e
 * Comunicação — o subperfil decide (ver normalizeRole).
 */
const LEGACY_ROLE_MAP: Record<string, UserRole> = {
  community: "agent",
  citizen: "member",
  institutional: "government",
  organization: "agent",
  association: "agent",
  business: "partner",
};

/**
 * Normaliza qualquer role vinda da API/localStorage para as 5 categorias.
 * Quando o subperfil é conhecido, ele prevalece: é o que resolve contas
 * antigas "institutional" de imprensa, que agora pertencem a Comunicação.
 */
export function normalizeRole(role: string | null | undefined, profileType?: string | null): UserRole {
  if (profileType && profileType in PROFILE_ROLE) return PROFILE_ROLE[profileType as ProfileType];
  if (!role) return "member";
  if ((ROLES as string[]).includes(role)) return role as UserRole;
  return LEGACY_ROLE_MAP[role] ?? "member";
}

// ── Permissões ─────────────────────────────────────────────
/**
 * Capacidades aplicadas no app, derivadas da função de cada categoria.
 * Ver, filtrar e acompanhar demandas, projetos e o mapa vale para todos.
 */
export type Permission =
  | "publish"                 // publicar demandas, projetos, eventos e ações
  | "update_results"          // atualizar andamento, resultados e impacto dos próprios projetos
  | "institutional_response"  // publicar respostas institucionais, programas e serviços
  | "interact"                // registrar atualizações e participar
  | "share"                   // divulgar iniciativas
  | "connect"                 // solicitar conexão
  | "express_interest"        // demonstrar interesse
  | "support"                 // apoiar projetos / oferecer recursos, produtos ou serviços
  | "volunteer"               // oferecer voluntariado, inscrever-se em eventos
  | "ranking";                // aparecer no ranking de apoiadores e impacto

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  agent: ["publish", "update_results", "interact", "share", "connect"],
  member: ["interact", "share", "connect", "express_interest", "support", "volunteer", "ranking"],
  partner: ["interact", "share", "connect", "express_interest", "support", "ranking"],
  // Sem "ranking": o Poder Público é medido por indicadores de atuação,
  // não por um ranking competitivo de apoiadores (neutralidade institucional).
  government: ["institutional_response", "interact", "share", "connect", "express_interest", "support"],
  media: ["interact", "share", "connect"],
};

export function can(role: string | null | undefined, permission: Permission, profileType?: string | null): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role, profileType)].includes(permission);
}

/**
 * Tipos de publicação que cada categoria pode criar. Membros da Comunidade,
 * Parceiros e Comunicação não publicam demandas ou projetos: agem por apoio,
 * conexão e compartilhamento. O Poder Público publica respostas institucionais
 * e informa programas e serviços como "Mensagem".
 */
export const ROLE_POST_TYPES: Record<UserRole, PostType[]> = {
  agent: ["problem", "project", "need", "event", "action", "message"],
  member: [],
  partner: [],
  government: ["message"],
  media: [],
};

export function allowedPostTypes(role: string | null | undefined, profileType?: string | null): PostType[] {
  return ROLE_POST_TYPES[normalizeRole(role, profileType)];
}

/** Texto exibido no cadastro — espelha a especificação de perfis. */
export const ROLE_PERMISSION_LABELS: Record<UserRole, string[]> = {
  agent: [
    "Criar e gerenciar perfil", "Registrar demandas", "Registrar projetos",
    "Registrar eventos e ações", "Adicionar fotos, documentos e informações",
    "Receber solicitações de conexão", "Conversar com parceiros",
    "Atualizar o andamento dos projetos", "Registrar resultados e impactos",
    "Informar necessidades de apoio", "Participar de indicadores de impacto",
  ],
  member: [
    "Criar perfil", "Visualizar demandas e projetos", "Apoiar iniciativas",
    "Registrar atualizações", "Divulgar iniciativas", "Solicitar conexão",
    "Demonstrar interesse em participar", "Inscrever-se em eventos",
    "Oferecer voluntariado", "Apoiar projetos",
  ],
  partner: [
    "Criar perfil empresarial", "Visualizar demandas e projetos",
    "Filtrar oportunidades de apoio", "Demonstrar interesse", "Solicitar conexão",
    "Oferecer recursos", "Oferecer produtos ou serviços", "Apoiar projetos",
    "Registrar apoio realizado", "Acompanhar resultados",
    "Participar do ranking de apoiadores",
  ],
  government: [
    "Criar perfil institucional", "Visualizar mapa de demandas e projetos",
    "Acompanhar iniciativas do território", "Solicitar conexão",
    "Responder demandas relacionadas à sua atuação",
    "Registrar respostas institucionais",
    "Informar programas, serviços ou oportunidades", "Divulgar iniciativas",
    "Acompanhar indicadores e resultados", "Filtrar oportunidades de apoio",
    "Demonstrar interesse", "Oferecer recursos", "Apoiar projetos",
  ],
  media: [
    "Criar perfil profissional ou institucional",
    "Visualizar demandas, projetos e resultados", "Solicitar conexão",
    "Identificar pautas", "Divulgar iniciativas",
    "Divulgar projetos e resultados",
    "Acompanhar informações públicas do território",
  ],
};

export const ROLE_RESTRICTIONS: Partial<Record<UserRole, string>> = {
  member: "Não registra demandas ou projetos em nome de uma organização ou comunidade sem vínculo ou autorização.",
  partner: "Apoia, oferece recursos e se conecta — demandas e projetos são iniciados pelos Agentes de Transformação.",
  government: "Registra respostas institucionais e programas; não participa do ranking competitivo de apoiadores.",
  media: "Amplifica e divulga iniciativas — demandas e projetos são iniciados pelos Agentes de Transformação.",
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
export type PostStatus =
  | "active" | "in_progress" | "resolved" | "cancelled"
  // Status operacionais que a gestão gravava em posts antigos. Pela decisão 7
  // (dm-docs, decisoes-de-implementacao) ninguém mais os edita: só são exibidos.
  | "em_analise" | "encaminhada" | "em_execucao" | "resolvida" | "cancelada";

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
  em_analise: "Em análise",
  encaminhada: "Encaminhada",
  em_execucao: "Em execução",
  resolvida: "Resolvida",
  cancelada: "Cancelada",
};

export const POST_STATUS_COLORS: Record<PostStatus, string> = {
  active: "#2e7ba8",
  in_progress: "#f4841a",
  resolved: "#2e9e5b",
  cancelled: "#868e96",
  em_analise: "#1b4f72",
  encaminhada: "#2e7ba8",
  em_execucao: "#f4841a",
  resolvida: "#2e9e5b",
  cancelada: "#868e96",
};

/** Status conhecido do post, ou `null` para valor ausente ou desconhecido
    (a interface não mostra rótulo em vez de exibir um valor cru). */
export function normalizePostStatus(value: unknown): PostStatus | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POST_STATUS_LABELS, value)
    ? (value as PostStatus)
    : null;
}

export interface Post {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  type: PostType;
  title: string;
  description: string;
  status: PostStatus | null;
  latitude?: number | null;
  longitude?: number | null;
  neighborhood?: string | null;
  city?: string | null;
  images: string[];
  /** Vídeos do post (mp4/webm em /public/videos). O primeiro vira a capa,
      com images[0] servindo de poster enquanto o vídeo não carrega. */
  videos?: string[];
  tags: string[];
  reactionsCount: number;
  commentsCount: number;
  viewsCount: number;
  createdAt: string;
  /** Post-vitrine de uma demanda publicada (T07): linka `/demandas/<id>`. */
  demandId?: string | null;
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
  { type: "sharing", label: "Divulgação", subtitle: "Divulgar em canais locais", icon: "share" },
];

export const SUPPORT_TYPE_META: Record<SupportType, SupportTypeMeta> = Object.fromEntries(
  SUPPORT_TYPES.map((s) => [s.type, s]),
) as Record<SupportType, SupportTypeMeta>;

/**
 * Formas de apoio que cada perfil pode oferecer. Quem tem "support" (Membros,
 * Parceiros, Poder Público) oferece qualquer uma; quem só amplifica
 * (Agentes, Comunicação) contribui com divulgação.
 */
export function allowedSupportTypes(role: string | null | undefined, profileType?: string | null): SupportType[] {
  if (can(role, "support", profileType)) return SUPPORT_TYPES.map((s) => s.type);
  if (can(role, "share", profileType)) return ["sharing"];
  return [];
}

export type PaymentMethod = "pix" | "debit" | "credit";

export const PAYMENT_METHODS: { method: PaymentMethod; label: string; subtitle: string; icon: string }[] = [
  { method: "pix", label: "PIX", subtitle: "Pagamento instantâneo", icon: "pix" },
  { method: "debit", label: "Cartão de débito", subtitle: "Débito em conta", icon: "card" },
  { method: "credit", label: "Cartão de crédito", subtitle: "Parcelamento disponível", icon: "card" },
];

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

// ── Ranking ────────────────────────────────────────────────
/**
 * As abas do ranking: reconhecimento de apoio e impacto. O Poder Público e a
 * Comunicação não entram — ver a permissão "ranking" em ROLE_PERMISSIONS.
 */
export type RankCategory = "partner" | "agent" | "volunteer";

export interface RankHighlight {
  icon: string; // chave de ícone (ver Icon component)
  label: string;
}

export interface RankEntry {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: UserRole;
  profileType?: ProfileType | null;
  city?: string | null;
  /** Pontuação calculada a partir dos eventos persistidos dos serviços. */
  points: number;
  /** posição 1-based, preenchida após a ordenação. */
  rank: number;
  /** métricas que compõem os pontos, prontas para exibição. */
  highlights: RankHighlight[];
}

export interface RankBoard {
  category: RankCategory;
  label: string;
  /** subtítulo curto da aba. */
  subtitle: string;
  /** como os pontos são calculados — exibido ao usuário. */
  metric: string;
  entries: RankEntry[];
}

export const RANK_CATEGORIES: { category: RankCategory; label: string; icon: string }[] = [
  { category: "partner", label: "Parceiros", icon: "building" },
  { category: "agent", label: "Agentes", icon: "users" },
  { category: "volunteer", label: "Voluntários", icon: "volunteer" },
];

// ── Conexões (o fluxo "Solicitar Conexão") ─────────────────
/**
 * Uma conexão é um pedido direto de uma conta a outra — agente ↔ parceiro,
 * projeto ↔ patrocinador, governo ↔ demanda, ONG ↔ voluntário. É o passo que
 * transforma interação em ação: alguém pede algo concreto, o outro lado aceita
 * e a dupla registra o desfecho.
 */
export type ConnectionType =
  | "support"      // solicitar apoio
  | "sponsorship"  // patrocínio
  | "partnership"  // parceria
  | "meeting"      // reunião
  | "resources"    // recursos
  | "outreach";    // divulgação

export interface ConnectionTypeMeta {
  type: ConnectionType;
  label: string;
  subtitle: string;
  icon: string; // chave de ícone (ver Icon component)
}

export const CONNECTION_TYPES: ConnectionTypeMeta[] = [
  { type: "support", label: "Solicitar apoio", subtitle: "Peça ajuda para uma demanda ou projeto", icon: "volunteer" },
  { type: "sponsorship", label: "Patrocínio", subtitle: "Proponha investimento em um projeto", icon: "payments" },
  { type: "partnership", label: "Parceria", subtitle: "Trabalhem juntos de forma contínua", icon: "link" },
  { type: "meeting", label: "Reunião", subtitle: "Marque uma conversa para alinhar", icon: "calendar" },
  { type: "resources", label: "Recursos", subtitle: "Ofereça ou peça materiais e equipamentos", icon: "inventory" },
  { type: "outreach", label: "Divulgação", subtitle: "Amplifique a causa em canais locais", icon: "megaphone" },
];

export const CONNECTION_TYPE_META: Record<ConnectionType, ConnectionTypeMeta> = Object.fromEntries(
  CONNECTION_TYPES.map((c) => [c.type, c]),
) as Record<ConnectionType, ConnectionTypeMeta>;

/** pending → accepted → done é o caminho feliz; declined e canceled encerram. */
export type ConnectionStatus = "pending" | "accepted" | "declined" | "done" | "canceled";

export const CONNECTION_STATUS_LABELS: Record<ConnectionStatus, string> = {
  pending: "Aguardando resposta",
  accepted: "Conexão ativa",
  declined: "Recusada",
  done: "Concluída",
  canceled: "Cancelada",
};

export const CONNECTION_STATUS_COLORS: Record<ConnectionStatus, string> = {
  pending: "#f4841a",
  accepted: "#2e7ba8",
  declined: "#868e96",
  done: "#2e9e5b",
  canceled: "#868e96",
};

/** Cada passo do fluxo fica registrado — é o histórico auditável da conexão. */
export interface ConnectionEvent {
  id: string;
  label: string;
  detail?: string | null;
  icon: string;
  at: string;
}

export interface ConnectionParty {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  role: UserRole | null;
  profileType?: ProfileType | null;
}

export interface Connection {
  id: string;
  type: ConnectionType;
  status: ConnectionStatus;
  /** quem pediu */
  from: ConnectionParty;
  /** quem recebeu o pedido */
  to: ConnectionParty;
  message: string;
  /** publicação que originou o pedido (opcional) */
  postId?: string | null;
  postTitle?: string | null;
  /** demanda de onde saiu o pedido (T15): o aceite passa pela rota da demanda */
  demandId?: string | null;
  /** o que a dupla registrou ao concluir */
  outcome?: string | null;
  createdAt: string;
  updatedAt: string;
  events: ConnectionEvent[];
}

// ── Notificações ───────────────────────────────────────────
export type NotificationKind = "comment" | "support" | "reaction" | "connection" | "forwarding";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  actorName: string;
  postId: string;
  postTitle: string;
  /** resumo pronto para exibição, ex.: "comentou em «Buraco na Av.»" */
  summary: string;
  icon: string; // chave de ícone (ver Icon component)
  /** destino ao clicar; sem isso vale a publicação (`/post/{postId}`) */
  href?: string;
  createdAt: string;
}

// ── Perfil, histórico e referências de atuação ────────────
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

export interface DirectoryUser {
  id: string;
  name: string;
  role: UserRole;
  profileType: ProfileType | null;
  neighborhood: string | null;
  city: string | null;
  memberSince: string;
  avatarUrl?: string | null;
}

export interface AdminSnapshot {
  posts: Post[];
  supports: SupportRecord[];
  comments: Comment[];
  users: DirectoryUser[];
  communities: Community[];
  scraps: Scrap[];
  testimonials: Testimonial[];
  connections: Connection[];
}

// ── Map presentation ──────────────────────────────────────
// This is only the initial viewport; it is never persisted as post data.
export const MAP_CENTER: [number, number] = [-23.0247, -43.4567];

// ── Cadastro institucional (T04) ──────────────────────────
// Fonte da verdade: Fluxo 2 (CNPJ + CNAE do Agente de Transformação) e Fluxo 3
// (órgão, esfera, território e representante do Poder Público). A validação é
// feita pela equipe no dm-gestao (decisão 2); o app só cria, edita, envia e lê.

export type InstitutionKind = "agente_transformacao" | "poder_publico";
export type InstitutionValidationStatus = "pendente" | "em_analise" | "validada" | "devolvida" | "revogada";
export type GovernmentSphere = "municipal" | "estadual" | "federal";

export const INSTITUTION_KIND_LABELS: Record<InstitutionKind, string> = {
  agente_transformacao: "Agente de Transformação",
  poder_publico: "Poder Público",
};

export const INSTITUTION_STATUS_LABELS: Record<InstitutionValidationStatus, string> = {
  pendente: "Cadastro não enviado",
  em_analise: "Aguardando validação",
  validada: "Instituição validada",
  devolvida: "Devolvido para ajustes",
  revogada: "Validação revogada",
};

export const GOVERNMENT_SPHERE_LABELS: Record<GovernmentSphere, string> = {
  municipal: "Municipal",
  estadual: "Estadual",
  federal: "Federal",
};

/** Estados em que o titular edita e (re)envia o cadastro. */
export const INSTITUTION_EDITABLE_STATUSES: InstitutionValidationStatus[] = ["pendente", "devolvida", "revogada"];

/** Subperfis de Agente que se vinculam a uma instituição com CNPJ (decisão 3). */
export const LINKED_AGENT_PROFILES: ProfileType[] = ["lider_comunitario", "representante_bairro"];

export interface CnaeEntry {
  code: string;          // 7 dígitos, sem máscara ("9430800")
  description: string | null;
}

export interface InstitutionRepresentative {
  fullName: string;
  position: string;
  institutionalEmail: string;
  institutionalPhone: string;
  /**
   * Comprovação da representação: `upload:<id>` de um upload confirmado (T08)
   * ou a referência de texto/link de cadastros anteriores.
   */
  proofDocumentRef: string | null;
  proofDescription: string | null;
  /** Arquivo da comprovação, quando enviado por upload (só na leitura). */
  proofDocument?: UploadedFile | null;
}

export interface InstitutionValidationEvent {
  fromStatus: InstitutionValidationStatus | null;
  toStatus: InstitutionValidationStatus;
  /** Parecer da equipe (devolução/revogação). */
  note: string | null;
  actorType: "titular" | "gestao";
  createdAt: string;
}

/** Dados que o titular envia em PUT /api/users/me/institution. */
export interface InstitutionInput {
  cnpj: string;
  legalName: string;
  tradeName?: string | null;
  cnaePrimary?: string | null;
  cnaePrimaryDescription?: string | null;
  cnaeSecondary?: CnaeEntry[];
  governmentSphere?: GovernmentSphere | null;
  department?: string | null;
  competenceAreas?: string[];
  territory?: string | null;
  cep?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  municipality?: string | null;
  municipalityIbgeCode?: string | null;
  uf?: string | null;
  institutionalEmail?: string | null;
  institutionalPhone?: string | null;
  website?: string | null;
  representative: Omit<InstitutionRepresentative, "proofDocumentRef" | "proofDescription" | "proofDocument">
    & Partial<Pick<InstitutionRepresentative, "proofDocumentRef" | "proofDescription">>;
}

/** Cadastro do próprio titular (GET /api/users/me/institution). */
export interface Institution extends Omit<InstitutionInput, "representative" | "cnaeSecondary" | "competenceAreas"> {
  id: string;
  kind: InstitutionKind;
  cnaeSecondary: CnaeEntry[];
  competenceAreas: string[];
  status: InstitutionValidationStatus;
  /** Parecer da última devolução/revogação, enquanto não houver reenvio. */
  validationNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  representative: InstitutionRepresentative | null;
  events: InstitutionValidationEvent[];
}

/** Instituição validada exibida publicamente (sem contatos nem representante). */
export interface PublicInstitution {
  kind: InstitutionKind;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  cnaePrimary: string | null;
  cnaePrimaryDescription: string | null;
  cnaeSecondary: CnaeEntry[];
  governmentSphere: GovernmentSphere | null;
  department: string | null;
  competenceAreas: string[];
  territory: string | null;
  municipality: string | null;
  uf: string | null;
  website: string | null;
  validatedAt: string | null;
}

export interface InstitutionAccess {
  kind: InstitutionKind | null;
  status: InstitutionValidationStatus | null;
  /** Tipo de cadastro que a categoria do perfil exige (null: não se aplica). */
  requiredKind: InstitutionKind | null;
  canActInstitutionally: boolean;
  /** Id da instituição (user_db.organizations), quando há cadastro. */
  organizationId?: string | null;
}

export interface InstitutionFieldErrors {
  [field: string]: string;
}

/** Tipo de cadastro institucional exigido pela categoria do perfil. */
export function institutionKindFor(role: string | null | undefined, profileType?: string | null): InstitutionKind | null {
  const normalized = normalizeRole(role, profileType);
  if (normalized === "agent") return "agente_transformacao";
  if (normalized === "government") return "poder_publico";
  return null;
}

/**
 * O Poder Público só entra no ambiente institucional (publicar mensagem,
 * comentar, apoiar, solicitar conexão) com o cadastro validado; os serviços
 * aplicam a mesma regra (403 `institution_not_validated`).
 */
export function requiresInstitutionalValidation(role: string | null | undefined, profileType?: string | null): boolean {
  return normalizeRole(role, profileType) === "government";
}

/** "11222333000181" → "11.222.333/0001-81" (aceita o CNPJ alfanumérico). */
export function formatCnpj(value: string): string {
  const c = value.toUpperCase().replace(/[.\-/\s]/g, "");
  if (c.length !== 14) return value;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** "9430800" → "9430-8/00". */
export function formatCnae(value: string): string {
  const c = value.replace(/[.\-/\s]/g, "");
  if (c.length !== 7) return value;
  return `${c.slice(0, 4)}-${c.slice(4, 5)}/${c.slice(5)}`;
}

// ── Demanda (T07) ──────────────────────────────────────────
// Espelho do contrato de services/post-service/src/routes/demands.js
// (JSON em camelCase). Valores e rótulos iguais a src/demand/constants.js.

export type DemandCategory =
  | "projeto_social" | "projeto_ambiental" | "necessidade_de_patrocinio"
  | "problema_urbano" | "problema_urgente";

export const DEMAND_CATEGORY_LABELS: Record<DemandCategory, string> = {
  projeto_social: "Projeto Social",
  projeto_ambiental: "Projeto Ambiental",
  necessidade_de_patrocinio: "Necessidade de Patrocínio",
  problema_urbano: "Problema Urbano",
  problema_urgente: "Problema Urgente",
};

export type DemandStatus =
  | "em_analise" | "publicada" | "em_busca_de_parceiro" | "conectada"
  | "em_execucao" | "concluida" | "prestacao_de_contas" | "arquivada";

export const DEMAND_STATUS_LABELS: Record<DemandStatus, string> = {
  em_analise: "Em análise",
  publicada: "Publicada",
  em_busca_de_parceiro: "Em busca de parceiro",
  conectada: "Conectada",
  em_execucao: "Em execução",
  concluida: "Concluída",
  prestacao_de_contas: "Prestação de contas",
  arquivada: "Arquivada",
};

/** Status visíveis em rota pública (da publicação em diante). */
export const DEMAND_PUBLIC_STATUSES: DemandStatus[] = [
  "publicada", "em_busca_de_parceiro", "conectada", "em_execucao", "concluida", "prestacao_de_contas",
];

export type DemandReviewState = "rascunho" | "aguardando_analise" | "devolvida" | "aprovada";

export const DEMAND_REVIEW_STATE_LABELS: Record<DemandReviewState, string> = {
  rascunho: "Rascunho",
  aguardando_analise: "Aguardando análise",
  devolvida: "Devolvida para ajustes",
  aprovada: "Aprovada",
};

export type DemandPriority = "baixa" | "media" | "alta" | "urgente";

export const DEMAND_PRIORITY_LABELS: Record<DemandPriority, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  urgente: "Urgente",
};

export type DemandRecordMilestone = "antes" | "acompanhamento" | "depois";
export type DemandResourceKind = "necessario" | "contrapartida";

export type DemandNeededResourceType =
  | "recursos_financeiros" | "materiais" | "servicos" | "equipamentos" | "mao_de_obra"
  | "estrutura" | "apoio_tecnico" | "conhecimento_especializado" | "servicos_de_fotografia_e_filmagem";

export type DemandCounterpartResourceType =
  | "equipe" | "espaco_fisico" | "equipamentos" | "materiais" | "servicos"
  | "estrutura" | "recursos_proprios" | "conhecimento_tecnico";

export type DemandResourceType = DemandNeededResourceType | DemandCounterpartResourceType;

export const DEMAND_RESOURCE_TYPES: Record<DemandResourceKind, DemandResourceType[]> = {
  necessario: [
    "recursos_financeiros", "materiais", "servicos", "equipamentos", "mao_de_obra",
    "estrutura", "apoio_tecnico", "conhecimento_especializado", "servicos_de_fotografia_e_filmagem",
  ],
  contrapartida: [
    "equipe", "espaco_fisico", "equipamentos", "materiais", "servicos",
    "estrutura", "recursos_proprios", "conhecimento_tecnico",
  ],
};

export type DemandDocumentType =
  | "documentos_institucionais" | "estatuto" | "documentos_de_representacao"
  | "autorizacoes" | "orcamentos_e_cotacoes" | "projetos_tecnicos" | "fotografias" | "outros";

/** Ações do Agente depois da publicação (POST /demands/:id/transitions). */
export type DemandAgentAction =
  | "buscar_parceiro" | "conectar" | "iniciar_execucao" | "concluir" | "prestar_contas";

/** `enviar` aparece em `availableActions` e usa POST /demands/:id/submit. */
export type DemandAction = "enviar" | DemandAgentAction;

/** Composição financeira gravada, em centavos (4% Agente + 6% plataforma). */
export interface DemandComposition {
  budgetAmountCents: number;
  agentFeeBps: number;
  platformFeeBps: number;
  agentFeeCents: number;
  platformFeeCents: number;
  totalAmountCents: number;
}

export interface DemandBudgetItemInput {
  description: string;
  /** Até 3 casas decimais; aceita "2,5". */
  quantity: number | string;
  unit: string;
  unitPriceCents: number;
  isAudiovisualRecord?: boolean;
  scheduleItemId?: string | null;
  position?: number;
}

export interface DemandBudgetItem extends Omit<DemandBudgetItemInput, "quantity"> {
  id: string;
  position: number;
  quantity: number;
  totalCents: number;
  isAudiovisualRecord: boolean;
  scheduleItemId: string | null;
}

export interface DemandScheduleItemInput {
  stage: string;
  activities: string;
  /** AAAA-MM-DD */
  startsOn: string;
  endsOn: string;
  responsible?: string | null;
  recordMilestones?: DemandRecordMilestone[];
  position?: number;
}

export interface DemandScheduleItem extends DemandScheduleItemInput {
  id: string;
  position: number;
  recordMilestones: DemandRecordMilestone[];
}

export interface DemandGoalInput {
  goal: string;
  expectedResult: string;
  indicator: string;
  measurementMethod: string;
  position?: number;
}

export interface DemandGoal extends DemandGoalInput {
  id: string;
  position: number;
}

export interface DemandResourceInput {
  kind: DemandResourceKind;
  type: DemandResourceType;
  description?: string | null;
  position?: number;
}

export interface DemandResource extends DemandResourceInput {
  id: string;
  position: number;
}

export interface DemandDocumentInput {
  type: DemandDocumentType;
  title: string;
  /** `upload:<id>` de upload confirmado desta demanda (T08) ou link https. */
  reference: string;
  description?: string | null;
  position?: number;
}

export interface DemandDocument extends DemandDocumentInput {
  id: string;
  position: number;
  /** Arquivo enviado por upload, com URL de leitura curta (só o autor). */
  file?: UploadedFile | null;
}

/** Documento na rota pública: sem o link. */
export interface PublicDemandDocument {
  id: string;
  position: number;
  type: DemandDocumentType;
  title: string;
}

export interface DemandItemInputs {
  "budget-items": DemandBudgetItemInput;
  "schedule-items": DemandScheduleItemInput;
  goals: DemandGoalInput;
  resources: DemandResourceInput;
  documents: DemandDocumentInput;
}

export interface DemandItems {
  "budget-items": DemandBudgetItem;
  "schedule-items": DemandScheduleItem;
  goals: DemandGoal;
  resources: DemandResource;
  documents: DemandDocument;
}

export type DemandItemKind = keyof DemandItemInputs;

/** Campos escalares da demanda (POST /demands e PUT /demands/:id; parciais). */
export interface DemandInput {
  category?: DemandCategory | null;
  title?: string | null;
  description?: string | null;
  objective?: string | null;
  justification?: string | null;
  beneficiariesEstimate?: number | null;
  beneficiariesProfile?: string | null;
  priority?: DemandPriority | null;
  photoRef?: string | null;
  cep?: string | null;
  street?: string | null;
  addressNumber?: string | null;
  addressComplement?: string | null;
  district?: string | null;
  municipality?: string | null;
  uf?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  territory?: string | null;
  hasPhysicalExecution?: boolean;
}

/** Demanda vista pelo autor (GET /demands/mine/:id). */
export interface Demand extends Required<DemandInput> {
  id: string;
  authorId: string;
  organizationId: string | null;
  authorName: string | null;
  authorAvatar: string | null;
  composition: DemandComposition;
  status: DemandStatus;
  reviewState: DemandReviewState;
  /** Parecer da devolução enquanto `reviewState` é `devolvida`. */
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  publishedAt: string | null;
  archiveReason: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Post-vitrine no feed, depois da publicação. */
  postId: string | null;
  /** Leitura da foto: URL assinada curta para o autor (rascunho não é público). */
  photoUrl: string | null;
  photoFile?: UploadedFile | null;
  editable: boolean;
  availableActions: DemandAction[];
  /** Ausentes na listagem (GET /demands/mine). */
  budgetItems?: DemandBudgetItem[];
  scheduleItems?: DemandScheduleItem[];
  goals?: DemandGoal[];
  resources?: DemandResource[];
  documents?: DemandDocument[];
}

/** Demanda na rota pública: sem endereço fino nem dados da análise. */
export interface PublicDemand {
  id: string;
  authorId: string;
  authorName: string | null;
  authorAvatar: string | null;
  category: DemandCategory;
  title: string;
  description: string;
  objective: string;
  justification: string;
  beneficiariesEstimate: number;
  beneficiariesProfile: string;
  priority: DemandPriority;
  photoRef: string | null;
  /** Endereço público estável da foto (`/api/posts/uploads/<id>/content`) ou link. */
  photoUrl: string | null;
  district: string | null;
  municipality: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  territory: string | null;
  hasPhysicalExecution: boolean;
  composition: DemandComposition;
  status: DemandStatus;
  publishedAt: string | null;
  updatedAt: string;
  postId: string | null;
  budgetItems: DemandBudgetItem[];
  scheduleItems: Omit<DemandScheduleItem, "responsible">[];
  goals: DemandGoal[];
  resources: DemandResource[];
  documents: PublicDemandDocument[];
}

/** Item da lista pública e do mapa. */
export interface PublicDemandSummary {
  id: string;
  authorId: string;
  authorName: string | null;
  authorAvatar: string | null;
  category: DemandCategory;
  title: string;
  /** Primeiros 280 caracteres. */
  description: string;
  priority: DemandPriority;
  photoRef: string | null;
  photoUrl: string | null;
  district: string | null;
  municipality: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
  territory: string | null;
  beneficiariesEstimate: number | null;
  budgetAmountCents: number;
  totalAmountCents: number;
  status: DemandStatus;
  publishedAt: string | null;
  postId: string | null;
}

export interface DemandListFilter {
  category?: DemandCategory[];
  priority?: DemandPriority[];
  status?: DemandStatus[];
  territory?: string;
  municipality?: string;
  uf?: string;
  q?: string;
  /** [oeste, sul, leste, norte] em graus. */
  bbox?: [number, number, number, number];
  limit?: number;
  cursor?: string | null;
}

export interface DemandPage {
  demands: PublicDemandSummary[];
  nextCursor: string | null;
}

/** Evento da linha do tempo pública. */
export interface DemandTimelineEvent {
  id: string;
  type: string;
  fromStatus: DemandStatus | null;
  toStatus: DemandStatus | null;
  createdAt: string;
  /** Eventos da atuação institucional (T13): órgão, tipo da resposta e status institucional. */
  details?: DemandTimelineDetails;
}

/** payload->'public' dos eventos institucionais (triggers da migração post 010). */
export interface DemandTimelineDetails {
  organizationName?: string | null;
  governmentSphere?: string | null;
  institutionalStatus?: string | null;
  fromInstitutionalStatus?: string | null;
  responseType?: string | null;
  programName?: string | null;
  excerpt?: string | null;
  note?: string | null;
  supportTypes?: string[] | null;
  /** Encaminhamentos (T14, migração post 011). */
  destinationKind?: string | null;
  destinationOrganizationName?: string | null;
  destinationSector?: string | null;
  originOrganizationName?: string | null;
  forwardingStatus?: string | null;
  fromForwardingStatus?: string | null;
  updateKind?: string | null;
  /** Interesse e conexão (T15, migração post 012): sem nome nem id de quem manifestou. */
  interestKind?: string | null;
  userCategory?: string | null;
  offerTypes?: string[] | null;
  /** Apoio (T16, migração post 013): modalidade, o que foi oferecido e, com
      consentimento, o nome público e o valor declarado. */
  modality?: string | null;
  supportType?: string | null;
  supporterCategory?: string | null;
  supporterName?: string | null;
  amount?: string | number | null;
  /** Execução e evidências (T17, migração post 014). */
  milestone?: string | null;
  mediaKind?: string | null;
  caption?: string | null;
  recordedOn?: string | null;
  stage?: string | null;
  stageProgress?: string | null;
  onSchedule?: boolean | null;
  newEndsOn?: string | null;
  deadlineReason?: string | null;
  partialResults?: string | null;
  executedAmountCents?: number | null;
  reason?: string | null;
}

/** Evento da linha do tempo completa, visto pelo autor. */
export interface DemandEvent extends DemandTimelineEvent {
  reviewState: DemandReviewState | null;
  actorType: "agente" | "gestao" | "sistema" | "poder_publico" | "parceiro" | "comunidade";
  note: string | null;
  payload: Record<string, unknown>;
  isPublic: boolean;
}

export interface DemandReview {
  status: DemandStatus;
  reviewState: DemandReviewState;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string | null;
  returns: { note: string | null; createdAt: string }[];
}

/** Erros por campo (`budgetItems[0].quantity`, `audiovisualRecord`, ...). */
export type DemandFieldErrors = Record<string, string>;

export interface DemandValidation {
  valid: boolean;
  fields: DemandFieldErrors;
  warnings: DemandFieldErrors;
  composition: DemandComposition | null;
}

// ── Upload de arquivos (T08) ─────────────────────────────────

/** Finalidades de upload (espelho de services/post-service/src/uploads.js). */
export type UploadPurpose =
  | "demand_photo"
  | "demand_evidence_photo"
  | "demand_evidence_video"
  | "demand_document"
  | "institution_proof";

/** Serviço que guarda o arquivo: `posts` (demanda) ou `users` (instituição). */
export type UploadService = "posts" | "users";

/** Arquivo confirmado (resposta da confirmação e das visões privadas). */
export interface UploadedFile {
  id: string;
  /** Valor gravado nas referências: `upload:<id>`. */
  ref: string;
  purpose: UploadPurpose;
  status: "pendente" | "confirmado";
  contentType: string;
  size: number;
  fileName: string | null;
  sha256: string | null;
  demandId?: string | null;
  organizationId?: string | null;
  createdAt: string | null;
  confirmedAt: string | null;
  /** URL de leitura curta (alguns minutos); peça outra com `api.getUpload`. */
  url: string | null;
}

/** Autorização de envio (POST /uploads/presign). */
export interface UploadTicket {
  uploadId: string;
  ref: string;
  method: "PUT";
  url: string;
  headers: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
}

// ── DOSSIÊ DA DEMANDA (T10) ──────────────────────────────────
// Documento Oficial da Demanda — Dossiê da Demanda, gerado pelo post-service
// (services/post-service/src/dossier/) no envio, em cada reenvio e na publicação.

export type DemandDossierVariant = "integral" | "publica";
export type DemandDossierTrigger = "envio" | "reenvio" | "publicacao" | "conclusao";
export type DemandDossierStatus = "pendente" | "gerado" | "falhou" | "indisponivel";

/** Versão do dossiê vista pelo autor (ou pela operação). */
export interface DemandDossier {
  id: string;
  demandId: string;
  number: string;
  version: number;
  variant: DemandDossierVariant;
  trigger: DemandDossierTrigger;
  status: DemandDossierStatus;
  /** Por que ainda não foi gerado (falha, bucket ausente). */
  statusReason: string | null;
  attempts: number;
  contentSha256: string | null;
  fileSha256: string | null;
  sizeBytes: number | null;
  fileName: string;
  generatedAt: string | null;
  requestedAt: string | null;
  verifyPath: string | null;
}

export interface DemandDossierList {
  storageConfigured: boolean;
  dossiers: DemandDossier[];
}

/** URL assinada curta (60 s) para baixar uma versão. */
export interface DemandDossierDownload {
  url: string;
  expiresAt: string;
  fileName: string;
}

/** Versão pública da publicação (GET /demands/:id/dossie-publico/info). */
export interface PublicDossierInfo {
  available: boolean;
  status: DemandDossierStatus;
  statusReason: string | null;
  dossier: {
    number: string;
    version: number;
    generatedAt: string;
    contentSha256: string;
    fileSha256: string;
    sizeBytes: number;
    verifyPath: string;
  } | null;
}

/** Verificação pública por SHA-256 (conteúdo ou arquivo). */
export interface DossierVerification {
  valid: boolean;
  matchedBy: "content" | "file";
  dossier: {
    number: string;
    version: number;
    variant: DemandDossierVariant;
    trigger: DemandDossierTrigger;
    generatedAt: string;
    contentSha256: string;
    fileSha256: string;
    sizeBytes: number;
    isLatest: boolean;
  };
  /** Só quando a demanda está publicada. */
  demand: { id: string; title: string; category: DemandCategory; categoryLabel: string | null; status: DemandStatus } | null;
}

// ── ATUAÇÃO INSTITUCIONAL DO PODER PÚBLICO (T13) ───────────
// Espelha services/post-service/src/institutional/constants.js (o teste
// src/lib/app/institutional.test.mjs compara as listas).

export type InstitutionalStatus =
  | "recebida" | "em_analise" | "encaminhada" | "em_articulacao" | "acao_programada"
  | "em_execucao" | "concluida" | "nao_e_de_competencia" | "encaminhada_ao_orgao_responsavel";

export type InstitutionalResponseType =
  | "recebimento" | "analise_em_andamento" | "orgao_ou_setor_responsavel" | "encaminhamento_realizado"
  | "programa_publico_relacionado" | "acao_prevista" | "informacoes_adicionais"
  | "impossibilidade_com_encaminhamento";

export type InstitutionalSupportType =
  | "recursos_publicos" | "servicos_publicos" | "programas_e_politicas_publicas" | "infraestrutura"
  | "equipamentos" | "espacos_publicos" | "equipes" | "conhecimento_tecnico"
  | "encaminhamentos_administrativos" | "articulacao_institucional" | "parcerias";

/** Acompanhamento de uma demanda pelo próprio órgão (visão do órgão). */
export interface InstitutionalTrack {
  id: string;
  demandId: string;
  organizationId: string;
  organizationName: string;
  governmentSphere: GovernmentSphere | null;
  department: string | null;
  municipality: string | null;
  uf: string | null;
  openedBy: string;
  openedByName: string | null;
  status: InstitutionalStatus;
  statusNote: string | null;
  statusChangedBy: string | null;
  responsibleName: string | null;
  responsibleRole: string | null;
  receivedAt: string;
  statusChangedAt: string;
  concludedAt: string | null;
  createdAt: string;
  updatedAt: string;
  availableStatuses: InstitutionalStatus[];
}

/** Acompanhamento na projeção pública (órgão, status e datas). */
export interface PublicInstitutionalTrack {
  id: string;
  organizationName: string;
  governmentSphere: GovernmentSphere | null;
  department: string | null;
  municipality: string | null;
  uf: string | null;
  status: InstitutionalStatus;
  statusNote: string | null;
  receivedAt: string;
  statusChangedAt: string;
  concludedAt: string | null;
}

export interface InstitutionalResponse {
  id: string;
  trackId: string;
  organizationName: string;
  type: InstitutionalResponseType;
  body: string;
  responsibleSector: string | null;
  programName: string | null;
  programUrl: string | null;
  plannedFor: string | null;
  institutionalStatus: InstitutionalStatus;
  createdAt: string;
  /** Só na visão do próprio órgão. */
  authorId?: string;
  authorName?: string | null;
}

export interface InstitutionalOffer {
  id: string;
  trackId: string;
  organizationName: string;
  supportTypes: InstitutionalSupportType[];
  description: string;
  createdAt: string;
  /** Só na visão do próprio órgão. */
  connectionId?: string | null;
  authorId?: string;
  authorName?: string | null;
}

/** GET /api/posts/demands/:id/institutional (público). */
export interface PublicDemandInstitutional {
  organizations: PublicInstitutionalTrack[];
  responses: InstitutionalResponse[];
  offers: InstitutionalOffer[];
  /** Tramitação dos encaminhamentos (T14). */
  forwardings: PublicForwarding[];
}

/** GET /api/posts/institutional/me. */
export interface InstitutionalContext {
  organizationId: string;
  organization: {
    name: string;
    legalName: string | null;
    governmentSphere: GovernmentSphere | null;
    department: string | null;
    competenceAreas: string[];
    territory: string | null;
    municipality: string | null;
    uf: string | null;
  };
  jurisdiction: { governmentSphere: GovernmentSphere | null; municipality: string | null; uf: string | null };
  counts: Record<InstitutionalStatus, number>;
  /** Encaminhamentos (T14): recebidos sem resposta e enviados em aberto. */
  forwardings: { pendingReceived: number; openSent: number };
}

export type InstitutionalScope = "jurisdicao" | "todas";

export interface InstitutionalDemandFilter extends DemandListFilter {
  scope?: InstitutionalScope;
  /** Inclui `sem_acompanhamento`. */
  institutionalStatus?: (InstitutionalStatus | "sem_acompanhamento")[];
}

export interface InstitutionalDemandSummary extends PublicDemandSummary {
  institutional: { trackId: string; status: InstitutionalStatus; statusChangedAt: string } | null;
}

export interface InstitutionalDemandPage {
  scope: InstitutionalScope;
  demands: InstitutionalDemandSummary[];
  nextCursor: string | null;
}

/** GET /api/posts/institutional/demands/:id e respostas das escritas. */
export interface InstitutionalDemandView {
  demand: PublicDemand;
  track: InstitutionalTrack | null;
  responses: InstitutionalResponse[];
  offers: InstitutionalOffer[];
  otherOrganizations: PublicInstitutionalTrack[];
  /** Encaminhamentos em que o órgão é origem ou destino (T14). */
  forwardings: Forwarding[];
}

export interface InstitutionalResponseInput {
  type: InstitutionalResponseType;
  body: string;
  responsibleSector?: string | null;
  programName?: string | null;
  programUrl?: string | null;
  plannedFor?: string | null;
  status?: InstitutionalStatus | null;
  statusNote?: string | null;
}

export interface InstitutionalOfferInput {
  supportTypes: InstitutionalSupportType[];
  description: string;
  connectionId?: string | null;
}

// ── ENCAMINHAMENTOS DA DEMANDA (T14) ────────────────────────
// Espelha services/post-service/src/institutional/forwardings.js (o teste
// src/lib/app/institutional.test.mjs compara as listas).

export type ForwardingDestinationKind = "orgao_plataforma" | "setor_interno" | "orgao_externo";
export type ForwardingStatus = "enviado" | "recebido" | "aceito" | "devolvido";
export type ForwardingUpdateKind = "providencia" | "atualizacao" | "status";
export type ForwardingDirection = "recebidos" | "enviados";

/** Providência, atualização posterior ou mudança de status (histórico de tramitação). */
export interface ForwardingUpdate {
  id: string;
  forwardingId: string;
  organizationName: string;
  side: "origem" | "destino";
  kind: ForwardingUpdateKind;
  body: string | null;
  fromStatus: ForwardingStatus | null;
  toStatus: ForwardingStatus | null;
  createdAt: string;
  /** Só na visão dos órgãos envolvidos. */
  authorId?: string;
  authorName?: string | null;
}

/** Encaminhamento na projeção pública (órgãos, setor, status, datas e tramitação). */
export interface PublicForwarding {
  id: string;
  demandId: string;
  originOrganizationName: string;
  destinationKind: ForwardingDestinationKind;
  destinationOrganizationName: string;
  destinationSector: string | null;
  destinationSphere: GovernmentSphere | null;
  destinationMunicipality: string | null;
  destinationUf: string | null;
  reason: string;
  status: ForwardingStatus;
  statusNote: string | null;
  statusChangedAt: string;
  forwardedAt: string;
  receivedAt: string | null;
  acceptedAt: string | null;
  returnedAt: string | null;
  updates: ForwardingUpdate[];
}

/** Encaminhamento na visão de um órgão envolvido (origem ou destino). */
export interface Forwarding extends PublicForwarding {
  trackId: string;
  organizationId: string;
  destinationOrganizationId: string | null;
  destinationTrackId: string | null;
  forwardedBy: string;
  forwardedByName: string | null;
  responsibleName: string | null;
  responsibleRole: string | null;
  statusChangedBy: string | null;
  /** Relativo ao órgão que vê: `enviado` (origem) ou `recebido` (destino). */
  direction: "enviado" | "recebido";
  canChangeStatus: boolean;
  availableStatuses: ForwardingStatus[];
}

/** Órgão validado do diretório (destino de encaminhamento). */
export interface GovernmentOrganization {
  organizationId: string;
  name: string;
  legalName: string | null;
  governmentSphere: GovernmentSphere | null;
  department: string | null;
  competenceAreas: string[];
  territory: string | null;
  municipality: string | null;
  uf: string | null;
}

export interface ForwardingInput {
  destinationKind: ForwardingDestinationKind;
  destinationOrganizationId?: string | null;
  destinationOrganizationName?: string | null;
  destinationSector?: string | null;
  destinationSphere?: GovernmentSphere | null;
  destinationMunicipality?: string | null;
  destinationUf?: string | null;
  reason: string;
  responsibleName?: string | null;
  responsibleRole?: string | null;
  trackStatus?: "encaminhada" | "encaminhada_ao_orgao_responsavel" | null;
}

/** Item da caixa do órgão (GET /api/posts/institutional/forwardings). */
export interface ForwardingInboxItem {
  forwarding: Forwarding;
  demand: PublicDemandSummary;
}

/** GET /api/posts/institutional/forwardings/:id e respostas de status e providências. */
export interface ForwardingView {
  forwarding: Forwarding;
  demand: PublicDemandSummary | null;
}

// ── Interesse, conexão e oportunidades de apoio (T15) ──────
// Espelho de services/post-service/src/routes/interests.js e
// services/user-service/src/routes/partner-profile.js (JSON em camelCase).

export type InterestKind = "apoio" | "participacao" | "voluntariado";
export type InterestOfferType = "recursos" | "produtos" | "servicos" | "conhecimento" | "estrutura" | "investimento";
export type InterestConnectionStatus = "pendente" | "aceita" | "recusada" | "cancelada";
export type InterestUserCategory = "parceiro" | "comunidade" | "poder_publico";

/** Manifestação vista por quem a fez. */
export interface DemandInterest {
  id: string;
  demandId: string;
  kind: InterestKind;
  offerTypes: InterestOfferType[];
  message: string | null;
  connectionId: string | null;
  connectionStatus: InterestConnectionStatus | null;
  connectionRequestedAt: string | null;
  connectionAnsweredAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
}

/** Manifestação vista pelo Agente autor: quem se interessou. */
export interface AgentDemandInterest extends DemandInterest {
  user: {
    userId: string;
    name: string | null;
    avatarUrl: string | null;
    category: InterestUserCategory;
    profileType: ProfileType | null;
  };
}

export interface MyInterestItem extends DemandInterest {
  demand: { id: string; title: string; status: DemandStatus };
}

/** Contagens públicas (sem nome nem id). */
export interface InterestSummary {
  apoio: number;
  participacao: number;
  voluntariado: number;
  acceptedConnections: number;
}

export type CompatibilityCriterion = "territorio" | "categoria" | "recursos";
export type CompatibilityLevel = "alta" | "media" | "baixa" | "nenhuma";

export interface CompatibilityReason {
  criterion: CompatibilityCriterion;
  points: number;
  maxPoints: number;
  matched: boolean;
  text: string;
  matchedResources?: DemandNeededResourceType[];
}

/** Compatibilidade explicável (sem IA): território 40, categoria 30, recursos 30. */
export interface Compatibility {
  score: number;
  maxScore: number;
  level: CompatibilityLevel;
  profileComplete: boolean;
  reasons: CompatibilityReason[];
}

export interface DemandInterestContext {
  interests: DemandInterest[];
  allowedKinds: InterestKind[];
  isAuthor: boolean;
  open: boolean;
  compatibility: Compatibility | null;
}

export interface Opportunity {
  demand: PublicDemandSummary & { neededResources: DemandNeededResourceType[] };
  compatibility: Compatibility | null;
  myInterests: { id: string; kind: InterestKind; connectionStatus: InterestConnectionStatus | null }[];
}

export interface OpportunityPage {
  opportunities: Opportunity[];
  total: number;
  truncated: boolean;
  offset: number;
  limit: number;
  nextOffset: number | null;
  sort: "compatibilidade" | "recentes";
  compatibilityAvailable: boolean;
  profile: { exists: boolean; complete: boolean } | null;
}

export interface OpportunityFilter {
  category?: DemandCategory[];
  priority?: DemandPriority[];
  status?: DemandStatus[];
  resourceType?: DemandNeededResourceType[];
  territory?: string;
  municipality?: string;
  uf?: string;
  q?: string;
  minTotalCents?: number | null;
  maxTotalCents?: number | null;
  sort?: "compatibilidade" | "recentes";
  limit?: number;
  offset?: number;
}

export interface InterestInput {
  kind: InterestKind;
  offerTypes?: InterestOfferType[];
  message?: string | null;
}

/** Perfil de apoio (user-service): base da compatibilidade. */
export interface PartnerProfile {
  exists: boolean;
  editable: boolean;
  nationwide: boolean;
  ufs: string[];
  /** "Município/UF" */
  municipalities: string[];
  territories: string[];
  interestCategories: DemandCategory[];
  offeredResources: DemandNeededResourceType[];
  updatedAt: string | null;
}

export type PartnerProfileInput = Omit<PartnerProfile, "exists" | "editable" | "updatedAt">;

// ── Apoio à demanda: modalidades, registro e transparência (T16) ──
// Espelho de services/post-service/src/routes/supports.js e
// src/support/ (JSON em camelCase). A plataforma não processa pagamento:
// o apoio financeiro é valor declarado (decisão 5).

/** As 6 modalidades do sistema de apoio (Apresentação, slide 20). */
export type SupportModality =
  | "patrocinar_projeto"
  | "doar_recursos"
  | "financiar_evento"
  | "adotar_espaco_publico"
  | "apoiar_acao_ambiental"
  | "contratar_servicos_locais";

/** Dupla confirmação: o apoiador declara, o Agente confirma ou contesta. */
export type SupportReceiptStatus = "declarado" | "confirmado" | "contestado";

/** Estado que o dm-gestao confirma ou rejeita. */
export type SupportGestaoStatus = "pending" | "confirmed" | "rejected";

export type SupporterCategory = "parceiro" | "poder_publico";

export interface SupportEvidence {
  reference: string;
  url: string | null;
}

/** Apoio visto por quem o registrou. */
export interface DemandSupport {
  id: string;
  demandId: string;
  postId: string | null;
  modality: SupportModality;
  supportType: SupportType;
  description: string;
  amountCents: number | null;
  amountPublic: boolean;
  occurredOn: string | null;
  message: string | null;
  receiptStatus: SupportReceiptStatus;
  receiptNote: string | null;
  receiptAnsweredAt: string | null;
  evidence: SupportEvidence[];
  displayConsent: boolean;
  publicName: string | null;
  status: SupportGestaoStatus;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Apoio visto pelo Agente autor da demanda. */
export interface AgentDemandSupport extends DemandSupport {
  supporter: {
    userId: string;
    name: string | null;
    category: SupporterCategory;
    profileType: ProfileType | null;
    organizationId: string | null;
  };
}

/** "Meus apoios": andamento da demanda apoiada. */
export interface MySupportItem extends DemandSupport {
  demand: {
    id: string;
    title: string;
    status: DemandStatus;
    category: DemandCategory;
    municipality: string | null;
    uf: string | null;
    territory: string | null;
  };
}

/** Linha do histórico público de apoio (slide 21). */
export interface PublicDemandSupport {
  id: string;
  modality: SupportModality;
  supportType: SupportType;
  description: string;
  supporterName: string | null;
  supporterCategory: SupporterCategory;
  amountCents: number | null;
  amountPublic: boolean;
  receiptStatus: SupportReceiptStatus;
  confirmedAt: string | null;
  hasEvidence: boolean;
  occurredOn: string | null;
  createdAt: string;
}

export interface SupportTotals {
  total: number;
  confirmed: number;
  declared: number;
  contested: number;
  government: number;
  publicAmountCents: number;
  confirmedPublicAmountCents: number;
  byModality: { modality: SupportModality; count: number }[];
}

export interface DemandSupportHistory {
  supports: PublicDemandSupport[];
  totals: SupportTotals;
}

export interface DemandSupportContext {
  supports: DemandSupport[];
  allowedModalities: SupportModality[];
  allowedSupportTypes: SupportType[];
  isAuthor: boolean;
  open: boolean;
}

export interface SupportInput {
  modality: SupportModality;
  supportType: SupportType;
  description: string;
  amountCents?: number | null;
  amountPublic?: boolean;
  occurredOn?: string | null;
  message?: string | null;
  displayConsent?: boolean;
  publicName?: string | null;
}

export interface SupportConsentInput {
  displayConsent: boolean;
  publicName?: string | null;
  amountPublic?: boolean;
}

export interface SupportReceiptInput {
  note?: string | null;
  evidence?: string[];
}

// ── EXECUÇÃO, EVIDÊNCIAS E ACOMPANHAMENTO (T17) ─────────────────────────────
// Fluxo 2, slides 11, 12, 14, 23 e 24. Espelha
// services/post-service/src/execution/ (constantes em execution.ts).

export type DemandEvidenceMediaKind = "foto" | "video";

export type DemandStageProgress = "nao_iniciada" | "em_andamento" | "concluida";

/** Evidência no histórico visual público (sem autor nem id do arquivo). */
export interface PublicDemandEvidence {
  id: string;
  scheduleItemId: string | null;
  stage: string | null;
  milestone: DemandRecordMilestone;
  mediaKind: DemandEvidenceMediaKind;
  url: string | null;
  caption: string | null;
  recordedOn: string | null;
  pairEvidenceId: string | null;
  createdAt: string | null;
}

/** Evidência vista pelo Agente autor. */
export interface DemandEvidence extends PublicDemandEvidence {
  demandId: string;
  progressUpdateId: string | null;
  reference: string;
  author: { userId: string; name: string | null };
  position: number;
  updatedAt: string | null;
}

/** Par antes↔depois do histórico visual (slide 24). */
export interface DemandEvidencePair<T = PublicDemandEvidence> {
  mediaKind: DemandEvidenceMediaKind;
  stage: string | null;
  before: T;
  after: T;
}

/** Execução orçamentária de uma atualização: valor executado por item e/ou etapa. */
export interface DemandProgressExpense {
  id: string;
  progressUpdateId: string;
  budgetItemId: string | null;
  budgetDescription: string | null;
  scheduleItemId: string | null;
  stage: string | null;
  description: string | null;
  executedAmountCents: number;
  createdAt: string | null;
}

/** Atualização de andamento no acompanhamento público (sem nota interna). */
export interface PublicDemandProgressUpdate {
  id: string;
  stage: string | null;
  stageProgress: DemandStageProgress | null;
  onSchedule: boolean | null;
  newEndsOn: string | null;
  deadlineReason: string | null;
  partialResults: string | null;
  executedAmountCents: number;
  createdAt: string | null;
}

/** Atualização vista pelo Agente autor. */
export interface DemandProgressUpdate extends PublicDemandProgressUpdate {
  demandId: string;
  scheduleItemId: string | null;
  note: string | null;
  author: { userId: string; name: string | null };
  expenses: DemandProgressExpense[];
}

export interface DemandBudgetExecution {
  items: {
    budgetItemId: string;
    description: string;
    isAudiovisualRecord: boolean;
    plannedCents: number;
    executedCents: number;
  }[];
  stages: { scheduleItemId: string; stage: string; executedCents: number }[];
  plannedCents: number;
  executedCents: number;
}

/** Situação corrente de cada etapa do cronograma (última atualização que a citou). */
export interface DemandScheduleStatus {
  scheduleItemId: string;
  stage: string;
  startsOn: string | null;
  endsOn: string | null;
  currentEndsOn: string | null;
  rescheduledTo: string | null;
  recordMilestones: DemandRecordMilestone[];
  stageProgress: DemandStageProgress | null;
  updatedAt: string | null;
}

export interface DemandMilestoneCounts {
  antes: number;
  acompanhamento: number;
  depois: number;
}

/** `GET /api/posts/demands/:id/execution` (público). */
export interface PublicDemandExecution {
  evidences: PublicDemandEvidence[];
  pairs: DemandEvidencePair[];
  milestones: DemandMilestoneCounts;
  progress: PublicDemandProgressUpdate[];
  budgetExecution: DemandBudgetExecution;
  schedule: DemandScheduleStatus[];
  status: DemandStatus;
  hasPhysicalExecution: boolean;
  recordWaiverReason: string | null;
}

/** `GET /api/posts/demands/mine/:id/execution` (Agente autor). */
export interface DemandExecution {
  evidences: DemandEvidence[];
  pairs: DemandEvidencePair<DemandEvidence>[];
  milestones: DemandMilestoneCounts;
  progress: DemandProgressUpdate[];
  budgetExecution: DemandBudgetExecution;
  schedule: DemandScheduleStatus[];
  status: DemandStatus;
  hasPhysicalExecution: boolean;
  recordWaiverReason: string | null;
  recordWaiverAt: string | null;
  canRegisterEvidence: boolean;
  canRegisterProgress: boolean;
  canWaiveRecord: boolean;
  /** Marcos que faltam para as transições `iniciar_execucao` e `concluir`. */
  pending: { antes: boolean; depois: boolean };
}

export interface DemandEvidenceInput {
  reference: string;
  milestone: DemandRecordMilestone;
  mediaKind: DemandEvidenceMediaKind;
  recordedOn: string;
  caption?: string | null;
  scheduleItemId?: string | null;
  pairEvidenceId?: string | null;
}

export interface DemandProgressExpenseInput {
  budgetItemId?: string | null;
  scheduleItemId?: string | null;
  description?: string | null;
  executedAmountCents: number;
}

export interface DemandProgressInput {
  scheduleItemId?: string | null;
  stageProgress?: DemandStageProgress | null;
  onSchedule?: boolean | null;
  newEndsOn?: string | null;
  deadlineReason?: string | null;
  partialResults?: string | null;
  note?: string | null;
  expenses?: DemandProgressExpenseInput[];
}
