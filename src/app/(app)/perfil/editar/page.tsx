import type { Metadata } from "next";
import { ProfileEditClient } from "@/components/app/ProfileEditClient";
import { metadataForPage } from "@/lib/seo/site";

export const metadata: Metadata = metadataForPage({
  title: "Editar perfil - DM Conecta",
  description: "Área privada para criar e gerenciar o seu perfil no DM Conecta.",
  path: "/perfil/editar",
  indexable: false,
});

/** Tela única de edição do perfil (W36). Privada e fora do índice. */
export default function EditarPerfilPage() {
  return <ProfileEditClient />;
}
