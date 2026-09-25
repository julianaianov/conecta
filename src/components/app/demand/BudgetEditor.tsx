"use client";

import { useEffect, useRef, useState } from "react";
import { api, BudgetImportError } from "@/lib/app/api";
import {
  BUDGET_CSV_HEADER,
  BUDGET_CSV_MAX_BYTES,
  budgetCsvTemplate,
  budgetImportErrorLines,
  budgetItemFormFrom,
  budgetItemInput,
  computeComposition,
  demandErrorMessage,
  emptyBudgetItemForm,
  fieldErrorsOf,
  formatCents,
  lineTotalCents,
  parseMoneyToCents,
  type BudgetItemForm,
} from "@/lib/app/demand";
import type { Demand, DemandBudgetItem, DemandBudgetItemInput, DemandComposition } from "@/lib/app/types";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { BudgetTable, CompositionCard } from "./DemandParts";
import { Checkbox, FormAlert, TextInput } from "./fields";

const AUDIOVISUAL_DESCRIPTION = "Registro fotográfico e audiovisual do antes e do depois";

function savedInputs(items: DemandBudgetItem[], skipId: string | null): DemandBudgetItemInput[] {
  return items.filter((item) => item.id !== skipId).map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    unit: item.unit,
    unitPriceCents: item.unitPriceCents,
  }));
}

function localComposition(inputs: DemandBudgetItemInput[]): DemandComposition {
  const base = inputs.reduce((sum, item) => sum + (lineTotalCents(item.quantity, item.unitPriceCents) ?? 0), 0);
  return computeComposition(base);
}

function isBlankForm(form: BudgetItemForm) {
  return !form.item.trim() && !form.description.trim() && !form.unit.trim() && !form.unitPrice.trim();
}

/**
 * Etapa 05 · Orçamento (Fluxo 2, slides 9 a 12; Modelo de Conexão §04):
 * planilha com item, descrição, quantidade, unidade, valor unitário, total e
 * fornecedor ou referência; importação da planilha em CSV; item obrigatório de
 * registro fotográfico/audiovisual quando há execução física e composição
 * 4%/6% calculada ao vivo pelo servidor (preview).
 */
export function BudgetEditor({ demand, onDemand, disabled, hasPhysicalExecution, onPhysicalChange, stepErrors }: {
  demand: Demand;
  onDemand: (next: Demand) => void;
  disabled: boolean;
  hasPhysicalExecution: boolean;
  onPhysicalChange: (value: boolean) => void;
  stepErrors: Record<string, string>;
}) {
  const items = demand.budgetItems ?? [];
  const [form, setForm] = useState<BudgetItemForm>(emptyBudgetItemForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<{ key: string; composition: DemandComposition } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Planilha em edição: itens gravados (menos o que está sendo editado) + a linha do formulário.
  const pending = budgetItemInput(form);
  const pendingValid = !isBlankForm(form) && Object.keys(pending.errors).length === 0;
  const previewInputs = [...savedInputs(items, editingId), ...(pendingValid ? [pending.input] : [])];
  const previewKey = JSON.stringify(previewInputs);
  const needsPreview = pendingValid || editingId !== null;

  useEffect(() => {
    if (!needsPreview) return;
    const inputs = JSON.parse(previewKey) as DemandBudgetItemInput[];
    let alive = true;
    const timer = setTimeout(() => {
      api.previewDemandComposition(inputs)
        .then((result) => { if (alive) setPreview({ key: previewKey, composition: result.composition }); })
        .catch(() => { if (alive) setPreview({ key: previewKey, composition: localComposition(inputs) }); });
    }, 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [needsPreview, previewKey]);

  const composition = needsPreview
    ? (preview?.key === previewKey ? preview.composition : localComposition(previewInputs))
    : demand.composition;
  const previewPending = needsPreview && preview?.key !== previewKey;

  const hasAudiovisual = items.some((item) => item.isAudiovisualRecord && item.totalCents > 0);
  const lineTotal = pendingValid ? lineTotalCents(pending.input.quantity, pending.input.unitPriceCents) : null;
  const unitCents = parseMoneyToCents(form.unitPrice);

  const set = <K extends keyof BudgetItemForm>(key: K, value: BudgetItemForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key === "unitPrice" ? "unitPriceCents" : key];
      return next;
    });
  };

  function reset() {
    setForm(emptyBudgetItemForm());
    setEditingId(null);
    setErrors({});
  }

  function startEdit(item: DemandBudgetItem) {
    setEditingId(item.id);
    setForm(budgetItemFormFrom(item));
    setErrors({});
    setMessage(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => formRef.current?.querySelector<HTMLInputElement>("input")?.focus(), 250);
  }

  function prefillAudiovisual() {
    setEditingId(null);
    setForm({ ...emptyBudgetItemForm(), description: AUDIOVISUAL_DESCRIPTION, isAudiovisualRecord: true });
    setErrors({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { input, errors: local } = budgetItemInput(form);
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    // Mantém o vínculo com a etapa do item em edição.
    const original = editingId ? items.find((item) => item.id === editingId) : null;
    const body = { ...input, scheduleItemId: original?.scheduleItemId ?? null };
    setBusy(true);
    setMessage(null);
    try {
      const result = editingId
        ? await api.updateDemandItem(demand.id, "budget-items", editingId, body)
        : await api.addDemandItem(demand.id, "budget-items", body);
      const nextItems = editingId
        ? items.map((item) => (item.id === editingId ? result.item : item))
        : [...items, result.item];
      onDemand({ ...demand, budgetItems: nextItems, composition: result.composition });
      setStatus(editingId ? "Item atualizado." : "Item adicionado ao orçamento.");
      reset();
    } catch (err) {
      const fields = fieldErrorsOf(err);
      if (Object.keys(fields).length) setErrors(fields);
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: DemandBudgetItem) {
    if (!window.confirm(`Remover "${item.description}" do orçamento?`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api.removeDemandItem(demand.id, "budget-items", item.id);
      onDemand({ ...demand, budgetItems: items.filter((i) => i.id !== item.id), composition: result.composition });
      if (editingId === item.id) reset();
      setStatus("Item removido do orçamento.");
    } catch (err) {
      setMessage(demandErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const audiovisualError = stepErrors.audiovisualRecord;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
        <Checkbox
          name="hasPhysicalExecution"
          label="Há execução física ou intervenção que permita o registro do antes e do depois"
          checked={hasPhysicalExecution}
          onChecked={onPhysicalChange}
          disabled={disabled}
          hint="Nesse caso, o custo do registro fotográfico e audiovisual é item obrigatório do orçamento e o cronograma prevê os momentos de registro."
        />
      </div>

      {hasPhysicalExecution && !hasAudiovisual && (
        <div role={audiovisualError ? "alert" : undefined} className="rounded-xl border p-3" style={{ borderColor: "rgba(244,132,26,0.45)", background: "rgba(244,132,26,0.08)" }}>
          <p className="flex items-start gap-2 text-sm" style={{ color: "var(--th-text)" }}>
            <Icon name="eye" size={16} className="mt-0.5 shrink-0" style={{ color: "#f4841a" }} />
            <span>
              <strong>Item obrigatório:</strong> preveja o custo do registro fotográfico e audiovisual — fotos do local antes, filmagem
              do processo quando aplicável, fotos e registro audiovisual do resultado final.
            </span>
          </p>
          {!disabled && <Button type="button" size="sm" variant="outline" icon="plus" className="mt-2" onClick={prefillAudiovisual}>Adicionar item de registro audiovisual</Button>}
        </div>
      )}

      <BudgetTable
        items={items}
        actions={disabled ? undefined : (item) => (
          <div className="flex justify-end gap-1">
            <Button type="button" size="sm" variant="ghost" icon="edit" aria-label={`Editar ${item.description}`} onClick={() => startEdit(item)} disabled={busy} />
            <Button type="button" size="sm" variant="ghost" icon="close" aria-label={`Remover ${item.description}`} onClick={() => void remove(item)} disabled={busy} />
          </div>
        )}
      />
      {stepErrors.budgetItems && <FormAlert message={stepErrors.budgetItems} />}

      {!disabled && (
        <form ref={formRef} onSubmit={save} noValidate className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }} aria-labelledby="budget-form-title">
          <h3 id="budget-form-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>{editingId ? "Editar item" : "Novo item do orçamento"}</h3>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-6">
            <TextInput className="sm:col-span-2" name="budget-item" label="Item" value={form.item} onValue={(v) => set("item", v)} error={errors.item} maxLength={200} hint="Nome curto. Ex.: Tinta, Mão de obra." />
            <TextInput className="sm:col-span-4" name="budget-description" label="Descrição do item" required value={form.description} onValue={(v) => set("description", v)} error={errors.description} maxLength={500} />
            <TextInput className="sm:col-span-2" name="budget-quantity" label="Quantidade" required inputMode="decimal" value={form.quantity} onValue={(v) => set("quantity", v)} error={errors.quantity} hint="Até 3 casas decimais." />
            <TextInput className="sm:col-span-2" name="budget-unit" label="Unidade" required value={form.unit} onValue={(v) => set("unit", v)} error={errors.unit} maxLength={30} hint="Ex.: m², diária, unidade, serviço." />
            <TextInput className="sm:col-span-2" name="budget-unitPrice" label="Valor unitário (R$)" required inputMode="decimal" value={form.unitPrice} onValue={(v) => set("unitPrice", v)} error={errors.unitPriceCents} placeholder="0,00" hint={unitCents !== null ? formatCents(unitCents) : undefined} />
            <TextInput className="sm:col-span-6" name="budget-supplierReference" label="Fornecedor ou referência" value={form.supplierReference} onValue={(v) => set("supplierReference", v)} error={errors.supplierReference} maxLength={500} hint="De onde vem o preço (cotação, loja, tabela). Fica no dossiê e na análise; a página pública não mostra." />
            <div className="sm:col-span-6">
              <Checkbox
                name="budget-isAudiovisualRecord"
                label="Este item é o registro fotográfico e audiovisual (antes e depois)"
                checked={form.isAudiovisualRecord}
                onChecked={(v) => set("isAudiovisualRecord", v)}
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" icon={editingId ? "check" : "plus"} loading={busy}>{editingId ? "Salvar item" : "Adicionar item"}</Button>
            {(editingId || !isBlankForm(form)) && <Button type="button" size="sm" variant="ghost" onClick={reset}>Cancelar</Button>}
            <span className="ml-auto text-sm font-numeric" style={{ color: "var(--th-muted)" }} aria-live="polite">
              {lineTotal !== null ? <>Total do item: <strong style={{ color: "var(--th-text)" }}>{formatCents(lineTotal)}</strong></> : null}
            </span>
          </div>
          {message && <div className="mt-3"><FormAlert message={message} /></div>}
        </form>
      )}

      {!disabled && (
        <BudgetImport
          demand={demand}
          onImported={(next) => { onDemand(next); setStatus("Planilha importada."); reset(); }}
          disabled={busy}
        />
      )}

      <CompositionCard composition={composition} preview={needsPreview} pending={previewPending} />
      <p className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}

/**
 * "O sistema pode receber uma planilha detalhada" (Modelo §04): CSV com o
 * cabeçalho do modelo, tudo ou nada, com erro por linha. XLSX não é lido: o
 * Agente salva a planilha como CSV (separado por ponto e vírgula).
 */
function BudgetImport({ demand, onImported, disabled }: {
  demand: Demand;
  onImported: (next: Demand) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"acrescentar" | "substituir">("acrescentar");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasItems = (demand.budgetItems ?? []).length > 0;

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([budgetCsvTemplate()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "modelo-orcamento-dm-conecta.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setMessage(null);
    setLines([]);
    setDone(null);
    if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
      setMessage("Salve a planilha como CSV (separado por ponto e vírgula) e envie de novo. Arquivos do Excel ainda não são lidos.");
      return;
    }
    if (file.size > BUDGET_CSV_MAX_BYTES) {
      setMessage("Planilha acima de 512 KB.");
      return;
    }
    if (mode === "substituir" && hasItems && !window.confirm("Substituir todos os itens do orçamento pelos da planilha?")) return;
    setBusy(true);
    try {
      const result = await api.importDemandBudget(demand.id, await file.text(), mode);
      onImported({ ...demand, budgetItems: result.items, composition: result.composition });
      setDone(`${result.imported} ${result.imported === 1 ? "item importado" : "itens importados"}. Confira e vincule cada item a uma etapa do cronograma.`);
    } catch (err) {
      setMessage(demandErrorMessage(err, "Não foi possível importar a planilha."));
      if (err instanceof BudgetImportError) setLines(budgetImportErrorLines(err.rows).slice(0, 30));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section aria-labelledby="budget-import-title" className="rounded-2xl border p-4" style={{ borderColor: "var(--th-border)" }}>
      <h3 id="budget-import-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Importar planilha (CSV)</h3>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        Colunas, nesta ordem: <span className="font-numeric">{BUDGET_CSV_HEADER}</span>. Separe por ponto e vírgula e use vírgula
        nos decimais (ex.: 1.250,50). O valor total de cada item é calculado pelo sistema. No Excel ou no LibreOffice, use
        &quot;Salvar como&quot; → CSV. Se alguma linha tiver erro, nada é importado.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm" style={{ color: "var(--th-text)" }}>
          <span className="mb-1 block font-semibold">Itens já lançados</span>
          <select className="app-input" value={mode} onChange={(e) => setMode(e.target.value as "acrescentar" | "substituir")} disabled={busy || disabled}>
            <option value="acrescentar">Manter e acrescentar os da planilha</option>
            <option value="substituir">Substituir pelos da planilha</option>
          </select>
        </label>
        <input
          ref={inputRef}
          id="budget-import-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => void onFile(e.target.files?.[0])}
          disabled={busy || disabled}
        />
        <Button type="button" size="sm" icon="plus" loading={busy} disabled={disabled} onClick={() => inputRef.current?.click()}>
          Escolher arquivo CSV
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={downloadTemplate}>Baixar modelo</Button>
      </div>
      <div aria-live="polite">
        {done && <p className="mt-3 text-sm font-semibold" style={{ color: "#2e9e5b" }}>{done}</p>}
        {message && <div className="mt-3"><FormAlert message={message} /></div>}
        {lines.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--th-text)" }}>
            {lines.map((line) => <li key={line}>{line}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}
