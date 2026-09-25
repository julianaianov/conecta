"use client";

import { useEffect, useState } from "react";
import { api, InstitutionRequestError } from "@/lib/app/api";
import {
  DECLARATION_NOTICE,
  DECLARED_PROFILE_FIELDS,
  DECLARED_PROFILE_TITLES,
  declaredKindFor,
  formFromDeclaredProfile,
  inputFromDeclaredForm,
  validateDeclaredForm,
  type DeclaredProfileForm,
} from "@/lib/app/declared-profile";
import { maskCnpj, safeWebsite } from "@/lib/app/institution";
import type { BusinessProfile, MediaProfile, PublicDeclaredProfile, UserRole } from "@/lib/app/types";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * Perfil empresarial do Parceiro e perfil profissional/institucional da
 * Comunicação (T-04-03; Arquitetura de Perfis §3.3 e §3.5; decisão 18). No
 * próprio perfil, a conta preenche e edita; no perfil de outra conta, aparece a
 * projeção pública. Sempre com o aviso "informado pela própria conta": não há
 * validação da equipe nem selo.
 */
export function DeclaredProfileSection({ userId, role, isOwn }: { userId: string; role: UserRole; isOwn: boolean }) {
  const kind = declaredKindFor(role);
  const [publicProfile, setPublicProfile] = useState<PublicDeclaredProfile | null>(null);
  const [own, setOwn] = useState<BusinessProfile | MediaProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<DeclaredProfileForm>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!kind) return;
    let active = true;
    const load = isOwn ? api.getMyDeclaredProfile(kind) : api.getPublicDeclaredProfile(userId);
    load
      .then((result) => {
        if (!active) return;
        if (isOwn) setOwn(result as BusinessProfile | MediaProfile | null);
        else setPublicProfile(result as PublicDeclaredProfile | null);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [kind, isOwn, userId]);

  if (!kind || !loaded) return null;
  if (!isOwn && !publicProfile) return null;

  const title = DECLARED_PROFILE_TITLES[kind];

  async function save() {
    if (!kind) return;
    const next = validateDeclaredForm(kind, form);
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      const saved = await api.saveMyDeclaredProfile(kind, inputFromDeclaredForm(kind, form));
      setOwn(saved);
      setEditing(false);
      setMessage("Perfil salvo.");
    } catch (err) {
      if (err instanceof InstitutionRequestError && Object.keys(err.fields).length) setErrors(err.fields);
      else setMessage("Não foi possível salvar agora. Tente de novo.");
    } finally {
      setSaving(false);
    }
  }

  const view: PublicDeclaredProfile | null = isOwn
    ? own && (own.kind === "empresarial"
      ? { kind: own.kind, name: own.companyName, cnpj: own.cnpj ? maskCnpj(own.cnpj) : null, segment: own.segment, description: own.description, website: own.website, declaration: own.declaration }
      : { kind: own.kind, name: own.outletName, coverageArea: own.coverageArea, description: own.description, website: own.website, declaration: own.declaration })
    : publicProfile;

  return (
    <section aria-labelledby="declared-profile-title" className="app-card rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="declared-profile-title" className="text-base font-bold" style={{ color: "var(--th-text)" }}>{title}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs" style={{ color: "var(--th-muted)" }}>
            <Icon name="info" size={12} />Dados {DECLARATION_NOTICE}; não passam por validação da equipe.
          </p>
        </div>
        {isOwn && !editing && (
          <Button type="button" variant="outline" size="sm" icon="edit" onClick={() => { setForm(formFromDeclaredProfile(kind, own)); setErrors({}); setEditing(true); }}>
            {own ? "Editar" : "Preencher"}
          </Button>
        )}
      </div>

      {!editing && view && (
        <dl className="mt-3 grid gap-2 text-sm">
          <div><dt className="sr-only">Nome</dt><dd className="font-semibold" style={{ color: "var(--th-text)" }}>{view.name}</dd></div>
          {view.cnpj && <div><dt className="text-[11px] font-bold uppercase" style={{ color: "var(--th-muted)" }}>CNPJ</dt><dd className="font-numeric">{view.cnpj}</dd></div>}
          {view.segment && <div><dt className="text-[11px] font-bold uppercase" style={{ color: "var(--th-muted)" }}>Segmento</dt><dd>{view.segment}</dd></div>}
          {view.coverageArea && <div><dt className="text-[11px] font-bold uppercase" style={{ color: "var(--th-muted)" }}>Área de cobertura</dt><dd>{view.coverageArea}</dd></div>}
          {view.description && <div><dt className="sr-only">Descrição</dt><dd className="whitespace-pre-line" style={{ color: "var(--th-text)" }}>{view.description}</dd></div>}
          {safeWebsite(view.website) && (
            <div><dt className="sr-only">Site</dt><dd><a href={safeWebsite(view.website) ?? undefined} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold underline" style={{ color: "#1b4f72" }}>{view.website}</a></dd></div>
          )}
        </dl>
      )}
      {!editing && !view && isOwn && (
        <p className="mt-3 text-sm" style={{ color: "var(--th-muted)" }}>
          {kind === "empresarial"
            ? "Apresente a empresa, a marca ou o comércio para os Agentes e a comunidade."
            : "Apresente o veículo, a instituição ou o seu trabalho de jornalismo."}
        </p>
      )}

      {editing && (
        <form noValidate onSubmit={(e) => { e.preventDefault(); void save(); }} className="mt-3 grid gap-3">
          {DECLARED_PROFILE_FIELDS[kind].map((f) => {
            const id = `declared-${f.key}`;
            const error = errors[f.key];
            const common = {
              id,
              value: form[f.key] ?? "",
              maxLength: f.key === "cnpj" ? 18 : f.max,
              placeholder: f.placeholder,
              "aria-invalid": error ? true : undefined,
              "aria-describedby": error ? `${id}-error` : f.hint ? `${id}-hint` : undefined,
              style: error ? { borderColor: "#e53935" } : undefined,
            };
            const onValue = (v: string) => setForm((current) => ({ ...current, [f.key]: f.key === "cnpj" ? maskCnpj(v) : v }));
            return (
              <div key={f.key}>
                <label htmlFor={id} className="mb-1 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>
                  {f.label}{f.required && <span aria-hidden="true" style={{ color: "#e53935" }}> *</span>}
                </label>
                {f.multiline
                  ? <textarea {...common} onChange={(e) => onValue(e.target.value)} className="app-textarea" />
                  : <input {...common} aria-required={f.required || undefined} onChange={(e) => onValue(e.target.value)} className="app-input" />}
                {f.hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{f.hint}</p>}
                {error && <p id={`${id}-error`} className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{error}</p>}
              </div>
            );
          })}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" size="sm" icon="check" loading={saving}>Salvar</Button>
          </div>
        </form>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>{message}</p>
    </section>
  );
}
