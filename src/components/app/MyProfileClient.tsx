"use client";

import { useAuth } from "@/lib/app/auth";
import { AuthPrompt } from "./AuthPrompt";
import { ProfileView } from "./ProfileView";

export function MyProfileClient() {
  const { user } = useAuth();
  if (!user) return <AuthPrompt action="ver seu perfil" returnTo="/perfil" />;
  return <ProfileView userId={user.id} />;
}
