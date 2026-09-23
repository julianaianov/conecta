import type { Metadata } from "next";
import { getPublicPosts, getPublicCommunities } from "@/lib/server/public-data";
import { FeedClient } from "@/components/app/public/FeedClient";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata: Metadata = metadataForPage({
  title: "Feed Comunitário",
  description:
    "Acompanhe demandas, projetos e acontecimentos do seu bairro em tempo real no DM Conecta.",
  path: "/feed",
});

export default async function FeedPage() {
  const [posts, communities] = await Promise.all([
    getPublicPosts(),
    getPublicCommunities(),
  ]);

  return <FeedClient initialPosts={posts} initialCommunities={communities} />;
}
