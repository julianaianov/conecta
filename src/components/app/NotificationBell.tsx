"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { timeAgo } from "@/lib/app/format";
import type { AppNotification } from "@/lib/app/types";
import { Icon, type IconName } from "./Icon";

const READ_KEY = (userId: string) => `conecta:notif:read:${userId}`;

function loadRead(userId: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(READ_KEY(userId)) ?? "[]"));
  } catch {
    return new Set();
  }
}

function saveRead(userId: string, ids: Set<string>) {
  try {
    localStorage.setItem(READ_KEY(userId), JSON.stringify([...ids]));
  } catch {
    /* localStorage indisponível — segue sem persistir */
  }
}

export function NotificationBell({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    setRead(loadRead(userId));
    api.notifications(userId).then((list) => {
      if (alive) setItems(list);
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  const unread = items.filter((n) => !read.has(n.id)).length;

  const markRead = useCallback(
    (ids: string[]) => {
      setRead((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.add(id));
        saveRead(userId, next);
        return next;
      });
    },
    [userId],
  );

  /** A navegação fica a cargo do <Link>; aqui só marcamos como lida e fechamos. */
  function openItem(n: AppNotification) {
    markRead([n.id]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
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
                  onClick={() => markRead(items.map((n) => n.id))}
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
                  const isUnread = !read.has(n.id);
                  return (
                    <Link
                      key={n.id}
                      href={`/post/${n.postId}`}
                      role="menuitem"
                      onClick={() => openItem(n)}
                      className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-[var(--th-card-alt)]"
                      style={{ borderColor: "var(--th-border)" }}
                    >
                      <span
                        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                        style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}
                      >
                        <Icon name={n.icon as IconName} size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-snug" style={{ color: "var(--th-text)" }}>
                          <strong className="font-semibold">{n.actorName}</strong> {n.summary}
                        </span>
                        <span className="mt-0.5 block text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                      {isUnread && (
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{ background: "#f4841a" }}
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
