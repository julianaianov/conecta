"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/app/api";
import {
  RECORD_MILESTONES,
  RECORD_MILESTONE_LABELS,
  budgetItemToInput,
  demandErrorMessage,
  emptyScheduleItemForm,
  fieldErrorsOf,
  formatCents,
  formatIsoDate,
  physicalFinancialRows,
  scheduleItemFormFrom,
  scheduleItemInput,
  type ScheduleItemForm,
} from "@/lib/app/demand";
import type { Demand, DemandBudgetItem, DemandScheduleItem } from "@/lib/app/types";
import { Button } from "../Button";
import { ScheduleList } from "./DemandParts";
import { Checkbox, FormAlert, TextArea, TextInput, demandFieldId } from "./fields";

/**
 * Etapa 06 · Cronograma (Fluxo 2, slides 13 e 14): etapas, atividades,
 * prazos e responsáveis; vínculo de cada custo à etapa (físico-financeiro) e
 * momentos de registro antes / acompanhamento / depois.
 */
// TODO(fonte-da-verdade): Modelo de Conexão §05 — etapa sem recursos necessários, valor associado explícito e status; ver TODO em services/post-service/migrations/007-demands.sql.
export function ScheduleEditor({ demand, onDemand, disabled, hasPhysicalExecution, stepErrors, warnings }: {
  demand: Demand;
  onDemand: (next: Demand) => void;
  disabled: boolean;
  hasPhysicalExecution: boolean;
  stepErrors: Record<string, string>;
  warnings: Record<string, string>;
}) {
  const items = demand.scheduleItems ?? [];
  const budget = demand.budgetItems ?? [];
  const [form, setForm] = useState<ScheduleItemForm>(emptyScheduleItemForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  const set = <K extends keyof ScheduleItemForm>(key: K, value: ScheduleItemForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  function reset() {
    setForm(emptyScheduleItemForm());
    setEditingId(null);
    setErrors({});
  }

  function startEdit(item: DemandScheduleItem) {
    setEditingId(item.id);
    setForm(scheduleItemFormFrom(item));
    setErrors({});
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 250);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { input, errors: local } = scheduleItemInput(form);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const result = editingId
        ? await api.updateDemandItem(demand.id, "schedule-items", editingId, input)
        : await api.addDemandItem(demand.id, "schedule-items", input);
      const next = editingId ? items.map((i) => (i.id === editingId ? result.item : i)) : [...items, result.item];
      onDemand({ ...demand, scheduleItems: next });
      setStatus(editingId ? "Etapa atualizada." : "Etapa adicionada ao cronograma.");
      reset();
    } catch (err) {
      const fields = fieldErrorsOf(err);
      if (Object.keys(fields).length) setErrors(fields);
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: { id: string; stage: string }) {
    if (!window.confirm(`Remover a etapa "${item.stage}" do cronograma? Os itens do orçamento vinculados a ela ficam sem etapa.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api.removeDemandItem(demand.id, "schedule-items", item.id);
      // Os itens do orçamento perdem o vínculo no banco (ON DELETE SET NULL).
      const fresh = await api.getMyDemand(demand.id);
      if (fresh) onDemand(fresh);
      if (editingId === item.id) reset();
      setStatus("Etapa removida.");
    } catch (err) {
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function link(item: DemandBudgetItem, scheduleItemId: string) {
    setLinking(item.id);
    setMessage(null);
    try {
      const result = await api.updateDemandItem(demand.id, "budget-items", item.id,
        budgetItemToInput(item, { scheduleItemId: scheduleItemId || null }));
      onDemand({ ...demand, budgetItems: budget.map((b) => (b.id === item.id ? result.item : b)), composition: result.composition });
      setStatus("Vínculo atualizado.");
    } catch (err) {
      setMessage(demandErrorMessage(err));
    } finally {
      setLinking(null);
    }
  }

  const rows = physicalFinancialRows(budget, items);
  const milestones = new Set(items.flatMap((i) => i.recordMilestones));

  return (
    <div className="space-y-5">
      {hasPhysicalExecution && (
        <div className="rounded-xl border p-3 text-sm" style={{ borderColor: "rgba(46,123,168,0.35)", background: "rgba(46,123,168,0.06)", color: "var(--th-text)" }}>
          <p>O cronograma deve prever os momentos de registro fotográfico e audiovisual:</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {RECORD_MILESTONES.map((m) => (
              <li key={m} className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: milestones.has(m) ? "rgba(46,158,91,0.12)" : "var(--th-card)", color: milestones.has(m) ? "#2e9e5b" : "var(--th-muted)" }}>
                {milestones.has(m) ? "✓" : "○"} {RECORD_MILESTONE_LABELS[m]}{m === "acompanhamento" ? " (recomendado)" : " (obrigatório)"}
              </li>
            ))}
          </ul>
        </div>
      )}
      {stepErrors.recordMilestones && <FormAlert message={stepErrors.recordMilestones} />}
      {!stepErrors.recordMilestones && warnings.recordMilestones && <FormAlert tone="info" message={warnings.recordMilestones} />}

      <ScheduleList
        items={items}
        budgetItems={budget}
        actions={disabled ? undefined : (item) => (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="ghost" icon="edit" aria-label={`Editar etapa ${item.stage}`} disabled={busy} onClick={() => startEdit(item as DemandScheduleItem)} />
            <Button type="button" size="sm" variant="ghost" icon="close" aria-label={`Remover etapa ${item.stage}`} disabled={busy} onClick={() => void remove(item)} />
          </div>
        )}
      />
      {stepErrors.scheduleItems && <FormAlert message={stepErrors.scheduleItems} />}

      {!disabled && (
        <form ref={formRef} onSubmit={save} noValidate className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }} aria-labelledby="schedule-form-title">
          <h3 id="schedule-form-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{editingId ? "Editar etapa" : "Nova etapa do cronograma"}</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextInput className="sm:col-span-2" name="schedule-stage" label="Etapa do projeto" required value={form.stage} onValue={(v) => set("stage", v)} error={errors.stage} maxLength={255} />
            <TextArea className="sm:col-span-2" name="schedule-activities" label="Atividades previstas" required rows={3} value={form.activities} onValue={(v) => set("activities", v)} error={errors.activities} maxLength={5000} />
            <TextInput name="schedule-startsOn" label="Data de início" required type="date" value={form.startsOn} onValue={(v) => set("startsOn", v)} error={errors.startsOn} />
            <TextInput name="schedule-endsOn" label="Data de término" required type="date" min={form.startsOn || undefined} value={form.endsOn} onValue={(v) => set("endsOn", v)} error={errors.endsOn} />
            <TextInput className="sm:col-span-2" name="schedule-responsible" label="Responsável (quando aplicável)" value={form.responsible} onValue={(v) => set("responsible", v)} error={errors.responsible} maxLength={255} hint="Fica só no dossiê e na análise: a página pública não mostra o responsável." />
            <fieldset className="sm:col-span-2">
              <legend className="mb-1.5 text-sm font-semibold" style={{ color: "var(--th-text)" }}>Registro fotográfico e audiovisual nesta etapa</legend>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
                {RECORD_MILESTONES.map((m) => (
                  <Checkbox
                    key={m}
                    name={`schedule-milestone-${m}`}
                    label={RECORD_MILESTONE_LABELS[m]}
                    checked={form.recordMilestones.includes(m)}
                    onChecked={(checked) => set("recordMilestones", checked
                      ? [...form.recordMilestones, m]
                      : form.recordMilestones.filter((x) => x !== m))}
                  />
                ))}
              </div>
              {errors.recordMilestones && <p className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{errors.recordMilestones}</p>}
            </fieldset>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="submit" size="sm" icon={editingId ? "check" : "plus"} loading={busy}>{editingId ? "Salvar etapa" : "Adicionar etapa"}</Button>
            {editingId && <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>}
          </div>
          {message && <div className="mt-3"><FormAlert message={message} /></div>}
        </form>
      )}

      {budget.length > 0 && items.length > 0 && (
        <section aria-labelledby="pf-title" className="space-y-3">
          <div>
            <h3 id="pf-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Cronograma físico-financeiro</h3>
            <p className="text-xs" style={{ color: "var(--th-muted)" }}>Sempre que possível, relacione cada item do orçamento à etapa em que o custo acontece.</p>
          </div>
          {warnings.physicalFinancial && <FormAlert tone="info" message={warnings.physicalFinancial} />}
          <ul className="space-y-2">
            {budget.map((item) => {
              const id = demandFieldId(`link-${item.id}`);
              return (
                <li key={item.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--th-border)" }}>
                  <label htmlFor={id} className="min-w-0 flex-1 text-sm" style={{ color: "var(--th-text)" }}>
                    <span className="font-semibold">{item.description}</span>
                    <span className="ml-2 font-numeric text-xs" style={{ color: "var(--th-muted)" }}>{formatCents(item.totalCents)}</span>
                  </label>
                  <select
                    id={id}
                    className="app-input sm:w-72"
                    value={item.scheduleItemId ?? ""}
                    disabled={disabled || linking === item.id}
                    onChange={(e) => void link(item, e.target.value)}
                  >
                    <option value="">Sem etapa vinculada</option>
                    {items.map((s) => <option key={s.id} value={s.id}>{s.stage} ({formatIsoDate(s.startsOn)})</option>)}
                  </select>
                </li>
              );
            })}
          </ul>
          <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--th-border)" }}>
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="sr-only">Custo por etapa</caption>
              <thead style={{ background: "var(--th-card-alt)", color: "var(--th-muted)" }}>
                <tr className="text-xs uppercase tracking-wide">
                  <th scope="col" className="px-3 py-2">Etapa</th>
                  <th scope="col" className="px-3 py-2">Período</th>
                  <th scope="col" className="px-3 py-2 text-right">Itens</th>
                  <th scope="col" className="px-3 py-2 text-right">Custo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.scheduleItemId ?? "sem-etapa"} className="border-t" style={{ borderColor: "var(--th-border)", color: row.scheduleItemId ? "var(--th-text)" : "var(--th-muted)" }}>
                    <th scope="row" className="px-3 py-2 font-semibold">{row.stage}</th>
                    <td className="px-3 py-2 font-numeric">{row.startsOn ? `${formatIsoDate(row.startsOn)} a ${formatIsoDate(row.endsOn)}` : "—"}</td>
                    <td className="px-3 py-2 text-right font-numeric">{row.itemCount}</td>
                    <td className="px-3 py-2 text-right font-numeric font-semibold">{formatCents(row.totalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {message && disabled && <FormAlert message={message} />}
      <p className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}
