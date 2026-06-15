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

export default function Home() {
  return (
    <div className="hero-gradient min-h-screen">
      <GridCanvas />
      <Navbar />
      <main>
        <Hero />
        <BannerFeatures />
        <ImpactGallery />
        <SmartMap />
        <Stakeholders />
        <Steps />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
