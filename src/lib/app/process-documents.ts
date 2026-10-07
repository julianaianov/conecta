/**
 * Documentos do Processo de Conexão (T-05-04): tipos, vocabulário e funções
 * puras da tela. Espelho de services/post-service/src/process/documents.js
 * (process-documents.test.mjs compara).
 *
 * Fonte: Modelo de Conexão §17 ("Cada processo terá uma área própria de
 * documentos. O sistema poderá registrar: Nome do documento, Tipo, Instituição
 * responsável, Usuário que enviou, Data, Hora, Versão, Status, Permissão de
 * acesso ... controle de versões, evitando que documentos antigos sejam
 * confundidos com documentos atualizados"), §23 a §25 (documentos dos módulos)
 * e §33 (Público, Institucional, Restrito); decisão 13.
 */
import { DOCUMENT_ACCESS_LEVELS, DOCUMENT_ACCESS_LEVEL_LABELS, type DocumentAccessLevel } from "./document-access.ts";
import { PROCESS_MESSAGE_RECIPIENT_LABELS } from "./process-communication.ts";
import type { DemandDocumentType, DemandModule } from "./types.ts";

export type ProcessDocumentType =
  | "projeto_tecnico" | "orcamento" | "parecer_tecnico" | "termo_de_parceria" | "relatorio_de_execucao"
  | "comprovante" | "plano_de_execucao" | "autorizacao_ou_licenca" | "contrato" | "nota_fiscal" | "laudo"
  | "certificado" | "outro"
  // Módulos específicos (§23 a §25; migração post 044).
  | "documentacao_institucional" | "documento_do_imovel" | "projeto_arquitetonico" | "art_rrt"
  | "plano_de_recuperacao" | "plano_de_monitoramento" | "relatorio_ambiental" | "plano_de_trabalho"
  | "plano_de_acao" | "metodologia" | "equipe" | "publico_alvo";

export type ProcessDocumentStatus = "vigente" | "substituido" | "arquivado";
export type ProcessDocumentSide = "agente" | "conectado";

/** Uma versão de um documento (todas as versões compartilham o `groupId`). */
export type ProcessDocumentVersion = {
  id: string;
  processId: string;
  groupId: string;
  version: number;
  name: string;
  documentType: ProcessDocumentType;
  organizationName: string | null;
  uploadedBy: { userId: string; name: string; side: ProcessDocumentSide };
  mine: boolean;
  status: ProcessDocumentStatus;
  accessLevel: DocumentAccessLevel;
  /** Só para quem enviou o documento restrito. */
  restrictedTo: string[];
  upload: { ref: string; fileName: string | null; contentType: string | null; size: number | null };
  canOpen: boolean;
  archivedAt: string | null;
  archiveReason: string | null;
  createdAt: string;
};

/** Documento com as versões: a vigente primeiro, depois da mais nova para a mais antiga. */
export type ProcessDocumentGroup = {
  groupId: string;
  name: string;
  documentType: ProcessDocumentType;
  status: ProcessDocumentStatus;
  latestVersion: number;
  updatedAt: string | null;
  versions: ProcessDocumentVersion[];
};

/** Quem pode constar da lista de um documento restrito: o Agente autor e a parte conectada. */
export type ProcessDocumentParticipant = { id: string; side: ProcessDocumentSide; label: string };

export type ProcessDocumentList = {
  groups: ProcessDocumentGroup[];
  /** `false` com o processo encerrado: nada novo entra. */
  open: boolean;
  participants: ProcessDocumentParticipant[];
  /** Módulo da demanda (§29): os tipos dele vêm primeiro. */
  module: DemandModule | null;
};

/** Novo documento ou nova versão (`replacesGroupId`). */
export type ProcessDocumentInput = {
  name: string;
  documentType: ProcessDocumentType | "";
  /** Referência do upload confirmado (`upload:<id>`). */
  uploadId: string;
  accessLevel: DocumentAccessLevel;
  restrictedTo?: string[];
  replacesGroupId?: string | null;
};

/** URL assinada curta do arquivo (GET .../file). */
export type ProcessDocumentLink = { url: string; expiresIn: number; fileName: string | null; contentType: string | null };

export const PROCESS_DOCUMENT_TYPES: ProcessDocumentType[] = [
  "projeto_tecnico", "orcamento", "parecer_tecnico", "termo_de_parceria", "relatorio_de_execucao", "comprovante",
  "plano_de_execucao", "autorizacao_ou_licenca", "contrato", "nota_fiscal", "laudo", "certificado", "outro",
  "documentacao_institucional", "documento_do_imovel", "projeto_arquitetonico", "art_rrt", "plano_de_recuperacao",
  "plano_de_monitoramento", "relatorio_ambiental", "plano_de_trabalho", "plano_de_acao", "metodologia", "equipe",
  "publico_alvo",
];

export const PROCESS_DOCUMENT_TYPE_LABELS: Record<ProcessDocumentType, string> = {
  projeto_tecnico: "Projeto técnico",
  orcamento: "Orçamento",
  parecer_tecnico: "Parecer técnico",
  termo_de_parceria: "Termo de parceria",
  relatorio_de_execucao: "Relatório de execução",
  comprovante: "Comprovante",
  plano_de_execucao: "Plano de execução",
  autorizacao_ou_licenca: "Autorização ou licença",
  contrato: "Contrato",
  nota_fiscal: "Nota fiscal",
  laudo: "Laudo",
  certificado: "Certificado",
  outro: "Outro",
  documentacao_institucional: "Documentação institucional",
  documento_do_imovel: "Documento do imóvel",
  projeto_arquitetonico: "Projeto arquitetônico",
  art_rrt: "ART/RRT",
  plano_de_recuperacao: "Plano de recuperação",
  plano_de_monitoramento: "Plano de monitoramento",
  relatorio_ambiental: "Relatório ambiental",
  plano_de_trabalho: "Plano de trabalho",
  plano_de_acao: "Plano de ação",
  metodologia: "Metodologia",
  equipe: "Equipe",
  publico_alvo: "Público-alvo",
};

/** Documentos de cada módulo da demanda (§23 a §25), no vocabulário do processo. */
export const PROCESS_MODULE_DOCUMENT_TYPES: Record<DemandModule, ProcessDocumentType[]> = {
  obras: [
    "documentacao_institucional", "documento_do_imovel", "projeto_arquitetonico", "projeto_tecnico", "orcamento",
    "art_rrt", "autorizacao_ou_licenca", "plano_de_execucao", "contrato", "nota_fiscal", "comprovante",
    "relatorio_de_execucao",
  ],
  ambiental: [
    "plano_de_recuperacao", "autorizacao_ou_licenca", "metodologia", "plano_de_monitoramento", "relatorio_ambiental",
  ],
  social: [
    "plano_de_acao", "projeto_tecnico", "plano_de_trabalho", "orcamento", "metodologia", "documentacao_institucional",
    "equipe", "publico_alvo", "relatorio_de_execucao", "comprovante",
  ],
  apoio_investimento: [],
  articulacao_publica: [],
};

/** Tipo do documento da demanda → tipo do documento do processo (o que não consta vira `outro`). */
export const PROCESS_TYPE_BY_DEMAND_TYPE: Partial<Record<DemandDocumentType, ProcessDocumentType>> = {
  documentos_institucionais: "documentacao_institucional",
  estatuto: "documentacao_institucional",
  documentos_de_representacao: "documentacao_institucional",
  autorizacoes: "autorizacao_ou_licenca",
  orcamentos_e_cotacoes: "orcamento",
  projetos_tecnicos: "projeto_tecnico",
  fotografias: "outro",
  outros: "outro",
  documento_do_imovel: "documento_do_imovel",
  projeto_arquitetonico: "projeto_arquitetonico",
  art_rrt: "art_rrt",
  licencas_ou_autorizacoes: "autorizacao_ou_licenca",
  contratos: "contrato",
  notas_fiscais: "nota_fiscal",
  comprovantes: "comprovante",
  relatorio_de_execucao: "relatorio_de_execucao",
  plano_de_trabalho: "plano_de_trabalho",
  metodologia: "metodologia",
  equipe: "equipe",
  publico_alvo: "publico_alvo",
  plano_de_recuperacao: "plano_de_recuperacao",
  plano_de_monitoramento: "plano_de_monitoramento",
  relatorio_ambiental: "relatorio_ambiental",
};

export const PROCESS_DOCUMENT_STATUSES: ProcessDocumentStatus[] = ["vigente", "substituido", "arquivado"];
export const PROCESS_DOCUMENT_STATUS_LABELS: Record<ProcessDocumentStatus, string> = {
  vigente: "Vigente",
  substituido: "Substituído",
  arquivado: "Arquivado",
};

export const PROCESS_DOCUMENT_LIMITS = { name: 255, organizationName: 255, archiveReason: 1000, restrictedTo: 20 } as const;

/** Tipo do processo para um tipo de documento da demanda (`outro` se desconhecido). */
export function processTypeForDemandType(demandType: string | null | undefined): ProcessDocumentType {
  return (demandType && PROCESS_TYPE_BY_DEMAND_TYPE[demandType as DemandDocumentType]) || "outro";
}

/** Todos os tipos, com os do módulo da demanda primeiro (sem repetir). */
export function processDocumentTypesFor(module: DemandModule | null | undefined): ProcessDocumentType[] {
  const first = module ? PROCESS_MODULE_DOCUMENT_TYPES[module] ?? [] : [];
  return [...first, ...PROCESS_DOCUMENT_TYPES.filter((type) => !first.includes(type))];
}

/** Rótulo de quem enviou ("Agente de Transformação" ou "Parte conectada"). */
export function processDocumentSideLabel(side: ProcessDocumentSide | null | undefined): string {
  return PROCESS_MESSAGE_RECIPIENT_LABELS[side === "agente" ? "agente" : "conectado"];
}

/**
 * Permissão de acesso (§33) em texto: "Público", "Institucional" ou, para quem
 * enviou o documento restrito, "Restrito: Agente de Transformação, Empresa X".
 */
export function processDocumentAccessLabel(
  version: Pick<ProcessDocumentVersion, "accessLevel" | "restrictedTo">,
  participants: readonly ProcessDocumentParticipant[] = [],
): string {
  const base = DOCUMENT_ACCESS_LEVEL_LABELS[version.accessLevel] ?? version.accessLevel;
  if (version.accessLevel !== "restrito" || !version.restrictedTo.length) return base;
  const names = version.restrictedTo.map((id) => participants.find((p) => p.id.toLowerCase() === id.toLowerCase())?.label ?? "Conta autorizada");
  return `${base}: ${names.join(", ")}`;
}

/** O que cabe fazer com o documento, dado o estado do processo e quem vê. */
export function processDocumentActions(
  group: Pick<ProcessDocumentGroup, "status" | "versions">,
  open: boolean,
): { open: boolean; replace: boolean; archive: boolean } {
  const current = group.versions[0];
  return {
    open: Boolean(current?.canOpen),
    // Documento arquivado não recebe versão nova (envie outro documento).
    replace: open && Boolean(current?.canOpen) && group.status !== "arquivado",
    // Só quem enviou arquiva, e só a versão vigente.
    archive: open && Boolean(current?.mine) && current?.status === "vigente",
  };
}

/** Data e hora no formato do Modelo §12 ("22/09/2026 - 14h35"), no horário de Brasília. */
export function formatProcessMoment(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} - ${part("hour")}h${part("minute")}`;
}

/** Nome sugerido para o documento a partir do arquivo ("Orçamento.xlsx" → "Orçamento"). */
export function suggestedDocumentName(fileName: string | null | undefined): string {
  return (fileName ?? "").replace(/\.[A-Za-z0-9]{1,5}$/, "").trim().slice(0, PROCESS_DOCUMENT_LIMITS.name);
}

/** Erros por campo do envio (mesmas mensagens de `validateDocument` no post-service). */
export function processDocumentProblems(input: ProcessDocumentInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (!name) errors.name = "Informe o nome do documento";
  else if (name.length > PROCESS_DOCUMENT_LIMITS.name) errors.name = `Use no máximo ${PROCESS_DOCUMENT_LIMITS.name} caracteres`;
  if (!PROCESS_DOCUMENT_TYPES.includes(input.documentType as ProcessDocumentType)) errors.documentType = "Escolha o tipo do documento";
  if (!input.uploadId.trim()) errors.uploadId = "Envie o arquivo do documento";
  if (!DOCUMENT_ACCESS_LEVELS.includes(input.accessLevel)) {
    errors.accessLevel = "Escolha o acesso: público, institucional ou restrito";
  } else {
    const restrictedTo = input.restrictedTo ?? [];
    if (restrictedTo.length > PROCESS_DOCUMENT_LIMITS.restrictedTo) errors.restrictedTo = `No máximo ${PROCESS_DOCUMENT_LIMITS.restrictedTo} autorizados`;
    else if (input.accessLevel === "restrito" && !restrictedTo.length) errors.restrictedTo = "Informe quem pode abrir o documento restrito";
    else if (input.accessLevel !== "restrito" && restrictedTo.length) errors.restrictedTo = "Autorizados só no documento restrito";
  }
  return errors;
}

/** Motivo do arquivamento (obrigatório, até 1000 caracteres); `null` quando está ok. */
export function processDocumentArchiveProblem(reason: string): string | null {
  const value = reason.trim();
  if (!value) return "Informe o motivo do arquivamento";
  if (value.length > PROCESS_DOCUMENT_LIMITS.archiveReason) return `Use no máximo ${PROCESS_DOCUMENT_LIMITS.archiveReason} caracteres`;
  return null;
}
