import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  // A tela de Comunidades virou Conexões — links antigos continuam válidos.
  async redirects() {
    return [{ source: "/comunidades", destination: "/conexoes", permanent: true }];
  },
};

export default nextConfig;
