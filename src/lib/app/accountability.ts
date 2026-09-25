// Prestação de contas e prestação de resultados (T18): rótulos e textos da
// interface. Espelha services/post-service/src/accountability/constants.js
// (accountability.test.mjs compara as listas). O servidor é quem decide; aqui
// só se orienta a tela.
//
// Fonte: 02-fluxo-cadastro-agente-de-transformacao.html, slide 24 ("Etapa 10 ·
// Prestação de resultados": relatório de execução, atualização do cronograma,
// registros das ações, comprovantes financeiros quando aplicável, número de
// beneficiários, resultados alcançados, indicadores de impacto e os registros
// de antes e depois vinculados à demanda) e slide 15 (metas, indicadores e
// forma de mensuração, fechados aqui com o valor medido).

import type {
  DemandAccountabilityDocumentKind,
  DemandAccountabilityRequirement,
  DemandAccountabilityRequirementCondition,
  DemandAccountabilityStatus,
  DemandStatus,
  DemandTimelineEvent,
  UploadPurpose,
} from "./types.ts";

export const ACCOUNTABILITY_STATUSES: DemandAccountabilityStatus[] = ["rascunho", "concluida"];

export const ACCOUNTABILITY_STATUS_LABELS: Record<DemandAccountabilityStatus, string> = {
  rascunho: "Em preparação",
  concluida: "Prestação concluída",
};

export const DOCUMENT_KINDS: DemandAccountabilityDocumentKind[] = [
  "comprovante_financeiro", "relatorio_execucao", "registro_acao", "outro",
  "nota_fiscal", "laudo", "certificado", "registro_tecnico", "relatorio", "documento",
];

export const DOCUMENT_KIND_LABELS: Record<DemandAccountabilityDocumentKind, string> = {
  comprovante_financeiro: "Comprovante financeiro",
  relatorio_execucao: "Relatório de execução",
  registro_acao: "Registro da ação realizada",
  outro: "Outro documento",
  nota_fiscal: "Nota fiscal",
  laudo: "Laudo",
  certificado: "Certificado",
  registro_tecnico: "Registro técnico",
  relatorio: "Relatório",
  documento: "Documento",
};

export const ACCOUNTABILITY_UPLOAD_PURPOSE: UploadPurpose = "demand_accountability_document";

export const ACCOUNTABILITY_OPEN_STATUSES: DemandStatus[] = ["prestacao_de_contas"];

export const ACCOUNTABILITY_EVENT_TYPES = ["prestacao_de_contas_concluida"];

/** Exigências da conclusão, na ordem em que a tela as apresenta. */
export const REQUIREMENTS: {
  key: string;
  condition: DemandAccountabilityRequirementCondition;
  label: string;
  informative?: boolean;
}[] = [
  { key: "execution_report", condition: "sempre", label: "Relatório de execução" },
  { key: "actions_record", condition: "sempre", label: "Registros das ações realizadas" },
  { key: "schedule_summary", condition: "sempre", label: "Atualização final do cronograma" },
  { key: "beneficiaries_reached", condition: "sempre", label: "Número de beneficiários alcançados" },
  { key: "impact_indicators", condition: "sempre", label: "Indicadores de impacto" },
  { key: "participants", condition: "sempre", label: "Quem participou" },
  { key: "final_result", condition: "sempre", label: "Resultado final" },
  { key: "results", condition: "sempre", label: "Resultado alcançado de cada meta declarada" },
  { key: "evidence_antes", condition: "execucao_fisica", label: 'Registro do "antes" (foto ou filmagem)' },
  { key: "evidence_depois", condition: "execucao_fisica", label: 'Registro do "depois" (foto ou filmagem)' },
  { key: "financial_summary", condition: "apoio_financeiro", label: "Resumo da aplicação do apoio financeiro" },
  { key: "financial_receipt", condition: "apoio_financeiro", label: "Comprovante financeiro anexado" },
  {
    key: "evidence_acompanhamento",
    condition: "previsto_no_cronograma",
    label: "Registro do acompanhamento previsto no cronograma",
    informative: true,
  },
];

export const REQUIREMENT_KEYS = REQUIREMENTS.map((r) => r.key);

/** Como a tela explica por que a exigência vale (ou não) nesta demanda. */
export const REQUIREMENT_CONDITION_LABELS: Record<DemandAccountabilityRequirementCondition, string> = {
  sempre: "Sempre obrigatório",
  execucao_fisica: "Obrigatório com execução física",
  apoio_financeiro: "Obrigatório com apoio financeiro",
  previsto_no_cronograma: "Informativo: previsto no cronograma, não bloqueia",
};

export const MAX_EXECUTION_REPORT = 20000;
export const MAX_ACTIONS_RECORD = 8000;
export const MAX_SCHEDULE_SUMMARY = 8000;
export const MAX_IMPACT_INDICATORS = 8000;
export const MAX_FINANCIAL_SUMMARY = 8000;
export const MAX_BENEFICIARIES_NOTE = 4000;
export const MAX_PARTICIPANTS = 4000;
export const MAX_LOCATION_SUMMARY = 2000;
export const MAX_FINAL_RESULT = 8000;

/** As dez perguntas do registro de resultados (Modelo de Conexão §21), literais. */
export const RESULT_QUESTIONS = [
  { key: "what", question: "O que foi realizado?" },
  { key: "where", question: "Onde?" },
  { key: "when", question: "Quando?" },
  { key: "who", question: "Quem participou?" },
  { key: "howMany", question: "Quantas pessoas?" },
  { key: "goals", question: "Quais metas?" },
  { key: "indicators", question: "Quais indicadores?" },
  { key: "resources", question: "Quais recursos?" },
  { key: "evidence", question: "Quais evidências?" },
  { key: "finalResult", question: "Qual foi o resultado final?" },
] as const;
export const MAX_RESULT_NOTE = 4000;
export const MAX_MEASURED_VALUE = 500;
export const MAX_MEASUREMENT_METHOD = 2000;
export const MAX_DOCUMENT_TITLE = 200;
export const MAX_DOCUMENT_DESCRIPTION = 2000;
export const MAX_DOCUMENTS = 60;
export const MAX_BENEFICIARIES = 100_000_000;
export const MAX_AMOUNT_CENTS = 9_999_999_999;

/** Exigências que se aplicam, bloqueiam e ainda faltam (o servidor devolve a lista pronta). */
export function pendingRequirements(
  requirements: DemandAccountabilityRequirement[] | null | undefined,
): DemandAccountabilityRequirement[] {
  return (requirements ?? []).filter((r) => r.applies && !r.satisfied && !r.informative);
}

/** "8 de 10 metas cumpridas" e afins, para o resumo público. */
export function goalsSummaryLabel(achieved: number, total: number): string {
  if (!total) return "Sem metas declaradas";
  return `${achieved} de ${total} ${total === 1 ? "meta cumprida" : "metas cumpridas"}`;
}

/**
 * Pessoas alcançadas contra a estimativa da T06. `null` quando não há
 * estimativa registrada.
 */
export function beneficiariesDelta(reached: number | null, estimate: number | null): number | null {
  if (reached === null || estimate === null) return null;
  return reached - estimate;
}

export function accountabilityTimelineLabel(
  event: Pick<DemandTimelineEvent, "type" | "details">,
): string | null {
  if (event.type !== "prestacao_de_contas_concluida") return null;
  return "Prestação de contas concluída";
}

export function accountabilityTimelineDetail(
  event: Pick<DemandTimelineEvent, "type" | "details">,
): string | null {
  if (!ACCOUNTABILITY_EVENT_TYPES.includes(event.type)) return null;
  const d = event.details ?? {};
  const parts: string[] = [];
  const reached = typeof d.beneficiariesReached === "number" ? d.beneficiariesReached : null;
  const estimate = typeof d.beneficiariesEstimate === "number" ? d.beneficiariesEstimate : null;
  if (reached !== null) {
    parts.push(`${reached.toLocaleString("pt-BR")} pessoas alcançadas${
      estimate !== null ? ` (estimativa: ${estimate.toLocaleString("pt-BR")})` : ""}`);
  }
  const total = typeof d.goalsTotal === "number" ? d.goalsTotal : null;
  const achieved = typeof d.goalsAchieved === "number" ? d.goalsAchieved : null;
  if (total !== null && achieved !== null) parts.push(goalsSummaryLabel(achieved, total));
  const executed = typeof d.executedAmountCents === "number" ? d.executedAmountCents : null;
  if (executed !== null && executed > 0) parts.push(`executado ${formatCents(executed)}`);
  if (typeof d.impactIndicators === "string" && d.impactIndicators) parts.push(d.impactIndicators);
  return parts.length ? parts.join(" · ") : null;
}

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Data "AAAA-MM-DD" no formato brasileiro, sem fuso (é data, não instante). */
export function formatAccountabilityDate(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date.slice(0, 10))) return "";
  const [year, month, day] = date.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

/** "1.500" / "1500,50" (reais) → centavos; vazio → null; inválido → NaN. */
export function accountabilityReaisToCents(value: string): number | null {
  const clean = value.trim().replace(/[R$\s]/g, "");
  if (!clean) return null;
  const normalized = clean.includes(",")
    ? clean.replace(/\./g, "").replace(",", ".")
    : clean.replace(/\.(?=\d{3}(\D|$))/g, "");
  const reais = Number(normalized);
  if (!Number.isFinite(reais) || reais < 0) return Number.NaN;
  return Math.round(reais * 100);
}

/** Mensagem a partir de um erro das rotas da prestação de contas. */
export function accountabilityErrorMessage(
  err: unknown,
  fallback = "Não foi possível registrar agora. Tente de novo.",
): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") {
      return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    }
    const code = (err as { code?: unknown }).code;
    if (code === "accountability_incomplete") {
      return "A prestação de contas ainda não pode ser concluída: complete os itens obrigatórios.";
    }
    if (code === "accountability_concluded") return "A prestação de contas concluída não muda mais.";
    if (code === "accountability_exists") return "Esta demanda já tem prestação de contas.";
    if (code === "document_exists") return "Este arquivo já foi anexado à prestação.";
    if (code === "evidence_required") {
      return 'Registre a foto ou a filmagem do "antes" e do "depois" na aba Execução.';
    }
    if (code === "demand_not_open") {
      return "A prestação de contas é registrada com a demanda em prestação de contas.";
    }
    if (err.message) return err.message;
  }
  return fallback;
}
