"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { timeAgo } from "@/lib/app/format";
import { NOTIFICATION_KIND_ICONS, notificationLine } from "@/lib/app/notifications";
import type { AppNotification } from "@/lib/app/types";
import { Icon, type IconName } from "./Icon";

// Central persistente (T-05-16): os avisos e a leitura ficam no banco dos
// serviços, então valem em qualquer sessão e dispositivo. O Poder Público vê
// também os avisos do órgão (encaminhamento recebido etc.).
const REFRESH_MS = 60_000;

export function NotificationBell({ userId, government = false }: { userId: string | null; government?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const feed = await api.notifications({ limit: 20, institution: government });
      setItems(feed.notifications);
      setUnread(feed.unreadCount);
    } catch {
      /* serviços fora: o sino fica como estava */
    }
  }, [userId, government]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      setUnread(0);
      return;
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [userId, load]);

  const markRead = useCallback(
    (target: AppNotification[] | "all") => {
      const now = new Date().toISOString();
      const ids = target === "all" ? null : new Set(target.map((n) => n.id));
      const changed = items.filter((n) => !n.readAt && (!ids || ids.has(n.id))).length;
      setItems((list) => list.map((n) => (!n.readAt && (!ids || ids.has(n.id)) ? { ...n, readAt: now } : n)));
      setUnread((u) => (target === "all" ? 0 : Math.max(0, u - changed)));
      api.markNotificationsRead(target, { institution: government }).catch(() => load());
    },
    [items, government, load],
  );

  if (!userId) {
    return (
      <Link
        href="/login?next=%2Ffeed"
        className="flex h-9 w-9 items-center justify-center rounded-lg border"
        style={{ borderColor: "var(--th-border)", color: "var(--th-muted)", background: "var(--th-surface)" }}
        aria-label="Entrar para ver notificações"
      >
        <Icon name="bell" size={17} />
      </Link>
    );
  }

  /** A navegação fica a cargo do <Link>; aqui só marcamos como lida e fechamos. */
  function openItem(n: AppNotification) {
    if (!n.readAt) markRead([n]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:border-orange/40"
        style={{ borderColor: "var(--th-border)", color: "var(--th-muted)", background: "var(--th-surface)" }}
        aria-label={unread > 0 ? `Notificações, ${unread} não lidas` : "Notificações"}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "#f4841a" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-xl"
            style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: "var(--th-border)" }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                Notificações
              </p>
              {unread > 0 && (
                <button
                  type="button"
                  onClick={() => markRead("all")}
                  className="text-xs font-semibold text-orange transition-opacity hover:opacity-70"
                >
                  Marcar todas como lidas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <Icon name="bell" size={24} style={{ color: "var(--th-muted)" }} />
                  <p className="text-sm" style={{ color: "var(--th-muted)" }}>
                    Nenhuma notificação por enquanto.
                  </p>
                </div>
              ) : (
                items.map((n) => {
                  const isUnread = !n.readAt;
                  const line = notificationLine(n);
                  return (
                    <Link
                      key={`${n.source}-${n.id}`}
                      href={n.href ?? "/notificacoes"}
                      role="menuitem"
                      onClick={() => openItem(n)}
                      className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-[var(--th-card-alt)]"
                      style={{ borderColor: "var(--th-border)" }}
                    >
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}
                      >
                        <Icon name={(NOTIFICATION_KIND_ICONS[n.kind] ?? "bell") as IconName} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block text-sm font-semibold leading-snug" style={{ color: "var(--th-text)" }}>
                          {n.title}
                        </strong>
                        {line && (
                          <span className="block text-sm leading-snug" style={{ color: "var(--th-text)" }}>
                            {line}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                          {timeAgo(n.createdAt)}
                          {n.scope === "organization" ? " · para o órgão" : ""}
                        </span>
                      </span>
                      {isUnread && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: "#f4841a" }}
                          aria-label="Não lida"
                        />
                      )}
                    </Link>
                  );
                })
              )}
            </div>
            <Link
              href="/notificacoes"
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-center text-xs font-semibold text-orange hover:opacity-70"
            >
              Ver todas e preferências
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
