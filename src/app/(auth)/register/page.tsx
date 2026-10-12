import { LandingExperience } from "@/components/LandingExperience";
import { PUBLIC_REGISTRATION_ROLES, type PublicRegistrationRole } from "@/lib/app/types";

export const revalidate = 60;

const QUERY_ROLE_MAP: Record<string, PublicRegistrationRole> = {
  partner: "partner",
  parceiro: "partner",
  agent: "agent",
  agente: "agent",
  government: "government",
  "poder-publico": "government",
  governo: "government",
  member: "member",
  comunidade: "member",
};

function roleFromQuery(value: string | string[] | undefined): PublicRegistrationRole {
  const raw = (Array.isArray(value) ? value[0] : value)?.toLowerCase() || "";
  if (raw in QUERY_ROLE_MAP) return QUERY_ROLE_MAP[raw];
  return PUBLIC_REGISTRATION_ROLES.includes(raw as PublicRegistrationRole) ? (raw as PublicRegistrationRole) : "partner";
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string | string[] }>;
}) {
  const query = await searchParams;
  return <LandingExperience dialog="register" initialRole={roleFromQuery(query.perfil)} />;
}
