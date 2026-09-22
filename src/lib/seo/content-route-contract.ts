import type { Metadata } from "next";
import { metadataForPage } from "./site.ts";

export interface PublicContentRecord {
  title?: string;
  description?: string;
  name?: string;
  bio?: string | null;
}

export function publicContentMetadata(record: PublicContentRecord | null, path: string): Metadata {
  if (!record) {
    return metadataForPage({
      title: "Conteúdo não encontrado | DM Conecta",
      description: "Esta página pública não está disponível no DM Conecta.",
      path,
      indexable: false,
    });
  }

  const title = record.title ?? record.name ?? "DM Conecta";
  const description = record.description ?? record.bio ?? `Conheça ${title} no DM Conecta.`;
  return metadataForPage({
    title: `${title} | DM Conecta`,
    description,
    path,
  });
}
