// Central de notificações (T-05-16; Modelo de Conexão §08 e §34; decisão 19).
// Espelho de services/*/src/notifications/index.js (notifications.test.mjs
// compara). O servidor guarda e decide; aqui só rótulos, ícones e a união das
// duas listas (post-service e user-service).

import type {
  AppNotification, NotificationFeed, NotificationKind, NotificationPreference, NotificationSource,
} from "./types";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "nova_demanda_compativel",
  "prazo_proximo",
  "prazo_vencido",
  "solicitacao_de_analise",
  "atualizacao_de_processo",
  "nova_mensagem",
  "novo_documento",
  "encaminhamento_recebido",
  "interesse_recebido",
  "conexao",
  "apoio",
  "resultado_registrado",
  "demanda_devolvida",
  "demanda_publicada",
  "convite_de_vinculo",
];

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, string> = {
  nova_demanda_compativel: "Nova demanda compatível",
  prazo_proximo: "Prazo próximo",
  prazo_vencido: "Prazo vencido",
  solicitacao_de_analise: "Solicitação de análise",
  atualizacao_de_processo: "Atualização de processo",
  nova_mensagem: "Nova mensagem",
  novo_documento: "Novo documento",
  encaminhamento_recebido: "Encaminhamento recebido",
  interesse_recebido: "Interesse recebido",
  conexao: "Conexão",
  apoio: "Apoio",
  resultado_registrado: "Resultado registrado",
  demanda_devolvida: "Demanda devolvida para ajustes",
  demanda_publicada: "Demanda publicada",
  convite_de_vinculo: "Convite de vínculo",
};

/** Chave do componente Icon por tipo. */
export const NOTIFICATION_KIND_ICONS: Record<NotificationKind, string> = {
  nova_demanda_compativel: "bolt",
  prazo_proximo: "clock",
  prazo_vencido: "clock",
  solicitacao_de_analise: "document",
  atualizacao_de_processo: "info",
  nova_mensagem: "message",
  novo_documento: "document",
  encaminhamento_recebido: "send",
  interesse_recebido: "star",
  conexao: "link",
  apoio: "volunteer",
  resultado_registrado: "trophy",
  demanda_devolvida: "edit",
  demanda_publicada: "check",
  convite_de_vinculo: "building",
};

/** A caixa de saída de e-mail existe, mas sem provedor nada é enviado (decisão 19). */
export const EMAIL_DELIVERY_NOTICE =
  "O aviso por e-mail está em desenvolvimento: as mensagens ficam registradas na caixa de saída e serão enviadas quando o envio estiver configurado. A central continua funcionando sem e-mail.";

const iso = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

/** Linha da API → notificação do portal, marcando a fonte. */
export function normalizeNotification(raw: Record<string, unknown>, source: NotificationSource): AppNotification {
  const kind = String(raw.kind ?? "") as NotificationKind;
  return {
    id: String(raw.id ?? ""),
    kind,
    source,
    scope: raw.scope === "organization" ? "organization" : "user",
    title: String(raw.title ?? NOTIFICATION_KIND_LABELS[kind] ?? "Aviso"),
    summary: iso(raw.summary),
    actorName: iso(raw.actorName),
    href: typeof raw.href === "string" && raw.href.startsWith("/") && !raw.href.startsWith("//") ? raw.href : null,
    demandId: iso(raw.demandId),
    processId: iso(raw.processId),
    connectionId: iso(raw.connectionId),
    createdAt: String(raw.createdAt ?? ""),
    readAt: iso(raw.readAt),
  };
}

type RawFeed = { notifications?: Record<string, unknown>[]; unreadCount?: number; hasMore?: boolean } | null;

/**
 * Junta as listas dos dois serviços (mais recente primeiro, até `limit`).
 * Fonte que falhou vem `null`: a outra aparece e `partial` avisa.
 */
export function mergeNotificationFeeds(posts: RawFeed, users: RawFeed, limit = 30): NotificationFeed {
  const items = [
    ...(posts?.notifications ?? []).map((n) => normalizeNotification(n, "posts")),
    ...(users?.notifications ?? []).map((n) => normalizeNotification(n, "users")),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || b.id.localeCompare(a.id));
  return {
    notifications: items.slice(0, limit),
    unreadCount: Number(posts?.unreadCount ?? 0) + Number(users?.unreadCount ?? 0),
    hasMore: items.length > limit || Boolean(posts?.hasMore) || Boolean(users?.hasMore),
    partial: posts == null || users == null,
  };
}

/** Ids a marcar como lidos, separados pelo serviço que guarda cada aviso. */
export function groupIdsBySource(items: Pick<AppNotification, "id" | "source">[]): Record<NotificationSource, string[]> {
  const out: Record<NotificationSource, string[]> = { posts: [], users: [] };
  for (const n of items) if (!out[n.source].includes(n.id)) out[n.source].push(n.id);
  return out;
}

/** Query de `GET /notifications`. */
export function buildNotificationQuery(options: {
  unreadOnly?: boolean; limit?: number; kinds?: NotificationKind[]; before?: string | null; institution?: boolean;
} = {}): string {
  const q = new URLSearchParams();
  if (options.unreadOnly) q.set("unread", "1");
  if (options.limit) q.set("limit", String(options.limit));
  if (options.kinds?.length) q.set("kind", options.kinds.join(","));
  if (options.before) q.set("before", options.before);
  if (options.institution) q.set("institution", "1");
  const s = q.toString();
  return s ? `?${s}` : "";
}

/** Preferências completas, na ordem dos tipos (sem registro = ligado). */
export function completePreferences(list: Partial<NotificationPreference>[] = []): NotificationPreference[] {
  const byKind = new Map(list.filter((p) => p.kind).map((p) => [p.kind as NotificationKind, p]));
  return NOTIFICATION_KINDS.map((kind) => ({
    kind,
    inApp: byKind.get(kind)?.inApp ?? true,
    email: byKind.get(kind)?.email ?? true,
  }));
}

/** Texto da linha do sino: quem agiu (se houver) + resumo. */
export function notificationLine(n: Pick<AppNotification, "actorName" | "summary">): string {
  return [n.actorName, n.summary].filter(Boolean).join(" ");
}
