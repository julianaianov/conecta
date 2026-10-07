import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo/site.ts";

const PRIVATE_PATHS = [
  "/admin",
  "/criar",
  "/login",
  "/register",
  "/recuperar-senha",
  "/meus-apoios",
  "/conexoes/nova",
  "/conexoes/",
  "/post/*/apoiar",
  "/cadastro-institucional",
  "/demandas/nova",
  "/demandas/*/editar",
  "/minhas-demandas",
  "/dossie/verificar",
  "/governo",
  "/oportunidades",
  "/perfil/editar",
  "/perfil/privacidade",
  "/meus-eventos",
  "/minhas-inscricoes",
  "/pautas",
  "/vinculos",
  "/processos",
  "/notificacoes",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["Googlebot", "OAI-SearchBot", "GPTBot"],
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
