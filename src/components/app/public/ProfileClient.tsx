"use client";

import { useMemo } from "react";
import type { Post, Profile, PublicInstitution } from "@/lib/app/types";
import type { ProfileImpact } from "@/lib/app/ranking";
import type { ProfileActivity } from "@/lib/app/profile";
import { ProfileView, type ProfileInitialData } from "../ProfileView";

// Perfil público com os dados do SSR. Visitante, indexador e pessoa logada veem
// o mesmo perfil de atuação territorial; muda só o que cada um pode fazer
// (solicitar conexão, denunciar, acompanhar os próprios registros).
export function ProfileClient({
  initialProfile, initialPosts, initialInstitution = null, initialImpact = null, initialActivity = null,
}: {
  initialProfile: Profile;
  initialPosts: Post[];
  initialInstitution?: PublicInstitution | null;
  initialImpact?: ProfileImpact | null;
  initialActivity?: ProfileActivity | null;
}) {
  const initial = useMemo<ProfileInitialData>(() => ({
    profile: initialProfile,
    posts: initialPosts,
    institution: initialInstitution,
    impact: initialImpact,
    activity: initialActivity,
  }), [initialProfile, initialPosts, initialInstitution, initialImpact, initialActivity]);

  return <ProfileView userId={initialProfile.userId} initial={initial} />;
}
