import { AuthProviderClient } from "@/components/app/AuthProviderClient";
import { AppShell } from "@/components/app/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviderClient>
      <AppShell>{children}</AppShell>
    </AuthProviderClient>
  );
}
