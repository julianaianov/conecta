"use client";

import { useState } from "react";
import Link from "next/link";
import { DMLogo } from "@/components/app/DMLogo";
import { AuthShowcase } from "@/components/app/AuthShowcase";
import { InDevelopment } from "@/components/app/InDevelopment";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Digite um e-mail válido.");
      return;
    }
    setError("A recuperação de senha ainda não está disponível porque o serviço de e-mail não foi configurado.");
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--th-bg)" }}>
      <AuthShowcase photos={false} />
      <div className="hidden w-px lg:block" style={{ background: "var(--th-border)" }} />

      <div className="flex w-full flex-1 flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-20 xl:px-28">
        <div className="mx-auto w-full max-w-md">
          <h2 className="text-3xl font-bold" style={{ color: "var(--th-text)", letterSpacing: "-0.02em" }}>Recuperar senha</h2>
          <p className="mt-1.5 text-[15px]" style={{ color: "var(--th-muted)" }}>
            A recuperação será habilitada quando o envio de e-mail estiver conectado ao serviço de autenticação.
          </p>

          {/* Marcador padrão da fonte (slide 25): funcionalidade em desenvolvimento é identificada como tal. */}
          <InDevelopment className="mt-4">
            A recuperação de senha por e-mail ainda não está disponível. Enquanto isso, fale com a equipe pelo
            contato da{" "}
            <Link href="/politica-de-privacidade" className="font-semibold underline">Política de Privacidade</Link>.
          </InDevelopment>

          <form onSubmit={handleSubmit} className="mt-7 space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="E-mail da conta"
              className="auth-input"
              autoComplete="email"
              aria-label="E-mail"
            />

            {error && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>
            )}

            <button type="submit" className="auth-btn-primary" style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)", boxShadow: "0 8px 22px rgba(244,132,26,0.32)" }}>
              Solicitar recuperação
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
        </div>
      </div>
    </div>
  );
}
