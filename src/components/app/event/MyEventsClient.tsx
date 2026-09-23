"use client";

// Painel do organizador (T25): rascunho, publicação, edição, cancelamento e a
// lista de presença.
//
// Fonte: slides 8 e 11 — publicar conteúdo do território é ação de Agentes de
// Transformação e do Poder Público. Quem não tem a permissão vê a explicação.
// LGPD: a lista de inscritos traz o nome público, a categoria e o estado; nada
// de contato, avatar ou id de conta.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, DemandRequestError } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { normalizeRole } from "@/lib/app/types";
import {
  EVENT_ACCESSIBILITY, EVENT_EMAIL_NOTIFICATIONS, EVENT_KINDS, EVENT_ORGANIZER_ROLES, EVENT_PRICING,
  eventAccessibilityLabel, eventKindLabel, eventPeriodLabel, eventPricingLabelOf,
  eventSeatsLabel, eventSignupStatusLabel, eventStatusLabel,
  type EventAccessibility, type EventAttendee, type EventFieldErrors, type EventInput,
  type EventKind, type EventPricing, type OrganizerEvent,
} from "@/lib/app/event";
import { Button } from "@/components/app/Button";
import { Card, EmptyState, SectionTitle } from "@/components/app/ui";
import { InDevelopment } from "@/components/app/InDevelopment";

const EMPTY_FORM: EventInput = {
  kind: "evento",
  title: "",
  description: "",
  startsAt: "",
  endsAt: "",
  locationName: "",
  cep: "",
  street: "",
  addressNumber: "",
  district: "",
  municipality: "",
  uf: "",
  territory: "",
  latitude: null,
  longitude: null,
  audience: "",
  capacity: null,
  waitlistEnabled: false,
  pricing: "gratuito",
  priceCents: null,
  accessibility: [],
  accessibilityNotes: "",
};

/** `2026-11-14T13:00Z` → valor de um `<input type="datetime-local">`. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const toIso = (local: string): string | undefined => {
  if (!local) return undefined;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

function formOf(event: OrganizerEvent): EventInput {
  return {
    kind: event.kind,
    title: event.title ?? "",
    description: event.description ?? "",
    startsAt: toLocalInput(event.startsAt),
    endsAt: toLocalInput(event.endsAt),
    locationName: event.locationName ?? "",
    cep: event.cep ?? "",
    street: event.street ?? "",
    addressNumber: event.addressNumber ?? "",
    district: event.district ?? "",
    municipality: event.municipality ?? "",
    uf: event.uf ?? "",
    territory: event.territory ?? "",
    latitude: event.latitude,
    longitude: event.longitude,
    audience: event.audience ?? "",
    capacity: event.capacity,
    waitlistEnabled: event.waitlistEnabled,
    pricing: event.pricing,
    priceCents: event.priceCents,
    accessibility: event.accessibility,
    accessibilityNotes: event.accessibilityNotes ?? "",
  };
}

export function MyEventsClient() {
  const { user, status } = useAuth();
  const role = user ? normalizeRole(user.role, user.profileType) : null;
  const allowed = role ? (EVENT_ORGANIZER_ROLES as readonly string[]).includes(role) : false;

  const [events, setEvents] = useState<OrganizerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "novo" | null>(null);
  const [form, setForm] = useState<EventInput>(EMPTY_FORM);
  const [fields, setFields] = useState<EventFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [attendeesOf, setAttendeesOf] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<EventAttendee[]>([]);

  const load = useCallback(async () => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true);
    try {
      setEvents(await api.myEvents());
    } catch {
      setError("Não foi possível carregar seus eventos.");
    } finally {
      setLoading(false);
    }
  }, [allowed]);

  useEffect(() => { void load(); }, [load]);

  const current = useMemo(
    () => (editing && editing !== "novo" ? events.find((e) => e.id === editing) ?? null : null),
    [editing, events],
  );

  const set = <K extends keyof EventInput>(key: K, value: EventInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const toggleAccessibility = (feature: EventAccessibility) =>
    setForm((prev) => {
      const list = prev.accessibility ?? [];
      return {
        ...prev,
        accessibility: list.includes(feature) ? list.filter((f) => f !== feature) : [...list, feature],
      };
    });

  const handle = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await action();
      await load();
      return true;
    } catch (err) {
      if (err instanceof DemandRequestError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError("Não foi possível concluir. Tente de novo.");
      }
      return false;
    } finally {
      setBusy(false);
    }
  };

  const payload = (): EventInput => ({
    ...form,
    startsAt: toIso(form.startsAt ?? ""),
    endsAt: toIso(form.endsAt ?? ""),
    uf: form.uf ? form.uf.toUpperCase() : undefined,
    priceCents: form.pricing === "pago" ? form.priceCents ?? null : null,
    capacity: form.capacity ?? null,
  });

  const save = async () => {
    const ok = await handle(async () => {
      if (editing === "novo") await api.createEvent(payload());
      else if (editing) await api.updateEvent(editing, payload());
    });
    if (ok) setEditing(null);
  };

  const openAttendees = async (id: string) => {
    setAttendeesOf(id);
    setAttendees([]);
    try {
      setAttendees((await api.eventAttendees(id)).attendees);
    } catch {
      setError("Não foi possível carregar a lista de presença.");
    }
  };

  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <EmptyState icon="calendar" title="Entre na sua conta" hint="Meus eventos é uma área da conta." />
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-3xl p-4">
        <EmptyState
          icon="calendar"
          title="Publicar eventos é de Agentes de Transformação e do Poder Público"
          hint="Membros da Comunidade participam dos eventos do território: veja a agenda em /eventos."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Meus eventos</h1>
        <div className="flex gap-2">
          <Button href="/eventos" variant="ghost">Ver a agenda</Button>
          <Button icon="plus" onClick={() => { setEditing("novo"); setForm(EMPTY_FORM); setFields({}); }}>
            Novo evento
          </Button>
        </div>
      </div>

      <InDevelopment title={EVENT_EMAIL_NOTIFICATIONS.label}>
        {EVENT_EMAIL_NOTIFICATIONS.note} Avise os inscritos por outro canal quando algo mudar.
      </InDevelopment>

      {error ? <p className="text-sm" style={{ color: "#b91c1c" }}>{error}</p> : null}

      {editing ? (
        <Card>
          <SectionTitle icon="edit">
            {editing === "novo" ? "Novo evento" : `Editar: ${current?.title ?? ""}`}
          </SectionTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Tipo" error={fields.kind}>
              <select
                value={form.kind}
                onChange={(e) => set("kind", e.target.value as EventKind)}
                className="w-full rounded-lg border p-2 text-sm"
                style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
              >
                {EVENT_KINDS.map((kind) => <option key={kind} value={kind}>{eventKindLabel(kind)}</option>)}
              </select>
            </Field>
            <Field label="Título" error={fields.title}>
              <Input value={form.title ?? ""} onChange={(v) => set("title", v)} maxLength={200} />
            </Field>
            <Field label="Início" error={fields.startsAt}>
              <Input type="datetime-local" value={form.startsAt ?? ""} onChange={(v) => set("startsAt", v)} />
            </Field>
            <Field label="Término" error={fields.endsAt}>
              <Input type="datetime-local" value={form.endsAt ?? ""} onChange={(v) => set("endsAt", v)} />
            </Field>
            <Field label="Local" error={fields.locationName}>
              <Input value={form.locationName ?? ""} onChange={(v) => set("locationName", v)} maxLength={200} />
            </Field>
            <Field label="CEP" error={fields.cep}>
              <Input value={form.cep ?? ""} onChange={(v) => set("cep", v)} maxLength={9} />
            </Field>
            <Field label="Rua" error={fields.street}>
              <Input value={form.street ?? ""} onChange={(v) => set("street", v)} />
            </Field>
            <Field label="Número" error={fields.addressNumber}>
              <Input value={form.addressNumber ?? ""} onChange={(v) => set("addressNumber", v)} maxLength={30} />
            </Field>
            <Field label="Bairro" error={fields.district}>
              <Input value={form.district ?? ""} onChange={(v) => set("district", v)} />
            </Field>
            <Field label="Território" error={fields.territory}>
              <Input value={form.territory ?? ""} onChange={(v) => set("territory", v)} />
            </Field>
            <Field label="Município" error={fields.municipality}>
              <Input value={form.municipality ?? ""} onChange={(v) => set("municipality", v)} />
            </Field>
            <Field label="UF" error={fields.uf}>
              <Input value={form.uf ?? ""} onChange={(v) => set("uf", v.toUpperCase())} maxLength={2} />
            </Field>
            <Field label="Latitude" error={fields.latitude}>
              <Input
                type="number"
                value={form.latitude === null || form.latitude === undefined ? "" : String(form.latitude)}
                onChange={(v) => set("latitude", v === "" ? null : Number(v))}
              />
            </Field>
            <Field label="Longitude" error={fields.longitude}>
              <Input
                type="number"
                value={form.longitude === null || form.longitude === undefined ? "" : String(form.longitude)}
                onChange={(v) => set("longitude", v === "" ? null : Number(v))}
              />
            </Field>
            <Field label="Para quem é" error={fields.audience}>
              <Input value={form.audience ?? ""} onChange={(v) => set("audience", v)} maxLength={255} />
            </Field>
            <Field label="Vagas (deixe vazio para sem limite)" error={fields.capacity}>
              <Input
                type="number"
                value={form.capacity === null || form.capacity === undefined ? "" : String(form.capacity)}
                onChange={(v) => set("capacity", v === "" ? null : Number(v))}
              />
            </Field>
            <Field label="Inscrição" error={fields.pricing}>
              <select
                value={form.pricing}
                onChange={(e) => set("pricing", e.target.value as EventPricing)}
                className="w-full rounded-lg border p-2 text-sm"
                style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
              >
                {EVENT_PRICING.map((p) => <option key={p} value={p}>{eventPricingLabelOf(p)}</option>)}
              </select>
            </Field>
            {form.pricing === "pago" ? (
              <Field label="Valor em centavos (cobrança fora da plataforma)" error={fields.priceCents}>
                <Input
                  type="number"
                  value={form.priceCents === null || form.priceCents === undefined ? "" : String(form.priceCents)}
                  onChange={(v) => set("priceCents", v === "" ? null : Number(v))}
                />
              </Field>
            ) : null}
          </div>

          <label className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--th-muted)" }}>
            <input
              type="checkbox"
              checked={form.waitlistEnabled ?? false}
              onChange={(e) => set("waitlistEnabled", e.target.checked)}
              disabled={form.capacity === null || form.capacity === undefined}
            />
            Manter lista de espera quando as vagas acabarem
          </label>
          {fields.waitlistEnabled ? <p className="text-xs" style={{ color: "#b91c1c" }}>{fields.waitlistEnabled}</p> : null}

          <Field label="Descrição" error={fields.description} className="mt-3">
            <textarea
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              maxLength={5000}
              className="w-full rounded-lg border p-2 text-sm"
              style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
            />
          </Field>

          <fieldset className="mt-3">
            <legend className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Acessibilidade do local</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {EVENT_ACCESSIBILITY.map((feature) => (
                <label key={feature} className="flex items-center gap-1 text-xs" style={{ color: "var(--th-muted)" }}>
                  <input
                    type="checkbox"
                    checked={(form.accessibility ?? []).includes(feature)}
                    onChange={() => toggleAccessibility(feature)}
                  />
                  {eventAccessibilityLabel(feature)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button loading={busy} onClick={save}>Salvar</Button>
            <Button variant="ghost" onClick={() => setEditing(null)}>Fechar</Button>
          </div>
        </Card>
      ) : null}

      {loading ? (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Carregando…</p>
      ) : !events.length ? (
        <EmptyState icon="calendar" title="Você ainda não criou eventos" hint="Publique um mutirão, uma oficina ou uma ação no território." />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <li key={event.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                      {eventKindLabel(event.kind)} · {eventStatusLabel(event.status)}
                    </p>
                    <h2 className="text-base font-semibold" style={{ color: "var(--th-text)" }}>
                      {event.title || "Rascunho sem título"}
                    </h2>
                    <p className="text-sm" style={{ color: "var(--th-muted)" }}>
                      {event.startsAt && event.endsAt ? eventPeriodLabel(event.startsAt, event.endsAt) : "Sem data definida"}
                      {" · "}
                      {eventSeatsLabel(event)}
                    </p>
                    <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                      {event.signupsCount} inscritos · {event.waitlistCount} na fila · {event.attendedCount} presentes
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {event.status === "publicado" ? (
                      <Link href={`/eventos/${encodeURIComponent(event.id)}`} className="text-sm font-semibold hover:underline" style={{ color: "var(--th-primary, #1d4ed8)" }}>
                        Ver página
                      </Link>
                    ) : null}
                    {event.status !== "cancelado" ? (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(event.id); setForm(formOf(event)); setFields({}); }}>
                        Editar
                      </Button>
                    ) : null}
                    {event.status === "rascunho" ? (
                      <Button size="sm" loading={busy} onClick={() => handle(() => api.publishEvent(event.id))}>Publicar</Button>
                    ) : null}
                    {event.status !== "cancelado" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const reason = window.prompt("Por que o evento foi cancelado? Quem se inscreveu vai ver este motivo.");
                          if (reason && reason.trim()) void handle(() => api.cancelEvent(event.id, reason.trim()));
                        }}
                      >
                        Cancelar
                      </Button>
                    ) : null}
                    <Button size="sm" variant="ghost" onClick={() => openAttendees(event.id)}>
                      Lista de presença
                    </Button>
                  </div>
                </div>

                {attendeesOf === event.id ? (
                  <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--th-border)" }}>
                    <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                      A lista traz só o nome público, a categoria e o estado da inscrição (LGPD).
                    </p>
                    {!attendees.length ? (
                      <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>Ninguém se inscreveu ainda.</p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {attendees.map((attendee) => (
                          <li key={attendee.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                            <span style={{ color: "var(--th-text)" }}>
                              {attendee.name}
                              <span style={{ color: "var(--th-muted)" }}>
                                {" · "}{eventSignupStatusLabel(attendee.status)}
                                {attendee.waitlistPosition ? ` (${attendee.waitlistPosition}º)` : ""}
                              </span>
                              {attendee.note ? (
                                <span className="block text-xs" style={{ color: "var(--th-muted)" }}>{attendee.note}</span>
                              ) : null}
                            </span>
                            {attendee.status === "inscrito" ? (
                              <label className="flex items-center gap-1 text-xs" style={{ color: "var(--th-muted)" }}>
                                <input
                                  type="checkbox"
                                  checked={attendee.attended}
                                  onChange={async (e) => {
                                    const ok = await handle(() => api.markEventAttendance(event.id, attendee.id, e.target.checked));
                                    if (ok) await openAttendees(event.id);
                                  }}
                                />
                                Compareceu
                              </label>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, error, children, className = "" }: {
  label: string; error?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`} style={{ color: "var(--th-muted)" }}>
      <span className="font-semibold" style={{ color: "var(--th-text)" }}>{label}</span>
      <span className="mt-1 block">{children}</span>
      {error ? <span className="mt-1 block text-xs" style={{ color: "#b91c1c" }}>{error}</span> : null}
    </label>
  );
}

function Input({ value, onChange, type = "text", maxLength }: {
  value: string; onChange: (value: string) => void; type?: string; maxLength?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border p-2 text-sm"
      style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
    />
  );
}
