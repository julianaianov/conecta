import type { Metadata } from "next";

export const metadata: Metadata = { title: "Meus eventos | DM Conecta", robots: { index: false, follow: false } };

export default function MyEventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
