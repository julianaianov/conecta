import { RankingClient } from "@/components/app/public/RankingClient";
import { getPublicRanking } from "@/lib/server/public-data";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Impacto local — DM Conecta",
  description: "Veja pessoas e iniciativas que fazem avançar a colaboração local no DM Conecta.",
  path: "/ranking",
});

export default async function RankingPage() {
  const boards = await getPublicRanking();
  return <RankingClient initialBoards={boards} />;
}
