import type { Metadata } from "next";

export const metadata: Metadata = { title: "Processos de conexão | DM Conecta", robots: { index: false, follow: false } };

export default function ProcessesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
