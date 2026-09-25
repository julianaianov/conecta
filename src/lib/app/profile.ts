// Perfil de atuação territorial ("Meu sinal").
//
// Espelho de services/post-service/src/routes/profiles.js
// (GET /api/posts/profiles/:userId/activity) e funções puras usadas pelo
// perfil. O perfil mostra atuação — demandas, sinais, apoios, selos e
// resultados — e não métricas sociais (identidade visual "Sinal do bairro",
// "O que muda na experiência", item 4).

import type { Connection, ConnectionParty, DemandCategory, DemandStatus, Post, SupportModality, SupportReceiptStatus } from "./types.ts";

export interface ProfileActivityDemand {
  id: string;
  title: string;
  category: DemandCategory;
  status: DemandStatus;
  district: string | null;
  municipality: string | null;
  uf: string | null;
  territory: string | null;
  publishedAt: string | null;
}

export interface ProfileActivitySupportGiven {
  id: string;
  demandId: string;
  demandTitle: string;
  demandStatus: DemandStatus;
  district: string | null;
  municipality: string | null;
  uf: string | null;
  modality: SupportModality | null;
  receiptStatus: SupportReceiptStatus;
  /** Só quando o apoiador tornou o valor público. */
  amountCents: number | null;
  createdAt: string | null;
}

export interface ProfileActivity {
  userId: string;
  demands: ProfileActivityDemand[];
  demandsTruncated: boolean;
  supportsReceived: {
    total: number;
    confirmed: number;
    byModality: { modality: SupportModality; count: number }[];
  };
  /** Só os apoios que o apoiador consentiu exibir com o nome. */
  supportsGiven: ProfileActivitySupportGiven[];
  supportsGivenTruncated: boolean;
}

/** Status em que a demanda já tem resultado ou prestação de contas publicada. */
export const RESULT_STATUSES: DemandStatus[] = ["concluida", "prestacao_de_contas", "encerrada"];

/** Resposta vazia: nada registrado. Nunca é preenchida com exemplo. */
export function emptyProfileActivity(userId: string): ProfileActivity {
  return {
    userId,
    demands: [],
    demandsTruncated: false,
    supportsReceived: { total: 0, confirmed: 0, byModality: [] },
    supportsGiven: [],
    supportsGivenTruncated: false,
  };
}

/** Aceita só o formato da rota; qualquer outra coisa vira `null`. */
export function normalizeProfileActivity(value: unknown): ProfileActivity | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ProfileActivity>;
  if (!Array.isArray(raw.demands) || !Array.isArray(raw.supportsGiven) || !raw.supportsReceived) return null;
  return {
    userId: String(raw.userId ?? ""),
    demands: raw.demands,
    demandsTruncated: raw.demandsTruncated === true,
    supportsReceived: {
      total: Number(raw.supportsReceived.total) || 0,
      confirmed: Number(raw.supportsReceived.confirmed) || 0,
      byModality: Array.isArray(raw.supportsReceived.byModality) ? raw.supportsReceived.byModality : [],
    },
    supportsGiven: raw.supportsGiven,
    supportsGivenTruncated: raw.supportsGivenTruncated === true,
  };
}

/** "Bairro, Cidade/UF" com o que existir; `null` quando não há local. */
export function placeLabel(parts: { district?: string | null; municipality?: string | null; uf?: string | null }): string | null {
  const city = [parts.municipality, parts.uf].filter(Boolean).join("/");
  const label = [parts.district, city].filter(Boolean).join(", ");
  return label || null;
}

/**
 * Sinais do perfil: posts que não são vitrine de demanda (a demanda aparece na
 * própria seção, com o status canônico).
 */
export function profileSignals(posts: Post[]): Post[] {
  return posts.filter((post) => !post.demandId);
}

export interface CollaborationLink {
  connectionId: string;
  party: ConnectionParty;
  type: Connection["type"];
  status: Connection["status"];
  /** Demanda ou publicação que originou a conexão, quando houver. */
  subject: { href: string; title: string } | null;
  updatedAt: string;
}

/**
 * Vínculos de colaboração do próprio perfil: conexões aceitas ou concluídas,
 * com a outra parte, o tipo e a demanda de origem. Sem foto e sem contador.
 */
export function collaborationLinks(connections: Connection[], userId: string): CollaborationLink[] {
  return connections
    .filter((connection) => connection.status === "accepted" || connection.status === "done")
    .filter((connection) => connection.from.userId === userId || connection.to.userId === userId)
    .map((connection) => {
      const party = connection.from.userId === userId ? connection.to : connection.from;
      let subject: CollaborationLink["subject"] = null;
      if (connection.demandId) {
        subject = { href: `/demandas/${encodeURIComponent(connection.demandId)}`, title: connection.postTitle || "Demanda vinculada" };
      } else if (connection.postId) {
        subject = { href: `/post/${encodeURIComponent(connection.postId)}`, title: connection.postTitle || "Publicação vinculada" };
      }
      return {
        connectionId: connection.id,
        party,
        type: connection.type,
        status: connection.status,
        subject,
        updatedAt: connection.updatedAt,
      };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}
