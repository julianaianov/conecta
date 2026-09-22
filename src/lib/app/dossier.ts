// Dossiê da Demanda (T10): rótulos, caminhos e verificação no navegador.
// O PDF é gerado pelo post-service (services/post-service/src/dossier/); aqui
// só há o que as telas precisam para listar, baixar e verificar.

import type { DemandDossier, DemandDossierStatus, DemandDossierTrigger, DemandDossierVariant } from "./types.ts";

export const DOSSIER_TITLE = "Documento Oficial da Demanda — Dossiê da Demanda";

export const DOSSIER_TRIGGER_LABELS: Record<DemandDossierTrigger, string> = {
  envio: "Envio para análise",
  reenvio: "Reenvio para análise",
  publicacao: "Publicação",
  conclusao: "Conclusão da execução",
  prestacao_de_contas: "Prestação de contas e resultados",
};

export const DOSSIER_VARIANT_LABELS: Record<DemandDossierVariant, string> = {
  integral: "Versão integral",
  publica: "Versão pública",
};

export const DOSSIER_STATUS_LABELS: Record<DemandDossierStatus, string> = {
  pendente: "Sendo gerado",
  gerado: "Gerado",
  falhou: "Falha na geração",
  indisponivel: "Indisponível neste ambiente",
};

const HASH_RE = /^[0-9a-f]{64}$/;

/** SHA-256 em hexadecimal minúsculo, ou `null` se o texto não for um hash. */
export function normalizeDossierHash(value: string | null | undefined): string | null {
  const hash = String(value ?? "").trim().toLowerCase();
  return HASH_RE.test(hash) ? hash : null;
}

export const DOSSIER_VERIFY_PATH = "/dossie/verificar";

export function dossierVerifyPath(hash: string): string {
  return `${DOSSIER_VERIFY_PATH}/${encodeURIComponent(hash)}`;
}

/** Download público da versão da publicação (redireciona para o PDF). */
export function publicDossierDownloadPath(demandId: string): string {
  return `/api/posts/demands/${encodeURIComponent(demandId)}/dossie-publico`;
}

/** Versões para exibir: mais recentes primeiro; integral antes da pública. */
export function sortDossiers(list: DemandDossier[]): DemandDossier[] {
  return [...list].sort((a, b) => b.version - a.version || (a.variant === "integral" ? -1 : 1));
}

/** Há versão que o autor pode pedir para gerar de novo? */
export function canRegenerate(list: DemandDossier[]): boolean {
  return list.some((d) => d.status === "falhou" || d.status === "pendente" || d.status === "indisponivel");
}

/** Hash curto para leitura humana (primeiros e últimos 8). */
export function shortHash(hash: string | null | undefined): string {
  if (!hash) return "";
  return hash.length > 20 ? `${hash.slice(0, 8)}…${hash.slice(-8)}` : hash;
}

export function formatBytesShort(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** SHA-256 de um arquivo, calculado no navegador (o arquivo não sai do aparelho). */
export async function sha256OfFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
