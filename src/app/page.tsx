import { AISection } from "@/components/AISection";
import { CTABanner } from "@/components/CTABanner";
import { Challenge } from "@/components/Challenge";
import { DataGovSection } from "@/components/DataGovSection";
import { Footer } from "@/components/Footer";
import { GovernanceSection } from "@/components/GovernanceSection";
import { Hero } from "@/components/Hero";
import { LandingDataProvider } from "@/components/LandingData";
import { LandingEffects } from "@/components/LandingEffects";
import { LandingModals } from "@/components/LandingModals";
import { LandingSvgSymbols } from "@/components/LandingSvgSymbols";
import { Navbar } from "@/components/Navbar";
import { Projects } from "@/components/Projects";
import { SmartMap } from "@/components/SmartMap";
import { Stakeholders } from "@/components/Stakeholders";
import { Steps } from "@/components/Steps";
import { TransparencySection } from "@/components/TransparencySection";
import { landingPageJsonLd } from "@/lib/seo/structured-data";
import {
  getPublicDemandMapSnapshot,
  getPublicMapTerritories,
  getPublicThemeIntelligence,
} from "@/lib/server/public-data";

// A página é pré-gerada no build, quando a API ainda não existe. Com `revalidate`
// ela é refeita no servidor em produção, lendo os serviços pela rede interna:
// os números chegam no HTML, no máximo uma leitura agregada por minuto.
export const revalidate = 60;

export default async function Home() {
  const [demandMap, intelligence, territories] = await Promise.all([
    getPublicDemandMapSnapshot(),
    getPublicThemeIntelligence(),
    getPublicMapTerritories(),
  ]);

  const jsonLd = landingPageJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingSvgSymbols />
      <Navbar />
      <LandingDataProvider initialView={demandMap} initialIntelligence={intelligence} territories={territories}>
        <main id="conteudo">
          <Hero />
          <Challenge />
          <Stakeholders />
          <Steps />
          <Projects />
          <SmartMap />
          <DataGovSection />
          <AISection />
          <TransparencySection />
          <GovernanceSection />
          <CTABanner />
        </main>
      </LandingDataProvider>
      <Footer />
      <LandingModals />
      <LandingEffects />
    </>
  );
}
