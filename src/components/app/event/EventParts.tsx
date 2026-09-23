// Peças de leitura do evento (T25), sem estado: servem ao SSR da agenda e da
// página pública e à tela do organizador. Nada aqui mostra dado de inscrito.

import Link from "next/link";
import { Icon } from "@/components/app/Icon";
import {
  eventAccessibilityLabel, eventKindLabel, eventPeriodLabel, eventPlaceLine,
  eventPriceLabel, eventSeatsLabel, eventStatusLabel,
  type PublicEvent,
} from "@/lib/app/event";

const KIND_ICON = {
  evento: "calendar",
  oficina_cultural: "school",
  mutirao: "volunteer",
  acao_ambiental: "leaf",
  aula_esportiva: "trophy",
} as const;

export function EventKindBadge({ event }: { event: Pick<PublicEvent, "kind"> }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: "var(--th-surface-2, rgba(0,0,0,0.05))", color: "var(--th-text)" }}
    >
      <Icon name={KIND_ICON[event.kind] ?? "calendar"} size={12} aria-hidden />
      {eventKindLabel(event.kind)}
    </span>
  );
}

export function EventStatusBadge({ status }: { status: PublicEvent["status"] }) {
  if (status === "publicado") return null;
  const canceled = status === "cancelado";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{
        background: canceled ? "rgba(220,38,38,0.12)" : "rgba(100,116,139,0.14)",
        color: canceled ? "#b91c1c" : "var(--th-muted)",
      }}
    >
      {eventStatusLabel(status)}
    </span>
  );
}

/** Linha de fatos do evento: quando, onde, para quem, vagas e cobrança. */
export function EventFacts({ event }: { event: PublicEvent }) {
  const place = eventPlaceLine(event);
  return (
    <dl className="grid gap-2 text-sm" style={{ color: "var(--th-muted)" }}>
      <div className="flex items-start gap-2">
        <dt className="sr-only">Quando</dt>
        <Icon name="clock" size={16} aria-hidden />
        <dd>{eventPeriodLabel(event.startsAt, event.endsAt)}</dd>
      </div>
      <div className="flex items-start gap-2">
        <dt className="sr-only">Onde</dt>
        <Icon name="location" size={16} aria-hidden />
        <dd>
          {event.locationName}
          {place ? <span> · {place}</span> : null}
        </dd>
      </div>
      <div className="flex items-start gap-2">
        <dt className="sr-only">Para quem</dt>
        <Icon name="users" size={16} aria-hidden />
        <dd>{event.audience}</dd>
      </div>
      <div className="flex items-start gap-2">
        <dt className="sr-only">Vagas</dt>
        <Icon name="check" size={16} aria-hidden />
        <dd>{eventSeatsLabel(event)}</dd>
      </div>
      <div className="flex items-start gap-2">
        <dt className="sr-only">Inscrição</dt>
        <Icon name="payments" size={16} aria-hidden />
        <dd>{eventPriceLabel(event)}</dd>
      </div>
    </dl>
  );
}

export function EventAccessibilityList({ event }: { event: PublicEvent }) {
  if (!event.accessibility.length && !event.accessibilityNotes) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Acessibilidade</h2>
      {event.accessibility.length ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {event.accessibility.map((feature) => (
            <li
              key={feature}
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ background: "rgba(34,197,94,0.12)", color: "#15803d" }}
            >
              {eventAccessibilityLabel(feature)}
            </li>
          ))}
        </ul>
      ) : null}
      {event.accessibilityNotes ? (
        <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{event.accessibilityNotes}</p>
      ) : null}
    </section>
  );
}

/** Cartão da agenda. Serve ao SSR: é um link, sem JavaScript. */
export function EventCard({ event }: { event: PublicEvent }) {
  return (
    <li className="rounded-xl border p-4" style={{ borderColor: "var(--th-border)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <EventKindBadge event={event} />
        <EventStatusBadge status={event.status} />
        <span className="text-xs" style={{ color: "var(--th-muted)" }}>
          {eventPeriodLabel(event.startsAt, event.endsAt)}
        </span>
      </div>
      <h3 className="mt-2 text-base font-semibold" style={{ color: "var(--th-text)" }}>
        <Link href={`/eventos/${encodeURIComponent(event.id)}`} className="hover:underline">
          {event.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
        {event.locationName}
        {eventPlaceLine(event) ? ` · ${eventPlaceLine(event)}` : ""}
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        {eventSeatsLabel(event)} · {eventPriceLabel(event)}
      </p>
      {event.demandId ? (
        <p className="mt-2 text-xs">
          <Link href={`/demandas/${encodeURIComponent(event.demandId)}`} className="hover:underline" style={{ color: "var(--th-primary, #1d4ed8)" }}>
            Faz parte da demanda {event.demandTitle ?? "vinculada"}
          </Link>
        </p>
      ) : null}
    </li>
  );
}
