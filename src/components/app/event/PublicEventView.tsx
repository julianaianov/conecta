// Página pública do evento (T25), renderizada no servidor: quem lê sem
// JavaScript vê tudo o que precisa para comparecer. Só o painel de inscrição é
// cliente.

import Link from "next/link";
import { Card, SectionTitle } from "@/components/app/ui";
import { eventAddressLine, type EventSignupSummary, type PublicEvent } from "@/lib/app/event";
import { EventAccessibilityList, EventFacts, EventKindBadge, EventStatusBadge } from "./EventParts";
import { EventSignupPanel } from "./EventSignupPanel";

export function PublicEventView({ event, signups }: { event: PublicEvent; signups: EventSignupSummary }) {
  const address = eventAddressLine(event);
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <EventKindBadge event={event} />
            <EventStatusBadge status={event.status} />
          </div>
          <h1 className="mt-2 text-2xl font-bold" style={{ color: "var(--th-text)" }}>{event.title}</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            Organizado por {event.organizerName ?? "organizador do território"}
          </p>
          {event.status === "cancelado" ? (
            <p className="mt-3 rounded-lg p-3 text-sm" style={{ background: "rgba(220,38,38,0.08)", color: "#b91c1c" }}>
              Evento cancelado{event.cancelReason ? `: ${event.cancelReason}` : "."}
            </p>
          ) : null}
          <div className="mt-4">
            <EventFacts event={event} />
          </div>
          {address ? (
            <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
              <span className="font-semibold" style={{ color: "var(--th-text)" }}>Endereço: </span>
              {address}
            </p>
          ) : null}
          {event.priceNote ? (
            <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{event.priceNote}</p>
          ) : null}
        </Card>

        <Card>
          <SectionTitle icon="document">Sobre o evento</SectionTitle>
          <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--th-muted)" }}>
            {event.description}
          </p>
        </Card>

        <Card>
          <EventAccessibilityList event={event} />
          {!event.accessibility.length && !event.accessibilityNotes ? (
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>
              O organizador ainda não informou recursos de acessibilidade deste local.
            </p>
          ) : null}
        </Card>

        {event.demandId ? (
          <Card>
            <SectionTitle icon="flag">Demanda vinculada</SectionTitle>
            <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
              Este evento faz parte de uma demanda publicada no DM Conecta.
            </p>
            <Link
              href={`/demandas/${encodeURIComponent(event.demandId)}`}
              className="mt-2 inline-block text-sm font-semibold hover:underline"
              style={{ color: "var(--th-primary, #1d4ed8)" }}
            >
              {event.demandTitle ?? "Ver a demanda"}
            </Link>
          </Card>
        ) : null}
      </div>

      <aside className="space-y-4">
        <EventSignupPanel event={event} initialSummary={signups} />
        {event.postId ? (
          <Card>
            <p className="text-sm" style={{ color: "var(--th-muted)" }}>
              Este evento também aparece no pulso e no mapa do território.
            </p>
            <Link
              href={`/post/${encodeURIComponent(event.postId)}`}
              className="mt-2 inline-block text-sm font-semibold hover:underline"
              style={{ color: "var(--th-primary, #1d4ed8)" }}
            >
              Ver no pulso
            </Link>
          </Card>
        ) : null}
      </aside>
    </div>
  );
}
