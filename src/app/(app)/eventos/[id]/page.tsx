// Página pública do evento (T25): SSR, indexável, com schema.org/Event.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicEventView } from "@/components/app/event/PublicEventView";
import { getPublicEvent } from "@/lib/server/public-data";
import { eventKindLabel, eventPeriodLabel, eventPlaceLine } from "@/lib/app/event";
import { absoluteUrl, metadataForPage } from "@/lib/seo/site";
import { publicContentMetadata } from "@/lib/seo/content-route-contract";
import { eventJsonLd } from "@/lib/seo/structured-data";

export const revalidate = 60;

function summary(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const path = `/eventos/${encodeURIComponent(id)}`;
  const data = await getPublicEvent(id);
  // Só evento publicado ou cancelado chega aqui (o post-service responde 404 ao rascunho).
  if (!data) return publicContentMetadata(null, path);
  const { event } = data;
  const where = eventPlaceLine(event);
  return metadataForPage({
    title: `${event.title} | DM Conecta`,
    description: summary(
      `${eventKindLabel(event.kind)} em ${event.locationName}${where ? `, ${where}` : ""}. `
      + `${eventPeriodLabel(event.startsAt, event.endsAt)}. ${event.description}`,
    ),
    path,
    type: "article",
    ...(event.photoUrl ? { image: event.photoUrl } : {}),
  });
}

export default async function PublicEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPublicEvent(id);
  if (!data) notFound();
  const url = absoluteUrl(`/eventos/${encodeURIComponent(data.event.id)}`);
  return (
    <>
      <PublicEventView event={data.event} signups={data.signups} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd(data.event, url)).replace(/</g, "\\u003c") }}
      />
    </>
  );
}
