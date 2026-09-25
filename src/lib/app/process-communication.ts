/**
 * Comunicação do Processo de Conexão (T-05-02): tipos, vocabulário e funções
 * puras. Espelho de services/post-service/src/process/communication.js
 * (process-communication.test.mjs compara).
 *
 * Fonte: Modelo de Conexão §12 ("Cada interação poderá registrar: usuário,
 * instituição, cargo/perfil, data, horário, destinatário, mensagem, documentos
 * anexados, histórico") e decisão 13 (a conversa da conexão vale na fase de
 * pedido; a partir do protocolo, a comunicação é a do processo).
 */
import type { ProcessViewerRole } from "./process";

export type ProcessMessageSide = "agente" | "conectado";
export type ProcessMessageRecipient = "agente" | "conectado" | "todos";

export type ProcessMessageAttachment = {
  id: string;
  ref: string;
  fileName: string | null;
  contentType: string | null;
  size: number | null;
  /** URL de leitura curta (alguns minutos); recarregue a conversa para outra. */
  url: string | null;
};

export type ProcessMessage = {
  id: string;
  processId: string;
  authorId: string;
  authorSide: ProcessMessageSide;
  authorName: string;
  authorOrganizationName: string | null;
  authorRoleLabel: string | null;
  recipient: ProcessMessageRecipient;
  mine: boolean;
  body: string;
  anonymized: boolean;
  attachments: ProcessMessageAttachment[];
  createdAt: string;
};

export type ProcessMessagePage = { messages: ProcessMessage[]; hasMore: boolean; open: boolean };

export type ProcessMessageInput = { body: string; recipient: ProcessMessageRecipient; attachments: string[] };

export const PROCESS_MESSAGE_RECIPIENTS: ProcessMessageRecipient[] = ["agente", "conectado", "todos"];

export const PROCESS_MESSAGE_RECIPIENT_LABELS: Record<ProcessMessageRecipient, string> = {
  agente: "Agente de Transformação",
  conectado: "Parte conectada",
  todos: "Todos do processo",
};

export const PROCESS_MESSAGE_LIMITS = { body: 4000, attachments: 10, pageDefault: 50, pageMax: 100 } as const;

/** Lado de quem vê o processo na conversa. */
export function sideOfViewer(role: ProcessViewerRole | null | undefined): ProcessMessageSide {
  return role === "agente" ? "agente" : "conectado";
}

/**
 * Opções de destinatário para quem escreve: primeiro "todos", depois o outro
 * lado e, por último, o próprio lado (ex.: outra pessoa do mesmo órgão).
 */
export function recipientOptions(role: ProcessViewerRole | null | undefined): { value: ProcessMessageRecipient; label: string }[] {
  const mine = sideOfViewer(role);
  const other: ProcessMessageSide = mine === "agente" ? "conectado" : "agente";
  return [
    { value: "todos", label: PROCESS_MESSAGE_RECIPIENT_LABELS.todos },
    { value: other, label: PROCESS_MESSAGE_RECIPIENT_LABELS[other] },
    { value: mine, label: `${PROCESS_MESSAGE_RECIPIENT_LABELS[mine]} (seu lado)` },
  ];
}

/** "Cargo · Instituição" de quem escreveu (§12), ou `null` sem os dois. */
export function messageAuthorDetails(m: Pick<ProcessMessage, "authorRoleLabel" | "authorOrganizationName">): string | null {
  const parts = [m.authorRoleLabel, m.authorOrganizationName].filter((v): v is string => Boolean(v && v.trim()));
  return parts.length ? parts.join(" · ") : null;
}

/** "Para: Parte conectada". */
export function recipientLabel(recipient: string): string {
  return `Para: ${PROCESS_MESSAGE_RECIPIENT_LABELS[recipient as ProcessMessageRecipient] ?? PROCESS_MESSAGE_RECIPIENT_LABELS.todos}`;
}
