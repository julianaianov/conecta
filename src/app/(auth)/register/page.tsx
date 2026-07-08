"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/app/auth";
import { Button } from "@/components/app/Button";
import { Icon } from "@/components/app/Icon";
import { AuthShowcase } from "@/components/app/AuthShowcase";
import { Field } from "../login/page";
import { ROLE_LABELS, ROLE_COLORS, type UserRole } from "@/lib/app/types";

const ROLES: UserRole[] = ["citizen", "organization", "association", "government", "business"];

export default function RegisterPage() {
  const { register, status } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [gender, setGender] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("citizen");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "authenticated") router.replace("/feed");
  }, [status, router]);

  function maskPhone(value: string): string {
    const d = value.replace(/\D/g, "").slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const fullName = [name.trim(), surname.trim()].filter(Boolean).join(" ");
      await register({ name: fullName, email, password, role });
      router.replace("/feed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível cadastrar.");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row" style={{ background: "var(--th-bg)" }}>
      {/* Vitrine: banner no mobile + painel lateral no desktop */}
      <AuthShowcase />

      {/* Divisória vertical sutil */}
      <div className="hidden w-px lg:block" style={{ background: "var(--th-border)" }} />

      {/* Form */}
      <div className="flex w-full flex-1 flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-20 xl:px-24">
        <div className="mx-auto w-full max-w-md">
          <h2 className="mt-6 text-2xl font-bold lg:mt-0" style={{ color: "var(--th-text)" }}>Criar conta</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>Junte-se ao ecossistema de impacto local.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Nome">
                <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" className="app-input" />
              </Field>
              <Field label="Sobrenome">
                <input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Seu sobrenome" className="app-input" />
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Data de nascimento">
                <input type="date" required value={birthdate} onChange={(e) => setBirthdate(e.target.value)} className="app-input" />
              </Field>
              <Field label="Gênero">
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="app-input">
                  <option value="">Selecione</option>
                  <option value="female">Feminino</option>
                  <option value="male">Masculino</option>
                  <option value="other">Outro</option>
                  <option value="undisclosed">Prefiro não informar</option>
                </select>
              </Field>
            </div>
            <Field label="Celular">
              <input type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} placeholder="(00) 00000-0000" className="app-input" />
            </Field>
            <Field label="E-mail">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" className="app-input" />
            </Field>
            <Field label="Senha">
              <div className="relative">
                <input type={show ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="app-input pr-11" />
                <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--th-muted)" }} aria-label="Mostrar senha">
                  <Icon name="eye" size={18} />
                </button>
              </div>
            </Field>

            <div>
              <span className="mb-2 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tipo de perfil</span>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {ROLES.map((r) => {
                  const active = role === r;
                  return (
                    <button
                      key={r} type="button" onClick={() => setRole(r)}
                      className="flex items-center gap-3 rounded-xl border p-3 text-left transition-all"
                      style={{
                        borderColor: active ? ROLE_COLORS[r] : "var(--th-border)",
                        background: active ? `${ROLE_COLORS[r]}14` : "var(--th-card)",
                      }}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${ROLE_COLORS[r]}1f`, color: ROLE_COLORS[r] }}>
                        <Icon name={r === "citizen" ? "person" : r === "government" ? "building" : r === "business" ? "building" : r === "organization" ? "volunteer" : "users"} size={18} />
                      </span>
                      <span className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{ROLE_LABELS[r]}</span>
                      {active && <Icon name="check" size={16} className="ml-auto" style={{ color: ROLE_COLORS[r] }} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(229,57,53,0.10)", color: "#e53935" }}>{error}</p>}

            <Button type="submit" block size="lg" loading={loading}>Cadastrar</Button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>
            Já tem conta? <Link href="/login" className="font-semibold" style={{ color: "#f4841a" }}>Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
