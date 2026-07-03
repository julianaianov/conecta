"use client";

import { useAuth } from "@/lib/app/auth";
import { OrkutProfile } from "@/components/app/OrkutProfile";

export default function MyProfilePage() {
  const { user } = useAuth();
  if (!user) return null;
  return <OrkutProfile userId={user.id} />;
}
