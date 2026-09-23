import type { Metadata } from "next";
import { getPublicMapPosts } from "@/lib/server/public-data";
import { MapClient } from "@/components/app/public/MapClient";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata: Metadata = metadataForPage({
  title: "Mapa de Demandas",
  description:
    "Explore visualmente demandas, projetos e eventos geolocalizados no seu bairro pelo DM Conecta.",
  path: "/mapa",
});

export default async function MapPage() {
  const posts = await getPublicMapPosts();
  return <MapClient initialPosts={posts} />;
}
