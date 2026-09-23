"use client";

import { AuthProvider } from "@/lib/app/auth";

export function AuthProviderClient({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
