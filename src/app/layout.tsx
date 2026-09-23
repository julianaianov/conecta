import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter } from "next/font/google";
import { BrandLoading } from "@/components/app/BrandLoading";
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

export const metadata: Metadata = {
  title: "DM Conecta — Conecte-se, participe, transforme",
  description:
    "Rede social de impacto local. Mapeie demandas, conecte suas conexões ao poder público e a quem pode ajudar. Apoie causas com voluntariado, doações e patrocínios.",
  metadataBase: new URL("https://dmconecta.org"),
  alternates: {
    canonical: "https://dmconecta.org",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "DM Conecta — Conecte-se, participe, transforme",
    description:
      "Rede social de impacto local que conecta moradores, associações, poder público e iniciativa privada.",
    url: "https://dmconecta.org",
    siteName: "DM Conecta",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1483729557144-040aa7a153b0?w=1200&q=80",
        width: 1200,
        height: 630,
        alt: "DM Conecta — bairros conectados",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DM Conecta — Conecte-se, participe, transforme",
    description:
      "Rede social de impacto local que conecta moradores, associações, poder público e iniciativa privada.",
    images: [
      "https://images.unsplash.com/photo-1483729557144-040aa7a153b0?w=1200&q=80",
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#1b4f72",
};

const rootJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://dmconecta.org/#organization",
      name: "DM Conecta",
      url: "https://dmconecta.org",
      logo: "https://dmconecta.org/icon.png",
      description:
        "Rede comunitária de impacto local que conecta moradores, coletivos, poder público e empresas para transformar bairros.",
    },
    {
      "@type": "WebSite",
      "@id": "https://dmconecta.org/#website",
      url: "https://dmconecta.org",
      name: "DM Conecta",
      publisher: {
        "@id": "https://dmconecta.org/#organization",
      },
      inLanguage: "pt-BR",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${dmSans.variable} ${inter.variable}`}>
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(rootJsonLd) }}
        />
        {/* Prevent theme flash on first load */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
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
