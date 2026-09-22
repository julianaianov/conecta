import Link from "next/link";
import { loginHref } from "@/lib/app/access";

export function AuthPrompt({ action, returnTo = "/feed" }: { action: string; returnTo?: string }) {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }}>
      <p className="text-sm" style={{ color: "var(--th-text)" }}>Entre para {action}.</p>
      <Link href={loginHref(returnTo)} className="mt-2 inline-flex text-sm font-bold" style={{ color: "#f4841a" }}>Entrar ou criar conta →</Link>
    </div>
  );
}
