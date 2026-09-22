"use client";

import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { api, putToStorage, UploadRequestError } from "@/lib/app/api";
import {
  SHA256_MAX_BYTES,
  UPLOAD_PURPOSES,
  acceptAttribute,
  acceptedExtensions,
  checkUploadFile,
  formatBytes,
} from "@/lib/app/uploads";
import type { UploadedFile, UploadPurpose } from "@/lib/app/types";
import { Button } from "./Button";
import { Icon } from "./Icon";

/**
 * Envio de arquivo (T08): valida tipo e tamanho, pede a URL pré-assinada,
 * envia direto ao S3 com progresso e confirma no serviço. Reutilizável em
 * qualquer finalidade (`purpose`); `target` diz a que o arquivo se vincula
 * (`demandId` nos arquivos da demanda; a comprovação institucional usa o
 * cadastro do próprio titular).
 *
 * `onChange` recebe o arquivo confirmado (grave `file.ref` no formulário) ou
 * `null` ao remover. Remover só desfaz a referência no formulário: o arquivo
 * confirmado continua guardado.
 */
export interface FileUploadProps {
  label: string;
  purpose: UploadPurpose;
  target?: { demandId?: string };
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  hint?: ReactNode;
  /** Erro vindo do servidor (ex.: `fields` do formulário). */
  error?: string;
  required?: boolean;
  disabled?: boolean;
  /** Explica por que o envio está indisponível (ex.: salvar o rascunho antes). */
  disabledReason?: string;
  /** Id do campo, para o resumo de erros apontar para cá. */
  id?: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "preparing"; name: string }
  | { kind: "uploading"; name: string; loaded: number; total: number }
  | { kind: "confirming"; name: string };

/** URL de leitura dura alguns minutos: depois disso, pede outra. */
const URL_FRESH_MS = 4 * 60 * 1000;

async function sha256Hex(file: Blob): Promise<string | null> {
  const subtle = typeof globalThis.crypto !== "undefined" ? globalThis.crypto.subtle : undefined;
  if (!subtle || file.size > SHA256_MAX_BYTES) return null;
  try {
    const digest = await subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function messageFor(err: unknown): string {
  if (err instanceof UploadRequestError) {
    if (err.code === "uploads_unavailable") return "O envio de arquivos não está disponível neste ambiente.";
    return err.message;
  }
  return "Não foi possível enviar o arquivo. Tente de novo.";
}

export function FileUpload({
  label, purpose, target, value, onChange, hint, error, required, disabled, disabledReason, id,
}: FileUploadProps) {
  const autoId = useId();
  const baseId = id ?? `upload-${autoId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const labelId = `${baseId}-label`;
  const hintId = `${baseId}-hint`;
  const errorId = `${baseId}-error`;
  const statusId = `${baseId}-status`;
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const urlAtRef = useRef<number>(0);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [localError, setLocalError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);

  const rule = UPLOAD_PURPOSES[purpose];
  const busy = phase.kind !== "idle";
  const blocked = disabled || busy;
  const shownError = localError ?? error ?? null;

  useEffect(() => {
    if (value?.url) urlAtRef.current = Date.now();
  }, [value?.url]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // O envio termina depois de outras renderizações: usa sempre o `onChange` atual.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  async function upload(file: File) {
    setLocalError(null);
    const check = checkUploadFile(purpose, file);
    if (!check.ok) {
      setLocalError(check.error);
      setStatus("");
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setPhase({ kind: "preparing", name: file.name });
      setStatus(`Preparando ${file.name}`);
      const sha256 = await sha256Hex(file);
      const ticket = await api.presignUpload(rule.service, {
        purpose, contentType: check.contentType, size: file.size, fileName: file.name, sha256,
      });
      setPhase({ kind: "uploading", name: file.name, loaded: 0, total: file.size });
      setStatus(`Enviando ${file.name}`);
      await putToStorage(ticket, file, {
        signal: controller.signal,
        onProgress: ({ loaded, total }) => setPhase({ kind: "uploading", name: file.name, loaded, total }),
      });
      setPhase({ kind: "confirming", name: file.name });
      setStatus(`Conferindo ${file.name}`);
      const confirmed = await api.confirmUpload(rule.service, ticket.uploadId, target ?? {});
      urlAtRef.current = Date.now();
      onChangeRef.current(confirmed);
      setStatus(`${file.name} anexado.`);
    } catch (err) {
      setLocalError(messageFor(err));
      setStatus("");
    } finally {
      abortRef.current = null;
      setPhase({ kind: "idle" });
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function open() {
    if (!value) return;
    if (value.url && Date.now() - urlAtRef.current < URL_FRESH_MS) {
      window.open(value.url, "_blank", "noopener,noreferrer");
      return;
    }
    // Abre a aba no clique (sem bloqueio de pop-up) e só depois busca a URL nova.
    const tab = window.open("about:blank", "_blank");
    try {
      const fresh = await api.getUpload(rule.service, value.id);
      if (!fresh.url) throw new UploadRequestError("Arquivo indisponível no momento.", 404);
      urlAtRef.current = Date.now();
      if (tab) {
        tab.opener = null;
        tab.location.href = fresh.url;
      } else {
        window.location.assign(fresh.url);
      }
    } catch (err) {
      tab?.close();
      setLocalError(messageFor(err));
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (blocked) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  const describedBy = [shownError ? errorId : null, hintId, statusId].filter(Boolean).join(" ");
  const percent = phase.kind === "uploading" && phase.total > 0 ? Math.round((phase.loaded / phase.total) * 100) : null;

  return (
    <div className="sm:col-span-2" id={baseId}>
      <p id={labelId} className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>
        {label}{required && <span aria-hidden="true" style={{ color: "#e53935" }}> *</span>}
      </p>

      <div
        role="group"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        onDragOver={(e) => { e.preventDefault(); if (!blocked) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className="rounded-xl border border-dashed p-3 transition-colors"
        style={{
          borderColor: shownError ? "#e53935" : dragging ? "#1b4f72" : "var(--th-border)",
          background: dragging ? "rgba(27,79,114,0.06)" : "var(--th-card)",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttribute(purpose)}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={blocked}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {value && !busy ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Icon name="check" size={18} className="shrink-0" style={{ color: "#2e7d32" }} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>{value.fileName ?? "Arquivo anexado"}</p>
                <p className="text-xs" style={{ color: "var(--th-muted)" }}>{formatBytes(value.size)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" icon="eye" onClick={() => void open()} aria-label={`Abrir ${value.fileName ?? "arquivo"}`}>Abrir</Button>
              {!disabled && (
                <>
                  <Button type="button" size="sm" variant="outline" icon="edit" onClick={() => inputRef.current?.click()} aria-describedby={labelId}>Trocar</Button>
                  <Button type="button" size="sm" variant="ghost" icon="close" onClick={() => { setLocalError(null); onChange(null); setStatus("Arquivo removido do formulário."); }} aria-describedby={labelId}>Remover</Button>
                </>
              )}
            </div>
          </div>
        ) : busy ? (
          <div className="flex flex-col gap-2">
            <p className="truncate text-sm font-semibold" style={{ color: "var(--th-text)" }}>
              {phase.kind === "preparing" ? "Preparando" : phase.kind === "uploading" ? "Enviando" : "Conferindo"} {phase.name}
            </p>
            <progress
              className="h-2 w-full overflow-hidden rounded-full accent-[#1b4f72]"
              max={100}
              value={percent ?? undefined}
              aria-labelledby={labelId}
              aria-valuetext={percent !== null ? `${percent}% enviado` : "Aguarde"}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                {phase.kind === "uploading"
                  ? `${percent ?? 0}% — ${formatBytes(phase.loaded)} de ${formatBytes(phase.total)}`
                  : phase.kind === "confirming" ? "Conferindo o arquivo no servidor…" : "Preparando o envio…"}
              </p>
              {phase.kind === "uploading" && (
                <Button type="button" size="sm" variant="ghost" icon="close" onClick={() => abortRef.current?.abort()}>Cancelar</Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="flex-1 text-sm" style={{ color: "var(--th-muted)" }}>
              {disabled && disabledReason ? disabledReason : "Arraste o arquivo para cá ou escolha no dispositivo."}
            </p>
            <Button type="button" size="sm" variant="outline" icon="plus" disabled={blocked} onClick={() => inputRef.current?.click()} aria-describedby={describedBy}>
              Escolher arquivo
            </Button>
          </div>
        )}
      </div>

      <p id={hintId} className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        {hint ? <>{hint} </> : null}
        Formatos: {acceptedExtensions(purpose).join(", ")}. Até {formatBytes(rule.maxBytes)}.
      </p>
      {shownError && (
        <p id={errorId} role="alert" className="mt-1 flex items-start gap-1 text-xs font-semibold" style={{ color: "#e53935" }}>
          <Icon name="info" size={12} className="mt-0.5 shrink-0" />{shownError}
        </p>
      )}
      <p id={statusId} className="sr-only" aria-live="polite">{status}</p>
    </div>
  );
}
