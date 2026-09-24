/**
 * Pautas da Comunicação e divulgação registrada (T28). Espelho puro de
 * services/post-service/src/media/constants.js (media.test.mjs compara).
 *
 * Fonte: Arquitetura de Perfis §3.5 (Comunicação: "Identificar pautas",
 * "Divulgar projetos e resultados", "Compartilhar iniciativas") e §6, etapa 6
 * (AMPLIFICAÇÃO).
 */
import { normalizeRole, type DemandTimelineEvent } from "./types.ts";

export const AGENDA_PATH = "/pautas";

export const MEDIA_ROLES = ["media"] as const;

export type AgendaTargetKind = "demanda" | "evento";
export const AGENDA_TARGET_KINDS: AgendaTargetKind[] = ["demanda", "evento"];
export const AGENDA_TARGET_LABELS: Record<AgendaTargetKind, string> = { demanda: "Demanda", evento: "Evento" };

export type AgendaStatus = "identificada" | "em_apuracao" | "publicada" | "descartada";
export const AGENDA_STATUSES: AgendaStatus[] = ["identificada", "em_apuracao", "publicada", "descartada"];
export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  identificada: "Pauta identificada",
  em_apuracao: "Em apuração",
  publicada: "Divulgação publicada",
  descartada: "Descartada",
};
export const AGENDA_STATUS_COLORS: Record<AgendaStatus, string> = {
  identificada: "#2e7ba8",
  em_apuracao: "#f4841a",
  publicada: "#2e9e5b",
  descartada: "#868e96",
};
export const AGENDA_STATUS_TRANSITIONS: Record<AgendaStatus, AgendaStatus[]> = {
  identificada: ["em_apuracao", "publicada", "descartada"],
  em_apuracao: ["publicada", "descartada"],
  publicada: [],
  descartada: ["identificada", "em_apuracao"],
};

export type AgendaSignal = "urgente" | "antes_e_depois" | "resultados" | "mais_apoiada" | "evento_proximo";
export const AGENDA_SIGNALS: AgendaSignal[] = ["urgente", "antes_e_depois", "resultados", "mais_apoiada", "evento_proximo"];
export const AGENDA_SIGNAL_LABELS: Record<AgendaSignal, string> = {
  urgente: "Problema urgente publicado nos últimos 30 dias",
  antes_e_depois: "Execução com registro de antes e depois",
  resultados: "Resultados e prestação de contas publicados",
  mais_apoiada: "Entre as demandas mais apoiadas",
  evento_proximo: "Evento do território nos próximos 30 dias",
};

export const AGENDA_ANGLE_MAX = 1000;
export const AGENDA_OUTLET_MAX = 200;
export const AGENDA_URL_MAX = 500;

/** Evento público da linha do tempo (migração post 025). */
export const MEDIA_EVENT_TYPES = ["divulgacao_registrada"];

/** Só a Comunicação identifica pautas (§3.5). */
export function canIdentifyAgenda(role: string | null | undefined, profileType?: string | null): boolean {
  return (MEDIA_ROLES as readonly string[]).includes(normalizeRole(role, profileType));
}

/** Caminho público do alvo da pauta. */
export function agendaTargetPath(kind: AgendaTargetKind, id: string): string {
  return kind === "evento" ? `/eventos/${encodeURIComponent(id)}` : `/demandas/${encodeURIComponent(id)}`;
}

/** Rótulo do evento `divulgacao_registrada` na linha do tempo. */
export function mediaTimelineLabel(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  if (event.type !== "divulgacao_registrada") return null;
  const outlet = typeof event.details?.outletName === "string" ? event.details.outletName : null;
  return outlet ? `Divulgada por ${outlet}` : "Divulgação registrada pela Comunicação";
}

/** Detalhe do evento: a data e o endereço da matéria. */
export function mediaTimelineDetail(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  if (event.type !== "divulgacao_registrada") return null;
  const parts: string[] = [];
  if (typeof event.details?.publishedOn === "string") parts.push(`publicada em ${formatIsoDay(event.details.publishedOn)}`);
  if (typeof event.details?.publishedUrl === "string") parts.push(event.details.publishedUrl);
  return parts.length ? parts.join(" · ") : null;
}

/** "2026-09-23" → "23/09/2026" (sem fuso). */
export function formatIsoDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Mensagem para a Comunicação a partir de um erro da API. */
export function agendaErrorMessage(err: unknown, fallback = "Não foi possível salvar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const code = (err as { code?: unknown }).code;
    if (code === "not_media") return "Identificar pautas e registrar divulgação é da Comunicação.";
    if (code === "agenda_item_exists") return "Você já identificou esta pauta.";
    if (code === "agenda_item_closed") return "Divulgação publicada não muda.";
    if (code === "target_not_found") return "Este conteúdo não está público para virar pauta.";
    if (err.message) return err.message;
  }
  return fallback;
}
