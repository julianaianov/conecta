import type { Metadata } from "next";
import { PrivacyClient } from "@/components/app/privacy/PrivacyClient";
import { metadataForPage } from "@/lib/seo/site";

export const metadata: Metadata = metadataForPage({
  title: "Privacidade — DM Conecta",
  description: "Consentimentos, exportação dos seus dados e eliminação da conta (LGPD).",
  path: "/perfil/privacidade",
  indexable: false,
});

/** Tela única de privacidade da conta (T24). Privada e fora do índice. */
export default function PrivacidadePage() {
  return <PrivacyClient />;
}
