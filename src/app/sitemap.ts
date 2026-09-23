import type { MetadataRoute } from "next";
import { absoluteUrl } from "../lib/seo/site.ts";
import { getPublicPosts } from "../lib/server/public-data.ts";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const stableRoutes: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl("/"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: absoluteUrl("/feed"),
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/mapa"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/ranking"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/conexoes"),
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/politica-de-privacidade"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: absoluteUrl("/seguranca-infantil"),
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];

  const seenUrls = new Set<string>(stableRoutes.map((r) => r.url));
  const dynamicEntries: MetadataRoute.Sitemap = [];

  try {
    const posts = await getPublicPosts({ limit: 5000 });
    for (const post of posts) {
      if (!post.id) continue;
      const postUrl = absoluteUrl(`/post/${post.id}`);
      if (!seenUrls.has(postUrl)) {
        seenUrls.add(postUrl);
        dynamicEntries.push({
          url: postUrl,
          lastModified: post.createdAt ? new Date(post.createdAt) : new Date(),
          changeFrequency: "daily",
          priority: 0.8,
        });
      }

      if (post.authorId) {
        const authorUrl = absoluteUrl(`/perfil/${post.authorId}`);
        if (!seenUrls.has(authorUrl)) {
          seenUrls.add(authorUrl);
          dynamicEntries.push({
            url: authorUrl,
            lastModified: new Date(),
            changeFrequency: "weekly",
            priority: 0.6,
          });
        }
      }
    }
  } catch {
    // Mantém as rotas estáveis públicas se a API falhar
  }

  return [...stableRoutes, ...dynamicEntries];
}
