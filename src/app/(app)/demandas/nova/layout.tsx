import type { Metadata } from "next";

export const metadata: Metadata = { title: "Nova demanda | DM Conecta", robots: { index: false, follow: true } };

export default function NewDemandLayout({ children }: { children: React.ReactNode }) {
  return children;
}
