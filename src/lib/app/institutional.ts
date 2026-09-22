// Atuação institucional do Poder Público (T13): rótulos, cores, máquina de
// estados e textos da interface. Espelha services/post-service/src/institutional/
// (constants.js e state-machine.js); institutional.test.mjs compara as listas.
// O servidor é quem decide: aqui só se orienta o formulário.

import type {
  DemandTimelineEvent,
  InstitutionalDemandFilter,
  InstitutionalResponseType,
  InstitutionalStatus,
  InstitutionalSupportType,
} from "./types.ts";

export const INSTITUTIONAL_AREA_PATH = "/governo";

export function institutionalDemandPath(id: string): string {
  return `${INSTITUTIONAL_AREA_PATH}/demandas/${encodeURIComponent(id)}`;
}

export const INSTITUTIONAL_STATUSES: InstitutionalStatus[] = [
  "recebida", "em_analise", "encaminhada", "em_articulacao", "acao_programada",
  "em_execucao", "concluida", "nao_e_de_competencia", "encaminhada_ao_orgao_responsavel",
];

export const INSTITUTIONAL_STATUS_LABELS: Record<InstitutionalStatus, string> = {
  recebida: "Recebida",
  em_analise: "Em análise",
  encaminhada: "Encaminhada",
  em_articulacao: "Em articulação",
  acao_programada: "Ação programada",
  em_execucao: "Em execução",
  concluida: "Concluída",
  nao_e_de_competencia: "Não é de competência",
  encaminhada_ao_orgao_responsavel: "Encaminhada ao órgão responsável",
};

export const INSTITUTIONAL_STATUS_COLORS: Record<InstitutionalStatus, string> = {
  recebida: "#2e7ba8",
  em_analise: "#8e6bbf",
  encaminhada: "#1b4f72",
  em_articulacao: "#b8860b",
  acao_programada: "#f4841a",
  em_execucao: "#2e9e5b",
  concluida: "#1f7a45",
  nao_e_de_competencia: "#6b7c8a",
  encaminhada_ao_orgao_responsavel: "#4a6f88",
};

/** Mudanças que exigem justificativa. */
export const STATUSES_REQUIRING_NOTE: InstitutionalStatus[] = ["nao_e_de_competencia", "encaminhada_ao_orgao_responsavel"];

/** Mesmo mapa de state-machine.js (o servidor devolve `availableStatuses`). */
export const INSTITUTIONAL_TRANSITIONS: Record<InstitutionalStatus, InstitutionalStatus[]> = {
  recebida: ["em_analise", "encaminhada", "nao_e_de_competencia", "encaminhada_ao_orgao_responsavel"],
  em_analise: ["encaminhada", "em_articulacao", "acao_programada", "em_execucao",
    "nao_e_de_competencia", "encaminhada_ao_orgao_responsavel"],
  encaminhada: ["em_analise", "em_articulacao", "acao_programada", "em_execucao",
    "nao_e_de_competencia", "encaminhada_ao_orgao_responsavel"],
  em_articulacao: ["encaminhada", "acao_programada", "em_execucao", "encaminhada_ao_orgao_responsavel"],
  acao_programada: ["em_articulacao", "em_execucao"],
  em_execucao: ["concluida"],
  concluida: [],
  nao_e_de_competencia: ["em_analise"],
  encaminhada_ao_orgao_responsavel: ["em_analise"],
};

export const RESPONSE_TYPES: InstitutionalResponseType[] = [
  "recebimento", "analise_em_andamento", "orgao_ou_setor_responsavel", "encaminhamento_realizado",
  "programa_publico_relacionado", "acao_prevista", "informacoes_adicionais",
  "impossibilidade_com_encaminhamento",
];

export const RESPONSE_TYPE_LABELS: Record<InstitutionalResponseType, string> = {
  recebimento: "Recebimento da demanda",
  analise_em_andamento: "Análise em andamento",
  orgao_ou_setor_responsavel: "Órgão ou setor responsável",
  encaminhamento_realizado: "Encaminhamento realizado",
  programa_publico_relacionado: "Programa público relacionado",
  acao_prevista: "Ação prevista",
  informacoes_adicionais: "Necessidade de informações adicionais",
  impossibilidade_com_encaminhamento: "Impossibilidade de atendimento nesta competência",
};

/** Status sugerido junto de cada tipo de resposta (o órgão pode trocar ou manter). */
export const RESPONSE_SUGGESTED_STATUS: Partial<Record<InstitutionalResponseType, InstitutionalStatus>> = {
  analise_em_andamento: "em_analise",
  encaminhamento_realizado: "encaminhada",
  acao_prevista: "acao_programada",
  impossibilidade_com_encaminhamento: "nao_e_de_competencia",
};

export const SUPPORT_TYPES: InstitutionalSupportType[] = [
  "recursos_publicos", "servicos_publicos", "programas_e_politicas_publicas", "infraestrutura",
  "equipamentos", "espacos_publicos", "equipes", "conhecimento_tecnico",
  "encaminhamentos_administrativos", "articulacao_institucional", "parcerias",
];

export const SUPPORT_TYPE_LABELS: Record<InstitutionalSupportType, string> = {
  recursos_publicos: "Recursos públicos",
  servicos_publicos: "Serviços públicos",
  programas_e_politicas_publicas: "Programas e políticas públicas",
  infraestrutura: "Infraestrutura",
  equipamentos: "Equipamentos",
  espacos_publicos: "Espaços públicos",
  equipes: "Equipes",
  conhecimento_tecnico: "Conhecimento técnico",
  encaminhamentos_administrativos: "Encaminhamentos administrativos",
  articulacao_institucional: "Articulação institucional",
  parcerias: "Parcerias",
};

export const WITHOUT_TRACK = "sem_acompanhamento" as const;

export function nextInstitutionalStatuses(status: InstitutionalStatus): InstitutionalStatus[] {
  return [...(INSTITUTIONAL_TRANSITIONS[status] ?? [])];
}

export function statusRequiresNote(status: InstitutionalStatus | "" | null | undefined): boolean {
  return Boolean(status && STATUSES_REQUIRING_NOTE.includes(status));
}

export function institutionalStatusLabel(status: string | null | undefined): string | null {
  return status && status in INSTITUTIONAL_STATUS_LABELS ? INSTITUTIONAL_STATUS_LABELS[status as InstitutionalStatus] : null;
}

export function responseTypeLabel(type: string | null | undefined): string | null {
  return type && type in RESPONSE_TYPE_LABELS ? RESPONSE_TYPE_LABELS[type as InstitutionalResponseType] : null;
}

export function supportTypeLabel(type: string): string {
  return type in SUPPORT_TYPE_LABELS ? SUPPORT_TYPE_LABELS[type as InstitutionalSupportType] : type;
}

/** Query da lista do Poder Público (GET /api/posts/institutional/demands). */
export function buildInstitutionalQuery(filter: InstitutionalDemandFilter = {}): string {
  const q = new URLSearchParams();
  if (filter.scope) q.set("scope", filter.scope);
  if (filter.institutionalStatus?.length) q.set("institutionalStatus", filter.institutionalStatus.join(","));
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

/** Texto do evento institucional da linha do tempo; `null` para os demais eventos. */
export function institutionalTimelineLabel(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  const org = event.details?.organizationName || "Poder Público";
  switch (event.type) {
    case "acompanhamento_institucional_aberto":
      return `${org} recebeu a demanda`;
    case "status_institucional_alterado": {
      const label = institutionalStatusLabel(event.details?.institutionalStatus);
      return label ? `${org}: ${label}` : `${org} atualizou o acompanhamento`;
    }
    case "resposta_institucional": {
      const label = responseTypeLabel(event.details?.responseType);
      return label ? `Resposta institucional de ${org}: ${label}` : `Resposta institucional de ${org}`;
    }
    case "apoio_institucional_oferecido":
      return `${org} ofereceu apoio`;
    default:
      return null;
  }
}

/** Detalhe curto do evento institucional (trecho, programa, formas de apoio, justificativa). */
export function institutionalTimelineDetail(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  const d = event.details;
  if (!d) return null;
  if (event.type === "resposta_institucional") {
    const parts = [d.programName ? `Programa: ${d.programName}` : null, d.excerpt ?? null].filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (event.type === "apoio_institucional_oferecido" && Array.isArray(d.supportTypes) && d.supportTypes.length) {
    return d.supportTypes.map(supportTypeLabel).join(", ");
  }
  if (event.type === "status_institucional_alterado" && d.note) return d.note;
  return null;
}

/** Mensagem para o representante a partir de um erro da API institucional. */
export function institutionalErrorMessage(err: unknown, fallback = "Não foi possível registrar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const code = (err as { code?: unknown }).code;
    if (code === "invalid_transition") return "Essa mudança de status não é permitida a partir do status atual.";
    if (code === "invalid_state") return "A demanda não está mais aberta à atuação institucional.";
    if (code === "not_government") return "A área institucional é do Poder Público.";
    if (err.message) return err.message;
  }
  return fallback;
}
