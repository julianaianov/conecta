"use client";

import { AuthProvider } from "@/lib/app/auth";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
