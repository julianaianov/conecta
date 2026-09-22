import { MapClient } from "@/components/app/public/MapClient";
import { getPublicMapPosts } from "@/lib/server/public-data";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Mapa de demandas e iniciativas — DM Conecta",
  description: "Explore demandas e iniciativas públicas por localização no mapa do DM Conecta.",
  path: "/mapa",
});

export default async function MapPage() {
  const posts = await getPublicMapPosts();
  return <MapClient initialPosts={posts} />;
}
