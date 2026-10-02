import { AISection } from "@/components/AISection";
import { CTABanner } from "@/components/CTABanner";
import { Challenge } from "@/components/Challenge";
import { DataGovSection } from "@/components/DataGovSection";
import { FAQSection } from "@/components/FAQSection";
import { Footer } from "@/components/Footer";
import { GovernanceSection } from "@/components/GovernanceSection";
import { Hero } from "@/components/Hero";
import { LandingModals } from "@/components/LandingModals";
import { LandingSvgSymbols } from "@/components/LandingSvgSymbols";
import { Navbar } from "@/components/Navbar";
import { Projects } from "@/components/Projects";
import { SmartMap } from "@/components/SmartMap";
import { Solution } from "@/components/Solution";
import { Stakeholders } from "@/components/Stakeholders";
import { Steps } from "@/components/Steps";
import { SupportSystem } from "@/components/SupportSystem";
import { TransparencySection } from "@/components/TransparencySection";
import { landingPageJsonLd } from "@/lib/seo/structured-data";
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

  const jsonLd = landingPageJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingSvgSymbols />
      <Navbar />
      <main id="conteudo">
        <Hero profiles={profiles} stats={stats} />
        <Challenge />
        <Solution />
        <Steps />
        <Stakeholders />
        <Projects />
        <SupportSystem />
        <SmartMap posts={mapPosts} />
        <DataGovSection />
        <TransparencySection />
        <AISection />
        <GovernanceSection />
        <FAQSection />
        <CTABanner />
      </main>
      <Footer />
      <LandingModals />
    </>
  );
}
