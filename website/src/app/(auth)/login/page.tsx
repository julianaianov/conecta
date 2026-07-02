"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/app/auth";
import { DMLogo } from "@/components/app/DMLogo";
import { Button } from "@/components/app/Button";
import { Icon } from "@/components/app/Icon";
import { DEMO_CREDENTIALS } from "@/lib/app/demo";

export default function LoginPage() {
  const { login, loginDemo, status } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState<"login" | "demo" | null>(null);
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

  async function handleDemo() {
    setError(null);
    setLoading("demo");
    try {
      await loginDemo();
      router.replace("/feed");
    } catch {
      setLoading(null);
    }
  }

  function fillDemo() {
    setEmail(DEMO_CREDENTIALS.email);
    setPassword(DEMO_CREDENTIALS.password);
  }

  return (
    <div className="flex min-h-dvh">
      {/* Hero (desktop) */}
      <div className="brand-gradient relative hidden w-1/2 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="relative z-10">
          <DMLogo size={40} tone="light" />
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-bold leading-tight text-white" style={{ letterSpacing: "-0.02em" }}>
            Seu bairro pode <span style={{ color: "#f4841a" }}>mudar</span>.
          </h1>
          <p className="mt-4 text-lg" style={{ color: "rgba(255,255,255,0.8)" }}>
            Mapeie demandas, mobilize vizinhos e conecte sua comunidade ao poder público e a quem pode ajudar.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {["Conecte-se", "participe", "transforme"].map((t, i) => (
              <span key={t} className="rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "rgba(255,255,255,0.10)", color: i === 2 ? "#f4841a" : "#fff" }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
          Rede social de impacto local · Recreio dos Bandeirantes
        </p>
        <div className="pointer-events-none absolute -right-20 top-1/3 h-80 w-80 rounded-full" style={{ background: "radial-gradient(circle,rgba(244,132,26,0.25),transparent 70%)" }} />
      </div>

      {/* Form */}
      <div className="app-mesh flex w-full flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Link href="/" style={{ color: "var(--th-text)" }}>
              <DMLogo size={34} tone="petroleo" />
            </Link>
          </div>

          <h2 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Entrar</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Acesse sua conta para participar.</p>

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <Field label="E-mail">
              <input
                type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@exemplo.com" className="app-input" autoComplete="email"
              />
            </Field>
            <Field label="Senha">
              <div className="relative">
                <input
                  type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••" className="app-input pr-11" autoComplete="current-password"
                />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} aria-label="Mostrar senha">
                  <Icon name="eye" size={18} />
                </button>
              </div>
            </Field>

            {error && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>
            )}

            <Button type="submit" block size="lg" loading={loading === "login"}>Entrar</Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
            <span className="h-px flex-1" style={{ background: "var(--th-border)" }} /> OU <span className="h-px flex-1" style={{ background: "var(--th-border)" }} />
          </div>

          {/* Caixa demo */}
          <div className="rounded-xl border p-4" style={{ borderColor: "rgba(244,132,26,0.3)", background: "rgba(244,132,26,0.06)" }}>
            <div className="flex items-center gap-2">
              <Icon name="info" size={16} style={{ color: "#f4841a" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Modo demonstração</p>
            </div>
            <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
              Explore a plataforma sem backend, com dados do Recreio. Conta: <b>{DEMO_CREDENTIALS.email}</b> / <b>{DEMO_CREDENTIALS.password}</b>
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button variant="secondary" size="sm" block onClick={handleDemo} loading={loading === "demo"} icon="bolt">Entrar sem conexão</Button>
              <Button variant="outline" size="sm" block onClick={fillDemo} icon="edit">Preencher conta demo</Button>
            </div>
          </div>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>
            Não tem conta?{" "}
            <Link href="/register" className="font-semibold" style={{ color: "#f4841a" }}>Cadastre-se</Link>
          </p>
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
