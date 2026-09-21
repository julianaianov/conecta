import type { Metadata } from "next";

export const SITE_URL = "https://dmconecta.org";
export const SITE_NAME = "DM Conecta";
export const DEFAULT_OG_IMAGE =
  "https://images.unsplash.com/photo-1483729557144-040aa7a153b0?w=1200&q=80";

export interface PageMetadataInput {
  title: string;
  description: string;
  path: string;
  indexable?: boolean;
  image?: string | null;
  type?: "website" | "article";
}

function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return "/";
  return `/${path.replace(/^\/+|\/+$/g, "")}`;
}

export function absoluteUrl(pathname: string): string {
  return new URL(normalizePath(pathname), SITE_URL).toString();
}

export function metadataForPage({
  title,
  description,
  path,
  indexable = true,
  image = DEFAULT_OG_IMAGE,
  type = "website",
}: PageMetadataInput): Metadata {
  const url = absoluteUrl(path);
  const imageUrl = image ? new URL(image, SITE_URL).toString() : undefined;

  return {
    title,
    description,
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "pt_BR",
      type,
      ...(imageUrl ? { images: [{ url: imageUrl, width: 1200, height: 630, alt: title }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(imageUrl ? { images: [imageUrl] } : {}),
    },
    robots: {
      index: indexable,
      follow: true,
    },
  };
}
