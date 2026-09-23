// Inteligência artificial (T23): vocabulário dos 5 recursos do slide 23,
// rótulo obrigatório de sugestão e apresentação.
// Espelha services/post-service/src/ai/constants.js; `ai.test.mjs` compara.
//
// Regra da interface, que este módulo sustenta: **toda saída do modelo aparece
// marcada como "Sugestão de IA"**, com a justificativa e os números
// verificáveis ao lado, e com as ações "Aceitar" e "Ignorar". Aceitar não
// altera nada sozinho: registra a decisão e devolve o valor sugerido para a
// pessoa aplicar na demanda.

import type { DemandCategory, DemandPriority } from "./types.ts";

export type AiKind =
  | "organizacao_da_demanda" | "deteccao_de_urgencia" | "sugestao_de_editais"
  | "conexao_com_patrocinadores" | "relatorio_para_governo";

export type AiStage = "disponivel" | "em_desenvolvimento";

export type AiSuggestionStatus = "sugerida" | "aceita" | "ignorada";

/** Os 5 recursos do slide 23, na ordem da fonte. */
export const AI_KINDS: AiKind[] = [
  "organizacao_da_demanda", "deteccao_de_urgencia", "sugestao_de_editais",
  "conexao_com_patrocinadores", "relatorio_para_governo",
];

export const AI_KIND_LABELS: Record<AiKind, string> = {
  organizacao_da_demanda: "Organização automática de demandas",
  deteccao_de_urgencia: "Detecção de urgência",
  sugestao_de_editais: "Sugestão de editais",
  conexao_com_patrocinadores: "Conexão com patrocinadores ideais",
  relatorio_para_governo: "Geração de relatórios para governo",
};

export const AI_KIND_AUDIENCE: Record<AiKind, "agente" | "poder_publico"> = {
  organizacao_da_demanda: "agente",
  deteccao_de_urgencia: "agente",
  sugestao_de_editais: "agente",
  conexao_com_patrocinadores: "agente",
  relatorio_para_governo: "poder_publico",
};

export const AI_KIND_STAGE: Record<AiKind, AiStage> = {
  organizacao_da_demanda: "disponivel",
  deteccao_de_urgencia: "disponivel",
  sugestao_de_editais: "em_desenvolvimento",
  conexao_com_patrocinadores: "disponivel",
  relatorio_para_governo: "disponivel",
};

export const AI_SUGGESTION_STATUSES: AiSuggestionStatus[] = ["sugerida", "aceita", "ignorada"];

export const AI_SUGGESTION_STATUS_LABELS: Record<AiSuggestionStatus, string> = {
  sugerida: "Sugestão de IA aguardando revisão",
  aceita: "Sugestão de IA aceita por uma pessoa",
  ignorada: "Sugestão de IA ignorada por uma pessoa",
};

/** Rótulo obrigatório em toda saída do modelo, na interface e no banco. */
export const AI_LABEL = "Sugestão de IA";

export const AI_DISCLAIMER = "Gerado por inteligência artificial a partir dos dados da própria plataforma. "
  + "É uma sugestão para revisão humana: nada muda sem a sua ação.";

/** Frases de indisponibilidade (as mesmas do servidor). */
export const AI_UNAVAILABLE_MESSAGES: Record<string, string> = {
  desligado: "Os recursos de inteligência artificial estão desligados neste ambiente.",
  sem_chave: "Os recursos de inteligência artificial estão indisponíveis: falta a chave de acesso ao modelo.",
  limite: "O limite de chamadas ao modelo no período foi atingido. Tente mais tarde.",
  circuito: "O modelo falhou nas últimas tentativas e foi suspenso por alguns minutos. Tente mais tarde.",
  erro: "Não foi possível falar com o modelo agora. Tente mais tarde.",
  resposta_invalida: "O modelo respondeu fora do formato esperado e a sugestão foi descartada.",
  sem_base: "Ainda não há dados cadastrados para esta sugestão.",
};

// ── Contrato das respostas ─────────────────────────────────

export interface AiSuggestion<P = Record<string, unknown>> {
  id: string;
  kind: AiKind;
  demandId: string | null;
  organizationId: string | null;
  model: string;
  /** Campos enviados ao modelo (auditoria do que saiu da plataforma). */
  promptFields: string[];
  payload: P;
  rationale: string | null;
  /** Números verificáveis exibidos ao lado do texto. */
  evidence: Record<string, unknown>;
  status: AiSuggestionStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  aiGenerated: true;
  label: string;
}

export interface AiFeature {
  kind: AiKind;
  label: string;
  source: string;
  audience: "agente" | "poder_publico";
  stage: AiStage;
  note: string | null;
}

export interface AiStatus {
  enabled: boolean;
  available: boolean;
  reason: string | null;
  message: string | null;
  model: string | null;
  label: string;
  disclaimer: string;
  features: AiFeature[];
  limits: {
    callsInWindow: number;
    maxCallsPerWindow: number;
    maxCallsPerUserPerWindow: number;
    consecutiveFailures: number;
    breakerOpen: boolean;
  };
}

export interface AiResult<P = Record<string, unknown>> {
  kind: AiKind;
  label: string;
  disclaimer: string;
  stage: AiStage;
  stageNote: string | null;
  aiGenerated: true;
  available: boolean;
  reason?: string;
  message?: string;
  suggestion?: AiSuggestion<P>;
}

export interface OrganizationSuggestion {
  categoria: DemandCategory;
  territorio: string | null;
  confianca: "baixa" | "media" | "alta";
  justificativa: string;
}

export interface UrgencySuggestion {
  prioridade: DemandPriority;
  sinais: string[];
  confianca: "baixa" | "media" | "alta";
  justificativa: string;
}

/** Edital real (cadastrado por um órgão, T22) ligado à referência que o modelo usou. */
export interface AiEditalMatch {
  referencia: number;
  aderencia: "baixa" | "media" | "alta";
  justificativa: string;
  edital: {
    id: string;
    title: string;
    summary: string;
    programName: string | null;
    territory: string | null;
    municipality: string | null;
    uf: string | null;
    startsOn: string | null;
    endsOn: string | null;
  };
}

/** Compatibilidade transparente (recorte de recursos da T15) do interessado. */
export interface AiCompatibility {
  matched: string[];
  score: number | null;
  level: "baixa" | "media" | "alta" | null;
  reasons: string[];
}

export interface AiPartnerMatch {
  referencia: number;
  posicao: number;
  justificativa: string;
  interestId: string;
  compatibility: AiCompatibility;
}

export interface AiGovernmentReportData {
  organization: {
    name: string | null; department: string | null; governmentSphere: string | null;
    municipality: string | null; uf: string | null;
  };
  scope: string;
  scopeLabel: string;
  period: { from: string | null; to: string };
  indicators: Record<string, number>;
  territories: { label: string; uf: string | null; total: number; urgent: number; concluded: number }[];
  categories: { category: string; total: number; urgent: number; concluded: number }[];
  sources: Record<string, string>;
}

export interface GovernmentReportSuggestion {
  titulo: string;
  resumo: string;
  secoes: { titulo: string; texto: string }[];
  observacao: string | null;
}

// ── Apresentação ───────────────────────────────────────────

/** Frase a mostrar quando não houve sugestão. Nunca inventar resultado. */
export function aiUnavailableMessage(result: { message?: string; reason?: string } | null): string {
  if (result?.message) return result.message;
  if (result?.reason && AI_UNAVAILABLE_MESSAGES[result.reason]) return AI_UNAVAILABLE_MESSAGES[result.reason];
  return AI_UNAVAILABLE_MESSAGES.erro;
}

/** "Sugestão de IA · Detecção de urgência" — o rótulo vem sempre na frente. */
export function aiBadgeLabel(kind: AiKind): string {
  return `${AI_LABEL} · ${AI_KIND_LABELS[kind]}`;
}

export function isInDevelopment(kind: AiKind): boolean {
  return AI_KIND_STAGE[kind] === "em_desenvolvimento";
}

/** A sugestão ainda espera desfecho humano? */
export function awaitsReview(suggestion: Pick<AiSuggestion, "status">): boolean {
  return suggestion.status === "sugerida";
}

/** Pares rótulo/valor dos números verificáveis, para exibir ao lado do texto. */
export function evidenceEntries(evidence: Record<string, unknown>): { label: string; value: string }[] {
  const label = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  const render = (value: unknown): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "boolean") return value ? "sim" : "não";
    if (Array.isArray(value)) return `${value.length}`;
    if (typeof value === "object") return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${label(k)}: ${render(v)}`).join(" · ");
    return String(value);
  };
  return Object.entries(evidence).map(([key, value]) => ({ label: label(key), value: render(value) }));
}
