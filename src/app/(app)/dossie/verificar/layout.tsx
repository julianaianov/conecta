import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Verificar dossiê | DM Conecta",
  robots: { index: false, follow: false },
};

export default function DossierVerifyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
