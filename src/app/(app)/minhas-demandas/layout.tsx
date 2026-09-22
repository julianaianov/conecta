import type { Metadata } from "next";

export const metadata: Metadata = { title: "Minhas demandas | DM Conecta", robots: { index: false, follow: false } };

export default function MyDemandsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
