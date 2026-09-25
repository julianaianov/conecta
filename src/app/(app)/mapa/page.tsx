import { SmartMapClient } from "@/components/app/map/SmartMapClient";
import { getPublicDemandMap, getPublicMapTerritories, getPublicThemeIntelligence } from "@/lib/server/public-data";
import { emptyMapFilter, parseMapThemes } from "@/lib/app/map";
import { metadataForPage } from "@/lib/seo/site";

export const revalidate = 60;

export const metadata = metadataForPage({
  title: "Mapa inteligente de demandas — DM Conecta",
  description:
    "Visualização geográfica das demandas publicadas: problemas urgentes, problemas urbanos, projetos sociais, ações ambientais e necessidades de patrocínio, com leitura rápida para governo, empresas, imprensa e comunidade.",
  path: "/mapa",
});

// `?theme=iluminacao` (vários com vírgula) abre o mapa já recortado pelos eixos
// temáticos do slide 26 (T26); eixo desconhecido é ignorado.
export default async function MapPage({ searchParams }: { searchParams: Promise<{ theme?: string | string[] }> }) {
  const { theme } = await searchParams;
  const themes = parseMapThemes(theme);
  const filter = themes.length ? { ...emptyMapFilter(), theme: themes } : undefined;
  const [view, territories, intelligence] = await Promise.all([
    getPublicDemandMap(filter),
    getPublicMapTerritories(),
    getPublicThemeIntelligence(filter),
  ]);
  return (
    <SmartMapClient
      initialView={view}
      initialPosts={[]}
      territories={territories}
      initialFilter={filter}
      initialIntelligence={intelligence}
      title="Mapa inteligente"
      intro="Visualização geográfica das demandas publicadas. Use a legenda, os eixos temáticos, os filtros e os atalhos de leitura rápida para encontrar o que importa no território."
    />
  );
}
