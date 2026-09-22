import { ConnectionsClient } from "@/components/app/public/ConnectionsClient";
import { getPublicCommunities } from "@/lib/server/public-data";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Conexões e frentes de atuação — DM Conecta",
  description: "Conheça frentes de atuação e caminhos de colaboração local no DM Conecta.",
  path: "/conexoes",
});

export default async function ConnectionsPage() {
  const communities = await getPublicCommunities();
  return <ConnectionsClient initialCommunities={communities} />;
}
