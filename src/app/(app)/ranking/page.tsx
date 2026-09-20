import type { Metadata } from "next";
import { getPublicRanking } from "@/lib/server/public-data";
import { RankingClient } from "@/components/app/public/RankingClient";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata: Metadata = metadataForPage({
  title: "Ranking de Impacto",
  description:
    "Conheça os moradores, apoiadores e organizações que mais geram impacto comunitário no DM Conecta.",
  path: "/ranking",
});

export default async function RankingPage() {
  const ranking = await getPublicRanking();
  return <RankingClient initialRanking={ranking} />;
}
