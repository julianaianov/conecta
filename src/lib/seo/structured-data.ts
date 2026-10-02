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

/** Structured Data para a Landing Page (WebSite, Organization, FAQPage). */
export function landingPageJsonLd(url: string = "https://dmconecta.org"): JsonLd[] {
  const org: JsonLd = compact({
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${url}#organization`,
    name: "DM Conecta",
    url,
    logo: `${url}/logo.png`,
    description:
      "Infraestrutura Digital de Impacto Local. Identifica demandas reais das comunidades, estrutura projetos e conecta parceiros e poder público.",
    sameAs: [
      "https://www.instagram.com/dmconectainfradigital/",
      "https://play.google.com/store/apps/details?id=org.dmconecta.app",
    ],
  });

  const website: JsonLd = compact({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}#website`,
    url,
    name: "DM Conecta",
    description: "Infraestrutura Digital de Impacto Social e Ambiental",
    publisher: { "@id": `${url}#organization` },
  });

  const faq: JsonLd = compact({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: [
      {
        "@type": "Question",
        name: "O que é o DM Conecta?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "O DM Conecta é uma plataforma que identifica demandas sociais e ambientais nas comunidades, estrutura projetos e conecta agentes locais a parceiros e ao poder público para transformar recursos em impacto mensurável.",
        },
      },
      {
        "@type": "Question",
        name: "O DM Conecta cobra taxa ou comissão sobre os apoios?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Não. O DM Conecta não é intermediário financeiro nem cobra taxa ou porcentagem sobre valores destinados a projetos. A conexão entre apoiadores e projetos é direta e transparente.",
        },
      },
      {
        "@type": "Question",
        name: "Quem pode cadastrar um projeto?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Agentes de Transformação — organizações da sociedade civil, associações comunitárias, coletivos e lideranças locais com atuação comprovada no território.",
        },
      },
      {
        "@type": "Question",
        name: "Como o Poder Público participa?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Por meio de cadastro institucional validado. Órgãos e secretarias podem acompanhar demandas de seus territórios, articular respostas e conectar programas públicos a projetos comunitários.",
        },
      },
    ],
  });

  return [org, website, faq];
}
