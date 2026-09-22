import { FeedClient } from "@/components/app/public/FeedClient";
import { getPublicCommunities, getPublicPosts } from "@/lib/server/public-data";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Demandas e iniciativas locais — DM Conecta",
  description: "Acompanhe demandas, projetos e resultados públicos do território no DM Conecta.",
  path: "/feed",
});

export default async function FeedPage() {
  const [posts, communities] = await Promise.all([
    getPublicPosts({ limit: 20 }),
    getPublicCommunities(),
  ]);
  return <FeedClient initialPosts={posts} initialCommunities={communities} />;
}
