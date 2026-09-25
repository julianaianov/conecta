/**
 * Controle de prazos (T-05-03): tipos, vocabulário e funções puras dos prazos
 * por etapa do Processo de Conexão, do prazo do encaminhamento e das
 * pendências. Espelho de services/post-service/src/process/constants.js
 * (deadlines.test.mjs compara).
 *
 * Fonte: Modelo de Conexão §13 (encaminhamento com prazo), §14 (responsável
 * atual com data limite) e §15 (prazos por etapa; alertas, lembretes,
 * pendências, prazos próximos e vencidos).
 */

export type DeadlineStage =
  | "analise_inicial" | "envio_de_documentacao" | "analise_tecnica" | "elaboracao_do_plano" | "execucao" | "outra";
export type DeadlineSide = "agente" | "parte";
export type DeadlineStatus = "aberto" | "cumprido" | "vencido";

export type ProcessDeadline = {
  id: string;
  processId: string;
  stage: DeadlineStage;
  stageLabel: string;
  responsibleSide: DeadlineSide;
  defaultDays: number | null;
  dueOn: string;
  note: string | null;
  setByKind: DeadlineSide;
  status: DeadlineStatus;
  overdue: boolean;
  daysLeft: number | null;
  open: boolean;
  fulfilledAt: string | null;
  fulfilledByKind: DeadlineSide | null;
  fulfilledNote: string | null;
  overdueAt: string | null;
  supersededBy: string | null;
  supersededAt: string | null;
  createdAt: string | null;
};

export type DeadlineInput = {
  stage: DeadlineStage;
  stageLabel?: string | null;
  dueDays?: number | null;
  dueOn?: string | null;
  responsibleSide?: DeadlineSide | null;
  note?: string | null;
};

export type PendingKind = "prazo_do_processo" | "responsavel_do_processo" | "encaminhamento" | "acompanhamento";

export type PendingItem = {
  kind: PendingKind;
  id: string;
  label: string;
  stage: DeadlineStage | null;
  responsibleSide: DeadlineSide | null;
  viewerSide: string;
  mustAct: boolean;
  dueOn: string;
  daysLeft: number;
  overdue: boolean;
  status: string;
  processId: string | null;
  protocol: string | null;
  processStatusLabel: string | null;
  demandId: string;
  demandTitle: string | null;
  href: string;
};

export const DEADLINE_STAGES: DeadlineStage[] = [
  "analise_inicial", "envio_de_documentacao", "analise_tecnica", "elaboracao_do_plano", "execucao", "outra",
];

export const DEADLINE_STAGE_LABELS: Record<DeadlineStage, string> = {
  analise_inicial: "Análise inicial",
  envio_de_documentacao: "Envio de documentação",
  analise_tecnica: "Análise técnica",
  elaboracao_do_plano: "Elaboração do plano",
  execucao: "Execução",
  outra: "Outra etapa",
};

/** Sugestão de dias da tabela do §15. */
export const DEADLINE_DEFAULT_DAYS: Record<Exclude<DeadlineStage, "outra">, number> = {
  analise_inicial: 5,
  envio_de_documentacao: 3,
  analise_tecnica: 10,
  elaboracao_do_plano: 7,
  execucao: 60,
};

/** Quem responde pela etapa (e define o prazo dela). */
export const DEADLINE_STAGE_SIDE: Record<Exclude<DeadlineStage, "outra">, DeadlineSide> = {
  analise_inicial: "parte",
  envio_de_documentacao: "agente",
  analise_tecnica: "parte",
  elaboracao_do_plano: "agente",
  execucao: "agente",
};

export const DEADLINE_STATUS_LABELS: Record<DeadlineStatus, string> = {
  aberto: "Em aberto",
  cumprido: "Cumprido",
  vencido: "Vencido",
};

export const DEADLINE_SIDE_LABELS: Record<DeadlineSide, string> = {
  agente: "Agente de Transformação",
  parte: "Parte conectada",
};

/** Aviso de "prazo próximo" a partir de 3 dias antes. */
export const DEADLINE_WARNING_DAYS = 3;

/** Etapas cujo prazo este lado define (a `outra` vale para os dois). */
export function stagesFor(side: DeadlineSide): DeadlineStage[] {
  return DEADLINE_STAGES.filter((s) => s === "outra" || DEADLINE_STAGE_SIDE[s as Exclude<DeadlineStage, "outra">] === side);
}

/** "Vence hoje", "Vence em 3 dias", "Venceu há 2 dias". */
export function dueLabel(daysLeft: number | null | undefined): string {
  if (daysLeft === null || daysLeft === undefined) return "";
  if (daysLeft === 0) return "Vence hoje";
  if (daysLeft === 1) return "Vence amanhã";
  if (daysLeft > 1) return `Vence em ${daysLeft} dias`;
  if (daysLeft === -1) return "Venceu ontem";
  return `Venceu há ${-daysLeft} dias`;
}

/** Tom do aviso: vencido, próximo (até 3 dias) ou em dia. */
export function dueTone(item: { overdue: boolean; daysLeft: number | null }): "vencido" | "proximo" | "em_dia" {
  if (item.overdue) return "vencido";
  if (item.daysLeft !== null && item.daysLeft <= DEADLINE_WARNING_DAYS) return "proximo";
  return "em_dia";
}

/** AAAA-MM-DD → DD/MM/AAAA (sem fuso: data do calendário). */
export function formatDay(day: string | null | undefined): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return day ?? "";
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}
