import Link from "next/link";
import { loginHref } from "@/lib/app/access";
import { Icon } from "./Icon";

export interface AuthPromptProps {
  action?: string;
  returnTo?: string;
  title?: string;
  message?: string;
  ctaText?: string;
  className?: string;
}

export function AuthPrompt({
  action,
  returnTo = "/feed",
  title = "Acesso restrito",
  message = "Entre na sua conta para continuar.",
  ctaText,
  className = "",
}: AuthPromptProps) {
  const href = loginHref(returnTo);
  const label =
    ctaText ??
    (action === "comment"
      ? "Entre para comentar"
      : action === "create-post"
      ? "Entre para publicar"
      : action === "support"
      ? "Entre para apoiar"
      : action === "reaction"
      ? "Entre para reagir"
      : action === "connection"
      ? "Entre para conectar"
      : "Entrar na conta");

  return (
    <div
      className={`rounded-2xl border p-6 text-center shadow-sm ${className}`}
      style={{
        background: "var(--th-card)",
        borderColor: "var(--th-border)",
      }}
    >
      <div
        className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full"
        style={{ background: "rgba(244,132,26,0.12)", color: "#f4841a" }}
      >
        <Icon name="person" size={24} />
      </div>
      <h3 className="text-base font-semibold" style={{ color: "var(--th-text)" }}>
        {title}
      </h3>
      <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
        {message}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Link
          href={href}
          className="inline-flex h-10 items-center justify-center rounded-xl px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#f4841a,#f89b45)" }}
        >
          {label}
        </Link>
        <Link
          href="/register"
          className="inline-flex h-10 items-center justify-center rounded-xl border px-5 text-sm font-semibold transition-colors hover:bg-[var(--th-card-alt)]"
          style={{ borderColor: "var(--th-border)", color: "var(--th-text)" }}
        >
          Criar conta
        </Link>
      </div>
    </div>
  );
}
