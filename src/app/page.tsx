import { LandingExperience } from "@/components/LandingExperience";

// A landing é refeita periodicamente no servidor, lendo os dados agregados da API.
export const revalidate = 60;

export default function Home() {
  return <LandingExperience />;
}
