import type { Metadata, Viewport } from "next";
import { DM_Mono, DM_Sans, Inter, Schibsted_Grotesk, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import { BrandLoading } from "@/components/app/BrandLoading";
import { absoluteUrl, metadataForPage, SITE_NAME, SITE_URL } from "@/lib/seo/site";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dmsans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const publicSans = Public_Sans({
  variable: "--font-public-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const HOME_TITLE = "DM Conecta — Conecte-se · Participe · Transforme";
// Apresentação Institucional, slides 1 e 2 (texto literal da fonte da verdade).
const HOME_DESCRIPTION =
  "Infraestrutura Digital de Impacto Local. O DM Conecta identifica demandas reais das comunidades, estrutura projetos e conecta empresas, organizações e poder público para transformar recursos em impacto local mensurável.";

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
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${dmMono.variable} ${inter.variable} ${schibstedGrotesk.variable} ${publicSans.variable} ${ibmPlexMono.variable}`}
    >
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
