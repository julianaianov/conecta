"use client";

/**
 * Central de notificações (T-05-16; Modelo de Conexão §08 "Central de
 * notificações" e §34 "O e-mail avisa. O DM Conecta organiza e registra o
 * processo."): lista persistida com filtro por tipo, só não lidas, marcar como
 * lidas e preferências de aviso no aplicativo e por e-mail.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { timeAgo } from "@/lib/app/format";
import {
  EMAIL_DELIVERY_NOTICE, NOTIFICATION_KINDS, NOTIFICATION_KIND_ICONS, NOTIFICATION_KIND_LABELS, notificationLine,
} from "@/lib/app/notifications";
import type { AppNotification, NotificationKind, NotificationPreference } from "@/lib/app/types";
import { AuthPrompt } from "./AuthPrompt";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { InDevelopment } from "./InDevelopment";
import { Card, EmptyState } from "./ui";
import { FormAlert } from "./demand/fields";
import { useEffectiveRole } from "./institution/useInstitutionAccess";

const PAGE = 30;

export function NotificationsCenter() {
  const { user, status } = useAuth();
  const { role } = useEffectiveRole();
  const institution = role === "government";
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [partial, setPartial] = useState(false);
  const [kind, setKind] = useState<NotificationKind | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreference[] | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsNotice, setPrefsNotice] = useState<string | null>(null);

  const load = useCallback(async (before: string | null = null) => {
    try {
      const feed = await api.notifications({
        limit: PAGE, unreadOnly, kinds: kind ? [kind] : undefined, before, institution,
      });
      setItems((list) => (before && list ? [...list, ...feed.notifications] : feed.notifications));
      setUnread(feed.unreadCount);
      setHasMore(feed.hasMore);
      setPartial(feed.partial);
      setError(null);
    } catch {
      setError("Não foi possível carregar as notificações.");
      setItems((list) => list ?? []);
    }
  }, [unreadOnly, kind, institution]);

  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);
  useEffect(() => {
    if (status !== "authenticated") return;
    api.notificationPreferences().then(setPrefs).catch(() => setPrefs(null));
  }, [status]);

  async function markRead(target: AppNotification[] | "all") {
    try {
      await api.markNotificationsRead(target, { institution });
    } catch {
      setError("Não foi possível marcar como lida.");
    }
    await load();
  }

  async function savePrefs(next: NotificationPreference[]) {
    setPrefs(next);
    setPrefsBusy(true);
    setPrefsNotice(null);
    try {
      setPrefs(await api.saveNotificationPreferences(next));
      setPrefsNotice("Preferências salvas.");
    } catch {
      setPrefsNotice("Não foi possível salvar as preferências.");
    } finally {
      setPrefsBusy(false);
    }
  }

  const toggle = (k: NotificationKind, field: "inApp" | "email") => {
    if (!prefs) return;
    void savePrefs(prefs.map((p) => (p.kind === k ? { ...p, [field]: !p[field] } : p)));
  };

  if (status === "unknown") return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Notificações</h1>
          <div className="mt-4"><AuthPrompt action="ver suas notificações" returnTo="/notificacoes" /></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Notificações</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Avisos sobre suas demandas, conexões, mensagens, apoios e processos, registrados na plataforma. A leitura vale em qualquer dispositivo.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" style={{ color: "var(--th-text)" }}>
          <span className="sr-only">Tipo</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as NotificationKind | "")}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--th-border)", background: "var(--th-surface)", color: "var(--th-text)" }}
          >
            <option value="">Todos os tipos</option>
            {NOTIFICATION_KINDS.map((k) => <option key={k} value={k}>{NOTIFICATION_KIND_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--th-text)" }}>
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          Só não lidas
        </label>
        <span className="ml-auto text-sm" style={{ color: "var(--th-muted)" }} aria-live="polite">
          {unread === 1 ? "1 não lida" : `${unread} não lidas`}
        </span>
        {unread > 0 && <Button size="sm" variant="outline" icon="check" onClick={() => markRead("all")}>Marcar todas como lidas</Button>}
      </div>

      {error && <FormAlert message={error} />}
      {partial && <FormAlert message="Parte das notificações não pôde ser carregada agora." />}

      {items === null ? (
        <div className="flex justify-center py-16"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
      ) : items.length === 0 ? (
        <EmptyState icon="bell" title="Nenhuma notificação" hint="Quando algo acontecer nas suas demandas, conexões ou processos, o aviso aparece aqui e no sino." />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={`${n.source}-${n.id}`}>
              <Card>
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}
                    aria-hidden="true"
                  >
                    <Icon name={(NOTIFICATION_KIND_ICONS[n.kind] ?? "bell") as IconName} size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
                      {NOTIFICATION_KIND_LABELS[n.kind] ?? n.kind}{n.scope === "organization" ? " · para o órgão" : ""}
                    </p>
                    {n.href ? (
                      <Link href={n.href} onClick={() => { if (!n.readAt) void api.markNotificationsRead([n], { institution }); }}
                        className="text-sm font-semibold underline-offset-2 hover:underline" style={{ color: "var(--th-text)" }}>
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{n.title}</p>
                    )}
                    {notificationLine(n) && <p className="text-sm" style={{ color: "var(--th-text)" }}>{notificationLine(n)}</p>}
                    <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
                      {timeAgo(n.createdAt)}{n.readAt ? " · lida" : ""}
                    </p>
                  </div>
                  {!n.readAt && (
                    <Button size="sm" variant="outline" onClick={() => markRead([n])}>Marcar como lida</Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {hasMore && items && items.length > 0 && (
        <div className="flex justify-center">
          <Button size="sm" variant="outline" onClick={() => load(items[items.length - 1].createdAt)}>Carregar mais</Button>
        </div>
      )}

      <section aria-labelledby="preferencias" className="pt-4">
        <h2 id="preferencias" className="mb-2 text-sm font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
          Preferências de aviso
        </h2>
        <InDevelopment title="E-mail em desenvolvimento">{EMAIL_DELIVERY_NOTICE}</InDevelopment>
        {prefsNotice && <div className="mt-2"><FormAlert message={prefsNotice} tone={prefsNotice === "Preferências salvas." ? "success" : undefined} /></div>}
        {prefs === null ? (
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Preferências indisponíveis no momento.</p>
        ) : (
          <table className="mt-3 w-full text-sm" style={{ color: "var(--th-text)" }}>
            <thead>
              <tr className="text-left text-xs uppercase" style={{ color: "var(--th-muted)" }}>
                <th scope="col" className="py-2">Tipo</th>
                <th scope="col" className="py-2 text-center">No aplicativo</th>
                <th scope="col" className="py-2 text-center">Por e-mail</th>
              </tr>
            </thead>
            <tbody>
              {prefs.map((p) => (
                <tr key={p.kind} className="border-t" style={{ borderColor: "var(--th-border)" }}>
                  <th scope="row" className="py-2 text-left font-normal">{NOTIFICATION_KIND_LABELS[p.kind]}</th>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={p.inApp} disabled={prefsBusy} onChange={() => toggle(p.kind, "inApp")}
                      aria-label={`${NOTIFICATION_KIND_LABELS[p.kind]} no aplicativo`} />
                  </td>
                  <td className="py-2 text-center">
                    <input type="checkbox" checked={p.email} disabled={prefsBusy} onChange={() => toggle(p.kind, "email")}
                      aria-label={`${NOTIFICATION_KIND_LABELS[p.kind]} por e-mail`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
