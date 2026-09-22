import type { MetadataRoute } from "next";
import { getPublicDemandSummaries, getPublicPosts } from "../lib/server/public-data.ts";
import { absoluteUrl } from "../lib/seo/site.ts";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const STABLE_PUBLIC_PATHS = [
  "/",
  "/feed",
  "/mapa",
  "/ranking",
  "/conexoes",
  "/politica-de-privacidade",
  "/seguranca-infantil",
] as const;

function addUnique(entries: Map<string, MetadataRoute.Sitemap[number]>, path: string, lastModified?: string) {
  const url = absoluteUrl(path);
  if (!entries.has(url)) entries.set(url, { url, ...(lastModified ? { lastModified } : {}) });
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = new Map<string, MetadataRoute.Sitemap[number]>();
  for (const path of STABLE_PUBLIC_PATHS) addUnique(entries, path);

  try {
    const posts = await getPublicPosts({ limit: 5000 });
    for (const post of posts) {
      if (!post.id) continue;
      addUnique(entries, `/post/${encodeURIComponent(post.id)}`, post.createdAt);
      if (post.authorId) addUnique(entries, `/perfil/${encodeURIComponent(post.authorId)}`);
    }
  } catch {
    // Stable public URLs remain available even when the content service is down.
  }

  try {
    // Página pública da demanda (T09): só publicada em diante.
    for (const demand of await getPublicDemandSummaries()) {
      if (demand.id) addUnique(entries, `/demandas/${encodeURIComponent(demand.id)}`, demand.publishedAt ?? undefined);
    }
  } catch {
    // Idem: sem o serviço, o sitemap segue com as demais URLs.
  }

  return [...entries.values()];
}
