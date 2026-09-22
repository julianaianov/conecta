import type { Metadata } from "next";

export const metadata: Metadata = { title: "Atuação institucional | DM Conecta", robots: { index: false, follow: false } };

/** Área institucional do Poder Público (T13): privada e fora do índice. */
export default function InstitutionalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
