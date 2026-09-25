"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import { useEffectiveRole } from "../institution/useInstitutionAccess";
import {
  DEMAND_CATEGORIES,
  DEMAND_CATEGORY_HELP,
  DEMAND_PRIORITIES,
  MY_DEMANDS_PATH,
  UFS,
  adjacentStep,
  demandEditPath,
  demandErrorMessage,
  demandFieldLabel,
  demandGuidance,
  demandPublicPath,
  demandStep,
  demandStepStates,
  emptyDemandForm,
  errorsByStep,
  fieldErrorsOf,
  firstPendingStep,
  formFromDemand,
  isDemandStepId,
  isStepDirty,
  maskDemandCep,
  stepForErrorKey,
  stepInput,
  type DemandFormState,
  type DemandStepId,
} from "@/lib/app/demand";
import { gateStatusFrom, isInstitutionNotValidated } from "@/lib/app/institution";
import {
  DEMAND_CATEGORY_LABELS,
  DEMAND_PRIORITY_LABELS,
  type Demand,
  type DemandFieldErrors,
  type DemandReview,
  type DemandValidation,
  type InstitutionValidationStatus,
  type UploadedFile,
} from "@/lib/app/types";
import { AuthPrompt } from "../AuthPrompt";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Icon } from "../Icon";
import { Card } from "../ui";
import { InstitutionGateNotice } from "../institution/InstitutionStatus";
import { useInstitutionAccess } from "../institution/useInstitutionAccess";
import { BudgetEditor } from "./BudgetEditor";
import { categoryIcon, DemandStatusBadge } from "./DemandParts";
import { DemandProgress } from "./DemandProgress";
import { DemandSummary } from "./DemandSummary";
import { DossierPanel } from "./DossierPanel";
import { DocumentsEditor, GoalsEditor, ResourcesEditor } from "./ItemEditors";
import { ScheduleEditor } from "./ScheduleEditor";
import { FieldShell, FormAlert, SelectInput, TextArea, TextInput, demandFieldId } from "./fields";

const LocationPicker = dynamic(
  () => import("@/components/app/LocationPicker").then((mod) => mod.LocationPicker),
  { ssr: false, loading: () => <div className="h-56 animate-pulse rounded-2xl" style={{ background: "var(--th-card-alt)" }} /> },
);

function dateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-xl">{children}</div>;
}

/**
 * Assistente de criação e edição da demanda (T09), nas etapas do Fluxo 2.
 * Cada etapa grava o rascunho no servidor ao avançar, voltar ou trocar de
 * etapa (o post-service aceita rascunho parcial e só exige tudo no envio).
 * `demandId` null: só a classificação, que cria o rascunho.
 */
export function DemandWizard({ demandId }: { demandId: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { user, status: authStatus } = useAuth();
  const { access, loading: accessLoading } = useInstitutionAccess();
  // Papel efetivo (T29): a própria categoria ou a que o vínculo empresta.
  const { role: effective, resolving: roleResolving } = useEffectiveRole();
  const isAgent = effective === "agent";

  const [demand, setDemand] = useState<Demand | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">(demandId ? "loading" : "ready");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<DemandFormState>(emptyDemandForm);
  const [saved, setSaved] = useState<DemandFormState>(emptyDemandForm);
  const requested = search.get("etapa");
  const [step, setStep] = useState<DemandStepId>(demandId && isDemandStepId(requested) ? requested : "classificacao");
  const [fieldErrors, setFieldErrors] = useState<DemandFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [validation, setValidation] = useState<DemandValidation | null>(null);
  const [validating, setValidating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gate, setGate] = useState<{ status: InstitutionValidationStatus | null } | null>(null);
  const [review, setReview] = useState<DemandReview | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const runValidation = useCallback(async (id: string) => {
    setValidating(true);
    try {
      setValidation(await api.validateDemand(id));
    } catch (err) {
      setSaveError(demandErrorMessage(err, "Não foi possível conferir a demanda agora."));
    } finally {
      setValidating(false);
    }
  }, []);

  // Carrega o rascunho (e o parecer, se devolvida).
  useEffect(() => {
    if (!demandId || authStatus !== "authenticated" || !isAgent) return;
    let alive = true;
    api.getMyDemand(demandId)
      .then(async (found) => {
        if (!alive) return;
        if (!found) {
          setLoadState("missing");
          return;
        }
        const f = formFromDemand(found);
        setDemand(found);
        setForm(f);
        setSaved(f);
        setLoadState("ready");
        const start = isDemandStepId(requested) ? requested : firstPendingStep(found);
        setStep(start);
        if (start === "revisao" && found.editable) void runValidation(found.id);
        if (found.reviewState === "devolvida") {
          const r = await api.myDemandReview(found.id).catch(() => null);
          if (alive) setReview(r);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setLoadError(demandErrorMessage(err, "Não foi possível abrir a demanda."));
        setLoadState("error");
      });
    return () => { alive = false; };
    // `requested` só vale na abertura.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demandId, authStatus, isAgent, runValidation]);

  const dirty = isStepDirty(step, form, saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function set<K extends keyof DemandFormState>(key: K, value: DemandFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setValidation((current) => {
      if (!current?.fields[key]) return current;
      const fields = { ...current.fields };
      delete fields[key];
      return { ...current, fields };
    });
  }

  /** Grava a etapa atual. Retorna false quando o servidor recusa algo. */
  async function persist(): Promise<boolean> {
    if (!demand) {
      // Etapa 1 de uma demanda nova: cria o rascunho com a categoria.
      if (!form.category) {
        setFieldErrors({ category: "Selecione a categoria da demanda" });
        return false;
      }
      setSaving(true);
      setSaveError(null);
      try {
        const created = await api.createDemand({ category: form.category });
        router.replace(demandEditPath(created.id, "descricao"));
        return false; // a página nova carrega o rascunho
      } catch (err) {
        if (isInstitutionNotValidated(err)) setGate({ status: gateStatusFrom(err) ?? access.status });
        setFieldErrors(fieldErrorsOf(err));
        setSaveError(demandErrorMessage(err));
        return false;
      } finally {
        setSaving(false);
      }
    }
    if (!demand.editable || !isStepDirty(step, form, saved)) return true;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await api.updateDemand(demand.id, stepInput(step, form));
      const f = formFromDemand(updated);
      setDemand(updated);
      setForm(f);
      setSaved(f);
      setFieldErrors({});
      setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      return true;
    } catch (err) {
      const fields = fieldErrorsOf(err);
      setFieldErrors(fields);
      setSaveError(Object.keys(fields).length
        ? "Confira os campos destacados antes de continuar."
        : demandErrorMessage(err));
      const first = Object.keys(fields)[0];
      if (first) setTimeout(() => document.getElementById(demandFieldId(first))?.focus(), 50);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function go(target: DemandStepId) {
    if (!(await persist())) return;
    setSaveError(null);
    setStep(target);
    router.replace(`${pathname}?etapa=${target}`, { scroll: false });
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(() => headingRef.current?.focus(), 80);
    if (target === "revisao" && demand?.editable) void runValidation(demand.id);
  }

  async function saveOnly() {
    if (await persist()) setSavedAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
  }

  async function onPhoto(file: UploadedFile | null) {
    if (!demand) return;
    setPhotoError(null);
    try {
      const updated = await api.updateDemand(demand.id, { photoRef: file?.ref ?? null });
      // Mantém o que o Agente digitou e ainda não gravou nesta etapa.
      setDemand({ ...updated, photoFile: file ?? null, photoUrl: file?.url ?? null });
    } catch (err) {
      setPhotoError(fieldErrorsOf(err).photoRef ?? demandErrorMessage(err));
    }
  }

  async function lookupCep() {
    const digits = form.cep.replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepStatus("Digite os 8 números do CEP para buscar o endereço.");
      return;
    }
    setCepLoading(true);
    setCepStatus(null);
    const address = await api.lookupCep(digits);
    setCepLoading(false);
    if (!address) {
      setCepStatus("Não encontramos este CEP. Preencha o endereço manualmente.");
      return;
    }
    setForm((current) => ({
      ...current,
      street: address.street ?? current.street,
      district: address.district ?? current.district,
      municipality: address.municipality ?? current.municipality,
      uf: address.uf ?? current.uf,
      territory: current.territory || address.district || "",
    }));
    setCepStatus("Endereço preenchido a partir do CEP. Confira, complete e marque o ponto no mapa.");
  }

  async function submit() {
    if (!demand) return;
    setSubmitting(true);
    setSaveError(null);
    setGate(null);
    try {
      const updated = await api.submitDemand(demand.id);
      setDemand(updated);
      setValidation(null);
    } catch (err) {
      if (isInstitutionNotValidated(err)) {
        setGate({ status: gateStatusFrom(err) ?? access.status });
      } else {
        const fields = fieldErrorsOf(err);
        if (Object.keys(fields).length) setValidation({ valid: false, fields, warnings: {}, composition: null });
        setSaveError(demandErrorMessage(err, "Não foi possível enviar agora. Tente de novo."));
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── Estados fora do formulário ─────────────────────────────
  if (authStatus === "unknown") {
    return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  }
  if (!user) {
    return (
      <Centered>
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Estruturar uma demanda</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>A demanda é criada pelo Agente de Transformação, com autoria e instituição identificadas.</p>
          <div className="mt-4"><AuthPrompt action="estruturar uma demanda" returnTo={demandId ? demandEditPath(demandId) : "/demandas/nova"} /></div>
        </Card>
      </Centered>
    );
  }
  if (roleResolving) return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando" /></div>;
  if (!isAgent) {
    return (
      <Centered>
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>Demandas são publicadas por Agentes de Transformação</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>
            Associações, ONGs, institutos, projetos sociais, coletivos, lideranças comunitárias e representantes de bairro identificam
            necessidades no território e as estruturam como demandas. Você pode acompanhar, apoiar e divulgar as demandas publicadas.
          </p>
          <Button className="mt-4" href="/feed">Ver o pulso</Button>
        </Card>
      </Centered>
    );
  }
  if (loadState === "loading") {
    return <div className="flex justify-center py-24"><span className="app-spinner" aria-label="Carregando a demanda" /></div>;
  }
  if (loadState === "missing" || loadState === "error") {
    return (
      <Centered>
        <Card>
          <h1 className="text-xl font-bold" style={{ color: "var(--th-text)" }}>{loadState === "missing" ? "Demanda não encontrada" : "Não foi possível abrir a demanda"}</h1>
          <p className="mt-2 text-sm" style={{ color: "var(--th-muted)" }}>{loadState === "missing" ? "Ela não existe ou pertence a outra conta." : loadError}</p>
          <Button className="mt-4" href={MY_DEMANDS_PATH} variant="secondary">Minhas demandas</Button>
        </Card>
      </Centered>
    );
  }

  // Enviada, em análise ou publicada: leitura, sem edição.
  if (demand && !demand.editable) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href={MY_DEMANDS_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
          <Icon name="arrowLeft" size={18} /> Minhas demandas
        </Link>
        <Card>
          <div className="flex flex-wrap items-center gap-2"><DemandStatusBadge status={demand.status} reviewState={demand.reviewState} /></div>
          <h1 className="mt-2 text-xl font-bold" style={{ color: "var(--th-text)" }}>{demand.title ?? "Demanda"}</h1>
          <p role="status" className="mt-2 text-sm" style={{ color: "var(--th-text)" }}>{demandGuidance(demand)}</p>
          {demand.submittedAt && <p className="mt-1 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>Enviada em {dateTime(demand.submittedAt)}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button href={MY_DEMANDS_PATH} variant="secondary" size="sm">Minhas demandas</Button>
            {demand.publishedAt && demand.status !== "arquivada" && <Button href={demandPublicPath(demand.id)} variant="outline" size="sm" icon="eye">Página pública</Button>}
          </div>
        </Card>
        <DossierPanel demandId={demand.id} />
        <DemandSummary demand={demand} />
      </div>
    );
  }

  const current = demandStep(step);
  const states = demandStepStates(demand);
  const prev = adjacentStep(step, -1);
  const next = adjacentStep(step, 1);
  const stepFields = Object.fromEntries(
    Object.entries({ ...(validation?.fields ?? {}), ...fieldErrors }).filter(([key]) => stepForErrorKey(key) === step),
  );
  const warnings = validation?.warnings ?? {};
  const setDemandFromEditor = (updated: Demand) => {
    setDemand(updated);
    setValidation(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={MY_DEMANDS_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: "var(--th-muted)" }}>
          <Icon name="arrowLeft" size={18} /> Minhas demandas
        </Link>
        {demand && <DemandStatusBadge status={demand.status} reviewState={demand.reviewState} />}
      </div>

      <header>
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "#f4841a" }}>{demand ? "Demanda em rascunho" : "Nova demanda"}</p>
        <p className="mt-0.5 text-xl font-bold" style={{ color: "var(--th-text)" }}>{demand?.title || "Estruturar uma demanda"}</p>
      </header>

      {demand?.reviewState === "devolvida" && (
        <section aria-labelledby="parecer-title" className="rounded-2xl border p-4" style={{ borderColor: "rgba(244,132,26,0.45)", background: "rgba(244,132,26,0.08)" }}>
          <h2 id="parecer-title" className="flex items-center gap-2 text-sm font-bold" style={{ color: "#f4841a" }}><Icon name="info" size={16} /> Devolvida para ajustes</h2>
          {demand.reviewNote && <p className="mt-2 whitespace-pre-line text-sm" style={{ color: "var(--th-text)" }}>{demand.reviewNote}</p>}
          {demand.reviewedAt && <p className="mt-1 text-xs font-numeric" style={{ color: "var(--th-muted)" }}>Parecer da equipe em {dateTime(demand.reviewedAt)}</p>}
          {review && review.returns.length > 1 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold" style={{ color: "#2e7ba8" }}>Devoluções anteriores ({review.returns.length - 1})</summary>
              <ul className="mt-2 space-y-2">
                {review.returns.slice(1).map((r) => (
                  <li key={r.createdAt} className="text-xs" style={{ color: "var(--th-muted)" }}>
                    <span className="font-numeric">{dateTime(r.createdAt)}</span>{r.note ? ` — ${r.note}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="mt-2 text-xs" style={{ color: "var(--th-text)" }}>Ajuste as etapas indicadas e envie de novo na revisão.</p>
        </section>
      )}

      <DemandProgress current={step} states={states} onGo={(s) => void go(s)} locked={!demand} />

      <section aria-labelledby="step-title" className="app-card rounded-2xl p-4 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
          Etapa {current.number} de 9{current.optional ? " · quando aplicável" : ""}
        </p>
        <h1 id="step-title" ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-bold outline-none" style={{ color: "var(--th-text)" }}>{current.title}</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>{current.intro}</p>

        <div className="mt-5">
          {step === "classificacao" && (
            <fieldset aria-describedby={stepFields.category ? `${demandFieldId("category")}-error` : undefined}>
              <legend className="sr-only">Categoria da demanda</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                {DEMAND_CATEGORIES.map((category) => {
                  const checked = form.category === category;
                  return (
                    <label
                      key={category}
                      className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors focus-within:ring-2 focus-within:ring-[#f4841a]"
                      style={{ borderColor: checked ? "#f4841a" : "var(--th-border)", background: checked ? "rgba(244,132,26,0.08)" : "var(--th-card)" }}
                    >
                      <input
                        type="radio"
                        name="category"
                        id={category === DEMAND_CATEGORIES[0] ? demandFieldId("category") : undefined}
                        value={category}
                        checked={checked}
                        onChange={() => set("category", category)}
                        className="sr-only"
                      />
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: checked ? "#f4841a" : "rgba(46,123,168,0.12)", color: checked ? "#fff" : "#2e7ba8" }}>
                        <Icon name={categoryIcon(category)} size={20} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold" style={{ color: "var(--th-text)" }}>{DEMAND_CATEGORY_LABELS[category]}</span>
                        <span className="block text-xs" style={{ color: "var(--th-muted)" }}>{DEMAND_CATEGORY_HELP[category]}</span>
                      </span>
                      {checked && <Icon name="check" size={18} className="ml-auto shrink-0" style={{ color: "#f4841a" }} />}
                    </label>
                  );
                })}
              </div>
              {stepFields.category && (
                <p id={`${demandFieldId("category")}-error`} className="mt-2 text-xs font-semibold" style={{ color: "#e53935" }}>{stepFields.category}</p>
              )}
            </fieldset>
          )}

          {step === "descricao" && demand && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput className="sm:col-span-2" name="title" label="Título da demanda" required value={form.title} onValue={(v) => set("title", v)} error={stepFields.title} maxLength={200} hint="Uma frase curta que identifique a demanda." />
              <TextArea className="sm:col-span-2" name="description" label="Descrição detalhada da demanda" required rows={6} value={form.description} onValue={(v) => set("description", v)} error={stepFields.description} maxLength={10000} />
              <FileUpload
                id={demandFieldId("photoRef")}
                label="Fotografia da situação, do local ou do projeto"
                purpose="demand_photo"
                target={{ demandId: demand.id }}
                value={demand.photoFile ?? null}
                onChange={(file) => void onPhoto(file)}
                error={photoError ?? stepFields.photoRef}
                required
                hint="A foto é gravada assim que o envio termina."
              />
              {demand.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={demand.photoUrl} alt="Prévia da fotografia enviada" className="max-h-56 w-full rounded-xl object-cover sm:col-span-2" />
              )}

              <h2 className="mt-2 text-sm font-bold sm:col-span-2" style={{ color: "var(--th-text)" }}>Localização (incluindo CEP)</h2>
              <FieldShell id={demandFieldId("cep")} label="CEP" required error={stepFields.cep}>
                <div className="flex gap-2">
                  <input
                    id={demandFieldId("cep")}
                    name="cep"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    value={form.cep}
                    onChange={(e) => set("cep", maskDemandCep(e.target.value))}
                    onBlur={() => { if (form.cep.replace(/\D/g, "").length === 8 && !form.street) void lookupCep(); }}
                    aria-required
                    aria-invalid={stepFields.cep ? true : undefined}
                    aria-describedby={[stepFields.cep ? `${demandFieldId("cep")}-error` : "", "dem-cep-status"].filter(Boolean).join(" ")}
                    className="app-input"
                    placeholder="00000-000"
                  />
                  <Button type="button" variant="outline" icon="search" loading={cepLoading} onClick={() => void lookupCep()}>Buscar</Button>
                </div>
              </FieldShell>
              <p id="dem-cep-status" role="status" aria-live="polite" className="self-end text-xs sm:pb-3" style={{ color: "var(--th-muted)" }}>{cepStatus}</p>
              <TextInput className="sm:col-span-2" name="street" label="Logradouro" value={form.street} onValue={(v) => set("street", v)} error={stepFields.street} maxLength={255} autoComplete="address-line1" />
              <TextInput name="addressNumber" label="Número" value={form.addressNumber} onValue={(v) => set("addressNumber", v)} error={stepFields.addressNumber} maxLength={30} />
              <TextInput name="addressComplement" label="Complemento" value={form.addressComplement} onValue={(v) => set("addressComplement", v)} error={stepFields.addressComplement} maxLength={120} autoComplete="address-line2" />
              <TextInput name="district" label="Bairro" value={form.district} onValue={(v) => set("district", v)} error={stepFields.district} maxLength={120} />
              <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                <TextInput name="municipality" label="Município" required value={form.municipality} onValue={(v) => set("municipality", v)} error={stepFields.municipality} maxLength={120} />
                <SelectInput name="uf" label="UF" required value={form.uf} onValue={(v) => set("uf", v)} error={stepFields.uf} placeholder="—" options={UFS.map((uf) => ({ value: uf, label: uf }))} />
              </div>
              <TextInput className="sm:col-span-2" name="territory" label="Território de abrangência" required value={form.territory} onValue={(v) => set("territory", v)} error={stepFields.territory} maxLength={255} hint="Bairro, comunidade ou região impactada." />
              <div className="sm:col-span-2">
                <p className="mb-1.5 text-sm font-semibold" style={{ color: "var(--th-text)" }}>Ponto no mapa</p>
                <LocationPicker
                  value={form.latitude != null && form.longitude != null ? { latitude: form.latitude, longitude: form.longitude } : null}
                  onChange={(c) => setForm((f) => ({ ...f, latitude: c?.latitude ?? null, longitude: c?.longitude ?? null }))}
                />
                <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
                  O ponto mostra a demanda no mapa depois da publicação. A página pública não exibe CEP, logradouro, número nem complemento.
                </p>
                {(stepFields.latitude || stepFields.longitude) && <p className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{stepFields.latitude ?? stepFields.longitude}</p>}
              </div>
            </div>
          )}

          {step === "publico" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput name="beneficiariesEstimate" label="Estimativa de pessoas beneficiadas" required inputMode="numeric" value={form.beneficiariesEstimate} onValue={(v) => set("beneficiariesEstimate", v.replace(/[^\d.]/g, ""))} error={stepFields.beneficiariesEstimate} />
              <fieldset>
                <legend className="mb-1.5 text-sm font-semibold" style={{ color: "var(--th-text)" }}>Nível de prioridade<span aria-hidden="true" style={{ color: "#e53935" }}> *</span></legend>
                <div className="grid grid-cols-2 gap-2" id={demandFieldId("priority")}>
                  {DEMAND_PRIORITIES.map((priority) => {
                    const checked = form.priority === priority;
                    return (
                      <label key={priority} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold focus-within:ring-2 focus-within:ring-[#f4841a]" style={{ borderColor: checked ? "#f4841a" : "var(--th-border)", background: checked ? "rgba(244,132,26,0.08)" : "var(--th-card)", color: "var(--th-text)" }}>
                        <input type="radio" name="priority" value={priority} checked={checked} onChange={() => set("priority", priority)} className="accent-[#f4841a]" />
                        {DEMAND_PRIORITY_LABELS[priority]}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>Conforme os critérios definidos pela plataforma; a equipe confere na análise.</p>
                {(stepFields.priority) && <p className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{stepFields.priority}</p>}
              </fieldset>
              <TextArea className="sm:col-span-2" name="beneficiariesProfile" label="Perfil dos beneficiários" required rows={3} value={form.beneficiariesProfile} onValue={(v) => set("beneficiariesProfile", v)} error={stepFields.beneficiariesProfile} maxLength={2000} />
              <TextArea className="sm:col-span-2" name="objective" label="Objetivo" required rows={3} value={form.objective} onValue={(v) => set("objective", v)} error={stepFields.objective} maxLength={5000} hint="O que se pretende resolver ou realizar." />
              <TextArea className="sm:col-span-2" name="justification" label="Justificativa" required rows={4} value={form.justification} onValue={(v) => set("justification", v)} error={stepFields.justification} maxLength={5000} hint="Explique a necessidade da ação." />
            </div>
          )}

          {step === "orcamento" && demand && (
            <BudgetEditor
              demand={demand}
              onDemand={setDemandFromEditor}
              disabled={!demand.editable}
              hasPhysicalExecution={form.hasPhysicalExecution}
              onPhysicalChange={(v) => set("hasPhysicalExecution", v)}
              stepErrors={stepFields}
            />
          )}
          {step === "cronograma" && demand && (
            <ScheduleEditor
              demand={demand}
              onDemand={setDemandFromEditor}
              disabled={!demand.editable}
              hasPhysicalExecution={form.hasPhysicalExecution}
              stepErrors={stepFields}
              warnings={warnings}
            />
          )}
          {step === "metas" && demand && <GoalsEditor demand={demand} onDemand={setDemandFromEditor} disabled={!demand.editable} stepErrors={stepFields} />}
          {step === "recursos" && demand && <ResourcesEditor demand={demand} onDemand={setDemandFromEditor} disabled={!demand.editable} stepErrors={stepFields} />}
          {step === "documentos" && demand && <DocumentsEditor demand={demand} onDemand={setDemandFromEditor} disabled={!demand.editable} stepErrors={stepFields} />}

          {step === "revisao" && demand && (
            <ReviewStep
              demand={demand}
              validation={validation}
              validating={validating}
              submitting={submitting}
              canSubmit={access.canActInstitutionally}
              accessLoading={accessLoading}
              accessStatus={gate?.status ?? access.status}
              gated={Boolean(gate) || (!accessLoading && !access.canActInstitutionally)}
              onRevalidate={() => void runValidation(demand.id)}
              onSubmit={() => void submit()}
              onGo={(s) => void go(s)}
            />
          )}
        </div>

        {saveError && <div className="mt-4"><FormAlert message={saveError} /></div>}
        {gate && step !== "revisao" && <div className="mt-4"><InstitutionGateNotice action="enviar_demanda" status={gate.status} kind="agente_transformacao" /></div>}

        <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: "var(--th-border)" }}>
          {prev && demand && <Button type="button" variant="outline" icon="chevronLeft" onClick={() => void go(prev)} disabled={saving}>Voltar</Button>}
          {demand && step !== "revisao" && (
            <Button type="button" variant="ghost" onClick={() => void saveOnly()} disabled={saving || !dirty}>Salvar rascunho</Button>
          )}
          <span className="text-xs" role="status" aria-live="polite" style={{ color: "var(--th-muted)" }}>
            {saving ? "Salvando…" : dirty ? "Alterações não salvas" : savedAt ? `Rascunho salvo às ${savedAt}` : demand ? "Rascunho salvo no servidor" : ""}
          </span>
          {next && (
            <Button type="button" className="ml-auto" iconRight="chevronRight" loading={saving} onClick={() => void go(next)}>
              {demand ? "Salvar e continuar" : "Criar rascunho e continuar"}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function ReviewStep({
  demand, validation, validating, submitting, canSubmit, accessLoading, accessStatus, gated, onRevalidate, onSubmit, onGo,
}: {
  demand: Demand;
  validation: DemandValidation | null;
  validating: boolean;
  submitting: boolean;
  canSubmit: boolean;
  accessLoading: boolean;
  accessStatus: InstitutionValidationStatus | null;
  gated: boolean;
  onRevalidate: () => void;
  onSubmit: () => void;
  onGo: (step: DemandStepId) => void;
}) {
  const grouped = validation ? errorsByStep(validation.fields) : {};
  const warningList = validation ? Object.entries(validation.warnings) : [];
  const ready = validation?.valid === true;

  return (
    <div className="space-y-5">
      <section aria-labelledby="check-title" aria-busy={validating} className="rounded-2xl border p-4" style={{ borderColor: ready ? "rgba(46,158,91,0.45)" : "var(--th-border)", background: ready ? "rgba(46,158,91,0.06)" : "var(--th-card-alt)" }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="check-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
            {validating ? "Conferindo a demanda…" : ready ? "Tudo pronto para o envio" : validation ? "Ainda falta completar" : "Conferência da demanda"}
          </h2>
          <Button type="button" size="sm" variant="outline" icon="check" onClick={onRevalidate} loading={validating}>Conferir de novo</Button>
        </div>
        {validation && !ready && (
          <ul className="mt-3 space-y-3" role="list">
            {Object.entries(grouped).map(([stepId, entries]) => {
              const s = demandStep(stepId as DemandStepId);
              return (
                <li key={stepId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Etapa {s.number} · {s.title}</p>
                    {stepId !== "revisao" && <Button type="button" size="sm" variant="ghost" iconRight="chevronRight" onClick={() => onGo(stepId as DemandStepId)}>Corrigir</Button>}
                  </div>
                  <ul className="mt-1 space-y-1">
                    {entries!.map(([key, message]) => (
                      <li key={key} className="flex items-start gap-1.5 text-sm" style={{ color: "var(--th-text)" }}>
                        <Icon name="info" size={14} className="mt-0.5 shrink-0" style={{ color: "#e53935" }} />
                        <span><strong>{demandFieldLabel(key)}:</strong> {message}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
        {warningList.length > 0 && (
          <ul className="mt-3 space-y-1">
            {warningList.map(([key, message]) => (
              <li key={key} className="flex items-start gap-1.5 text-sm" style={{ color: "var(--th-text)" }}>
                <Icon name="info" size={14} className="mt-0.5 shrink-0" style={{ color: "#2e7ba8" }} />
                <span>{message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DemandSummary demand={demand} onEdit={onGo} />

      {demand.submittedAt && <DossierPanel demandId={demand.id} />}

      <section aria-labelledby="send-title" className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)" }}>
        <h2 id="send-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Envio para análise</h2>
        <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
          Ao enviar, a plataforma gera o Documento Oficial da Demanda — Dossiê da Demanda (PDF), que você baixa em Minhas demandas.
          A equipe do DM Conecta analisa e valida a demanda; com a aprovação, a demanda é publicada para potenciais parceiros e o
          dossiê ganha a versão da publicação. Enquanto aguarda a análise, a demanda não pode ser alterada.
        </p>
        {gated ? (
          <div className="mt-3"><InstitutionGateNotice action="enviar_demanda" status={accessStatus} kind="agente_transformacao" /></div>
        ) : (
          <Button
            type="button"
            className="mt-3"
            icon="send"
            loading={submitting}
            disabled={!ready || !canSubmit || accessLoading || validating}
            onClick={onSubmit}
          >
            {demand.reviewState === "devolvida" ? "Reenviar para análise" : "Enviar para análise"}
          </Button>
        )}
        {!ready && !gated && validation && <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>Complete as pendências acima para liberar o envio.</p>}
      </section>
    </div>
  );
}
