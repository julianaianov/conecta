import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter } from "next/font/google";
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
    "Rede social de impacto local. Mapeie demandas, conecte sua comunidade ao poder público e a quem pode ajudar. Apoie causas com voluntariado, doações e patrocínios.",
  metadataBase: new URL("https://dmconecta.org"),
  openGraph: {
    title: "DM Conecta — Conecte-se, participe, transforme",
    description: "Rede social de impacto local que conecta moradores, associações, poder público e iniciativa privada.",
    url: "https://dmconecta.org",
    siteName: "DM Conecta",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1483729557144-040aa7a153b0?w=1200&q=80",
        width: 1200,
        height: 630,
        alt: "dmconecta — bairros conectados",
      },
    ],
  },
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
      </head>
      <body className="antialiased">
        <div className="noise" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
