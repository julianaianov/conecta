import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { BrandLoading } from "@/components/app/BrandLoading";
import { absoluteUrl, metadataForPage, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dmsans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const HOME_TITLE = "DM Conecta — Conecte-se, participe, transforme";
const HOME_DESCRIPTION =
  "Plataforma de impacto local. Mapeie demandas, conecte iniciativas ao poder público e a quem pode ajudar. Registre apoios, acompanhe avanços e transforme o território.";

export const metadata: Metadata = metadataForPage({
  title: HOME_TITLE,
  description: HOME_DESCRIPTION,
  path: "/",
});

const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/icon.svg"),
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}#website`,
      name: SITE_NAME,
      url: SITE_URL,
      inLanguage: "pt-BR",
      publisher: { "@id": `${SITE_URL}#organization` },
    },
  ],
};

export const viewport: Viewport = {
  themeColor: "#1b4f72",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${inter.variable}`}>
      <head>
        {/* Prevent theme flash on first load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_JSON_LD) }}
        />
      </head>
      <body className="antialiased">
        <BrandLoading />
        <div className="noise" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
