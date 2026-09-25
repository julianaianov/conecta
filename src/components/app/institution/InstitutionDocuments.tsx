"use client";

import { useState } from "react";
import { api, InstitutionRequestError } from "@/lib/app/api";
import {
  INSTITUTION_DOCUMENT_KINDS,
  INSTITUTION_DOCUMENT_KIND_LABELS,
  REQUIRED_DOCUMENT_KINDS,
  missingDocumentKinds,
} from "@/lib/app/institution";
import type {
  InstitutionDocument,
  InstitutionDocumentKind,
  InstitutionFieldErrors,
  InstitutionKind,
  UploadedFile,
} from "@/lib/app/types";
import { formatBytes } from "@/lib/app/uploads";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Icon } from "../Icon";

/**
 * Documentação institucional (Modelo de Conexão §02, T-05-19): estatuto ou ato
 * constitutivo, ata de eleição, cartão CNPJ, comprovante de endereço, alvará
 * ou outro. Cada documento é um upload `institution_document` anexado na hora
 * (POST/DELETE /me/institution/documents), com a ficha salva e editável. Só o
 * titular e a equipe de validação têm acesso; nada disso é público.
 */
export function InstitutionDocuments({
  kind, documents, onChange, editable, hasSavedRecord, error,
}: {
  kind: InstitutionKind;
  documents: InstitutionDocument[];
  onChange: (next: InstitutionDocument[]) => void;
  editable: boolean;
  hasSavedRecord: boolean;
  /** Erro do envio à validação (`fields.documents`). */
  error?: string;
}) {
  const [docKind, setDocKind] = useState<InstitutionDocumentKind>(missingDocumentKinds(kind, documents)[0] ?? "estatuto");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [errors, setErrors] = useState<InstitutionFieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const missing = missingDocumentKinds(kind, documents);
  const required = REQUIRED_DOCUMENT_KINDS[kind];

  async function attach() {
    const next: InstitutionFieldErrors = {};
    if (!title.trim()) next.title = "Dê um título ao documento";
    if (!file) next.uploadRef = "Envie o arquivo do documento";
    setErrors(next);
    setMessage(null);
    if (Object.keys(next).length || !file) return;
    setBusy("attach");
    try {
      const saved = await api.addInstitutionDocument({ kind: docKind, title: title.trim(), uploadRef: file.ref });
      onChange([...documents, saved]);
      setTitle("");
      setFile(null);
      setDocKind(missingDocumentKinds(kind, [...documents, saved])[0] ?? "outro");
      setMessage("Documento anexado à ficha.");
    } catch (err) {
      if (err instanceof InstitutionRequestError && Object.keys(err.fields).length) setErrors(err.fields);
      else setMessage(err instanceof Error && err.message !== "network" && err.message !== "timeout"
        ? err.message
        : "Não foi possível anexar agora. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(doc: InstitutionDocument) {
    setBusy(doc.id);
    setMessage(null);
    try {
      await api.removeInstitutionDocument(doc.id);
      onChange(documents.filter((d) => d.id !== doc.id));
      setMessage("Documento retirado da ficha.");
    } catch (err) {
      setMessage(err instanceof Error && err.message !== "network" && err.message !== "timeout"
        ? err.message
        : "Não foi possível retirar agora. Tente de novo.");
    } finally {
      setBusy(null);
    }
  }

  async function open(doc: InstitutionDocument) {
    const tab = window.open("about:blank", "_blank");
    try {
      const fresh = await api.getUpload("users", doc.uploadId);
      if (!fresh.url) throw new Error("indisponível");
      if (tab) {
        tab.opener = null;
        tab.location.href = fresh.url;
      } else {
        window.location.assign(fresh.url);
      }
    } catch {
      tab?.close();
      setMessage("Não foi possível abrir o arquivo agora.");
    }
  }

  return (
    <section id="inst-documents" aria-labelledby="inst-documents-title" tabIndex={-1} className="app-card rounded-2xl p-4 outline-none sm:p-5">
      <h2 id="inst-documents-title" className="text-base font-bold" style={{ color: "var(--th-text)" }}>Documentação institucional</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--th-muted)" }}>
        {required.length
          ? "O estatuto social (ou o ato constitutivo) é necessário para enviar a ficha à validação. Ata de eleição, cartão CNPJ, comprovante de endereço e alvará ajudam a equipe a conferir a organização."
          : "Opcional: documentos que ajudem a equipe a conferir o órgão."}
        {" "}Só você e a equipe de validação têm acesso; nada disso aparece no perfil público.
      </p>
      {error && (
        <p id="inst-documents-error" role="alert" className="mt-2 flex items-start gap-1 text-xs font-semibold" style={{ color: "#e53935" }}>
          <Icon name="info" size={12} className="mt-0.5 shrink-0" />{error}
        </p>
      )}

      <ul className="mt-4 space-y-2" aria-label="Documentos anexados">
        {documents.length === 0 && <li className="text-xs" style={{ color: "var(--th-muted)" }}>Nenhum documento anexado.</li>}
        {documents.map((doc) => (
          <li key={doc.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center" style={{ borderColor: "var(--th-border)" }}>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>{doc.title}</p>
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                {INSTITUTION_DOCUMENT_KIND_LABELS[doc.kind] ?? doc.kind}
                {doc.file ? ` · ${doc.file.fileName ?? "arquivo"} (${formatBytes(doc.file.size)})` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" icon="eye" onClick={() => void open(doc)} aria-label={`Abrir ${doc.title}`}>Abrir</Button>
              {editable && (
                <Button type="button" variant="ghost" size="sm" icon="close" loading={busy === doc.id} disabled={busy !== null} onClick={() => void remove(doc)} aria-label={`Retirar ${doc.title}`}>Retirar</Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <p className="mt-3 text-xs font-semibold" style={{ color: "#f4841a" }}>
          Falta anexar: {missing.map((k) => INSTITUTION_DOCUMENT_KIND_LABELS[k]).join(", ")}.
        </p>
      )}

      {editable && (
        <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border p-3 sm:grid-cols-2" style={{ borderColor: "var(--th-border)" }}>
          <div>
            <label htmlFor="inst-doc-kind" className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Tipo de documento</label>
            <select id="inst-doc-kind" value={docKind} onChange={(e) => setDocKind(e.target.value as InstitutionDocumentKind)} className="app-input">
              {INSTITUTION_DOCUMENT_KINDS.map((k) => <option key={k} value={k}>{INSTITUTION_DOCUMENT_KIND_LABELS[k]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="inst-doc-title" className="mb-1.5 block text-sm font-semibold" style={{ color: "var(--th-text)" }}>Título</label>
            <input
              id="inst-doc-title" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Estatuto registrado em 2019"
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? "inst-doc-title-error" : undefined}
              className="app-input" style={errors.title ? { borderColor: "#e53935" } : undefined}
            />
            {errors.title && <p id="inst-doc-title-error" className="mt-1 text-xs font-semibold" style={{ color: "#e53935" }}>{errors.title}</p>}
          </div>
          <div className="sm:col-span-2">
            <FileUpload
              id="inst-doc-file"
              label="Arquivo"
              purpose="institution_document"
              value={file}
              onChange={setFile}
              error={errors.uploadRef ?? errors.kind}
              disabled={!hasSavedRecord}
              disabledReason="Salve o rascunho da ficha para anexar documentos."
            />
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <Button type="button" variant="outline" icon="plus" loading={busy === "attach"} disabled={busy !== null || !hasSavedRecord} onClick={() => void attach()}>
              Anexar documento
            </Button>
          </div>
        </div>
      )}
      <p role="status" aria-live="polite" className="mt-2 text-xs" style={{ color: "var(--th-muted)" }}>{message}</p>
    </section>
  );
}
