"use client";

import { useAuth } from "@/lib/app/auth";
import { OrkutProfile } from "@/components/app/OrkutProfile";
import { AuthPrompt } from "@/components/app/AuthPrompt";

export default function MyProfilePage() {
  const { user } = useAuth();
  if (!user) {
    return (
      <div className="mx-auto max-w-lg pt-6">
        <AuthPrompt
          action="profile-write"
          returnTo="/perfil"
          title="Seu perfil"
          message="Entre na sua conta para acessar e gerenciar seu perfil."
        />
      </div>
    );
  }
  return <OrkutProfile userId={user.id} />;
}
