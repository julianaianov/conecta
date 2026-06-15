import type { Metadata, Viewport } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "dmconecta — Transformando bairros",
  description:
    "Conecte seu bairro. Publique problemas, projetos e ações. Apoie causas locais com voluntariado, doações e muito mais.",
  metadataBase: new URL("https://dmconecta.org"),
  openGraph: {
    title: "dmconecta — Transformando bairros",
    description: "Plataforma comunitária para conectar cidadãos, ONGs e governo local.",
    url: "https://dmconecta.org",
    siteName: "dmconecta",
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
  themeColor: "#f0f5f9",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${outfit.variable} ${jetbrains.variable}`}>
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
