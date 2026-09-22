import { SmartMapClient } from "@/components/app/map/SmartMapClient";
import { getPublicDemandMap, getPublicMapTerritories } from "@/lib/server/public-data";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Mapa inteligente de demandas — DM Conecta",
  description:
    "Visualização geográfica das demandas publicadas: problemas urgentes, problemas urbanos, projetos sociais, ações ambientais e necessidades de patrocínio, com leitura rápida para governo, empresas, imprensa e comunidade.",
  path: "/mapa",
});

export default async function MapPage() {
  const [view, territories] = await Promise.all([
    getPublicDemandMap(),
    getPublicMapTerritories(),
  ]);
  return (
    <SmartMapClient
      initialView={view}
      initialPosts={[]}
      territories={territories}
      title="Mapa inteligente"
      intro="Visualização geográfica das demandas publicadas. Use a legenda, os filtros e os atalhos de leitura rápida para encontrar o que importa no território."
    />
  );
}
