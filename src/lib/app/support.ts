// Apoio à demanda (T16): modalidades da fonte, rótulos e textos da interface.
// Espelha services/post-service/src/support/constants.js (support.test.mjs
// compara as listas). O servidor é quem decide; aqui só se orienta a tela.
//
// Fonte: 01-apresentacao-institucional.html, slide 20 (sistema de apoio),
// slide 21 (transparência: histórico de apoio) e slides 10–11 ("registrar
// apoio realizado", "acompanhar resultados"; Poder Público sem ranking).
// Decisão 5: a plataforma não processa pagamento — valor declarado.

import {
  normalizeRole,
  type DemandStatus,
  type DemandTimelineEvent,
  type SupportGestaoStatus,
  type SupportModality,
  type SupportReceiptStatus,
  type SupportType,
  type SupporterCategory,
  type UserRole,
} from "./types.ts";

export const MY_SUPPORTS_PATH = "/meus-apoios";

export const SUPPORT_MODALITIES: SupportModality[] = [
  "patrocinar_projeto",
  "doar_recursos",
  "financiar_evento",
  "adotar_espaco_publico",
  "apoiar_acao_ambiental",
  "contratar_servicos_locais",
];

export const SUPPORT_MODALITY_LABELS: Record<SupportModality, string> = {
  patrocinar_projeto: "Patrocinar projetos",
  doar_recursos: "Doar recursos",
  financiar_evento: "Financiar eventos",
  adotar_espaco_publico: "Adotar espaços públicos",
  apoiar_acao_ambiental: "Apoiar ações ambientais",
  contratar_servicos_locais: "Contratar serviços locais",
};

export const SUPPORT_MODALITY_HINTS: Record<SupportModality, string> = {
  patrocinar_projeto: "Patrocínio da execução, com valor declarado ou contrapartida.",
  doar_recursos: "Materiais, equipamentos, alimentos, espaço ou outros recursos.",
  financiar_evento: "Custeio de um evento ligado à demanda.",
  adotar_espaco_publico: "Manutenção e cuidado de uma praça, canteiro ou equipamento público.",
  apoiar_acao_ambiental: "Plantio, limpeza, coleta, educação ambiental.",
  contratar_servicos_locais: "Contratação de serviços e mão de obra do território.",
};

export const SUPPORT_MODALITY_ICONS: Record<SupportModality, string> = {
  patrocinar_projeto: "payments",
  doar_recursos: "inventory",
  financiar_evento: "calendar",
  adotar_espaco_publico: "home_work",
  apoiar_acao_ambiental: "leaf",
  contratar_servicos_locais: "construction",
};

/** O que é oferecido (supports.type). Divulgação fica fora do apoio à demanda. */
export const DEMAND_SUPPORT_TYPES: SupportType[] = [
  "financial", "materials", "labor", "volunteering", "equipment", "space", "food", "transport", "knowledge",
];

export const SUPPORT_TYPE_LABELS: Record<SupportType, string> = {
  financial: "Financeiro (valor declarado)",
  materials: "Materiais",
  labor: "Serviços e mão de obra",
  volunteering: "Voluntariado",
  equipment: "Equipamentos e ferramentas",
  space: "Espaço físico",
  food: "Alimentação",
  transport: "Transporte e frete",
  knowledge: "Conhecimento e mentoria",
  sharing: "Divulgação e amplificação",
};

export const RECEIPT_STATUSES: SupportReceiptStatus[] = ["declarado", "confirmado", "contestado"];

export const RECEIPT_STATUS_LABELS: Record<SupportReceiptStatus, string> = {
  declarado: "Declarado pelo apoiador",
  confirmado: "Confirmado pelo Agente",
  contestado: "Contestado pelo Agente",
};

export const RECEIPT_STATUS_COLORS: Record<SupportReceiptStatus, string> = {
  declarado: "#2e7ba8",
  confirmado: "#2e9e5b",
  contestado: "#c0392b",
};

export const GESTAO_STATUS_LABELS: Record<SupportGestaoStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  rejected: "Rejeitado",
};

export const SUPPORTER_CATEGORY_LABELS: Record<SupporterCategory, string> = {
  parceiro: "Parceiro",
  poder_publico: "Poder Público",
};

/** "Registrar apoio realizado": Parceiros e Poder Público (slides 10 e 11). */
export const SUPPORT_ROLES: UserRole[] = ["partner", "government"];

/** Estados da demanda que recebem registro de apoio. */
export const SUPPORT_OPEN_STATUSES: DemandStatus[] = [
  "publicada", "em_busca_de_parceiro", "conectada", "em_execucao", "concluida", "prestacao_de_contas",
];

export const SUPPORT_EVENT_TYPES = ["apoio_declarado", "apoio_confirmado", "apoio_contestado"];

/**
 * Mapeamento dos tipos antigos de `supports` para as modalidades (aplicado
 * pela migração post 013; `sharing` fica sem modalidade, porque divulgação é
 * amplificação e não uma das 6 modalidades de apoio).
 */
export const LEGACY_TYPE_MODALITY: Record<SupportType, SupportModality | null> = {
  financial: "patrocinar_projeto",
  materials: "doar_recursos",
  equipment: "doar_recursos",
  food: "doar_recursos",
  space: "doar_recursos",
  volunteering: "doar_recursos",
  labor: "contratar_servicos_locais",
  transport: "contratar_servicos_locais",
  knowledge: "contratar_servicos_locais",
  sharing: null,
};

export function canRegisterSupport(role: string | null | undefined, profileType?: string | null): boolean {
  return SUPPORT_ROLES.includes(normalizeRole(role, profileType));
}

/** Parceiros entram no ranking de apoiadores; o Poder Público, não (slide 11). */
export function countsForRanking(category: SupporterCategory): boolean {
  return category === "parceiro";
}

/** "R$ 1.500,00" a partir de centavos; `null` quando não há valor declarado. */
export function formatCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return null;
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "1.500" / "1500,50" (reais) → centavos; vazio → null; inválido → NaN. */
export function supportReaisToCents(value: string): number | null {
  const clean = value.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",") ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/\.(?=\d{3}(\D|$))/g, "");
  const reais = Number(normalized);
  if (!Number.isFinite(reais) || reais < 0) return Number.NaN;
  return Math.round(reais * 100);
}

/** Nome exibido no histórico público (sem consentimento, só a categoria). */
export function supporterDisplayName(support: { supporterName: string | null; supporterCategory: SupporterCategory }): string {
  if (support.supporterName) return support.supporterName;
  return support.supporterCategory === "poder_publico" ? "Órgão do Poder Público" : "Parceiro apoiador";
}

export function supportTimelineLabel(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  const d = event.details ?? {};
  const modality = d.modality as SupportModality | undefined;
  const who = d.supporterName as string | undefined;
  const category = d.supporterCategory as SupporterCategory | undefined;
  const actor = who ?? (category ? SUPPORTER_CATEGORY_LABELS[category] : "Um apoiador");
  const what = modality && modality in SUPPORT_MODALITY_LABELS ? SUPPORT_MODALITY_LABELS[modality].toLowerCase() : "apoio";
  switch (event.type) {
    case "apoio_declarado": return `${actor} registrou apoio: ${what}`;
    case "apoio_confirmado": return "Apoio confirmado pelo Agente de Transformação";
    case "apoio_contestado": return "Apoio contestado pelo Agente de Transformação";
    default: return null;
  }
}

export function supportTimelineDetail(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  if (!SUPPORT_EVENT_TYPES.includes(event.type)) return null;
  const d = event.details ?? {};
  const parts: string[] = [];
  const type = d.supportType as SupportType | undefined;
  if (type && type in SUPPORT_TYPE_LABELS) parts.push(SUPPORT_TYPE_LABELS[type]);
  const amount = typeof d.amount === "string" || typeof d.amount === "number" ? Number(d.amount) : null;
  if (amount !== null && Number.isFinite(amount) && amount > 0) {
    parts.push(`valor declarado ${amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/** Mensagem a partir de um erro das rotas de apoio. */
export function supportErrorMessage(err: unknown, fallback = "Não foi possível registrar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const code = (err as { code?: unknown }).code;
    if (code === "support_not_allowed") return "Registrar apoio realizado é uma ação de Parceiros e do Poder Público.";
    if (code === "own_demand") return "O autor não registra apoio à própria demanda.";
    if (code === "demand_not_open") return "Esta demanda não recebe registro de apoio no estado atual.";
    if (code === "support_confirmed") return "Apoio já confirmado pelo Agente não é cancelado.";
    if (code === "support_canceled") return "Este apoio foi cancelado.";
    if (code === "invalid_transition") return "Este apoio já foi respondido.";
    if (code === "payment_not_supported") return "A plataforma não processa pagamento: registre apenas o valor declarado.";
    if (code === "demand_support_flow") return "O apoio a esta demanda é registrado na página da demanda.";
    if (err.message) return err.message;
  }
  return fallback;
}
