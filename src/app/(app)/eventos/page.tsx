// Agenda pública do território (T25): SSR e indexável. Os filtros são links e
// um formulário GET, então a página serve sem JavaScript.
//
// Fonte: slide 18 — eventos, oficinas culturais, mutirões, ações ambientais e
// aulas esportivas são conteúdos do território.

import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, SectionTitle } from "@/components/app/ui";
import { EventCard } from "@/components/app/event/EventParts";
import { getPublicEventTerritories, getPublicEvents } from "@/lib/server/public-data";
import { EVENT_KINDS, eventKindLabel, type EventAgendaFilter, type EventKind } from "@/lib/app/event";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? "";

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const params = await searchParams;
  const territory = first(params.territorio);
  return metadataForPage({
    title: territory ? `Eventos em ${territory} | DM Conecta` : "Agenda de eventos do território | DM Conecta",
    description: territory
      ? `Mutirões, oficinas, ações ambientais, aulas e eventos abertos em ${territory}.`
      : "Mutirões, oficinas culturais, ações ambientais, aulas esportivas e eventos abertos publicados por Agentes de Transformação e pelo Poder Público.",
    path: territory ? `/eventos?territorio=${encodeURIComponent(territory)}` : "/eventos",
  });
}

export default async function EventsAgendaPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams;
  const kind = first(params.tipo);
  const filter: EventAgendaFilter = {
    territory: first(params.territorio) || undefined,
    municipality: first(params.municipio) || undefined,
    uf: first(params.uf) || undefined,
    q: first(params.q) || undefined,
    when: first(params.quando) === "passados" ? "passados" : "proximos",
    ...(EVENT_KINDS.includes(kind as EventKind) ? { kind: kind as EventKind } : {}),
    limit: 50,
  };

  const [events, territories] = await Promise.all([
    getPublicEvents(filter),
    getPublicEventTerritories(),
  ]);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-4 p-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-4">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>
            Agenda do território
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
            Eventos, oficinas culturais, mutirões, ações ambientais e aulas esportivas publicados no DM Conecta.
            Membros da Comunidade podem se inscrever.
          </p>

          <form method="get" className="mt-4 grid gap-2 sm:grid-cols-4">
            <label className="text-xs sm:col-span-2" style={{ color: "var(--th-muted)" }}>
              Buscar
              <input
                type="search"
                name="q"
                defaultValue={filter.q ?? ""}
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
              />
            </label>
            <label className="text-xs" style={{ color: "var(--th-muted)" }}>
              Tipo
              <select
                name="tipo"
                defaultValue={filter.kind ?? ""}
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
              >
                <option value="">Todos</option>
                {EVENT_KINDS.map((value) => <option key={value} value={value}>{eventKindLabel(value)}</option>)}
              </select>
            </label>
            <label className="text-xs" style={{ color: "var(--th-muted)" }}>
              Quando
              <select
                name="quando"
                defaultValue={filter.when}
                className="mt-1 w-full rounded-lg border p-2 text-sm"
                style={{ borderColor: "var(--th-border)", background: "transparent", color: "var(--th-text)" }}
              >
                <option value="proximos">Próximos</option>
                <option value="passados">Já aconteceram</option>
              </select>
            </label>
            <input type="hidden" name="territorio" value={filter.territory ?? ""} />
            <button
              type="submit"
              className="rounded-lg px-3 py-2 text-sm font-semibold sm:col-span-4"
              style={{ background: "var(--th-primary, #1d4ed8)", color: "#fff" }}
            >
              Filtrar
            </button>
          </form>
        </Card>

        {events.length ? (
          <ul className="space-y-3">
            {events.map((event) => <EventCard key={event.id} event={event} />)}
          </ul>
        ) : (
          <EmptyState
            icon="calendar"
            title="Nenhum evento nesse recorte"
            hint="Ajuste os filtros ou volte depois: a agenda cresce com o que o território publica."
          />
        )}
      </div>

      <aside>
        <Card>
          <SectionTitle icon="location">Por território</SectionTitle>
          {territories.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {territories.slice(0, 25).map((territory) => (
                <li key={`${territory.territory}-${territory.municipality ?? ""}`}>
                  <Link
                    href={`/eventos?territorio=${encodeURIComponent(territory.territory)}`}
                    className="hover:underline"
                    style={{ color: "var(--th-text)" }}
                  >
                    {territory.territory}
                    <span style={{ color: "var(--th-muted)" }}>
                      {territory.municipality ? ` · ${territory.municipality}` : ""} ({territory.upcomingCount})
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
              Ainda não há eventos próximos publicados.
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}
