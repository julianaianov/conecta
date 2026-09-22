import { BannerFeatures } from "@/components/BannerFeatures";
import { CTABanner } from "@/components/CTABanner";
import { Footer } from "@/components/Footer";
import { GridCanvas } from "@/components/GridCanvas";
import { Hero } from "@/components/Hero";
import { ImpactGallery } from "@/components/ImpactGallery";
import { Navbar } from "@/components/Navbar";
import { SmartMap } from "@/components/SmartMap";
import { Stakeholders } from "@/components/Stakeholders";
import { Steps } from "@/components/Steps";
import { getPublicMapPosts, getPublicPosts, getPublicRanking } from "@/lib/server/public-data";

export default async function Home() {
  const [posts, mapPosts, ranking] = await Promise.all([
    getPublicPosts({ limit: 6 }),
    getPublicMapPosts(),
    getPublicRanking(),
  ]);
  const profiles = Object.values(ranking).flat();
  const neighborhoods = new Set(posts.map((post) => post.neighborhood).filter(Boolean));
  const stats = [
    { value: profiles.length.toLocaleString("pt-BR"), label: "Perfis publicados" },
    { value: posts.length.toLocaleString("pt-BR"), label: "Sinais recentes" },
    { value: neighborhoods.size.toLocaleString("pt-BR"), label: "Bairros nos sinais" },
    { value: mapPosts.length.toLocaleString("pt-BR"), label: "Sinais no mapa" },
  ];

  return (
    <div className="hero-gradient min-h-screen">
      <GridCanvas />
      <Navbar />
      <main>
        <Hero profiles={profiles} stats={stats} />
        <BannerFeatures />
        <ImpactGallery posts={posts} />
        <SmartMap posts={mapPosts} />
        <Stakeholders />
        <Steps />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
