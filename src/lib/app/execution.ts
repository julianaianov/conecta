// Execução, evidências do antes/depois e acompanhamento (T17): rótulos e
// textos da interface. Espelha services/post-service/src/execution/constants.js
// (execution.test.mjs compara as listas). O servidor é quem decide; aqui só se
// orienta a tela.
//
// Fonte: 02-fluxo-cadastro-agente-de-transformacao.html, slide 11 (registro do
// antes e do depois), slide 12 (o que o registro deve contemplar), slide 14
// (os momentos de registro no cronograma), slide 23 (execução e
// acompanhamento) e slide 24 (histórico visual da demanda).

import type {
  DemandAgentAction,
  DemandEvidenceMediaKind,
  DemandIncidentImpact,
  DemandIncidentKind,
  DemandRecordMilestone,
  DemandStageProgress,
  DemandStatus,
  DemandTimelineEvent,
  UploadPurpose,
} from "./types.ts";

export const RECORD_MILESTONES: DemandRecordMilestone[] = ["antes", "acompanhamento", "depois"];

export const RECORD_MILESTONE_LABELS: Record<DemandRecordMilestone, string> = {
  antes: "Antes (situação inicial)",
  acompanhamento: "Acompanhamento (durante a execução)",
  depois: "Depois (resultado final)",
};

/** Rótulo curto, para abas e etiquetas da galeria. */
export const RECORD_MILESTONE_SHORT: Record<DemandRecordMilestone, string> = {
  antes: "Antes",
  acompanhamento: "Acompanhamento",
  depois: "Depois",
};

export const EVIDENCE_MEDIA_KINDS: DemandEvidenceMediaKind[] = ["foto", "video"];

export const EVIDENCE_MEDIA_LABELS: Record<DemandEvidenceMediaKind, string> = {
  foto: "Fotografia",
  video: "Filmagem",
};

export const EVIDENCE_PURPOSE_BY_MEDIA: Record<DemandEvidenceMediaKind, UploadPurpose> = {
  foto: "demand_evidence_photo",
  video: "demand_evidence_video",
};

/** Status da etapa (Modelo de Conexão §18). `atrasada` também é gravada pela plataforma. */
export const STAGE_PROGRESS: DemandStageProgress[] = ["nao_iniciada", "em_andamento", "concluida", "atrasada", "bloqueada"];

export const STAGE_PROGRESS_LABELS: Record<DemandStageProgress, string> = {
  nao_iniciada: "Não iniciada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  atrasada: "Atrasada",
  bloqueada: "Bloqueada",
};

/** Ocorrências da execução (Modelo de Conexão §19). */
export const INCIDENT_KINDS: DemandIncidentKind[] = [
  "atraso", "bloqueio", "alteracao_de_escopo", "problema_tecnico", "seguranca", "clima",
  "fornecedor", "outra",
];

export const INCIDENT_KIND_LABELS: Record<DemandIncidentKind, string> = {
  atraso: "Atraso",
  bloqueio: "Bloqueio",
  alteracao_de_escopo: "Alteração de escopo",
  problema_tecnico: "Problema técnico",
  seguranca: "Segurança",
  clima: "Clima",
  fornecedor: "Fornecedor",
  outra: "Outra",
};

export const INCIDENT_IMPACTS: DemandIncidentImpact[] = ["prazo", "custo", "escopo", "nenhum"];

export const INCIDENT_IMPACT_LABELS: Record<DemandIncidentImpact, string> = {
  prazo: "Prazo",
  custo: "Custo",
  escopo: "Escopo",
  nenhum: "Sem impacto",
};

/**
 * Etapa atrasada: prazo corrente antes de hoje, não concluída nem bloqueada.
 * Mesma regra de `isLate` do post-service.
 */
export function isLate(currentEndsOn: string | null | undefined, progress: DemandStageProgress | null | undefined, today: Date | string = new Date()): boolean {
  if (typeof currentEndsOn !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(currentEndsOn)) return false;
  if (progress === "concluida" || progress === "bloqueada") return false;
  const day = typeof today === "string" ? today.slice(0, 10) : today.toISOString().slice(0, 10);
  return currentEndsOn.slice(0, 10) < day;
}

/** "50" / "33,3" para exibir o percentual de execução; `null` → "—". */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export const EVIDENCE_OPEN_STATUSES: DemandStatus[] = [
  "publicada", "em_busca_de_parceiro", "conectada", "em_execucao", "concluida", "prestacao_de_contas",
];

export const PROGRESS_OPEN_STATUSES: DemandStatus[] = ["em_execucao", "concluida", "prestacao_de_contas"];

export const WAIVER_OPEN_STATUSES: DemandStatus[] = [
  "publicada", "em_busca_de_parceiro", "conectada", "em_execucao",
];

/** Marco exigido por transição, salvo justificativa de ausência de execução física. */
export const TRANSITION_REQUIRED_MILESTONE: Partial<Record<DemandAgentAction, DemandRecordMilestone>> = {
  iniciar_execucao: "antes",
  concluir: "depois",
};

export const EXECUTION_EVENT_TYPES = [
  "evidencia_registrada", "registro_pareado", "andamento_registrado",
  "prazo_alterado", "registro_dispensado",
  "etapa_atrasada", "ocorrencia_registrada", "ocorrencia_resolvida",
];

export const MAX_CAPTION = 500;
export const MAX_PARTIAL_RESULTS = 4000;
export const MAX_NOTE = 2000;
export const MAX_REASON = 2000;
export const MAX_INCIDENT_TEXT = 4000;
export const MAX_EXPENSE_DESCRIPTION = 500;
export const MAX_EXPENSES = 50;
export const MAX_EXECUTED_CENTS = 9_999_999_999;

/** Data "AAAA-MM-DD" no formato brasileiro, sem fuso (é data, não instante). */
export function formatRecordDate(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function executionTimelineLabel(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  const d = event.details ?? {};
  switch (event.type) {
    case "evidencia_registrada": {
      const milestone = d.milestone as DemandRecordMilestone | undefined;
      const kind = d.mediaKind as DemandEvidenceMediaKind | undefined;
      const what = kind ? EVIDENCE_MEDIA_LABELS[kind].toLowerCase() : "registro";
      const when = milestone ? RECORD_MILESTONE_SHORT[milestone].toLowerCase() : "execução";
      return `Evidência registrada: ${what} do ${when}`;
    }
    case "registro_pareado":
      return "Registros do antes e do depois pareados";
    case "andamento_registrado":
      return "Andamento da execução atualizado";
    case "prazo_alterado":
      return "Prazo de etapa alterado";
    case "registro_dispensado":
      return "Demanda sem execução física a registrar";
    case "etapa_atrasada":
      return "Etapa atrasada";
    case "ocorrencia_registrada":
      return "Ocorrência registrada na execução";
    case "ocorrencia_resolvida":
      return "Ocorrência resolvida";
    default:
      return null;
  }
}

export function executionTimelineDetail(event: Pick<DemandTimelineEvent, "type" | "details">): string | null {
  if (!EXECUTION_EVENT_TYPES.includes(event.type)) return null;
  const d = event.details ?? {};
  const parts: string[] = [];
  const stage = typeof d.stage === "string" ? d.stage : null;
  if (stage) parts.push(`Etapa: ${stage}`);
  if (event.type === "evidencia_registrada") {
    if (typeof d.caption === "string" && d.caption) parts.push(d.caption);
    const recordedOn = typeof d.recordedOn === "string" ? formatRecordDate(d.recordedOn.slice(0, 10)) : "";
    if (recordedOn) parts.push(`registrado em ${recordedOn}`);
  }
  if (event.type === "andamento_registrado") {
    const progress = d.stageProgress as DemandStageProgress | undefined;
    if (progress && progress in STAGE_PROGRESS_LABELS) parts.push(STAGE_PROGRESS_LABELS[progress]);
    if (d.onSchedule === true) parts.push("dentro do cronograma");
    if (d.onSchedule === false) parts.push("fora do cronograma");
    const executed = typeof d.executedAmountCents === "number" ? d.executedAmountCents : null;
    if (executed !== null && executed > 0) parts.push(`executado ${formatCents(executed)}`);
    if (typeof d.partialResults === "string" && d.partialResults) parts.push(d.partialResults);
  }
  if (event.type === "prazo_alterado") {
    const newEndsOn = typeof d.newEndsOn === "string" ? formatRecordDate(d.newEndsOn.slice(0, 10)) : "";
    if (newEndsOn) parts.push(`novo término em ${newEndsOn}`);
    if (typeof d.deadlineReason === "string" && d.deadlineReason) parts.push(d.deadlineReason);
  }
  if (event.type === "registro_dispensado" && typeof d.reason === "string") parts.push(d.reason);
  // Campos da migração 034 (T-05-11), fora de DemandTimelineDetails.
  const x = d as Record<string, unknown>;
  if (event.type === "andamento_registrado" && typeof x.blockReason === "string" && x.blockReason) {
    parts.push(`motivo do bloqueio: ${x.blockReason}`);
  }
  if (event.type === "etapa_atrasada") {
    const dueOn = typeof x.dueOn === "string" ? formatRecordDate(x.dueOn.slice(0, 10)) : "";
    if (dueOn) parts.push(`prazo vencido em ${dueOn}`);
  }
  if (event.type === "ocorrencia_registrada" || event.type === "ocorrencia_resolvida") {
    const kind = x.kind as DemandIncidentKind | undefined;
    if (kind && kind in INCIDENT_KIND_LABELS) parts.push(INCIDENT_KIND_LABELS[kind]);
    const impact = x.impact as DemandIncidentImpact | undefined;
    if (impact && impact !== "nenhum" && impact in INCIDENT_IMPACT_LABELS) parts.push(`impacto: ${INCIDENT_IMPACT_LABELS[impact].toLowerCase()}`);
    const occurredOn = typeof x.occurredOn === "string" ? formatRecordDate(x.occurredOn.slice(0, 10)) : "";
    if (occurredOn) parts.push(`em ${occurredOn}`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** "1.500" / "1500,50" (reais) → centavos; vazio → null; inválido → NaN. */
export function executionReaisToCents(value: string): number | null {
  const clean = value.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/\.(?=\d{3}(\D|$))/g, "");
  const reais = Number(normalized);
  if (!Number.isFinite(reais) || reais < 0) return Number.NaN;
  return Math.round(reais * 100);
}

/** Mensagem a partir de um erro das rotas da execução. */
export function executionErrorMessage(err: unknown, fallback = "Não foi possível registrar agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") {
      return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    }
    const code = (err as { code?: unknown }).code;
    if (code === "evidence_required") {
      return "Registre a foto ou o vídeo do marco exigido — ou justifique que não há execução física a registrar.";
    }
    if (code === "demand_not_open") return "A demanda não recebe este registro no estado atual.";
    if (code === "pair_taken") return "Este registro do \"antes\" já está pareado com outro \"depois\".";
    if (code === "pair_locked") return "O par antes/depois já registrado não é desfeito.";
    if (code === "evidence_exists") return "Este arquivo já foi registrado como evidência.";
    if (code === "incident_resolved") return "A resolução desta ocorrência já foi registrada e não muda.";
    if (code === "record_waiver_exists") return "A justificativa de ausência de registro já foi dada e não muda.";
    if (err.message) return err.message;
  }
  return fallback;
}
