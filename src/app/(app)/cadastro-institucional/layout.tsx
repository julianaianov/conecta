import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cadastro institucional — DM Conecta",
  description: "Ficha institucional do Agente de Transformação e do Poder Público.",
  robots: { index: false, follow: false },
};

export default function InstitutionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
