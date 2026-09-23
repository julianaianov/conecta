import type { Metadata } from "next";
import { metadataForPage } from "./site.ts";

export function publicContentMetadata(
  record: { title?: string; description?: string; name?: string } | null,
  path: string,
): Metadata {
  if (!record) {
    return metadataForPage({
      title: "Conteúdo não encontrado",
      description: "Esta página não está disponível.",
      path,
      indexable: false,
    });
  }
  const title = record.title ?? record.name ?? "DM Conecta";
  return metadataForPage({
    title,
    description: record.description ?? `Conheça ${title} no DM Conecta.`,
    path,
  });
}
