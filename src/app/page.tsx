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
import {
  getPublicDemandMapSnapshot,
  getPublicThemeIntelligence,
} from "@/lib/server/public-data";

export default async function Home() {
  const [demandMap, intelligence] = await Promise.all([
    getPublicDemandMapSnapshot(),
    getPublicThemeIntelligence(),
  ]);
  const stats = [
    { value: intelligence?.demandsTotal.toLocaleString("pt-BR") ?? "—", label: "Demandas públicas" },
    { value: intelligence?.demandsWithTheme.toLocaleString("pt-BR") ?? "—", label: "Com eixo de impacto" },
    { value: intelligence?.territoriesTotal.toLocaleString("pt-BR") ?? "—", label: "Territórios informados" },
    { value: demandMap?.counts.total.toLocaleString("pt-BR") ?? "—", label: "Demandas no mapa" },
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
        <Hero mapView={demandMap} intelligence={intelligence} stats={stats} />
        <Challenge />
        <Solution />
        <Steps />
        <Stakeholders />
        <Projects />
        <SupportSystem />
        <SmartMap view={demandMap} intelligence={intelligence} />
        <DataGovSection intelligence={intelligence} />
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
