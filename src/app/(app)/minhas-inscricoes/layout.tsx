import type { Metadata } from "next";

export const metadata: Metadata = { title: "Minhas inscrições | DM Conecta", robots: { index: false, follow: false } };

export default function MySignupsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
