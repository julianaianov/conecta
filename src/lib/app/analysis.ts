/**
 * Respostas à análise (T-05-05): tipos, vocabulário e funções puras das
 * solicitações que Parceiros e o Poder Público fazem ao Agente autor —
 * informações adicionais, documentos, reunião, análise técnica — e da recusa
 * com motivo. Espelho de services/post-service/src/analysis/index.js
 * (analysis.test.mjs compara).
 *
 * Fonte: Modelo de Conexão §10 ("solicitar informações adicionais, solicitar
 * documentos, solicitar reunião, … solicitar análise técnica, recusar a
 * demanda informando o motivo") e §12 ("Agente envia os documentos
 * solicitados").
 */
import type { DemandDocumentType } from "./types";

export type AnalysisRequestKind = "informacoes_adicionais" | "documentos" | "reuniao" | "analise_tecnica" | "recusa";
export type AnalysisRequestStatus = "aberta" | "respondida" | "encerrada";
export type MeetingMode = "presencial" | "online";

export type AnalysisAnswerDocument = {
  id: string;
  documentType: string | null;
  title: string | null;
  source: "demanda" | "processo" | null;
};

export type AnalysisRequest = {
  id: string;
  demandId: string;
  processId: string | null;
  processProtocol: string | null;
  fromInstitutionalResponse: boolean;
  requesterCategory: "parceiro" | "poder_publico";
  kind: AnalysisRequestKind;
  kindLabel: string;
  body: string;
  requestedDocumentTypes: DemandDocumentType[];
  meetingProposedAt: string | null;
  meetingMode: MeetingMode | null;
  status: AnalysisRequestStatus;
  answerBody: string | null;
  answerDocuments: AnalysisAnswerDocument[];
  answeredAt: string | null;
  createdAt: string;
  /** Só na visão do Agente autor. */
  requesterName?: string | null;
  requesterProfileType?: string | null;
};

export type AnalysisRequestInput = {
  kind: AnalysisRequestKind;
  body: string;
  requestedDocumentTypes?: DemandDocumentType[];
  meetingProposedAt?: string | null;
  meetingMode?: MeetingMode | null;
};

export const ANALYSIS_REQUEST_KINDS: AnalysisRequestKind[] = [
  "informacoes_adicionais", "documentos", "reuniao", "analise_tecnica", "recusa",
];

export const ANALYSIS_REQUEST_KIND_LABELS: Record<AnalysisRequestKind, string> = {
  informacoes_adicionais: "Solicitação de informações adicionais",
  documentos: "Solicitação de documentos",
  reuniao: "Solicitação de reunião",
  analise_tecnica: "Solicitação de análise técnica",
  recusa: "Recusa da demanda",
};

/** Rótulo do botão para quem pede (Modelo §10). */
export const ANALYSIS_REQUEST_ACTIONS: Record<AnalysisRequestKind, string> = {
  informacoes_adicionais: "Solicitar informações",
  documentos: "Solicitar documentos",
  reuniao: "Solicitar reunião",
  analise_tecnica: "Solicitar análise técnica",
  recusa: "Recusar",
};

export const ANALYSIS_REQUEST_STATUS_LABELS: Record<AnalysisRequestStatus, string> = {
  aberta: "Aguardando resposta",
  respondida: "Respondida",
  encerrada: "Encerrada",
};

export const MEETING_MODES: MeetingMode[] = ["presencial", "online"];

export const ANALYSIS_EVENT_TYPES = ["solicitacao_registrada", "solicitacao_respondida"] as const;

const CATEGORY_LABELS = { parceiro: "Parceiro", poder_publico: "Poder Público" } as const;

/** Rótulo dos eventos na linha do tempo (tipo e categoria da conta; nunca o nome). */
export function analysisTimelineLabel(event: { type: string; details?: object | null }): string | null {
  const d = (event.details ?? {}) as Record<string, unknown>;
  const kind = typeof d.kind === "string" && d.kind in ANALYSIS_REQUEST_KIND_LABELS
    ? ANALYSIS_REQUEST_KIND_LABELS[d.kind as AnalysisRequestKind] : "Solicitação";
  const who = typeof d.requesterCategory === "string" && d.requesterCategory in CATEGORY_LABELS
    ? CATEGORY_LABELS[d.requesterCategory as keyof typeof CATEGORY_LABELS] : null;
  if (event.type === "solicitacao_registrada") return `${kind}${who ? ` (${who})` : ""}`;
  if (event.type === "solicitacao_respondida") {
    const docs = typeof d.documentsCount === "number" && d.documentsCount > 0
      ? ` com ${d.documentsCount} documento${d.documentsCount > 1 ? "s" : ""}` : "";
    return `${kind} respondida pelo Agente${docs}`;
  }
  return null;
}

/** Recusa exige o motivo; documentos, ao menos um tipo. `null` quando está ok. */
export function analysisRequestProblem(input: AnalysisRequestInput): string | null {
  if (!input.body.trim()) return input.kind === "recusa" ? "Informe o motivo da recusa" : "Descreva o que precisa";
  if (input.kind === "documentos" && !(input.requestedDocumentTypes ?? []).length) return "Escolha ao menos um documento";
  return null;
}
