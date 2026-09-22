"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/app/auth";
import { DMLogo } from "@/components/app/DMLogo";
import { Icon } from "@/components/app/Icon";
import { AuthShowcase } from "@/components/app/AuthShowcase";

export default function LoginPage() {
  const { login, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState<"login" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/feed");
  }, [status, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading("login");
    try {
      await login(email, password);
      router.replace("/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
      setLoading(null);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--th-bg)" }}>
      {/* Vitrine: banner no mobile + painel lateral no desktop */}
      <AuthShowcase photos={false} />

      {/* Divisória vertical sutil para separar a apresentação do formulário */}
      <div className="hidden w-px lg:block" style={{ background: "var(--th-border)" }} />

      {/* Form */}
      <div className="flex w-full flex-1 flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-20 xl:px-28">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-3xl font-bold" style={{ color: "var(--th-text)", letterSpacing: "-0.02em" }}>Entrar na Conecta</h2>
          <p className="mt-1.5 text-[15px]" style={{ color: "var(--th-muted)" }}>Acesse sua conta para participar do seu bairro.</p>

          <form onSubmit={handleLogin} className="mt-7 space-y-3">
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail ou telefone" className="auth-input" autoComplete="email" aria-label="E-mail"
            />
            <div className="relative">
              <input
                type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha" className="auth-input pr-12" autoComplete="current-password" aria-label="Senha"
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} aria-label="Mostrar senha">
                <Icon name="eye" size={20} />
              </button>
            </div>

            {error && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>
            )}

            <button type="submit" disabled={loading === "login"} className="auth-btn-primary" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 8px 22px rgba(244,132,26,0.32)" }}>
              {loading === "login" ? <span className="app-spinner" style={{ borderTopColor: "#fff" }} /> : "Entrar"}
            </button>
          </form>

          <p className="mt-4 text-center">
            <Link href="/recuperar-senha" className="text-[15px] font-semibold" style={{ color: "var(--th-text)" }}>Esqueceu a senha?</Link>
          </p>

          <div className="my-6 h-px w-full" style={{ background: "var(--th-border)" }} />

          <Link href="/register" className="auth-btn-outline" style={{ borderColor: "#f4841a", color: "#f4841a" }}>
            Criar nova conta
          </Link>

          <div className="mt-8 flex justify-center opacity-70">
            <DMLogo size={22} tone="petroleo" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>{label}</span>
      {children}
    </label>
  );
}
