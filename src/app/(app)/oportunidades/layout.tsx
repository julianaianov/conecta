import type { Metadata } from "next";

export const metadata: Metadata = { title: "Oportunidades de apoio | DM Conecta", robots: { index: false, follow: false } };

/** Oportunidades de apoio para Parceiros e Poder Público (T15): privada e fora do índice. */
export default function OpportunitiesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
