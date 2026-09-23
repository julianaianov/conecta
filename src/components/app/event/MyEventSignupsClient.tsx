"use client";

// "Minhas inscrições" (T25): onde o Membro da Comunidade confere e cancela o
// que reservou. Enquanto não houver envio de e-mail, esta é a confirmação da
// inscrição — e a tela diz isso (governança, slide 26).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  EVENT_EMAIL_NOTIFICATIONS, eventKindLabel, eventPeriodLabel, eventPlaceLine,
  eventSignupStatusLabel, type MyEventSignup, type PublicEvent,
} from "@/lib/app/event";
import { Button } from "@/components/app/Button";
import { Card, EmptyState } from "@/components/app/ui";
import { InDevelopment } from "@/components/app/InDevelopment";

type Item = MyEventSignup & { event: PublicEvent | null };

export function MyEventSignupsClient() {
  const { status } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.myEventSignups());
      setError(null);
    } catch {
      setError("Não foi possível carregar suas inscrições.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (status === "authenticated") void load(); else setLoading(false); }, [load, status]);

  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <EmptyState icon="calendar" title="Entre na sua conta" hint="Minhas inscrições é uma área da conta." />
      </div>
    );
  }

  const cancel = async (eventId: string) => {
    setBusy(eventId);
    try {
      await api.cancelEventSignup(eventId);
      await load();
    } catch {
      setError("Não foi possível cancelar. Tente de novo.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Minhas inscrições</h1>
        <Button href="/eventos" variant="ghost">Ver a agenda</Button>
      </div>

      <InDevelopment title={EVENT_EMAIL_NOTIFICATIONS.label}>{EVENT_EMAIL_NOTIFICATIONS.note}</InDevelopment>

      {error ? <p className="text-sm" style={{ color: "#b91c1c" }}>{error}</p> : null}
      {loading ? (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Carregando…</p>
      ) : !items.length ? (
        <EmptyState icon="calendar" title="Você ainda não se inscreveu em nenhum evento" hint="A agenda do território mostra o que vem por aí." />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {item.event ? eventKindLabel(item.event.kind) : "Evento"} · {eventSignupStatusLabel(item.status)}
                  {item.status === "lista_de_espera" && item.waitlistPosition ? ` · ${item.waitlistPosition}º da fila` : ""}
                </p>
                <h2 className="text-base font-semibold" style={{ color: "var(--th-text)" }}>
                  {item.event ? (
                    <Link href={`/eventos/${encodeURIComponent(item.event.id)}`} className="hover:underline">
                      {item.event.title}
                    </Link>
                  ) : "Evento"}
                </h2>
                {item.event ? (
                  <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
                    {eventPeriodLabel(item.event.startsAt, item.event.endsAt)} · {item.event.locationName}
                    {eventPlaceLine(item.event) ? ` · ${eventPlaceLine(item.event)}` : ""}
                  </p>
                ) : null}
                {item.event?.status === "cancelado" ? (
                  <p className="mt-1 text-sm" style={{ color: "#b91c1c" }}>
                    O organizador cancelou este evento{item.event.cancelReason ? `: ${item.event.cancelReason}` : "."}
                  </p>
                ) : null}
                {item.status !== "cancelado" && item.event?.status === "publicado" ? (
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="ghost"
                    loading={busy === item.eventId}
                    onClick={() => cancel(item.eventId)}
                  >
                    Cancelar inscrição
                  </Button>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
