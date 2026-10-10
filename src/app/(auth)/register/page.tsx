import { LandingExperience } from "@/components/LandingExperience";
import { ROLES, type UserRole } from "@/lib/app/types";

export const revalidate = 60;

function roleFromQuery(value: string | string[] | undefined): UserRole {
  const role = Array.isArray(value) ? value[0] : value;
  return ROLES.includes(role as UserRole) ? role as UserRole : "member";
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string | string[] }>;
}) {
  const query = await searchParams;
  return <LandingExperience dialog="register" initialRole={roleFromQuery(query.perfil)} />;
}
