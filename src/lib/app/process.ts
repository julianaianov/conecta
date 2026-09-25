/**
 * Processo de Conexão (T-05-01): tipos, vocabulário e funções puras. Espelho de
 * services/post-service/src/process/constants.js e state-machine.js
 * (process.test.mjs compara).
 *
 * Fonte: Modelo de Conexão §11 (protocolo DM-AAAA-NNNNNN), §14 (responsável
 * atual), §16 (status padronizados), §28 (vários processos por demanda) e §35
 * (linha do tempo por conexão); decisões 13 e 16.
 */

export type ProcessStatus =
  | "recebida" | "em_analise" | "solicitacao_de_informacoes" | "encaminhada" | "em_articulacao"
  | "aprovada_para_execucao" | "em_execucao" | "concluida" | "prestacao_de_contas"
  | "aguardando_documentacao" | "aguardando_recurso" | "nao_e_de_competencia" | "nao_aprovada" | "suspensa"
  | "cancelada";

export type ProcessPartyKind =
  | "poder_publico" | "empresa" | "marca" | "comercio_local" | "patrocinador" | "investidor" | "parceiro_outro";

export type ProcessContributionKind =
  | "apoio_financeiro" | "patrocinio" | "materiais" | "equipamentos" | "servicos" | "equipe" | "conhecimento_tecnico"
  | "execucao_de_etapa" | "infraestrutura" | "articulacao" | "autorizacao" | "encaminhamento" | "programa_publico"
  | "recurso_publico";

export type ProcessViewerRole = "agente" | "parte";

export type ProcessSummary = {
  id: string;
  protocol: string;
  demandId: string;
  demandTitle: string | null;
  sequenceInDemand: number;
  partyKind: ProcessPartyKind;
  partyName: string;
  status: ProcessStatus;
  statusChangedAt: string | null;
  responsibleDueOn: string | null;
  formalizedAt: string | null;
  closedAt: string | null;
  viewerRole?: ProcessViewerRole;
};

export type ProcessResponsible = {
  organizationName: string | null;
  organ: string | null;
  department: string | null;
  sector: string | null;
  name: string | null;
  role: string | null;
  since: string | null;
  dueOn: string | null;
};

/**
 * Taxas do processo (T-05-06, decisão 14; migração post 040): 4% + 6% sobre a
 * contribuição financeira só quando a parte não é o Poder Público. `null` no
 * processo sem contribuição financeira.
 */
export type ProcessFees = {
  applies: boolean;
  contributionAmountCents: number;
  agentFeeCents: number;
  platformFeeCents: number;
  totalWithFeesCents: number;
};

export type ConnectionProcess = ProcessSummary & {
  demand: { id: string; title: string | null; status: string | null };
  partyUserId: string | null;
  partyOrganizationId: string | null;
  partyProfileType: string | null;
  feeApplies: boolean;
  originKind: "interesse" | "oferta_institucional" | "acompanhamento_institucional";
  originConnectionId: string | null;
  contributionKinds: ProcessContributionKind[];
  contributionDescription: string | null;
  contributionAmountCents: number | null;
  fees?: ProcessFees | null;
  previousStatus: ProcessStatus | null;
  statusNote: string | null;
  responsible: ProcessResponsible;
  availableStatuses: ProcessStatus[];
  viewerRole: ProcessViewerRole | null;
};

export type ProcessTimelineEvent = {
  id: string;
  type: string;
  actorType?: string;
  note?: string | null;
  isPublic?: boolean;
  createdAt: string;
  details?: Record<string, unknown>;
};

export type ProcessDetail = { process: ConnectionProcess; timeline: ProcessTimelineEvent[] };

export type PublicProcess = {
  id: string;
  protocol: string;
  demandId: string;
  sequenceInDemand: number;
  partyKind: ProcessPartyKind;
  organizationName: string | null;
  contributionKinds: ProcessContributionKind[];
  feeApplies?: boolean;
  fees?: ProcessFees | null;
  status: ProcessStatus;
  statusChangedAt: string | null;
  formalizedAt: string | null;
  closedAt: string | null;
};

export type ProcessResponsibleInput = Partial<Record<Exclude<keyof ProcessResponsible, "since">, string | null>>;

export const PROCESSES_PATH = "/processos";

export const PROCESS_STATUSES: ProcessStatus[] = [
  "recebida", "em_analise", "solicitacao_de_informacoes", "encaminhada", "em_articulacao",
  "aprovada_para_execucao", "em_execucao", "concluida", "prestacao_de_contas",
  "aguardando_documentacao", "aguardando_recurso", "nao_e_de_competencia", "nao_aprovada", "suspensa", "cancelada",
];

export const PROCESS_STATUS_LABELS: Record<ProcessStatus, string> = {
  recebida: "Recebida",
  em_analise: "Em análise",
  solicitacao_de_informacoes: "Solicitação de informações",
  encaminhada: "Encaminhada",
  em_articulacao: "Em articulação",
  aprovada_para_execucao: "Aprovada para execução",
  em_execucao: "Em execução",
  concluida: "Concluída",
  prestacao_de_contas: "Prestação de contas / Resultados",
  aguardando_documentacao: "Aguardando documentação",
  aguardando_recurso: "Aguardando recurso",
  nao_e_de_competencia: "Não é competência do órgão",
  nao_aprovada: "Não aprovada",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
};

export const PROCESS_STATUS_COLORS: Record<ProcessStatus, string> = {
  recebida: "#2e7ba8",
  em_analise: "#8e6bbf",
  solicitacao_de_informacoes: "#7a5ea8",
  encaminhada: "#1b4f72",
  em_articulacao: "#b8860b",
  aprovada_para_execucao: "#f4841a",
  em_execucao: "#2e9e5b",
  concluida: "#1f7a45",
  prestacao_de_contas: "#1f7a45",
  aguardando_documentacao: "#a0701a",
  aguardando_recurso: "#a0701a",
  nao_e_de_competencia: "#6b7c8a",
  nao_aprovada: "#8a4b4b",
  suspensa: "#7d6f5f",
  cancelada: "#5f5f5f",
};

export const PROCESS_STATUSES_REQUIRING_NOTE: ProcessStatus[] = ["nao_e_de_competencia", "nao_aprovada", "suspensa", "cancelada"];
export const PROCESS_FINAL_STATUSES: ProcessStatus[] = ["nao_e_de_competencia", "nao_aprovada", "cancelada", "prestacao_de_contas"];

export const PARTY_KIND_LABELS: Record<ProcessPartyKind, string> = {
  poder_publico: "Poder Público",
  empresa: "Empresa",
  marca: "Marca",
  comercio_local: "Comércio local",
  patrocinador: "Patrocinador",
  investidor: "Investidor",
  parceiro_outro: "Parceiro",
};

export const CONTRIBUTION_KIND_LABELS: Record<ProcessContributionKind, string> = {
  apoio_financeiro: "Apoio financeiro",
  patrocinio: "Patrocínio",
  materiais: "Materiais",
  equipamentos: "Equipamentos",
  servicos: "Serviços",
  equipe: "Equipe",
  conhecimento_tecnico: "Conhecimento técnico",
  execucao_de_etapa: "Execução de etapa",
  infraestrutura: "Infraestrutura",
  articulacao: "Articulação",
  autorizacao: "Autorização",
  encaminhamento: "Encaminhamento",
  programa_publico: "Programa público",
  recurso_publico: "Recurso público",
};
export const CONTRIBUTION_KINDS = Object.keys(CONTRIBUTION_KIND_LABELS) as ProcessContributionKind[];

export const PROCESS_EVENT_TYPES = ["processo_formalizado", "processo_status_alterado"] as const;

export const PROCESS_PROTOCOL_RE = /^DM-\d{4}-\d{6}$/;

/** Caminho da tela do processo (pelo protocolo). */
export function processPath(protocol: string): string {
  return `${PROCESSES_PATH}/${encodeURIComponent(protocol)}`;
}

/** "CONEXÃO 01" (§28). */
export function connectionNumberLabel(sequence: number): string {
  return `Conexão ${String(sequence).padStart(2, "0")}`;
}

export function processStatusLabel(status: string | null | undefined): string {
  return status && status in PROCESS_STATUS_LABELS ? PROCESS_STATUS_LABELS[status as ProcessStatus] : "—";
}

export function contributionLabels(kinds: readonly string[] | null | undefined): string {
  const list = (kinds ?? []).map((k) => CONTRIBUTION_KIND_LABELS[k as ProcessContributionKind] ?? k);
  return list.length ? list.join(", ") : "A definir";
}

/** Quem é a parte, na visão pública: o órgão pelo nome; Parceiros só pelo tipo. */
export function publicPartyLabel(p: Pick<PublicProcess, "partyKind" | "organizationName">): string {
  return p.partyKind === "poder_publico" && p.organizationName ? p.organizationName : PARTY_KIND_LABELS[p.partyKind] ?? "Parceiro";
}

export function processRequiresNote(status: string): boolean {
  return PROCESS_STATUSES_REQUIRING_NOTE.includes(status as ProcessStatus);
}

/** Rótulo dos eventos do processo na linha do tempo (§35). */
export function processTimelineLabel(event: { type: string; details?: object | null }): string | null {
  const d = (event.details ?? {}) as Record<string, unknown>;
  const protocol = typeof d.protocol === "string" ? d.protocol : null;
  switch (event.type) {
    case "processo_formalizado": {
      const party = typeof d.organizationName === "string" && d.organizationName
        ? d.organizationName
        : typeof d.partyKind === "string" ? PARTY_KIND_LABELS[d.partyKind as ProcessPartyKind] ?? null : null;
      return `Conexão formalizada${protocol ? ` — processo ${protocol}` : ""}${party ? ` (${party})` : ""}`;
    }
    case "processo_status_alterado":
      return `Processo${protocol ? ` ${protocol}` : ""}: ${processStatusLabel(typeof d.status === "string" ? d.status : null)}`;
    case "responsavel_do_processo_definido":
      return "Responsável atual do processo definido";
    default:
      return null;
  }
}

/** Mensagem a partir de um erro da API do processo. */
export function processErrorMessage(err: unknown, fallback = "Não foi possível concluir agora. Tente de novo."): string {
  if (err instanceof Error) {
    if (err.message === "network" || err.message === "timeout") return "Sem conexão com o servidor. Confira a internet e tente de novo.";
    const code = (err as { code?: unknown }).code;
    if (code === "process_closed") return "Este processo foi encerrado e não muda mais.";
    if (code === "forbidden_status") return err.message;
    if (code === "invalid_transition") return "Esta mudança de status não é permitida a partir do status atual.";
    const status = (err as { status?: unknown }).status;
    if (status === 404) return "Processo não encontrado ou você não é parte dele.";
    if (err.message && !/^Erro \d+$/.test(err.message)) return err.message;
  }
  return fallback;
}

/** Valor em centavos → "R$ 1.234,56". */
export function formatCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined) return null;
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Valor da conexão (decisão 14): "Contribuição R$ X + 4% + 6% = R$ Y" com
 * Parceiros, Investidores e Empresas; só "Contribuição R$ X" com o Poder
 * Público (as taxas não se aplicam). `null` sem contribuição financeira.
 */
export function processFeesLine(fees: ProcessFees | null | undefined): string | null {
  if (!fees) return null;
  const amount = formatCents(fees.contributionAmountCents);
  if (!fees.applies) return `Contribuição ${amount} (sem 4% + 6%: conexão com o Poder Público)`;
  return `Contribuição ${amount} + 4% (${formatCents(fees.agentFeeCents)}) + 6% (${formatCents(fees.platformFeeCents)}) = ${formatCents(fees.totalWithFeesCents)}`;
}
