import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicDemandView } from "@/components/app/demand/PublicDemandView";
import {
  getPublicDemand, getPublicDemandAccountability, getPublicDemandExecution,
  getPublicDemandInstitutional, getPublicDemandTimeline, getPublicDossierInfo,
} from "@/lib/server/public-data";
import { DEMAND_CATEGORY_LABELS } from "@/lib/app/types";
import { absoluteUrl, metadataForPage } from "@/lib/seo/site";
import { publicContentMetadata } from "@/lib/seo/content-route-contract";
import { demandJsonLd } from "@/lib/seo/structured-data";

export const revalidate = 60;

function summary(text: string, max = 200): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const path = `/demandas/${encodeURIComponent(id)}`;
  const demand = await getPublicDemand(id);
  // Só demanda publicada em diante chega aqui (o post-service responde 404 para as demais).
  if (!demand) return publicContentMetadata(null, path);
  const where = [demand.territory, demand.municipality, demand.uf].filter(Boolean).join(", ");
  return metadataForPage({
    title: `${demand.title} | DM Conecta`,
    description: summary(`${DEMAND_CATEGORY_LABELS[demand.category]}${where ? ` em ${where}` : ""}. ${demand.description}`),
    path,
    type: "article",
    ...(demand.photoUrl ? { image: demand.photoUrl } : {}),
  });
}

export default async function PublicDemandPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [demand, timeline, dossier, institutional, execution, accountability] = await Promise.all([
    getPublicDemand(id), getPublicDemandTimeline(id), getPublicDossierInfo(id), getPublicDemandInstitutional(id),
    getPublicDemandExecution(id), getPublicDemandAccountability(id),
  ]);
  if (!demand) notFound();
  const url = absoluteUrl(`/demandas/${encodeURIComponent(demand.id)}`);
  return (
    <>
      <PublicDemandView
        demand={demand}
        timeline={timeline}
        dossier={dossier}
        institutional={institutional}
        execution={execution}
        accountability={accountability}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(demandJsonLd(demand, url)).replace(/</g, "\\u003c") }} />
    </>
  );
}
