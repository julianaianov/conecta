"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/app/api";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  RESOURCE_TYPE_LABELS,
  demandErrorMessage,
  fieldErrorsOf,
  goalInput,
} from "@/lib/app/demand";
import {
  DEMAND_RESOURCE_TYPES,
  type Demand,
  type DemandDocument,
  type DemandDocumentType,
  type DemandGoal,
  type DemandGoalInput,
  type DemandResource,
  type DemandResourceKind,
  type DemandResourceType,
  type UploadedFile,
} from "@/lib/app/types";
import { formatBytes } from "@/lib/app/uploads";
import { DEMAND_MODULE_LABELS, MODULE_DOCUMENT_TYPES, MODULE_INDICATORS, documentTypesFor, moduleOf } from "@/lib/app/demand-modules";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Icon } from "../Icon";
import { GoalsList } from "./DemandParts";
import { FormAlert, SelectInput, TextArea, TextInput, demandFieldId } from "./fields";

type EditorProps = {
  demand: Demand;
  onDemand: (next: Demand) => void;
  disabled: boolean;
  stepErrors: Record<string, string>;
};

// ── Etapa 07 · Metas e resultados esperados (slide 15) ─────

const EMPTY_GOAL: DemandGoalInput = { goal: "", expectedResult: "", indicator: "", measurementMethod: "" };

export function GoalsEditor({ demand, onDemand, disabled, stepErrors }: EditorProps) {
  // Indicadores sugeridos do módulo (T-05-08): atalhos; o indicador segue texto livre.
  const goalModule = moduleOf(demand.category);
  const indicatorSuggestions = goalModule ? MODULE_INDICATORS[goalModule] : [];
  const moduleLabel = goalModule ? DEMAND_MODULE_LABELS[goalModule] : "";
  const goals = demand.goals ?? [];
  const [form, setForm] = useState<DemandGoalInput>(EMPTY_GOAL);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const set = (key: keyof DemandGoalInput, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  function reset() {
    setForm(EMPTY_GOAL);
    setEditingId(null);
    setErrors({});
  }

  function startEdit(goal: DemandGoal) {
    setEditingId(goal.id);
    setForm({ goal: goal.goal, expectedResult: goal.expectedResult, indicator: goal.indicator, measurementMethod: goal.measurementMethod });
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => formRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(), 250);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { input, errors: local } = goalInput(form);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = editingId
        ? await api.updateDemandItem(demand.id, "goals", editingId, input)
        : await api.addDemandItem(demand.id, "goals", input);
      onDemand({ ...demand, goals: editingId ? goals.map((g) => (g.id === editingId ? result.item : g)) : [...goals, result.item] });
      setStatus(editingId ? "Meta atualizada." : "Meta adicionada.");
      reset();
    } catch (err) {
      const fields = fieldErrorsOf(err);
      if (Object.keys(fields).length) setErrors(fields);
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(goal: DemandGoal) {
    if (!window.confirm("Remover esta meta?")) return;
    setBusy(true);
    try {
      await api.removeDemandItem(demand.id, "goals", goal.id);
      onDemand({ ...demand, goals: goals.filter((g) => g.id !== goal.id) });
      if (editingId === goal.id) reset();
      setStatus("Meta removida.");
    } catch (err) {
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <GoalsList
        goals={goals}
        actions={disabled ? undefined : (goal) => (
          <div className="flex shrink-0 gap-1">
            <Button type="button" size="sm" variant="ghost" icon="edit" aria-label="Editar meta" disabled={busy} onClick={() => startEdit(goal)} />
            <Button type="button" size="sm" variant="ghost" icon="close" aria-label="Remover meta" disabled={busy} onClick={() => void remove(goal)} />
          </div>
        )}
      />
      {stepErrors.goals && <FormAlert message={stepErrors.goals} />}
      {!disabled && (
        <form ref={formRef} onSubmit={save} noValidate className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }} aria-labelledby="goal-form-title">
          <h3 id="goal-form-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{editingId ? "Editar meta" : "Nova meta"}</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextArea name="goal-goal" label="Meta a ser alcançada" required rows={2} value={form.goal} onValue={(v) => set("goal", v)} error={errors.goal} maxLength={2000} />
            <TextArea name="goal-expectedResult" label="Resultado esperado" required rows={2} value={form.expectedResult} onValue={(v) => set("expectedResult", v)} error={errors.expectedResult} maxLength={2000} />
            <div>
              <TextArea name="goal-indicator" label="Indicador de acompanhamento" required rows={2} value={form.indicator} onValue={(v) => set("indicator", v)} error={errors.indicator} maxLength={2000} />
              {indicatorSuggestions.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs" style={{ color: "var(--th-muted)" }}>Indicadores sugeridos do {moduleLabel}:</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {indicatorSuggestions.map((indicator) => (
                      <li key={indicator}>
                        <button type="button" className="app-chip text-xs" data-active={form.indicator === indicator} aria-pressed={form.indicator === indicator} onClick={() => set("indicator", indicator)}>
                          {indicator}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <TextArea name="goal-measurementMethod" label="Forma de mensuração dos resultados" required rows={2} value={form.measurementMethod} onValue={(v) => set("measurementMethod", v)} error={errors.measurementMethod} maxLength={2000} />
          </div>
          <p className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>
            Os registros fotográficos e audiovisuais poderão ser usados como evidências complementares dos resultados alcançados.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" size="sm" icon={editingId ? "check" : "plus"} loading={busy}>{editingId ? "Salvar meta" : "Adicionar meta"}</Button>
            {editingId && <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>}
          </div>
          {message && <div className="mt-3"><FormAlert message={message} /></div>}
        </form>
      )}
      <p className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}

// ── Etapa 07 · Recursos necessários e contrapartida (slide 16) ──

const KIND_TEXT: Record<DemandResourceKind, { title: string; text: string }> = {
  necessario: {
    title: "Recursos necessários",
    text: "O que é necessário para a realização da demanda.",
  },
  contrapartida: {
    title: "Contrapartida",
    text: "O que a sua instituição já possui e poderá disponibilizar para a execução do projeto.",
  },
};

function ResourceRow({ demand, kind, type, resource, disabled, onChanged }: {
  demand: Demand; kind: DemandResourceKind; type: DemandResourceType; resource: DemandResource | undefined;
  disabled: boolean; onChanged: (next: { removed?: string; item?: DemandResource }, message?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState(resource?.description ?? "");
  const id = demandFieldId(`resource-${kind}-${type}`);
  const label = RESOURCE_TYPE_LABELS[type];

  async function toggle(checked: boolean) {
    setBusy(true);
    try {
      if (checked) {
        const result = await api.addDemandItem(demand.id, "resources", { kind, type, description: description.trim() || null });
        onChanged({ item: result.item }, `${label} incluído.`);
      } else if (resource) {
        await api.removeDemandItem(demand.id, "resources", resource.id);
        onChanged({ removed: resource.id }, `${label} removido.`);
      }
    } catch (err) {
      onChanged({}, demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveDescription() {
    if (!resource || (resource.description ?? "") === description.trim()) return;
    setBusy(true);
    try {
      const result = await api.updateDemandItem(demand.id, "resources", resource.id, { kind, type, description: description.trim() || null });
      onChanged({ item: result.item }, "Detalhe salvo.");
    } catch (err) {
      onChanged({}, demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-xl border p-3" style={{ borderColor: resource ? "rgba(244,132,26,0.45)" : "var(--th-border)", background: resource ? "rgba(244,132,26,0.05)" : undefined }}>
      <div className="flex items-center gap-2.5">
        <input id={id} type="checkbox" className="h-4 w-4 shrink-0 accent-[#f4841a]" checked={Boolean(resource)} disabled={disabled || busy} onChange={(e) => void toggle(e.target.checked)} />
        <label htmlFor={id} className="flex-1 text-sm font-semibold" style={{ color: "var(--th-text)" }}>{label}</label>
        {busy && <span className="app-spinner" style={{ width: 14, height: 14 }} aria-label="Salvando" />}
      </div>
      {resource && (
        <div className="mt-2">
          <label htmlFor={`${id}-desc`} className="sr-only">Detalhes de {label}</label>
          <textarea
            id={`${id}-desc`}
            className="app-textarea"
            style={{ minHeight: "3.5rem" }}
            rows={2}
            maxLength={2000}
            placeholder="Detalhe, se quiser (quantidade, especificação, observações)"
            value={description}
            disabled={disabled}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => void saveDescription()}
          />
        </div>
      )}
    </li>
  );
}

export function ResourcesEditor({ demand, onDemand, disabled, stepErrors }: EditorProps) {
  const resources = demand.resources ?? [];
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  // O `onDemand` do pai troca a demanda inteira: acumula aqui para não perder mudanças em paralelo.
  const latest = useRef(demand);
  useEffect(() => {
    latest.current = demand;
  });

  function changed(next: { removed?: string; item?: DemandResource }, text?: string) {
    const current = latest.current.resources ?? [];
    let list = current;
    if (next.removed) list = current.filter((r) => r.id !== next.removed);
    if (next.item) {
      const item = next.item;
      list = current.some((r) => r.id === item.id) ? current.map((r) => (r.id === item.id ? item : r)) : [...current, item];
    }
    if (list !== current) {
      latest.current = { ...latest.current, resources: list };
      onDemand(latest.current);
    }
    if (text) setMessage({ text, error: !next.item && !next.removed });
  }

  return (
    <div className="space-y-5">
      {(["necessario", "contrapartida"] as DemandResourceKind[]).map((kind) => (
        <fieldset key={kind} className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)" }}>
          <legend className="px-1 text-sm font-bold" style={{ color: "var(--th-text)" }}>{KIND_TEXT[kind].title}</legend>
          <p className="text-xs" style={{ color: "var(--th-muted)" }}>{KIND_TEXT[kind].text}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {DEMAND_RESOURCE_TYPES[kind].map((type) => {
              const resource = resources.find((r) => r.kind === kind && r.type === type);
              return (
                <ResourceRow
                  key={`${kind}-${type}-${resource?.id ?? "novo"}`}
                  demand={demand}
                  kind={kind}
                  type={type}
                  resource={resource}
                  disabled={disabled}
                  onChanged={changed}
                />
              );
            })}
          </ul>
        </fieldset>
      ))}
      {stepErrors.resources && <FormAlert message={stepErrors.resources} />}
      {message && (message.error ? <FormAlert message={message.text} /> : <p className="sr-only" aria-live="polite">{message.text}</p>)}
    </div>
  );
}

// ── Etapa 07 · Documentação comprobatória (slide 17) ───────

export function DocumentsEditor({ demand, onDemand, disabled, stepErrors }: EditorProps) {
  const docModule = moduleOf(demand.category);
  const moduleDocuments = docModule ? MODULE_DOCUMENT_TYPES[docModule] : [];
  const documents = demand.documents ?? [];
  const [type, setType] = useState<DemandDocumentType | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string> = {};
    if (!type) local.type = "Selecione o tipo do documento";
    if (!title.trim()) local.title = "Informe o nome do documento";
    if (!file) local.reference = "Anexe o documento";
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.addDemandItem(demand.id, "documents", {
        type: type as DemandDocumentType, title: title.trim(), reference: file!.ref, description: description.trim() || null,
      });
      onDemand({ ...demand, documents: [...documents, { ...result.item, file: result.item.file ?? file }] });
      setType("");
      setTitle("");
      setDescription("");
      setFile(null);
      setErrors({});
      setStatus("Documento anexado à demanda.");
    } catch (err) {
      const fields = fieldErrorsOf(err);
      if (Object.keys(fields).length) setErrors(fields);
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: DemandDocument) {
    if (!window.confirm(`Remover "${doc.title}" da demanda?`)) return;
    setBusy(true);
    try {
      await api.removeDemandItem(demand.id, "documents", doc.id);
      onDemand({ ...demand, documents: documents.filter((d) => d.id !== doc.id) });
      setStatus("Documento removido.");
    } catch (err) {
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {documents.length > 0 ? (
        <ul className="space-y-2">
          {documents.map((doc) => (
            <li key={doc.id} className="flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center" style={{ borderColor: "var(--th-border)" }}>
              <Icon name="inventory" size={16} className="hidden shrink-0 sm:block" style={{ color: "#2e7ba8" }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{doc.title}</p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                  {DOCUMENT_TYPE_LABELS[doc.type] ?? "Documento"}
                  {doc.file ? ` · ${doc.file.fileName ?? "arquivo"} · ${formatBytes(doc.file.size)}` : ""}
                </p>
              </div>
              <div className="flex gap-1">
                {doc.file?.url && (
                  <a href={doc.file.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-semibold" style={{ color: "#2e7ba8" }}>
                    <Icon name="eye" size={16} /> Abrir
                  </a>
                )}
                {!disabled && <Button type="button" size="sm" variant="ghost" icon="close" aria-label={`Remover ${doc.title}`} disabled={busy} onClick={() => void remove(doc)} />}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "var(--th-muted)" }}>Nenhum documento anexado. A documentação é opcional e entra quando aplicável.</p>
      )}
      {stepErrors.documents && <FormAlert message={stepErrors.documents} />}

      {!disabled && (
        <form onSubmit={add} noValidate className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }} aria-labelledby="doc-form-title">
          <h3 id="doc-form-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Anexar documento</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectInput
              name="doc-type" label="Tipo" required value={type} placeholder="Selecione"
              onValue={(v) => { setType(v as DemandDocumentType | ""); setErrors((e) => ({ ...e, type: "" })); }}
              options={documentTypesFor(demand.category, DOCUMENT_TYPES).map((t) => ({ value: t, label: DOCUMENT_TYPE_LABELS[t] }))}
              hint={moduleDocuments.length ? `Os primeiros são os documentos possíveis do ${DEMAND_MODULE_LABELS[moduleOf(demand.category)!]}.` : undefined}
              error={errors.type || undefined}
            />
            <TextInput name="doc-title" label="Nome do documento" required value={title} onValue={(v) => { setTitle(v); setErrors((e) => ({ ...e, title: "" })); }} error={errors.title || undefined} maxLength={255} />
            <TextArea className="sm:col-span-2" name="doc-description" label="Descrição (opcional)" rows={2} value={description} onValue={setDescription} maxLength={2000} />
            <FileUpload
              id={demandFieldId("doc-reference")}
              label="Arquivo"
              purpose="demand_document"
              target={{ demandId: demand.id }}
              value={file}
              onChange={(f) => { setFile(f); setErrors((e) => ({ ...e, reference: "" })); }}
              error={errors.reference || undefined}
              required
            />
          </div>
          <div className="mt-4">
            <Button type="submit" size="sm" icon="plus" loading={busy}>Adicionar documento</Button>
          </div>
          {message && <div className="mt-3"><FormAlert message={message} /></div>}
        </form>
      )}
      <p className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}
