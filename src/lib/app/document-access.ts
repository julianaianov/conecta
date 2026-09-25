/**
 * Nível de visibilidade dos documentos da demanda (T-05-18; Modelo de Conexão
 * §33; decisão 13). Espelho de `services/post-service/src/access/documents.js`
 * e `src/access/process-party.js` (`document-access.test.mjs` compara).
 */
import type { DemandDocumentType } from "./types.ts";

export type DocumentAccessLevel = "publico" | "institucional" | "restrito";

/** Papel de quem vê na demanda ("usuário envolvido no processo"). */
export type DemandAccessRole = "autor" | "delegado" | "operacao" | "parte" | "orgao" | "interessado";

export interface DemandAccessDocument {
  id: string;
  position: number;
  type: DemandDocumentType;
  title: string;
  description: string | null;
  accessLevel: DocumentAccessLevel;
  /** Só para quem define o acesso (autor e delegados). */
  restrictedTo?: string[];
  hasFile: boolean;
}

/** GET /api/posts/demands/:id/documents */
export interface DemandDocumentsAccess {
  role: DemandAccessRole;
  canManage: boolean;
  documents: DemandAccessDocument[];
  /** Última versão integral gerada do dossiê, quando há armazenamento. */
  dossier: { number: string; version: number; generatedAt: string | null } | null;
}

/** URL assinada curta (documento: 5 min; dossiê integral: 60 s). */
export interface SignedFileLink {
  url: string;
  expiresAt: string | null;
  fileName: string | null;
  number?: string;
  version?: number;
}

export const DOCUMENT_ACCESS_LEVELS: DocumentAccessLevel[] = ["publico", "institucional", "restrito"];

export const DOCUMENT_ACCESS_LEVEL_LABELS: Record<DocumentAccessLevel, string> = {
  publico: "Público",
  institucional: "Institucional",
  restrito: "Restrito",
};

/** Texto de ajuda de cada nível, com as palavras do Modelo de Conexão §33. */
export const DOCUMENT_ACCESS_LEVEL_HINTS: Record<DocumentAccessLevel, string> = {
  publico: "Informações que podem aparecer no mapa ou portal",
  institucional: "Informações acessíveis aos usuários envolvidos no processo",
  restrito: "Destinado apenas a usuários autorizados",
};

export const DEFAULT_DOCUMENT_ACCESS_LEVEL: DocumentAccessLevel = "institucional";

export const DEMAND_ACCESS_ROLE_LABELS: Record<DemandAccessRole, string> = {
  autor: "Agente autor",
  delegado: "Vínculo com a instituição autora",
  operacao: "Operação da plataforma",
  parte: "Parte de um processo de conexão",
  orgao: "Órgão com acompanhamento aberto",
  interessado: "Conexão aceita",
};

/** Mensagem curta para a falha ao abrir um documento ou o dossiê integral. */
export function documentAccessErrorMessage(status: number | undefined, code?: string): string {
  if (code === "uploads_unavailable" || status === 503) return "O armazenamento de arquivos não está disponível neste ambiente.";
  if (code === "dossier_not_available") return "O dossiê integral desta demanda ainda não foi gerado.";
  if (status === 404) return "Arquivo não encontrado ou sem acesso para esta conta.";
  return "Não foi possível abrir o arquivo agora.";
}
