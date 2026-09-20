import type { Metadata } from "next";

export const SITE_URL = "https://dmconecta.org";
export const SITE_NAME = "DM Conecta";
export const DEFAULT_SITE_DESCRIPTION =
  "Conecte-se à sua comunidade, publique demandas e encontre iniciativas que transformam o lugar onde você vive.";

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, SITE_URL).toString();
}

type PageMetadataInput = {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
};

export function metadataForPage({
  title,
  description,
  path,
  indexable = true,
  image,
  type = "website",
  publishedTime,
}: PageMetadataInput): Metadata {
  const fullTitle = title === SITE_NAME || title.includes(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;
  const url = absoluteUrl(path);
  const imageUrl = image ? absoluteUrl(image) : undefined;

  return {
    metadataBase: new URL(SITE_URL),
    title: fullTitle,
    description,
    alternates: { canonical: url },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false },
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: "pt_BR",
      type,
      ...(publishedTime ? { publishedTime } : {}),
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    twitter: {
      card: imageUrl ? "summary_large_image" : "summary",
      title: fullTitle,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
  };
}
