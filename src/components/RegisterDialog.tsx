"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/app/auth";
import { postRegisterDestination } from "@/lib/app/institution";
import { Button } from "@/components/app/Button";
import { Icon } from "@/components/app/Icon";
import { DMLogo } from "@/components/app/DMLogo";
import {
  ROLES, ROLE_LABELS, ROLE_COLORS, ROLE_ICONS, ROLE_PROFILES,
  ROLE_PERMISSION_LABELS, ROLE_RESTRICTIONS, ROLE_FUNCTIONS, ROLE_DESCRIPTIONS, ROLE_FUTURE_PROFILES,
  type UserRole, type ProfileType,
} from "@/lib/app/types";
import { CONSENT_DOCUMENTS, CONSENT_KEYS } from "@/lib/app/privacy";
import type { IconName } from "@/components/app/Icon";

/** Cadastro real em diálogo, sobre a landing; o envio continua no auth-service. */
export function RegisterDialog({ initialRole = "member" }: { initialRole?: UserRole }) {
  const { register, status } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(initialRole);
  const [profileType, setProfileType] = useState<ProfileType | null>(null);
  const [show, setShow] = useState(false);
  /** Aceite versionado dos Termos e da Política (T24, LGPD art. 8º). */
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Evita que o redirecionamento de sessão ativa passe por cima do onboarding. */
  const registering = useRef(false);

  /** Trocar de categoria zera o subperfil — os subperfis não se repetem entre categorias. */
  function selectRole(next: UserRole) {
    setRole(next);
    setProfileType(null);
  }

  const closeDialog = useCallback(() => {
    router.replace("/");
  }, [router]);

  useEffect(() => {
    if (status === "authenticated" && !registering.current) router.replace("/feed");
  }, [status, router]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [closeDialog]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (!profileType) {
      setError(`Escolha um perfil dentro de "${ROLE_LABELS[role]}".`);
      return;
    }
    if (!acceptedTerms) {
      setError("É preciso aceitar os Termos de Uso e a Política de Privacidade para criar a conta.");
      return;
    }
    setLoading(true);
    registering.current = true;
    try {
      const fullName = [name.trim(), surname.trim()].filter(Boolean).join(" ");
      await register({ name: fullName, email, password, role, profileType, consents: CONSENT_KEYS });
      // Agente de Transformação e Poder Público seguem para a ficha institucional.
      router.replace(postRegisterDestination(role, profileType));
    } catch (err) {
      registering.current = false;
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar.");
      setLoading(false);
    }
  }

  return (
    <div
      className="lg-ov register-ov"
      role="dialog"
      aria-modal="true"
      aria-labelledby="registerTitle"
      onClick={(event) => { if (event.target === event.currentTarget) closeDialog(); }}
    >
      <form className="lg-box register-box" onSubmit={handleSubmit}>
        <button type="button" className="lg-x" aria-label="Fechar cadastro" onClick={closeDialog}>&times;</button>
        <DMLogo size={26} tone="petroleo" />
        <h2 id="registerTitle">Criar conta</h2>
        <p className="lg-sub">Junte-se ao ecossistema de impacto local.</p>

        <div className="register-fields">
          <div className="register-name-grid">
            <Field label="Nome">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="app-input" autoComplete="given-name" />
            </Field>
            <Field label="Sobrenome">
              <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Seu sobrenome" className="app-input" autoComplete="family-name" />
            </Field>
          </div>
          <Field label="E-mail">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className="app-input" autoComplete="email" />
          </Field>
          <Field label="Senha">
            <div className="relative">
              <input type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="app-input pr-11" autoComplete="new-password" />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} aria-label={show ? "Ocultar senha" : "Mostrar senha"}>
                <Icon name="eye" size={18} />
              </button>
            </div>
          </Field>

          <div>
            <span className="mb-2 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tipo de perfil</span>
            <div role="radiogroup" aria-label="Tipo de perfil" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ROLES.map((r) => {
                  const active = role === r;
                  return (
                    <button
                      key={r} type="button" role="radio" aria-checked={active} onClick={() => selectRole(r)}
                      className="flex items-center gap-3 rounded-xl border p-3 text-left transition-all"
                      style={{
                        borderColor: active ? ROLE_COLORS[r] : "var(--th-border)",
                        background: active ? `${ROLE_COLORS[r]}14` : "var(--th-card)",
                      }}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${ROLE_COLORS[r]}1f`, color: ROLE_COLORS[r] }}>
                        <Icon name={ROLE_ICONS[r] as IconName} size={18} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold" style={{ color: "var(--th-text)" }}>{ROLE_LABELS[r]}</span>
                        <span className="block text-xs" style={{ color: "var(--th-muted)" }}>{ROLE_FUNCTIONS[r]}</span>
                      </span>
                      {active && <Icon name="check" size={16} className="ml-auto shrink-0" style={{ color: ROLE_COLORS[r] }} />}
                    </button>
                  );
                })}
            </div>

            {/* Subperfis + permissões da categoria escolhida */}
            <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)", background: "var(--th-card)" }}>
                <span id="subperfil-label" className="block text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
                  Seu perfil em {ROLE_LABELS[role]}
                </span>
                <p className="mt-1 text-xs" style={{ color: "var(--th-text)" }}>{ROLE_DESCRIPTIONS[role]}</p>
                <div role="radiogroup" aria-labelledby="subperfil-label" className="mt-2 flex flex-wrap gap-2">
                  {ROLE_PROFILES[role].map((p) => {
                    const active = profileType === p.type;
                    return (
                      <button
                        key={p.type} type="button" role="radio" aria-checked={active}
                        onClick={() => setProfileType(p.type)}
                        className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all"
                        style={{
                          borderColor: active ? ROLE_COLORS[role] : "var(--th-border)",
                          background: active ? ROLE_COLORS[role] : "transparent",
                          color: active ? "#fff" : "var(--th-text)",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
                {ROLE_FUTURE_PROFILES[role] && (
                  <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>
                    Em breve: {ROLE_FUTURE_PROFILES[role]!.join(", ")}.
                  </p>
                )}

                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {ROLE_PERMISSION_LABELS[role].map((label) => (
                    <li key={label} className="flex items-center gap-1 text-xs" style={{ color: "var(--th-muted)" }}>
                      <Icon name="check" size={12} style={{ color: ROLE_COLORS[role] }} />
                      {label}
                    </li>
                  ))}
                </ul>

                {ROLE_RESTRICTIONS[role] && (
                  <p className="mt-2 flex items-start gap-1 text-xs" style={{ color: "var(--th-muted)" }}>
                    <Icon name="info" size={12} className="mt-0.5 shrink-0" />
                    {ROLE_RESTRICTIONS[role]}
                  </p>
                )}
            </div>
          </div>

          {/* Consentimento versionado (T24): a versão aceita fica registrada. */}
          <label className="register-consent flex items-start gap-2 text-xs" style={{ color: "var(--th-muted)" }}>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-describedby="aceite-versoes"
              />
              <span>
                Li e aceito os{" "}
                {CONSENT_DOCUMENTS.map((doc, i) => (
                  <span key={doc.key}>
                    {i > 0 && " e a "}
                    <Link href={doc.path} target="_blank" className="font-semibold underline" style={{ color: "#f4841a" }}>
                      {doc.label}
                    </Link>
                  </span>
                ))}
                .{" "}
                <span id="aceite-versoes">
                  O aceite é registrado com a versão e a data ({CONSENT_DOCUMENTS.map((d) => `${d.label} v${d.version}`).join(", ")}).
                  Você pode ver, revogar consentimentos opcionais e pedir seus dados em Privacidade, no seu perfil.
                </span>
              </span>
          </label>

          {error && <p className="rounded-lg px-3 py-2 text-sm" role="alert" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>}

          <Button type="submit" block size="lg" loading={loading}>Cadastrar</Button>
        </div>

        <p className="register-login-link">
          Já tem conta? <Link href="/login" className="font-semibold" style={{ color: "var(--orange-btn)" }}>Entrar</Link>
        </p>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="register-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
