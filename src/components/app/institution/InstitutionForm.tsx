"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { api, type InstitutionReference } from "@/lib/app/api";
import {
  cnaeSuggestions,
  maskCep,
  maskCnae,
  maskCnpj,
  maskPhone,
  normalizeCep,
  normalizeCnae,
  type InstitutionFormState,
} from "@/lib/app/institution";
import {
  GOVERNMENT_SPHERE_LABELS,
  formatCnae,
  type GovernmentSphere,
  type InstitutionFieldErrors,
  type InstitutionKind,
} from "@/lib/app/types";
import { Button } from "../Button";
import { Icon } from "../Icon";

/** Id do campo a partir da chave de erro do servidor ("representative.fullName"). */
export function fieldId(key: string): string {
  return `inst-${key.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

const REQUIRED_MARK = <span aria-hidden="true" style={{ color: "#e53935" }}> *</span>;

function FieldShell({ id, label, required, hint, error, children }: {
  id: string; label: string; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>
        {label}{required && REQUIRED_MARK}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="mt-1 flex items-start gap-1 text-xs font-semibold" style={{ color: "#e53935" }}>
          <Icon name="info" size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

type TextFieldProps = {
  name: string; label: string; value: string; onValue: (value: string) => void;
  errors: InstitutionFieldErrors; required?: boolean; hint?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name" | "required">;

function TextField({ name, label, value, onValue, errors, required, hint, ...rest }: TextFieldProps) {
  const id = fieldId(name);
  const error = errors[name];
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error}>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className="app-input"
        style={error ? { borderColor: "#e53935" } : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const id = `inst-section-${title.normalize("NFD").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}`;
  return (
    <section aria-labelledby={id} className="app-card rounded-2xl p-4 sm:p-5">
      <h2 id={id} className="text-base font-bold" style={{ color: "var(--th-text)" }}>{title}</h2>
      {description && <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>{description}</p>}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/** Campo CNAE com sugestões da referência (combobox acessível). */
function CnaeCombobox({ name, label, value, reference, errors, required, onValue, onPick }: {
  name: string; label: string; value: string; reference: InstitutionReference["cnaeReference"];
  errors: InstitutionFieldErrors; required?: boolean;
  onValue: (value: string) => void; onPick: (item: { code: string; description: string }) => void;
}) {
  const id = fieldId(name);
  const listId = `${id}-list`;
  const error = errors[name];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const options = cnaeSuggestions(reference, value);

  function pick(item: { code: string; description: string }) {
    onPick(item);
    setOpen(false);
    setActive(-1);
  }

  return (
    <FieldShell id={id} label={label} required={required} error={error} hint="Digite o código (ex.: 9430-8/00) ou parte da atividade para ver sugestões.">
      <div className="relative">
        <input
          id={id}
          name={name}
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : `${id}-hint`}
          autoComplete="off"
          value={value}
          onChange={(e) => {
            const raw = e.target.value;
            onValue(/^[\d.\-/\s]*$/.test(raw) ? maskCnae(raw) : raw);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, options.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter" && open && active >= 0 && options[active]) { e.preventDefault(); pick(options[active]); }
            else if (e.key === "Escape") setOpen(false);
          }}
          className="app-input"
          style={error ? { borderColor: "#e53935" } : undefined}
        />
        {open && options.length > 0 && (
          <ul id={listId} role="listbox" aria-label={`Sugestões para ${label}`} className="app-card absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-xl p-1 shadow-lg">
            {options.map((item, i) => (
              <li
                key={item.code}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => { e.preventDefault(); pick(item); }}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm"
                style={{ background: i === active ? "var(--th-card-alt)" : "transparent", color: "var(--th-text)" }}
              >
                <span className="font-numeric font-semibold">{formatCnae(item.code)}</span>
                <span style={{ color: "var(--th-muted)" }}> — {item.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FieldShell>
  );
}

function CompetenceAreas({ value, suggestions, errors, onChange }: {
  value: string[]; suggestions: string[]; errors: InstitutionFieldErrors; onChange: (next: string[]) => void;
}) {
  const id = fieldId("competenceAreas");
  const [draft, setDraft] = useState("");
  const error = errors.competenceAreas;
  const has = (area: string) => value.some((a) => a.toLowerCase() === area.toLowerCase());
  const toggle = (area: string) => onChange(has(area) ? value.filter((a) => a.toLowerCase() !== area.toLowerCase()) : [...value, area]);
  const custom = value.filter((a) => !suggestions.some((s) => s.toLowerCase() === a.toLowerCase()));

  function addDraft() {
    const area = draft.trim();
    if (area && !has(area) && area.length <= 120) onChange([...value, area]);
    setDraft("");
  }

  return (
    <div className="sm:col-span-2">
      <p id={`${id}-label`} className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>
        Área de atuação ou competência{REQUIRED_MARK}
      </p>
      <p className="mb-2 text-xs" style={{ color: "var(--th-muted)" }}>Selecione as áreas sob responsabilidade do órgão ou acrescente outras.</p>
      <div role="group" aria-labelledby={`${id}-label`} aria-describedby={error ? `${id}-error` : undefined} className="flex flex-wrap gap-2">
        {suggestions.map((area) => {
          const selected = has(area);
          return (
            <button
              key={area} type="button" aria-pressed={selected} onClick={() => toggle(area)}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold transition-all"
              style={{ borderColor: selected ? "#0d2d42" : "var(--th-border)", background: selected ? "#0d2d42" : "transparent", color: selected ? "#fff" : "var(--th-text)" }}
            >
              {selected && <Icon name="check" size={12} className="mr-1 inline" />}{area}
            </button>
          );
        })}
        {custom.map((area) => (
          <span key={area} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "#0d2d42" }}>
            {area}
            <button type="button" onClick={() => toggle(area)} aria-label={`Remover ${area}`} className="-mr-1 rounded-full p-0.5">
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          id={id}
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addDraft(); } }}
          placeholder="Outra área (ex.: Proteção animal)"
          aria-label="Acrescentar outra área de competência"
          aria-invalid={error ? true : undefined}
          className="app-input"
        />
        <Button type="button" variant="outline" size="md" icon="plus" onClick={addDraft} disabled={!draft.trim()}>Incluir</Button>
      </div>
      {error && <p id={`${id}-error`} className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{error}</p>}
    </div>
  );
}

export interface InstitutionFormProps {
  kind: InstitutionKind;
  form: InstitutionFormState;
  onChange: (next: InstitutionFormState) => void;
  errors: InstitutionFieldErrors;
  reference: InstitutionReference;
  busy: "draft" | "submit" | null;
  hasSavedRecord: boolean;
  onSaveDraft: () => void;
  onSubmit: () => void;
}

export function InstitutionForm({ kind, form, onChange, errors, reference, busy, hasSavedRecord, onSaveDraft, onSubmit }: InstitutionFormProps) {
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const sphereName = useId();
  const isAgent = kind === "agente_transformacao";

  const set = <K extends keyof InstitutionFormState>(key: K, value: InstitutionFormState[K]) => onChange({ ...form, [key]: value });
  const setRep = (key: keyof InstitutionFormState["representative"], value: string) =>
    onChange({ ...form, representative: { ...form.representative, [key]: value } });

  const referenceDescription = (code: string) => reference.cnaeReference.find((c) => c.code === normalizeCnae(code))?.description ?? null;

  function setPrimaryCnae(value: string) {
    const desc = referenceDescription(value);
    const wasReference = !form.cnaePrimaryDescription || reference.cnaeReference.some((c) => c.description === form.cnaePrimaryDescription);
    onChange({ ...form, cnaePrimary: value, cnaePrimaryDescription: desc && wasReference ? desc : form.cnaePrimaryDescription });
  }

  function setSecondary(index: number, patch: Partial<{ code: string; description: string }>) {
    onChange({ ...form, cnaeSecondary: form.cnaeSecondary.map((c, i) => (i === index ? { ...c, ...patch } : c)) });
  }

  async function lookupCep() {
    if (normalizeCep(form.cep).length !== 8) {
      setCepStatus("Digite os 8 números do CEP para buscar o endereço.");
      return;
    }
    setCepLoading(true);
    setCepStatus(null);
    const address = await api.lookupCep(form.cep);
    setCepLoading(false);
    if (!address) {
      setCepStatus("Não encontramos este CEP. Preencha o endereço manualmente.");
      return;
    }
    onChange({
      ...form,
      street: address.street ?? form.street,
      district: address.district ?? form.district,
      municipality: address.municipality ?? form.municipality,
      uf: address.uf ?? form.uf,
      municipalityIbgeCode: address.municipalityIbgeCode ?? "",
    });
    setCepStatus("Endereço preenchido a partir do CEP. Confira e complete o número.");
  }

  const ufSelect = (required: boolean) => {
    const id = fieldId("uf");
    return (
      <FieldShell id={id} label="UF" required={required} error={errors.uf}>
        <select
          id={id} value={form.uf} onChange={(e) => set("uf", e.target.value)}
          aria-required={required || undefined} aria-invalid={errors.uf ? true : undefined}
          aria-describedby={errors.uf ? `${id}-error` : undefined}
          className="app-input" style={errors.uf ? { borderColor: "#e53935" } : undefined}
        >
          <option value="">Selecione</option>
          {reference.ufs.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </FieldShell>
    );
  };

  const sphere = form.governmentSphere;

  return (
    <form
      noValidate
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="space-y-4"
      aria-describedby="inst-required-note"
    >
      <p id="inst-required-note" className="text-xs" style={{ color: "var(--th-muted)" }}>
        Campos marcados com <span style={{ color: "#e53935" }}>*</span> são obrigatórios.
      </p>

      {isAgent ? (
        <>
          <Section title="Identificação da organização" description="Os dados do cartão CNPJ identificam a organização responsável pelas demandas publicadas.">
            <TextField name="cnpj" label="CNPJ" required value={form.cnpj} onValue={(v) => set("cnpj", maskCnpj(v))} errors={errors} inputMode="text" autoComplete="off" placeholder="00.000.000/0000-00" hint="Aceita o CNPJ numérico e o alfanumérico." />
            <TextField name="legalName" label="Razão social" required value={form.legalName} onValue={(v) => set("legalName", v)} errors={errors} maxLength={255} autoComplete="organization" />
            <TextField name="tradeName" label="Nome fantasia" value={form.tradeName} onValue={(v) => set("tradeName", v)} errors={errors} maxLength={255} hint="Como a organização é conhecida no território." />
            <TextField name="territory" label="Território de atuação" value={form.territory} onValue={(v) => set("territory", v)} errors={errors} maxLength={255} placeholder="Ex.: bairro, comunidade ou região" />
          </Section>

          <Section title="Atividade (CNAE)" description="Informe o CNAE principal que consta no cartão CNPJ e, se houver, os secundários.">
            <CnaeCombobox
              name="cnaePrimary" label="CNAE principal" required value={form.cnaePrimary}
              reference={reference.cnaeReference} errors={errors}
              onValue={setPrimaryCnae}
              onPick={(item) => onChange({ ...form, cnaePrimary: formatCnae(item.code), cnaePrimaryDescription: item.description })}
            />
            <TextField name="cnaePrimaryDescription" label="Descrição da atividade principal" required value={form.cnaePrimaryDescription} onValue={(v) => set("cnaePrimaryDescription", v)} errors={errors} maxLength={255} />
            <div className="space-y-3 sm:col-span-2">
              <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>CNAEs secundários</p>
              {form.cnaeSecondary.length === 0 && <p className="text-xs" style={{ color: "var(--th-muted)" }}>Nenhum CNAE secundário informado.</p>}
              {form.cnaeSecondary.map((item, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_1fr_auto]" style={{ borderColor: "var(--th-border)" }}>
                  <CnaeCombobox
                    name={`cnaeSecondary.${i}`} label={`CNAE secundário ${i + 1}`} value={item.code}
                    reference={reference.cnaeReference} errors={errors}
                    onValue={(v) => setSecondary(i, { code: v, description: referenceDescription(v) ?? item.description })}
                    onPick={(ref) => setSecondary(i, { code: formatCnae(ref.code), description: ref.description })}
                  />
                  <div>
                    <label htmlFor={`${fieldId(`cnaeSecondary.${i}`)}-desc`} className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Descrição</label>
                    <input id={`${fieldId(`cnaeSecondary.${i}`)}-desc`} value={item.description} maxLength={255} onChange={(e) => setSecondary(i, { description: e.target.value })} className="app-input" />
                  </div>
                  <div className="flex items-end">
                    <Button type="button" variant="ghost" size="sm" icon="close" onClick={() => set("cnaeSecondary", form.cnaeSecondary.filter((_, j) => j !== i))} aria-label={`Remover CNAE secundário ${i + 1}`}>Remover</Button>
                  </div>
                </div>
              ))}
              {form.cnaeSecondary.length < 20 && (
                <Button type="button" variant="outline" size="sm" icon="plus" onClick={() => set("cnaeSecondary", [...form.cnaeSecondary, { code: "", description: "" }])}>Adicionar CNAE secundário</Button>
              )}
            </div>
          </Section>

          <Section title="Endereço" description="A localização com CEP é obrigatória para o Agente de Transformação.">
            <FieldShell id={fieldId("cep")} label="CEP" required error={errors.cep}>
              <div className="flex gap-2">
                <input
                  id={fieldId("cep")} value={form.cep} inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
                  onChange={(e) => { set("cep", maskCep(e.target.value)); setCepStatus(null); }}
                  onBlur={() => { if (normalizeCep(form.cep).length === 8 && !form.street) void lookupCep(); }}
                  aria-required aria-invalid={errors.cep ? true : undefined}
                  aria-describedby={[errors.cep ? `${fieldId("cep")}-error` : "", "inst-cep-status"].filter(Boolean).join(" ")}
                  className="app-input" style={errors.cep ? { borderColor: "#e53935" } : undefined}
                />
                <Button type="button" variant="outline" icon="search" loading={cepLoading} onClick={() => void lookupCep()}>Buscar</Button>
              </div>
            </FieldShell>
            <p id="inst-cep-status" role="status" aria-live="polite" className="self-end text-xs sm:pb-3" style={{ color: "var(--th-muted)" }}>{cepStatus}</p>
            <TextField name="street" label="Logradouro" required value={form.street} onValue={(v) => set("street", v)} errors={errors} maxLength={255} autoComplete="address-line1" />
            <div className="grid grid-cols-2 gap-4">
              <TextField name="addressNumber" label="Número" required value={form.addressNumber} onValue={(v) => set("addressNumber", v)} errors={errors} maxLength={20} />
              <TextField name="addressComplement" label="Complemento" value={form.addressComplement} onValue={(v) => set("addressComplement", v)} errors={errors} maxLength={120} autoComplete="address-line2" />
            </div>
            <TextField name="district" label="Bairro" required value={form.district} onValue={(v) => set("district", v)} errors={errors} maxLength={120} />
            <div className="grid grid-cols-[1fr_7rem] gap-4">
              <TextField name="municipality" label="Município" required value={form.municipality} onValue={(v) => onChange({ ...form, municipality: v, municipalityIbgeCode: "" })} errors={errors} maxLength={120} autoComplete="address-level2" />
              {ufSelect(true)}
            </div>
          </Section>

          <Section title="Contatos institucionais" description="Informe ao menos um contato da organização. Os contatos ficam visíveis só para você e para a equipe de validação.">
            <TextField name="institutionalEmail" label="E-mail institucional" type="email" value={form.institutionalEmail} onValue={(v) => set("institutionalEmail", v)} errors={errors} maxLength={255} autoComplete="email" />
            <TextField name="institutionalPhone" label="Telefone institucional" type="tel" value={form.institutionalPhone} onValue={(v) => set("institutionalPhone", maskPhone(v))} errors={errors} autoComplete="tel" placeholder="(00) 0000-0000" />
            <TextField name="website" label="Site" type="url" value={form.website} onValue={(v) => set("website", v)} errors={errors} maxLength={500} placeholder="https://" />
            {errors.institutionalContact && (
              <p id={fieldId("institutionalContact")} className="self-end text-xs font-semibold sm:pb-3" style={{ color: "#e53935" }}>{errors.institutionalContact}</p>
            )}
          </Section>
        </>
      ) : (
        <>
          <Section title="Órgão ou entidade" description="Identifique o órgão, a prefeitura, a secretaria ou a entidade pública que você representa.">
            <TextField name="legalName" label="Nome do órgão ou entidade" required value={form.legalName} onValue={(v) => set("legalName", v)} errors={errors} maxLength={255} placeholder="Ex.: Prefeitura Municipal de ..." autoComplete="organization" />
            <TextField name="cnpj" label="CNPJ" required value={form.cnpj} onValue={(v) => set("cnpj", maskCnpj(v))} errors={errors} autoComplete="off" placeholder="00.000.000/0000-00" />
            <fieldset className="sm:col-span-2" aria-describedby={errors.governmentSphere ? `${fieldId("governmentSphere")}-error` : undefined}>
              <legend className="mb-1.5 text-sm font-semibold" style={{ color: "var(--th-text)" }}>Esfera de governo{REQUIRED_MARK}</legend>
              <div id={fieldId("governmentSphere")} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(Object.keys(GOVERNMENT_SPHERE_LABELS) as GovernmentSphere[]).map((value) => {
                  const checked = sphere === value;
                  return (
                    <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold" style={{ borderColor: checked ? "#1b4f72" : "var(--th-border)", background: checked ? "rgba(27,79,114,0.08)" : "var(--th-card)", color: "var(--th-text)" }}>
                      <input type="radio" name={sphereName} value={value} checked={checked} onChange={() => set("governmentSphere", value)} className="h-4 w-4 accent-[#1b4f72]" />
                      {GOVERNMENT_SPHERE_LABELS[value]}
                    </label>
                  );
                })}
              </div>
              {errors.governmentSphere && <p id={`${fieldId("governmentSphere")}-error`} className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{errors.governmentSphere}</p>}
            </fieldset>
            <div className="grid grid-cols-[1fr_7rem] gap-4 sm:col-span-2">
              <TextField name="municipality" label="Município" required={sphere === "municipal"} value={form.municipality} onValue={(v) => set("municipality", v)} errors={errors} maxLength={120} hint={sphere === "federal" ? "Opcional na esfera federal." : undefined} />
              {ufSelect(sphere === "municipal" || sphere === "estadual")}
            </div>
            <TextField name="territory" label="Território de atuação" required value={form.territory} onValue={(v) => set("territory", v)} errors={errors} maxLength={255} placeholder="Ex.: todo o município, Zona Oeste, bairros atendidos" />
            <TextField name="department" label="Secretaria, órgão ou departamento" required value={form.department} onValue={(v) => set("department", v)} errors={errors} maxLength={255} placeholder="Ex.: Secretaria Municipal de Meio Ambiente" />
            <CompetenceAreas value={form.competenceAreas} suggestions={reference.competenceAreaSuggestions} errors={errors} onChange={(next) => set("competenceAreas", next)} />
          </Section>

          <Section title="Contatos do órgão" description="Opcionais. Ficam visíveis só para você e para a equipe de validação; o site aparece no perfil público depois da validação.">
            <TextField name="institutionalEmail" label="E-mail do órgão" type="email" value={form.institutionalEmail} onValue={(v) => set("institutionalEmail", v)} errors={errors} maxLength={255} />
            <TextField name="institutionalPhone" label="Telefone do órgão" type="tel" value={form.institutionalPhone} onValue={(v) => set("institutionalPhone", maskPhone(v))} errors={errors} placeholder="(00) 0000-0000" />
            <TextField name="website" label="Site oficial" type="url" value={form.website} onValue={(v) => set("website", v)} errors={errors} maxLength={500} placeholder="https://" />
          </Section>
        </>
      )}

      <Section
        title={isAgent ? "Responsável pela organização" : "Representante"}
        description={isAgent
          ? "Pessoa que responde pela organização na plataforma. Os contatos não são publicados."
          : "Pessoa que representa o órgão na plataforma. O perfil fica vinculado ao órgão depois da validação; os contatos não são publicados."}
      >
        <TextField name="representative.fullName" label={isAgent ? "Nome do responsável" : "Nome do representante"} required value={form.representative.fullName} onValue={(v) => setRep("fullName", v)} errors={errors} maxLength={255} autoComplete="name" />
        <TextField name="representative.position" label="Cargo ou função" required value={form.representative.position} onValue={(v) => setRep("position", v)} errors={errors} maxLength={255} autoComplete="organization-title" />
        <TextField name="representative.institutionalEmail" label="E-mail institucional" required type="email" value={form.representative.institutionalEmail} onValue={(v) => setRep("institutionalEmail", v)} errors={errors} maxLength={255} autoComplete="email" />
        <TextField name="representative.institutionalPhone" label="Telefone institucional" required type="tel" value={form.representative.institutionalPhone} onValue={(v) => setRep("institutionalPhone", maskPhone(v))} errors={errors} autoComplete="tel" placeholder="(00) 00000-0000" />
        <TextField
          name="representative.proofDocumentRef" label="Link ou referência do documento de comprovação" inputMode="url"
          value={form.representative.proofDocumentRef} onValue={(v) => setRep("proofDocumentRef", v)} errors={errors} maxLength={500} placeholder="https://"
          hint={isAgent
            ? "Quando aplicável: ata de eleição da diretoria, estatuto ou procuração. O envio de arquivos está em desenvolvimento; por enquanto, informe um link."
            : "Quando aplicável: ato de nomeação publicado em diário oficial ou documento de designação. O envio de arquivos está em desenvolvimento; por enquanto, informe um link."}
        />
        <div>
          <label htmlFor={fieldId("representative.proofDescription")} className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Informação para a comprovação</label>
          <textarea
            id={fieldId("representative.proofDescription")} value={form.representative.proofDescription} maxLength={2000}
            onChange={(e) => setRep("proofDescription", e.target.value)}
            aria-invalid={errors["representative.proofDescription"] ? true : undefined}
            placeholder="Ex.: número e data da publicação, ou onde a equipe pode conferir a representação."
            className="app-textarea" style={{ minHeight: "5rem" }}
          />
          {errors["representative.proofDescription"] && <p className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{errors["representative.proofDescription"]}</p>}
        </div>
      </Section>

      <div className="app-card sticky bottom-20 z-10 flex flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-end lg:bottom-4" style={{ boxShadow: "0 8px 24px rgba(13,45,66,0.12)" }}>
        <p className="text-xs sm:mr-auto" style={{ color: "var(--th-muted)" }}>
          {hasSavedRecord ? "O rascunho fica salvo e só segue para análise quando você enviar." : "Salve como rascunho para continuar depois ou envie para validação."}
        </p>
        <Button type="button" variant="outline" icon="check" loading={busy === "draft"} disabled={busy !== null} onClick={onSaveDraft}>Salvar rascunho</Button>
        <Button type="submit" icon="send" loading={busy === "submit"} disabled={busy !== null}>Enviar para validação</Button>
      </div>
    </form>
  );
}
