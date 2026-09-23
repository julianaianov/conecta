import type { Post, Profile, PublicDemand } from "../app/types.ts";
import type { PublicEvent } from "../app/event.ts";
import { absoluteUrl } from "./site.ts";

type JsonLd = Record<string, unknown>;

function mediaUrl(value: string): string {
  return new URL(value, "https://dmconecta.org").toString();
}

function compact(input: JsonLd): JsonLd {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value == null) return false;
      if (Array.isArray(value)) return value.length > 0;
      return value !== "";
    }),
  );
}

export function postJsonLd(post: Post, url: string): JsonLd {
  const images = (post.images ?? []).filter(Boolean).map(mediaUrl);
  const locationName = [post.neighborhood, post.city].filter(Boolean).join(", ");
  const author = compact({
    "@type": "Person",
    name: post.authorName,
    ...(post.authorId ? { url: absoluteUrl(`/perfil/${post.authorId}`) } : {}),
  });

  return compact({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${url}#post`,
    url,
    headline: post.title,
    description: post.description,
    datePublished: post.createdAt,
    author,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(images.length ? { image: images } : {}),
    ...(post.tags.length ? { keywords: post.tags.join(", ") } : {}),
    ...(locationName ? { contentLocation: { "@type": "Place", name: locationName } } : {}),
  });
}

export function profileJsonLd(profile: Profile, url: string): JsonLd {
  const person = compact({
    "@type": "Person",
    "@id": `${url}#person`,
    name: profile.name,
    url,
    description: profile.bio,
    image: profile.avatarUrl ? mediaUrl(profile.avatarUrl) : undefined,
    jobTitle: profile.role,
  });

  return compact({
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    url,
    name: `${profile.name} — DM Conecta`,
    mainEntity: person,
  });
}

/** Demanda publicada (T09): só dados da projeção pública. */
export function demandJsonLd(demand: PublicDemand, url: string): JsonLd {
  const locationName = [demand.territory, demand.municipality, demand.uf].filter(Boolean).join(", ");
  return compact({
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#demanda`,
    url,
    headline: demand.title,
    description: demand.description,
    datePublished: demand.publishedAt,
    dateModified: demand.updatedAt,
    image: demand.photoUrl ? mediaUrl(demand.photoUrl) : undefined,
    author: compact({
      "@type": "Organization",
      name: demand.authorName,
      url: absoluteUrl(`/perfil/${demand.authorId}`),
    }),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(locationName ? { contentLocation: { "@type": "Place", name: locationName } } : {}),
  });
}

/**
 * Evento do território (T25) como schema.org/Event: data, local e inscrição.
 * `offers` declara o valor **informado pelo organizador**; a plataforma não
 * processa pagamento (decisão 5), então a URL da oferta é a própria página.
 */
export function eventJsonLd(event: PublicEvent, url: string): JsonLd {
  const address = compact({
    "@type": "PostalAddress",
    streetAddress: [event.street, event.addressNumber].filter(Boolean).join(", "),
    addressLocality: event.municipality ?? undefined,
    addressRegion: event.uf ?? undefined,
    postalCode: event.cep ?? undefined,
    addressCountry: "BR",
  });
  return compact({
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${url}#evento`,
    url,
    name: event.title,
    description: event.description,
    startDate: event.startsAt,
    endDate: event.endsAt,
    eventStatus: event.status === "cancelado"
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: event.photoUrl ? mediaUrl(event.photoUrl) : undefined,
    location: compact({
      "@type": "Place",
      name: event.locationName,
      address,
      ...(event.latitude !== null && event.longitude !== null
        ? { geo: { "@type": "GeoCoordinates", latitude: event.latitude, longitude: event.longitude } }
        : {}),
    }),
    organizer: compact({
      "@type": "Organization",
      name: event.organizerName ?? undefined,
      url: absoluteUrl(`/perfil/${event.organizerId}`),
    }),
    ...(event.capacity !== null ? { maximumAttendeeCapacity: event.capacity } : {}),
    offers: compact({
      "@type": "Offer",
      url,
      price: event.pricing === "gratuito" ? 0 : (event.priceCents ?? 0) / 100,
      priceCurrency: "BRL",
      availability: event.seatsLeft === 0 ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
    }),
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
  });
}
