import type { Metadata } from "next";
import { getPublicCommunities } from "@/lib/server/public-data";
import { ConnectionsClient } from "@/components/app/public/ConnectionsClient";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata: Metadata = metadataForPage({
  title: "Conexões e Grupos Comunitários",
  description:
    "Descubra grupos e conexões locais para unir forças, apoiar projetos e transformar o bairro no DM Conecta.",
  path: "/conexoes",
});

export default async function ConnectionsPage() {
  const communities = await getPublicCommunities();
  return <ConnectionsClient initialCommunities={communities} />;
}
