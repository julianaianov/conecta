"use client";

/**
 * "Editar perfil" (W36): o titular cria e gerencia o próprio perfil. Arquitetura
 * de Perfis §3.1 ("Criar e gerenciar perfil") e §3.2 a §3.5 ("Criar perfil");
 * Apresentação Institucional, slides 7 e 8. Serve às cinco categorias com o mesmo
 * formulário e um texto de apoio por categoria. Categoria e subperfil nascem no
 * cadastro e aparecem aqui só para leitura.
 *
 * Telefone e estado são privados (LGPD): cada campo diz se aparece no perfil
 * público. A validação que vale é a do servidor; os erros chegam por campo.
 */

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { maskPhone } from "@/lib/app/institution";
import { UFS } from "@/lib/app/interest";
import { PRIVACY_PATH } from "@/lib/app/privacy";
import {
  PROFILE_FIELD_BY_KEY, PROFILE_FIELD_GROUPS, PROFILE_GUIDES, PROFILE_PATH, PROFILE_VISIBILITY_LABELS,
  avatarPreviewUrl, emptyProfileForm, firstProfileErrorKey, formFromProfile, inputFromProfileForm,
  isProfileFormDirty, profileErrorMessage, profileFieldErrors, validateProfileForm,
  type OwnProfile, type ProfileFieldKey, type ProfileFieldSpec, type ProfileForm,
} from "@/lib/app/profile-edit";
import { PROFILE_LABELS, ROLE_DESCRIPTIONS, ROLE_FUNCTIONS, ROLE_LABELS, type ProfileType } from "@/lib/app/types";
import { AuthPrompt } from "./AuthPrompt";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Card } from "./ui";
import { FormAlert, SelectInput, TextArea, TextInput, demandFieldId } from "./demand/fields";

type FieldErrors = Partial<Record<ProfileFieldKey, string>>;
type Notice = { tone: "error" | "success"; text: string };

const FOCUS = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4841a]";

function focusField(key: ProfileFieldKey | null) {
  if (key) document.getElementById(demandFieldId(key))?.focus();
}

/** Diz, no próprio rótulo, quem vê o campo (LGPD: telefone e estado são privados). */
function FieldLabel({ spec }: { spec: ProfileFieldSpec }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      {spec.label}
      <span
        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
        style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}
      >
        <Icon name={spec.visibility === "privado" ? "shield" : "eye"} size={11} aria-hidden />
        {PROFILE_VISIBILITY_LABELS[spec.visibility]}
      </span>
    </span>
  );
}

function Spinner() {
  return <div className="flex justify-center py-24"><span className="app-spinner" style={{ width: 30, height: 30 }} /></div>;
}

export function ProfileEditClient() {
  const { user, status } = useAuth();
  const [saved, setSaved] = useState<OwnProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyProfileForm());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const own = await api.getMyProfile();
      setSaved(own);
      setForm(formFromProfile(own));
      setLoadError(null);
    } catch (err) {
      setLoadError(profileErrorMessage(err, "Não foi possível carregar o perfil."));
    }
  }, []);

  useEffect(() => { if (status === "authenticated") void load(); }, [status, load]);

  if (status === "unknown") return <Spinner />;
  if (!user) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Editar perfil</h1>
          <div className="mt-4"><AuthPrompt action="editar seu perfil" returnTo="/perfil/editar" /></div>
        </Card>
      </div>
    );
  }

  const guide = PROFILE_GUIDES[user.role];
  const savedForm = formFromProfile(saved);
  const dirty = saved !== null && isProfileFormDirty(form, savedForm);
  const subprofile = user.profileType ? PROFILE_LABELS[user.profileType as ProfileType] : null;

  function set(key: ProfileFieldKey, value: string) {
    setForm((current) => ({ ...current, [key]: key === "phone" ? maskPhone(value) : value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const { [key]: _removed, ...rest } = current;
      void _removed;
      return rest;
    });
    setNotice((current) => (current?.tone === "success" ? null : current));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setNotice(null);
    const local = validateProfileForm(form);
    setErrors(local);
    if (Object.keys(local).length) {
      focusField(firstProfileErrorKey(local));
      setNotice({ tone: "error", text: "Revise os campos destacados." });
      return;
    }
    setSaving(true);
    try {
      const next = await api.updateProfile(inputFromProfileForm(form));
      setSaved(next);
      setForm(formFromProfile(next));
      setErrors({});
      setNotice({ tone: "success", text: "Perfil salvo." });
    } catch (err) {
      const remote = profileFieldErrors((err as { fields?: Record<string, string> } | null)?.fields);
      if (Object.keys(remote).length) {
        setErrors(remote);
        focusField(firstProfileErrorKey(remote));
        setNotice({ tone: "error", text: "Revise os campos destacados." });
      } else {
        setNotice({ tone: "error", text: profileErrorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  }

  function renderField(key: ProfileFieldKey) {
    const spec = PROFILE_FIELD_BY_KEY[key];
    const label = <FieldLabel spec={spec} />;
    const error = errors[key];
    const required = spec.required;
    if (key === "state") {
      return (
        <SelectInput
          key={key} name={key} label={label} hint={spec.hint} error={error} value={form.state}
          onValue={(value) => set(key, value)} placeholder="Selecione a UF"
          options={UFS.map((uf) => ({ value: uf, label: uf }))}
          autoComplete="address-level1"
        />
      );
    }
    if (spec.multiline) {
      return (
        <TextArea
          key={key} name={key} label={label} required={required} error={error} value={form[key]}
          onValue={(value) => set(key, value)} maxLength={spec.max} rows={4} placeholder={spec.placeholder}
          hint={`${guide.bioHint} (${form[key].length}/${spec.max})`}
        />
      );
    }
    return (
      <TextInput
        key={key} name={key} label={label} required={required} error={error} value={form[key]}
        onValue={(value) => set(key, value)} maxLength={key === "phone" ? 15 : spec.max} placeholder={spec.placeholder}
        hint={key === "name" ? guide.nameHint : spec.hint}
        {...(key === "phone" ? { type: "tel", inputMode: "tel" as const, autoComplete: "tel-national" } : {})}
        {...(key === "website" || key === "avatarUrl" ? { inputMode: "url" as const, autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : {})}
        {...(key === "city" ? { autoComplete: "address-level2" } : {})}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <Link href={PROFILE_PATH} className={`mb-2 inline-flex items-center gap-1.5 rounded text-sm font-semibold ${FOCUS}`} style={{ color: "var(--th-muted)" }}>
          <Icon name="arrowLeft" size={16} aria-hidden /> Voltar ao perfil
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--th-text)" }}>Editar perfil</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>{guide.intro}</p>
      </header>

      <Card>
        <div className="flex items-start gap-3">
          <Avatar name={form.name || user.name} src={avatarPreviewUrl(form.avatarUrl)} id={user.id} size={56} />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold break-words" style={{ color: "var(--th-text)" }}>{form.name.trim() || user.name}</p>
            <p className="mt-0.5 text-xs font-semibold" style={{ color: "var(--th-muted)" }}>
              {[ROLE_LABELS[user.role], subprofile].filter(Boolean).join(" · ")}
            </p>
            <p className="mt-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
              <span className="font-semibold">{ROLE_FUNCTIONS[user.role]}.</span> {ROLE_DESCRIPTIONS[user.role]}
            </p>
            <p className="mt-1.5 flex items-start gap-1 text-xs" style={{ color: "var(--th-muted)" }}>
              <Icon name="info" size={12} className="mt-0.5 shrink-0" aria-hidden />
              A categoria e o subperfil são definidos no cadastro e não mudam aqui.
            </p>
          </div>
        </div>
      </Card>

      {loadError ? (
        <div className="space-y-3">
          <FormAlert message={loadError} />
          <Button type="button" variant="outline" size="sm" icon="check" onClick={() => void load()}>Tentar de novo</Button>
        </div>
      ) : saved === null ? (
        <div className="flex justify-center py-12"><span className="app-spinner" style={{ width: 28, height: 28 }} /></div>
      ) : (
        <form noValidate onSubmit={onSubmit} className="space-y-4" aria-label="Editar perfil">
          {PROFILE_FIELD_GROUPS.map((group) => (
            <section key={group.id} aria-labelledby={`perfil-${group.id}`}>
              <Card>
                <h2 id={`perfil-${group.id}`} className="text-base font-bold" style={{ color: "var(--th-text)" }}>{group.title}</h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>{group.description}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {group.keys.map((key) => (
                    <div key={key} className={PROFILE_FIELD_BY_KEY[key].multiline || key === "name" || key === "avatarUrl" || key === "website" ? "sm:col-span-2" : undefined}>
                      {renderField(key)}
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          ))}

          {guide.related && (
            <p className="flex items-start gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
              <Icon name="info" size={13} className="mt-0.5 shrink-0" aria-hidden />
              <span>
                {guide.related.text}{" "}
                {guide.related.href && (
                  <Link href={guide.related.href} className={`rounded font-semibold underline ${FOCUS}`} style={{ color: "var(--th-text)" }}>{guide.related.linkLabel}</Link>
                )}
              </span>
            </p>
          )}
          <p className="flex items-start gap-1.5 text-xs" style={{ color: "var(--th-muted)" }}>
            <Icon name="shield" size={13} className="mt-0.5 shrink-0" aria-hidden />
            <span>
              Telefone e estado não aparecem no perfil público. Para acessar, corrigir ou eliminar seus dados, use{" "}
              <Link href={PRIVACY_PATH} className={`rounded font-semibold underline ${FOCUS}`} style={{ color: "var(--th-text)" }}>Privacidade e meus dados</Link>.
            </span>
          </p>

          {notice && <FormAlert message={notice.text} tone={notice.tone} />}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button href={PROFILE_PATH} variant="ghost" size="md">{dirty ? "Cancelar" : "Voltar ao perfil"}</Button>
            <Button type="submit" size="md" icon="check" loading={saving}>Salvar perfil</Button>
          </div>
        </form>
      )}
    </div>
  );
}
