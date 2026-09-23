"use client";

// Inscrição e cancelamento no evento (T25).
//
// Fonte: slide 9 — "Inscrever-se em eventos" é permissão de Membros da
// Comunidade. Quem não tem a permissão vê a explicação, não um botão que falha.
// Sem vaga, a inscrição vai para a fila de espera quando o organizador a
// habilitou; sem fila, o painel diz que as vagas acabaram.
//
// Confirmação por e-mail: a plataforma ainda não envia e-mail. O painel diz
// isso com todas as letras (InDevelopment), em vez de prometer o que não existe.

import { useCallback, useEffect, useState } from "react";
import { api, DemandRequestError } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { normalizeRole } from "@/lib/app/types";
import {
  EVENT_EMAIL_NOTIFICATIONS, EVENT_SIGNUP_ROLES, eventSeatsLabel, eventSignupStatusLabel,
  isEventOver, type EventSignupContext, type EventSignupSummary, type PublicEvent,
} from "@/lib/app/event";
import { Button } from "@/components/app/Button";
import { Card } from "@/components/app/ui";
import { InDevelopment } from "@/components/app/InDevelopment";

export function EventSignupPanel({ event, initialSummary }: { event: PublicEvent; initialSummary: EventSignupSummary }) {
  const { user, status: authStatus } = useAuth();
  const [context, setContext] = useState<EventSignupContext | null>(null);
  const [summary, setSummary] = useState<EventSignupSummary>(initialSummary);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.eventSignupContext(event.id);
      if (data) {
        setContext(data);
        setSummary(data.summary);
      }
    } catch {
      // Sem o contexto, o painel segue mostrando as contagens públicas.
    }
  }, [event.id, user]);

  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<{ summary: EventSignupSummary }>, done: string) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await action();
      setSummary(result.summary);
      setMessage(done);
      await load();
    } catch (err) {
      if (err instanceof DemandRequestError) setError(err.message);
      else setError("Não foi possível concluir. Tente de novo.");
    } finally {
      setBusy(false);
    }
  };

  const over = isEventOver(event);
  const canceled = event.status === "cancelado";
  const role = user ? normalizeRole(user.role, user.profileType) : null;
  const allowed = role ? (EVENT_SIGNUP_ROLES as readonly string[]).includes(role) : false;
  const signup = context?.signup ?? null;
  const active = signup && signup.status !== "cancelado" ? signup : null;

  return (
    <Card>
      <h2 className="text-base font-semibold" style={{ color: "var(--th-text)" }}>Inscrição</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
        {eventSeatsLabel(event)}
        {summary.waitlistCount ? ` · ${summary.waitlistCount} na lista de espera` : ""}
      </p>

      {canceled ? (
        <p className="mt-3 text-sm" style={{ color: "#b91c1c" }}>
          Este evento foi cancelado pelo organizador.
          {event.cancelReason ? ` Motivo: ${event.cancelReason}` : ""}
        </p>
      ) : over ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>Este evento já aconteceu.</p>
      ) : authStatus !== "authenticated" ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
          Entre na sua conta para se inscrever neste evento.
        </p>
      ) : context?.isOrganizer ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
          Você organiza este evento: a lista de inscritos fica em &ldquo;Meus eventos&rdquo;.
        </p>
      ) : !allowed ? (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
          Inscrever-se em eventos é uma permissão de Membros da Comunidade.
        </p>
      ) : active ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm" style={{ color: "var(--th-text)" }}>
            <strong>{eventSignupStatusLabel(active.status)}</strong>
            {active.status === "lista_de_espera" && active.waitlistPosition
              ? ` · ${active.waitlistPosition}º da fila`
              : ""}
          </p>
          <Button
            variant="ghost"
            loading={busy}
            onClick={() => run(() => api.cancelEventSignup(event.id), "Inscrição cancelada.")}
          >
            Cancelar inscrição
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block text-sm" style={{ color: "var(--th-muted)" }}>
            Observação para o organizador (opcional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-lg border p-2 text-sm"
              style={{ borderColor: "var(--th-border)", color: "var(--th-text)", background: "transparent" }}
            />
          </label>
          <Button
            loading={busy}
            onClick={() => run(
              () => api.signUpForEvent(event.id, note.trim() || undefined),
              summary.full && event.waitlistEnabled ? "Você entrou na lista de espera." : "Inscrição confirmada.",
            )}
            disabled={summary.full && !event.waitlistEnabled}
          >
            {summary.full && event.waitlistEnabled ? "Entrar na lista de espera" : "Quero me inscrever"}
          </Button>
          {summary.full && !event.waitlistEnabled ? (
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>
              As vagas acabaram e este evento não tem lista de espera.
            </p>
          ) : null}
        </div>
      )}

      {message ? <p className="mt-3 text-sm" style={{ color: "#15803d" }}>{message}</p> : null}
      {error ? <p className="mt-3 text-sm" style={{ color: "#b91c1c" }}>{error}</p> : null}

      <InDevelopment className="mt-4" title={EVENT_EMAIL_NOTIFICATIONS.label}>
        {EVENT_EMAIL_NOTIFICATIONS.note}
      </InDevelopment>
    </Card>
  );
}
