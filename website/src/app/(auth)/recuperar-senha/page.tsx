"use client";

import { useState } from "react";
import Link from "next/link";
import { DMLogo } from "@/components/app/DMLogo";
import { Icon } from "@/components/app/Icon";
import { AuthShowcase } from "@/components/app/AuthShowcase";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Digite um e-mail válido.");
      return;
    }
    setLoading(true);
    // Fluxo simulado (modo demo): sem backend de recuperação ainda.
    await new Promise((r) => setTimeout(r, 700));
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-dvh" style={{ background: "var(--th-bg)" }}>
      {/* Vitrine da comunidade (desktop) */}
      <AuthShowcase />

      {/* Divisória vertical sutil */}
      <div className="hidden w-px lg:block" style={{ background: "var(--th-border)" }} />

      {/* Form */}
      <div className="flex w-full flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-20 xl:px-28">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Link href="/" style={{ color: "var(--th-text)" }}>
              <DMLogo size={36} tone="petroleo" />
            </Link>
          </div>

          {sent ? (
            <div className="text-center">
              <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 10px 26px rgba(244,132,26,0.32)" }}>
                <Icon name="send" size={28} />
              </span>
              <h2 className="mt-6 text-3xl font-bold" style={{ color: "var(--th-text)", letterSpacing: "-0.02em" }}>Verifique seu e-mail</h2>
              <p className="mt-2 text-[15px]" style={{ color: "var(--th-muted)" }}>
                Se houver uma conta associada a <b style={{ color: "var(--th-text)" }}>{email}</b>, enviamos um link para redefinir sua senha.
              </p>

              <div className="mt-6 rounded-xl border p-4 text-left" style={{ borderColor: "rgba(244,132,26,0.28)", background: "rgba(244,132,26,0.05)" }}>
                <div className="flex items-center gap-2">
                  <Icon name="info" size={16} style={{ color: "#f4841a" }} />
                  <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Modo demonstração</p>
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                  Nenhum e-mail real é enviado por enquanto — a recuperação de senha ainda não está conectada a um backend.
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button type="button" onClick={() => { setSent(false); setEmail(""); }} className="auth-btn-outline" style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}>
                  Usar outro e-mail
                </button>
                <Link href="/login" className="text-center text-[15px] font-semibold" style={{ color: "#f4841a" }}>
                  Voltar para o login
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-3xl font-bold" style={{ color: "var(--th-text)", letterSpacing: "-0.02em" }}>Recuperar senha</h2>
              <p className="mt-1.5 text-[15px]" style={{ color: "var(--th-muted)" }}>
                Digite o e-mail da sua conta e enviaremos um link para você criar uma nova senha.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-3">
                <input
                  type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                  placeholder="E-mail da conta" className="auth-input" autoComplete="email" aria-label="E-mail"
                />

                {error && (
                  <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>
                )}

                <button type="submit" disabled={loading} className="auth-btn-primary" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 8px 22px rgba(244,132,26,0.32)" }}>
                  {loading ? <span className="app-spinner" style={{ borderTopColor: "#fff" }} /> : "Enviar link de recuperação"}
                </button>
              </form>

              <div className="my-6 h-px w-full" style={{ background: "var(--th-border)" }} />

              <p className="text-center text-sm" style={{ color: "var(--th-muted)" }}>
                Lembrou a senha?{" "}
                <Link href="/login" className="font-semibold" style={{ color: "#f4841a" }}>Entrar</Link>
              </p>

              <div className="mt-8 flex justify-center opacity-70">
                <DMLogo size={22} tone="petroleo" />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
