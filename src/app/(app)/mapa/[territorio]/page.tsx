import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SmartMapClient } from "@/components/app/map/SmartMapClient";
import { getPublicDemandMap, getPublicMapTerritories, getPublicThemeIntelligence } from "@/lib/server/public-data";
import { emptyMapFilter, MAP_LEGEND, type MapFilterState } from "@/lib/app/map";
import type { MapTerritory } from "@/lib/app/types";
import { metadataForPage } from "@/lib/seo/site";

// Página pública do mapa por território (T20): SSR indexável, sem dado
// pessoal. A lista de demandas do recorte vem renderizada no HTML, por isso a
// página serve a quem não roda JavaScript e aos buscadores.

export const revalidate = 300;

function filterFor(territory: MapTerritory): MapFilterState {
  return {
    ...emptyMapFilter(),
    territory: territory.territory,
    municipality: territory.municipality ?? "",
    uf: territory.uf ?? "",
  };
}

async function findTerritory(slug: string): Promise<MapTerritory | null> {
  const territories = await getPublicMapTerritories();
  return territories.find((item) => item.slug === slug) ?? null;
}

function placeName(territory: MapTerritory): string {
  return [territory.territory, territory.municipality, territory.uf].filter(Boolean).join(", ");
}

export async function generateMetadata({ params }: { params: Promise<{ territorio: string }> }): Promise<Metadata> {
  const { territorio } = await params;
  const territory = await findTerritory(territorio);
  const path = `/mapa/${encodeURIComponent(territorio)}`;
  if (!territory) {
    return metadataForPage({
      title: "Território não encontrado — DM Conecta",
      description: "Este território ainda não tem demanda publicada no mapa do DM Conecta.",
      path,
      indexable: false,
    });
  }
  const place = placeName(territory);
  return metadataForPage({
    title: `Mapa de demandas em ${place} — DM Conecta`,
    description: `${territory.total} demanda${territory.total === 1 ? "" : "s"} publicada${territory.total === 1 ? "" : "s"} em ${place}: problemas urgentes, problemas urbanos, projetos sociais, ações ambientais e necessidades de patrocínio.`,
    path,
  });
}

export default async function TerritoryMapPage({ params }: { params: Promise<{ territorio: string }> }) {
  const { territorio } = await params;
  const territory = await findTerritory(territorio);
  if (!territory) notFound();

  const filter = filterFor(territory);
  const [view, territories, intelligence] = await Promise.all([
    getPublicDemandMap(filter),
    getPublicMapTerritories(),
    getPublicThemeIntelligence(filter),
  ]);
  const place = placeName(territory);
  const breakdown = MAP_LEGEND
    .map((legend) => ({ legend, total: legend.categories.reduce((sum, c) => sum + (territory.category[c] ?? 0), 0) }))
    .filter((item) => item.total > 0)
    .map((item) => `${item.legend.label}: ${item.total}`)
    .join(" · ");

  return (
    <SmartMapClient
      initialView={view}
      initialPosts={[]}
      territories={territories}
      initialFilter={filter}
      lockedTerritory={territory}
      initialIntelligence={intelligence}
      title={`Mapa de demandas em ${place}`}
      intro={`${territory.total} demanda${territory.total === 1 ? "" : "s"} publicada${territory.total === 1 ? "" : "s"} neste território.${breakdown ? ` ${breakdown}.` : ""}`}
    />
  );
}
