import { AISection } from "@/components/AISection";
import { AuthProviderClient } from "@/components/app/AuthProviderClient";
import { CTABanner } from "@/components/CTABanner";
import { Challenge } from "@/components/Challenge";
import { DataGovSection } from "@/components/DataGovSection";
import { Footer } from "@/components/Footer";
import { GovernanceSection } from "@/components/GovernanceSection";
import { Hero } from "@/components/Hero";
import { LandingDataProvider } from "@/components/LandingData";
import { LandingEffects } from "@/components/LandingEffects";
import { LandingMotion } from "@/components/LandingMotion";
import { LandingModals } from "@/components/LandingModals";
import { LandingSvgSymbols } from "@/components/LandingSvgSymbols";
import { Navbar } from "@/components/Navbar";
import { Projects } from "@/components/Projects";
import { RegisterDialog } from "@/components/RegisterDialog";
import { SmartMap } from "@/components/SmartMap";
import { Stakeholders } from "@/components/Stakeholders";
import { Steps } from "@/components/Steps";
import { TransparencySection } from "@/components/TransparencySection";
import { landingPageJsonLd } from "@/lib/seo/structured-data";
import type { UserRole } from "@/lib/app/types";
import {
  getPublicDemandMapSnapshot,
  getPublicMapTerritories,
  getPublicThemeIntelligence,
} from "@/lib/server/public-data";

type LandingDialog = "login" | "register" | null;

/** Landing única para a home e para os links diretos de autenticação. */
export async function LandingExperience({
  dialog = null,
  initialRole = "member",
}: {
  dialog?: LandingDialog;
  initialRole?: UserRole;
}) {
  const [demandMap, intelligence, territories] = await Promise.all([
    getPublicDemandMapSnapshot(),
    getPublicThemeIntelligence(),
    getPublicMapTerritories(),
  ]);
  const jsonLd = landingPageJsonLd();

  return (
    <AuthProviderClient>
    <>
      {dialog === null ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}
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
      <LandingModals initialLoginOpen={dialog === "login"} />
      {dialog === "register" ? <RegisterDialog initialRole={initialRole} /> : null}
      <LandingEffects />
      <LandingMotion />
    </>
    </AuthProviderClient>
  );
}
