import { LandingExperience } from "@/components/LandingExperience";

export const revalidate = 60;

export default function LoginPage() {
  return <LandingExperience dialog="login" />;
}
