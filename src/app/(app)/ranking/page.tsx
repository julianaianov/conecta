import { RankingClient } from "@/components/app/public/RankingClient";
import { normalizeRankingPeriod } from "@/lib/app/ranking";
import { getPublicRankings } from "@/lib/server/public-data";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Impacto local — DM Conecta",
  description: "Os sete indicadores públicos de engajamento e apoio do DM Conecta, calculados a partir de registros reais.",
  path: "/ranking",
});

export default async function RankingPage({
  searchParams,
}: { searchParams: Promise<{ periodo?: string }> }) {
  const { periodo } = await searchParams;
  const period = normalizeRankingPeriod(periodo);
  const data = await getPublicRankings(period, 10);
  return <RankingClient initial={data} />;
}
