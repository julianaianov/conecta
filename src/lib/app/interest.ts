// Interesse, conexão e oportunidades de apoio (T15): rótulos, permissões por
// categoria e textos da interface. Espelha services/post-service/src/interest/
// (constants.js) e services/user-service/src/partner-profile.js;
// interest.test.mjs compara as listas. O servidor é quem decide (inclusive a
// compatibilidade, calculada no post-service): aqui só se orienta a tela.

import {
  normalizeRole,
  type DemandTimelineEvent,
  type InterestConnectionStatus,
  type InterestKind,
  type InterestOfferType,
  type InterestUserCategory,
  type CompatibilityLevel,
  type DemandStatus,
  type OpportunityFilter,
  type UserRole,
} from "./types.ts";

export const OPPORTUNITIES_PATH = "/oportunidades";

export const INTEREST_KINDS: InterestKind[] = ["apoio", "participacao", "voluntariado"];

export const INTEREST_KIND_LABELS: Record<InterestKind, string> = {
  apoio: "Interesse em apoiar",
  participacao: "Interesse em participar",
  voluntariado: "Oferta de voluntariado",
};

/** Texto do botão de cada manifestação na página da demanda. */
export const INTEREST_KIND_ACTIONS: Record<InterestKind, string> = {
  apoio: "Tenho interesse",
  participacao: "Quero participar",
  voluntariado: "Quero ser voluntário",
};

/** Slide 10 e, pela migração 038 (T-05-15), o que faltava do Modelo de Conexão §27. */
export const OFFER_TYPES: InterestOfferType[] = [
  "recursos", "produtos", "servicos", "conhecimento", "estrutura", "investimento",
  "materiais", "equipamentos", "equipe", "execucao_de_etapa", "patrocinio", "parceria",
];

export const OFFER_TYPE_LABELS: Record<InterestOfferType, string> = {
  recursos: "Recursos",
  produtos: "Produtos",
  servicos: "Serviços",
  conhecimento: "Conhecimento",
  estrutura: "Estrutura",
  investimento: "Investimento",
  materiais: "Doar materiais",
  equipamentos: "Fornecer equipamentos",
  equipe: "Disponibilizar equipe",
  execucao_de_etapa: "Executar determinada etapa",
  patrocinio: "Patrocinar",
  parceria: "Estabelecer parceria",
};

/** Oferta que exige a etapa do cronograma (`scheduleItemId`). */
export const SCHEDULE_ITEM_OFFER: InterestOfferType = "execucao_de_etapa";

export const INTEREST_CONNECTION_STATUSES: InterestConnectionStatus[] = ["pendente", "aceita", "recusada", "cancelada"];

export const INTEREST_CONNECTION_LABELS: Record<InterestConnectionStatus, string> = {
  pendente: "Conexão solicitada",
  aceita: "Conexão aceita",
  recusada: "Conexão recusada",
  cancelada: "Conexão cancelada",
};

export const INTEREST_USER_CATEGORY_LABELS: Record<InterestUserCategory, string> = {
  parceiro: "Parceiro",
  comunidade: "Membro da Comunidade",
  poder_publico: "Poder Público",
};

/** Manifestações por categoria (Apresentação, slides 9–11). */
export const INTEREST_KINDS_BY_ROLE: Record<UserRole, InterestKind[]> = {
  partner: ["apoio"],
  government: ["apoio"],
  member: ["participacao", "voluntariado"],
  agent: [],
  media: [],
};

/** "Filtrar oportunidades de apoio": Parceiros e Poder Público. */
export const OPPORTUNITY_ROLES: UserRole[] = ["partner", "government"];

/** Estados da demanda que recebem manifestação e conexão. */
export const INTEREST_OPEN_STATUSES: DemandStatus[] = ["publicada", "em_busca_de_parceiro", "conectada", "em_execucao"];
/** Potenciais parceiros para o Agente (T30): enquanto a demanda recebe interesse. */
export const POTENTIAL_PARTNERS_STATUSES: DemandStatus[] = INTEREST_OPEN_STATUSES;
export const POTENTIAL_PARTNERS_MAX = 50;

export const INTEREST_EVENT_TYPES = ["interesse_registrado", "interesse_retirado", "conexao_solicitada", "conexao_aceita"];

export const COMPATIBILITY_LEVEL_LABELS: Record<CompatibilityLevel, string> = {
  alta: "Alta compatibilidade",
  media: "Média compatibilidade",
  baixa: "Baixa compatibilidade",
  nenhuma: "Sem critérios em comum",
};

export const COMPATIBILITY_LEVEL_COLORS: Record<CompatibilityLevel, string> = {
  alta: "#2e9e5b",
  media: "#f4841a",
  baixa: "#2e7ba8",
  nenhuma: "#868e96",
};

/** Pesos do cálculo (território 40, categoria 30, recursos 30). */
export const COMPATIBILITY_WEIGHTS = { territorio: 40, categoria: 30, recursos: 30 } as const;

export const COMPATIBILITY_CRITERION_LABELS = { territorio: "Território", categoria: "Categoria", recursos: "Recursos" } as const;

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export function interestKindsFor(role: string | null | undefined, profileType?: string | null): InterestKind[] {
  return INTEREST_KINDS_BY_ROLE[normalizeRole(role, profileType)];
}

export function canFilterOpportunities(role: string | null | undefined, profileType?: string | null): boolean {
  return OPPORTUNITY_ROLES.includes(normalizeRole(role, profileType));
}

export function buildOpportunityQuery(filter: OpportunityFilter = {}): string {
  const q = new URLSearchParams();
  if (filter.category?.length) q.set("category", filter.category.join(","));
  if (filter.priority?.length) q.set("priority", filter.priority.join(","));
  if (filter.status?.length) q.set("status", filter.status.join(","));
  if (filter.resourceType?.length) q.set("resourceType", filter.resourceType.join(","));
  if (filter.territory) q.set("territory", filter.territory);
  if (filter.municipality) q.set("municipality", filter.municipality);
  if (filter.uf) q.set("uf", filter.uf);
  if (filter.q) q.set("q", filter.q);
  if (filter.minTotalCents != null) q.set("minTotalCents", String(filter.minTotalCents));
  if (filter.maxTotalCents != null) q.set("maxTotalCents", String(filter.maxTotalCents));
  if (filter.sort) q.set("sort", filter.sort);
  if (filter.limit) q.set("limit", String(filter.limit));
  if (filter.offset) q.set("offset", String(filter.offset));
  return q.toString();
}

/** "1.500" / "1500,50" (reais) → centavos; vazio → null; inválido → NaN. */
export function reaisToCents(value: string): number | null {
  const clean = value.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/\.(?=\d{3}(\D|$))/g, "");
  const reais = Number(normalized);
  if (!Number.isFinite(reais) || reais < 0) return Number.NaN;
  return Math.round(reais * 100);
}

/** Texto do perfil de apoio: "Rio de Janeiro/RJ; Niterói/RJ" ↔ lista. */
export function splitList(value: string): string[] {
  return value.split(/[;\n]/).map((v) => v.trim()).filter(Boolean);
}

export function interestTimelineLabel(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  const d = event.details ?? {};
  const who = d.userCategory && d.userCategory in INTEREST_USER_CATEGORY_LABELS
    ? INTEREST_USER_CATEGORY_LABELS[d.userCategory as InterestUserCategory]
    : null;
  const kind = d.interestKind as InterestKind | undefined;
  switch (event.type) {
    case "interesse_registrado":
      if (kind === "participacao") return `${who ?? "Alguém"} demonstrou interesse em participar`;
      if (kind === "voluntariado") return `${who ?? "Alguém"} ofereceu voluntariado`;
      return `${who ?? "Um apoiador"} demonstrou interesse em apoiar`;
    case "interesse_retirado": return `${who ?? "Um participante"} retirou a manifestação`;
    case "conexao_solicitada": return `${who ?? "Um apoiador"} solicitou conexão com o Agente`;
    case "conexao_aceita": return who ? `Conexão aceita pelo Agente (${who})` : "Conexão aceita pelo Agente";
    case "conexao_recusada": return "Pedido de conexão recusado";
    case "conexao_cancelada": return "Pedido de conexão cancelado";
    default: return null;
  }
}

export function interestTimelineDetail(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  const offers = event.details?.offerTypes;
  if (event.type !== "interesse_registrado" || !Array.isArray(offers) || !offers.length) return null;
  const text = `Pode oferecer: ${offers.map((o) => OFFER_TYPE_LABELS[o as InterestOfferType] ?? o).join(", ")}`;
  // "Executar determinada etapa" mostra a etapa do cronograma (T-05-15).
  const stage = event.details?.scheduleStage;
  return typeof stage === "string" && stage ? `${text} — etapa: ${stage}` : text;
}

/** Mensagem a partir de um erro das rotas de interesse. */
export function interestErrorMessage(err: unknown, fallback = "Não foi possível registrar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const code = (err as { code?: unknown }).code;
    if (code === "interest_exists") return "Você já registrou esta manifestação nesta demanda.";
    if (code === "demand_not_open") return "Esta demanda não recebe novas manifestações no estado atual.";
    if (code === "connection_exists") return "A conexão já foi solicitada.";
    if (code === "connections_unavailable") return "O serviço de conexões não respondeu. Tente de novo em instantes.";
    if (code === "connection_not_linked") return "Esta conexão não foi pedida a partir desta demanda.";
    if (code === "connection_closed") return "Esta conexão já foi encerrada.";
    if (code === "interest_not_allowed" || code === "opportunities_not_allowed") return "Seu perfil não tem esta ação.";
    if (err.message) return err.message;
  }
  return fallback;
}
