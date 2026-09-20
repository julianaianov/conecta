import type { Post, Profile } from "../app/types.ts";

import { absoluteUrl } from "./site.ts";

const CONTEXT = "https://schema.org";

export function postJsonLd(post: Post, url: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": CONTEXT,
    "@type": "DiscussionForumPosting",
    "@id": url,
    url,
    headline: post.title,
    description: post.description,
    datePublished: post.createdAt,
    author: {
      "@type": "Person",
      name: post.authorName,
      url: absoluteUrl(`/perfil/${post.authorId}`),
    },
    mainEntityOfPage: url,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: post.reactionsCount,
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: post.commentsCount,
      },
    ],
  };

  if (post.images.length > 0) {
    data.image = post.images.map((image) => absoluteUrl(image));
  }

  if (post.tags.length > 0) {
    data.keywords = post.tags.join(", ");
  }

  if (post.neighborhood || post.city) {
    data.contentLocation = {
      "@type": "Place",
      name: [post.neighborhood, post.city].filter(Boolean).join(", "),
    };
  }

  return data;
}

export function profileJsonLd(
  profile: Pick<Profile, "userId" | "name" | "bio" | "avatarUrl">,
  url: string,
): Record<string, unknown> {
  const person: Record<string, unknown> = {
    "@type": "Person",
    name: profile.name,
    url,
  };

  if (profile.bio) {
    person.description = profile.bio;
  }

  if (profile.avatarUrl) {
    person.image = absoluteUrl(profile.avatarUrl);
  }

  return {
    "@context": CONTEXT,
    "@type": "ProfilePage",
    "@id": url,
    url,
    mainEntity: person,
  };
}
