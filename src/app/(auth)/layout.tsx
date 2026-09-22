import type { Metadata } from "next";
import { AuthProviderClient } from "@/components/app/AuthProviderClient";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AuthProviderClient>{children}</AuthProviderClient>;
}
