"use client";

// Informações do módulo específico (T-05-08, Modelo de Conexão §23–§25 e §29).
// O módulo sai da categoria escolhida logo acima (decisão 15): o Agente não o
// escolhe. Nenhum campo é obrigatório — no envio, o que faltar vira aviso.

import {
  DEMAND_MODULE_LABELS,
  MODULE_FIELDS,
  moduleOf,
  type ModuleDetailsForm,
} from "@/lib/app/demand-modules";
import type { DemandCategory } from "@/lib/app/types";
import { TextArea, TextInput } from "./fields";

export function ModuleDetailsFields({ category, value, onValue, errors, disabled }: {
  category: DemandCategory | "";
  value: ModuleDetailsForm;
  onValue: (next: ModuleDetailsForm) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const mod = moduleOf(category);
  if (!mod) return null;
  const fields = MODULE_FIELDS[mod];
  const label = DEMAND_MODULE_LABELS[mod];

  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string) : "");
  const group = (key: string) => (typeof value[key] === "object" ? (value[key] as Record<string, string>) : {});
  const errorOf = (key: string) => errors[`moduleDetails.${key}`];

  return (
    <section className="mt-6 rounded-2xl border p-4" style={{ borderColor: "var(--th-border)", background: "var(--th-card-alt)" }} aria-labelledby="module-details-title">
      <h3 id="module-details-title" className="text-sm font-bold" style={{ color: "var(--th-text)" }}>
        Informações do módulo: {label}
      </h3>
      {fields.length === 0 ? (
        <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
          Este módulo segue o fluxo comum da plataforma e não pede informações próprias.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
            O módulo é definido pela categoria. Preencha o que já souber; as informações entram na análise e no dossiê.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              if (field.type === "number") {
                return (
                  <TextInput
                    key={field.key}
                    name={`module-${field.key}`}
                    label={field.label}
                    inputMode="decimal"
                    value={text(field.key)}
                    onValue={(v) => onValue({ ...value, [field.key]: v })}
                    error={errorOf(field.key)}
                    disabled={disabled}
                    maxLength={20}
                  />
                );
              }
              if (field.type === "group") {
                return (
                  <fieldset key={field.key} className="sm:col-span-2">
                    <legend className="mb-1.5 text-sm font-semibold" style={{ color: "var(--th-text)" }}>{field.label}</legend>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {field.fields.map((sub) => (
                        <TextInput
                          key={sub.key}
                          name={`module-${field.key}-${sub.key}`}
                          label={sub.label}
                          value={group(field.key)[sub.key] ?? ""}
                          onValue={(v) => onValue({ ...value, [field.key]: { ...group(field.key), [sub.key]: v } })}
                          error={errorOf(`${field.key}.${sub.key}`)}
                          disabled={disabled}
                          maxLength={sub.max}
                        />
                      ))}
                    </div>
                  </fieldset>
                );
              }
              return (
                <TextArea
                  key={field.key}
                  className="sm:col-span-2"
                  name={`module-${field.key}`}
                  label={field.label}
                  rows={3}
                  value={text(field.key)}
                  onValue={(v) => onValue({ ...value, [field.key]: v })}
                  error={errorOf(field.key)}
                  disabled={disabled}
                  maxLength={field.max}
                />
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
