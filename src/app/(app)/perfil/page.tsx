import type { Metadata } from "next";
import { MyProfileClient } from "@/components/app/MyProfileClient";
import { metadataForPage } from "@/lib/seo/site";

export const metadata: Metadata = metadataForPage({
  title: "Meu perfil — DM Conecta",
  description: "Área privada para acompanhar seu perfil e sua atuação no DM Conecta.",
  path: "/perfil",
  indexable: false,
});

export default function MyProfilePage() {
  return <MyProfileClient />;
}
