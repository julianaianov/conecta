"use client";

// Botão "Denunciar" com modal acessível (T6.3). Serve aos quatro alvos:
// publicação, comentário, demanda e perfil.
//
// Fonte: Apresentação Institucional, slide 26 (Governança: LGPD, neutralidade
// político-partidária e publicação apenas de dados verificáveis).
//
// Regras da tela:
// - só aparece para quem tem sessão e nunca no próprio conteúdo;
// - motivo obrigatório (seis da fonte), descrição opcional — obrigatória em
//   "Outro" —, e uma confirmação antes de enviar;
// - a confirmação final não revela nada do resultado: a moderação despacha no
//   dm-gestao e nem o denunciante nem o denunciado ficam sabendo do desfecho;
// - `role="dialog"` + `aria-modal`, foco no primeiro campo ao abrir, Esc
//   fecha e o foco volta para o botão.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api, ApiError } from "@/lib/app/api";
import { useAuth } from "@/lib/app/auth";
import {
  REPORT_CONFIRMATION_NOTICE,
  REPORT_DESCRIPTION_MAX,
  REPORT_REASONS,
  REPORT_REASON_HINTS,
  REPORT_REASON_LABELS,
  reportDescriptionRequired,
  reportErrorMessage,
  reportTargetLabel,
  type ReportReason,
  type ReportTargetKind,
} from "@/lib/app/report";
import { Icon } from "./Icon";

type Props = {
  targetKind: ReportTargetKind;
  targetId: string;
  /** Conta dona do conteúdo: o botão some quando é a própria sessão. */
  targetOwnerId?: string | null;
  /** Texto curto para a tela dizer o que está sendo denunciado. */
  targetLabel?: string;
  /** `icon` fica com o ícone e o rótulo acessível só para leitor de tela. */
  variant?: "text" | "icon";
  className?: string;
};

type Step = "form" | "confirm" | "done";

export function ReportButton({
  targetKind, targetId, targetOwnerId = null, targetLabel, variant = "text", className,
}: Props) {
  const { user } = useAuth();
  const titleId = useId();
  const errorId = useId();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open && step === "form") firstFieldRef.current?.focus();
  }, [open, step]);

  // Sem sessão não há denúncia (não existe denúncia anônima) e ninguém
  // denuncia o próprio conteúdo.
  if (!user) return null;
  if (targetOwnerId && targetOwnerId === user.id) return null;

  function start() {
    setStep("form");
    setReason(null);
    setDescription("");
    setError(null);
    setFieldError(null);
    setOpen(true);
  }

  function review() {
    if (!reason) {
      setFieldError("Escolha o motivo da denúncia");
      return;
    }
    if (reportDescriptionRequired(reason) && !description.trim()) {
      setFieldError('Descreva o que houve quando o motivo é "Outro"');
      return;
    }
    setFieldError(null);
    setStep("confirm");
  }

  async function submit() {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.report({
        targetKind,
        targetId,
        reason,
        description: description.trim() || undefined,
      });
      setStep("done");
    } catch (err) {
      const fallback = "Não foi possível registrar a denúncia agora. Tente de novo.";
      setError(err instanceof ApiError ? reportErrorMessage(err.code, err.message || fallback) : fallback);
      setStep("form");
    } finally {
      setSending(false);
    }
  }

  const what = targetLabel ?? reportTargetLabel(targetKind).toLowerCase();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={start}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={className ?? (variant === "icon"
          ? "inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--th-card-alt)]"
          : "inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold transition-colors hover:bg-[var(--th-card-alt)]")}
        style={{ color: "var(--th-muted)" }}
      >
        <Icon name="flag" size={16} />
        {variant === "icon" ? <span className="sr-only">{`Denunciar ${what}`}</span> : "Denunciar"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-3 py-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="absolute inset-0" style={{ background: "rgba(13,45,66,0.45)" }} onClick={close} aria-hidden="true" />

          <div
            className="relative z-10 flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--th-card)", borderColor: "var(--th-border)" }}
          >
            <div className="flex items-start justify-between gap-3 border-b px-4 py-3" style={{ borderColor: "var(--th-border)" }}>
              <div>
                <h2 id={titleId} className="text-base font-extrabold" style={{ color: "var(--th-text)" }}>
                  {step === "done" ? "Denúncia registrada" : `Denunciar ${what}`}
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--th-muted)" }}>
                  A moderação da plataforma analisa cada caso.
                </p>
              </div>
              <button type="button" onClick={close} aria-label="Fechar" style={{ color: "var(--th-muted)" }}>
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {error && (
                <p id={errorId} role="alert" className="mb-3 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ background: "rgba(229,57,53,0.1)", color: "#e53935" }}>
                  {error}
                </p>
              )}

              {step === "form" && (
                <>
                  <fieldset>
                    <legend className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
                      Motivo da denúncia
                    </legend>
                    <div className="mt-2 space-y-1.5">
                      {REPORT_REASONS.map((value, index) => (
                        <label
                          key={value}
                          className="flex cursor-pointer gap-2.5 rounded-xl border p-2.5 transition-colors"
                          style={{
                            borderColor: reason === value ? "#f4841a" : "var(--th-border)",
                            background: reason === value ? "var(--th-card-alt)" : "transparent",
                          }}
                        >
                          <input
                            ref={index === 0 ? firstFieldRef : undefined}
                            type="radio"
                            name={`${titleId}-reason`}
                            value={value}
                            checked={reason === value}
                            onChange={() => { setReason(value); setFieldError(null); }}
                            className="mt-1"
                          />
                          <span>
                            <span className="block text-sm font-bold" style={{ color: "var(--th-text)" }}>
                              {REPORT_REASON_LABELS[value]}
                            </span>
                            <span className="block text-xs" style={{ color: "var(--th-muted)" }}>
                              {REPORT_REASON_HINTS[value]}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <label className="mt-4 block">
                    <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--th-muted)" }}>
                      Descrição {reportDescriptionRequired(reason) ? "(obrigatória)" : "(opcional)"}
                    </span>
                    <textarea
                      value={description}
                      onChange={(event) => setDescription(event.target.value.slice(0, REPORT_DESCRIPTION_MAX))}
                      maxLength={REPORT_DESCRIPTION_MAX}
                      rows={3}
                      className="app-textarea mt-1"
                      placeholder="Conte o que houve. Não inclua dados pessoais de terceiros."
                    />
                  </label>

                  {fieldError && (
                    <p role="alert" className="mt-2 text-sm font-semibold" style={{ color: "#e53935" }}>{fieldError}</p>
                  )}
                </>
              )}

              {step === "confirm" && reason && (
                <div className="space-y-3">
                  <p className="text-sm" style={{ color: "var(--th-text)" }}>
                    Confirmar a denúncia de <strong>{what}</strong> por{" "}
                    <strong>{REPORT_REASON_LABELS[reason]}</strong>?
                  </p>
                  {description.trim() && (
                    <p className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--th-border)", color: "var(--th-muted)" }}>
                      {description.trim()}
                    </p>
                  )}
                  <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                    {REPORT_CONFIRMATION_NOTICE}
                  </p>
                </div>
              )}

              {step === "done" && (
                <p className="text-sm" style={{ color: "var(--th-text)" }}>{REPORT_CONFIRMATION_NOTICE}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "var(--th-border)" }}>
              {step === "form" && (
                <>
                  <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm font-bold" style={{ color: "var(--th-muted)" }}>
                    Cancelar
                  </button>
                  <button type="button" onClick={review} className="rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "#f4841a" }}>
                    Continuar
                  </button>
                </>
              )}
              {step === "confirm" && (
                <>
                  <button type="button" onClick={() => setStep("form")} className="rounded-lg px-3 py-2 text-sm font-bold" style={{ color: "var(--th-muted)" }}>
                    Voltar
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={sending}
                    className="rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                    style={{ background: "#e53935" }}
                  >
                    {sending ? "Enviando…" : "Enviar denúncia"}
                  </button>
                </>
              )}
              {step === "done" && (
                <button type="button" onClick={close} className="rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "#f4841a" }}>
                  Fechar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
