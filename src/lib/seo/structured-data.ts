import type { Post, Profile } from "../app/types.ts";
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

  return compact({
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": `${url}#post`,
    url,
    headline: post.title,
    description: post.description,
    datePublished: post.createdAt,
    author: {
      "@type": "Person",
      name: post.authorName,
      url: absoluteUrl(`/perfil/${post.authorId}`),
    },
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
