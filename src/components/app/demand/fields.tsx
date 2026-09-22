"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Icon } from "../Icon";

/** Id do campo a partir da chave de erro do servidor (`budgetItems[0].quantity`). */
export function demandFieldId(key: string): string {
  return `dem-${key.replace(/[^a-zA-Z0-9]+/g, "-")}`;
}

const REQUIRED_MARK = <span aria-hidden="true" style={{ color: "#e53935" }}> *</span>;

export function FieldShell({ id, label, required, hint, error, children, className = "" }: {
  id: string; label: ReactNode; required?: boolean; hint?: ReactNode; error?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>
        {label}{required && REQUIRED_MARK}
      </label>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>{hint}</p>}
      {error && <FieldError id={`${id}-error`} message={error} />}
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message: string }) {
  return (
    <p id={id} className="mt-1 flex items-start gap-1 text-xs font-semibold" style={{ color: "#e53935" }}>
      <Icon name="info" size={12} className="mt-0.5 shrink-0" />{message}
    </p>
  );
}

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
}

type Common = { name: string; label: ReactNode; error?: string; required?: boolean; hint?: ReactNode; className?: string };

export function TextInput({ name, label, error, required, hint, className, value, onValue, ...rest }: Common & {
  value: string; onValue: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "name" | "required" | "className">) {
  const id = demandFieldId(name);
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <input
        id={id}
        name={name}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className="app-input"
        style={error ? { borderColor: "#e53935" } : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function TextArea({ name, label, error, required, hint, className, value, onValue, rows = 4, ...rest }: Common & {
  value: string; onValue: (value: string) => void;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "name" | "required" | "className">) {
  const id = demandFieldId(name);
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <textarea
        id={id}
        name={name}
        value={value}
        rows={rows}
        onChange={(e) => onValue(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className="app-textarea"
        style={error ? { borderColor: "#e53935" } : undefined}
        {...rest}
      />
    </FieldShell>
  );
}

export function SelectInput({ name, label, error, required, hint, className, value, onValue, options, placeholder, ...rest }: Common & {
  value: string; onValue: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange" | "name" | "required" | "className">) {
  const id = demandFieldId(name);
  return (
    <FieldShell id={id} label={label} required={required} hint={hint} error={error} className={className}>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(e) => onValue(e.target.value)}
        aria-required={required || undefined}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        className="app-input"
        style={error ? { borderColor: "#e53935" } : undefined}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </FieldShell>
  );
}

export function Checkbox({ name, label, checked, onChecked, hint, disabled }: {
  name: string; label: ReactNode; checked: boolean; onChecked: (checked: boolean) => void; hint?: ReactNode; disabled?: boolean;
}) {
  const id = demandFieldId(name);
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        name={name}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChecked(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#f4841a]"
      />
      <div>
        <label htmlFor={id} className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{label}</label>
        {hint && <p id={`${id}-hint`} className="text-xs" style={{ color: "var(--th-muted)" }}>{hint}</p>}
      </div>
    </div>
  );
}

/** Mensagem de erro geral de um bloco (salvar, enviar). */
export function FormAlert({ message, tone = "error" }: { message: string; tone?: "error" | "info" | "success" }) {
  const color = tone === "error" ? "#e53935" : tone === "success" ? "#2e9e5b" : "#2e7ba8";
  return (
    <p role={tone === "error" ? "alert" : "status"} className="flex items-start gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: `${color}55`, background: `${color}10`, color: "var(--th-text)" }}>
      <Icon name={tone === "success" ? "check" : "info"} size={16} className="mt-0.5 shrink-0" style={{ color }} />
      <span>{message}</span>
    </p>
  );
}
