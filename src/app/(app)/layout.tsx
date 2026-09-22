import { AppShell } from "@/components/app/AppShell";
import { AuthProviderClient } from "@/components/app/AuthProviderClient";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProviderClient>
      <AppShell>{children}</AppShell>
    </AuthProviderClient>
  );
}
