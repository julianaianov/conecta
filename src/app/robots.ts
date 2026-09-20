import type { MetadataRoute } from "next";
import { SITE_URL } from "../lib/seo/site.ts";

export default function robots(): MetadataRoute.Robots {
  const privateDisallows = [
    "/admin",
    "/admin/",
    "/criar",
    "/criar/",
    "/meus-apoios",
    "/meus-apoios/",
    "/perfil",
    "/conexoes/nova",
    "/conexoes/nova/",
    "/api/",
    "/login",
    "/register",
    "/auth/",
    "/post/*/apoiar",
  ];

  return {
    rules: [
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "OAI-SearchBot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: privateDisallows,
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: privateDisallows,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
