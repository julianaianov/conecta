"use client";

/**
 * Documentos do Processo de Conexão (T-05-04, Modelo de Conexão §17): área
 * própria de documentos com nome, tipo, instituição responsável, quem enviou,
 * data e hora, versão, status e permissão de acesso. Controle de versões: a
 * versão nova passa a vigente e a anterior fica no histórico como substituída,
 * para documento antigo não ser confundido com o atualizado. Nível de acesso
 * (§33): público, institucional ou restrito (com a lista de autorizados).
 * Só quem enviou arquiva, com o motivo; nada é excluído. O arquivo abre por
 * endereço temporário e a consulta por quem não enviou fica registrada.
 * Só o Agente autor e a parte conectada usam; para os demais a API responde 404.
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/app/api";
import {
  DOCUMENT_ACCESS_LEVELS, DOCUMENT_ACCESS_LEVEL_HINTS, DOCUMENT_ACCESS_LEVEL_LABELS, documentAccessErrorMessage,
  type DocumentAccessLevel,
} from "@/lib/app/document-access";
import { processErrorMessage } from "@/lib/app/process";
import {
  PROCESS_DOCUMENT_LIMITS, PROCESS_DOCUMENT_STATUS_LABELS, PROCESS_DOCUMENT_TYPE_LABELS,
  formatProcessMoment, processDocumentAccessLabel, processDocumentActions, processDocumentArchiveProblem,
  processDocumentProblems, processDocumentSideLabel, processDocumentTypesFor, suggestedDocumentName,
  type ProcessDocumentGroup, type ProcessDocumentList, type ProcessDocumentParticipant, type ProcessDocumentStatus,
  type ProcessDocumentType, type ProcessDocumentVersion,
} from "@/lib/app/process-documents";
import { formatBytes } from "@/lib/app/uploads";
import type { DemandModule, UploadedFile } from "@/lib/app/types";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Icon } from "../Icon";
import { Card } from "../ui";
import { Checkbox, FieldError, FormAlert, SelectInput, TextArea, TextInput } from "../demand/fields";

const STATUS_COLORS: Record<ProcessDocumentStatus, string> = {
  vigente: "#2e9e5b",
  substituido: "#6b7c8a",
  arquivado: "#8a4b4b",
};

function StatusBadge({ status }: { status: ProcessDocumentStatus }) {
  const color = STATUS_COLORS[status] ?? "#6b7c8a";
  return (
    <span className="inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: `${color}1f`, color }}>
      {PROCESS_DOCUMENT_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold" style={{ color: "var(--th-muted)" }}>{label}</dt>
      <dd className="break-words text-sm" style={{ color: "var(--th-text)" }}>{children || "Sem registro"}</dd>
    </div>
  );
}

function Moment({ iso }: { iso: string }) {
  return <time dateTime={iso} className="font-numeric">{formatProcessMoment(iso) || "Sem registro"}</time>;
}

/** Os campos que o §17 manda registrar, de uma versão. */
function VersionFields({ version, participants }: { version: ProcessDocumentVersion; participants: ProcessDocumentParticipant[] }) {
  return (
    <dl className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-3">
      <Field label="Tipo">{PROCESS_DOCUMENT_TYPE_LABELS[version.documentType] ?? version.documentType}</Field>
      <Field label="Instituição responsável">{version.organizationName}</Field>
      <Field label="Enviado por">
        {version.uploadedBy.name}{version.mine ? " (você)" : ""}
        <span className="block text-xs" style={{ color: "var(--th-muted)" }}>{processDocumentSideLabel(version.uploadedBy.side)}</span>
      </Field>
      <Field label="Data e hora"><Moment iso={version.createdAt} /></Field>
      <Field label="Versão">Versão {version.version}</Field>
      <Field label="Status">{PROCESS_DOCUMENT_STATUS_LABELS[version.status] ?? version.status}</Field>
      <Field label="Permissão de acesso">
        <span title={DOCUMENT_ACCESS_LEVEL_HINTS[version.accessLevel]}>{processDocumentAccessLabel(version, participants)}</span>
      </Field>
      {version.upload.fileName && (
        <Field label="Arquivo">
          {version.upload.fileName}{version.upload.size ? ` (${formatBytes(version.upload.size)})` : ""}
        </Field>
      )}
      {version.status === "arquivado" && (
        <Field label="Arquivado">
          {version.archivedAt ? <Moment iso={version.archivedAt} /> : null}
          {version.archiveReason && <span className="block text-xs" style={{ color: "var(--th-muted)" }}>Motivo: {version.archiveReason}</span>}
        </Field>
      )}
    </dl>
  );
}

type FormProps = {
  processId: string;
  /** Módulo da demanda: os tipos dele vêm primeiro. */
  module: DemandModule | null;
  /** Quem pode constar da lista do documento restrito. */
  participants?: ProcessDocumentParticipant[];
  /** Nova versão de um documento: nome, tipo e acesso vêm preenchidos. */
  replaces?: ProcessDocumentGroup | null;
  defaultType?: ProcessDocumentType | "";
  /** Sem escolha de acesso: o documento fica institucional (resposta a uma solicitação). */
  simple?: boolean;
  submitLabel: string;
  onCreated: (document: ProcessDocumentVersion) => void;
  onCancel?: () => void;
};

/** Envio de documento novo ou de nova versão: arquivo (upload `process_document`), nome, tipo e acesso. */
export function ProcessDocumentForm({
  processId, module, participants = [], replaces = null, defaultType = "", simple = false, submitLabel, onCreated, onCancel,
}: FormProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const base = replaces?.versions[0] ?? null;
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [name, setName] = useState(replaces?.name ?? "");
  const [type, setType] = useState<string>(base?.documentType ?? defaultType);
  const [access, setAccess] = useState<DocumentAccessLevel>(base?.accessLevel ?? "institucional");
  const [authorized, setAuthorized] = useState<string[]>(base?.restrictedTo ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  function onFile(next: UploadedFile | null) {
    setFile(next);
    setFields((current) => ({ ...current, uploadId: "" }));
    if (next && !name.trim()) setName(suggestedDocumentName(next.fileName));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const accessLevel = simple ? "institucional" : access;
    const input = {
      name: name.trim(),
      documentType: type as ProcessDocumentType | "",
      uploadId: file?.ref ?? "",
      accessLevel,
      restrictedTo: accessLevel === "restrito" ? authorized : [],
      replacesGroupId: replaces?.groupId ?? null,
    };
    const problems = processDocumentProblems(input);
    setFields(problems);
    if (Object.keys(problems).length) {
      setError("Confira os campos destacados.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.createProcessDocument(processId, input);
      setFile(null);
      if (!replaces) {
        setName("");
        setType(defaultType);
      }
      onCreated(created);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) setFields(err.fields);
      setError(processErrorMessage(err, "Não foi possível enviar o documento agora."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label={replaces ? `Nova versão de ${replaces.name}` : "Enviar documento novo"}>
      {error && <div className="sm:col-span-2"><FormAlert message={error} /></div>}
      <FileUpload
        label={replaces ? "Arquivo da nova versão" : "Arquivo do documento"}
        purpose="process_document"
        target={{ processId }}
        value={file}
        onChange={onFile}
        required
        error={fields.uploadId}
        disabled={busy}
      />
      <TextInput name={`doc-${uid}-name`} label="Nome do documento" required value={name} onValue={setName}
        maxLength={PROCESS_DOCUMENT_LIMITS.name} error={fields.name} />
      <SelectInput name={`doc-${uid}-type`} label="Tipo" required value={type} onValue={setType} placeholder="Escolha"
        options={processDocumentTypesFor(module).map((t) => ({ value: t, label: PROCESS_DOCUMENT_TYPE_LABELS[t] }))}
        error={fields.documentType} />
      {simple ? (
        <p className="text-xs sm:col-span-2" style={{ color: "var(--th-muted)" }}>
          O documento entra na área de documentos do processo, com acesso institucional: {DOCUMENT_ACCESS_LEVEL_HINTS.institucional.toLowerCase()}.
        </p>
      ) : (
        <>
          <SelectInput name={`doc-${uid}-access`} label="Permissão de acesso" value={access}
            onValue={(v) => setAccess(v as DocumentAccessLevel)}
            options={DOCUMENT_ACCESS_LEVELS.map((l) => ({ value: l, label: DOCUMENT_ACCESS_LEVEL_LABELS[l] }))}
            hint={DOCUMENT_ACCESS_LEVEL_HINTS[access]} error={fields.accessLevel} className="sm:col-span-2" />
          {access === "restrito" && (
            <fieldset className="space-y-1.5 sm:col-span-2">
              <legend className="text-sm font-semibold" style={{ color: "var(--th-text)" }}>Quem pode abrir</legend>
              <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                Quem enviou o documento, o Agente autor, a equipe da instituição dele e a operação da plataforma sempre abrem.
                Escolha ao menos um autorizado.
              </p>
              {participants.map((p) => (
                <Checkbox key={p.id} name={`doc-${uid}-auth-${p.id}`} label={p.label} checked={authorized.includes(p.id)}
                  onChecked={(on) => setAuthorized((list) => (on ? [...list, p.id] : list.filter((id) => id !== p.id)))} />
              ))}
              {fields.restrictedTo && <FieldError message={fields.restrictedTo} />}
            </fieldset>
          )}
        </>
      )}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" size="sm" icon="send" loading={busy}>{submitLabel}</Button>
        {onCancel && <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>}
      </div>
    </form>
  );
}

function ArchiveForm({ version, onDone, onCancel }: {
  version: ProcessDocumentVersion; onDone: (document: ProcessDocumentVersion) => void; onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = processDocumentArchiveProblem(reason);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.archiveProcessDocument(version.processId, version.id, reason.trim()));
    } catch (err) {
      setError(processErrorMessage(err, "Não foi possível arquivar o documento agora."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3" aria-label={`Arquivar ${version.name}`}>
      <TextArea name={`archive-${version.id}`} label="Motivo do arquivamento" required value={reason} onValue={setReason} rows={3}
        maxLength={PROCESS_DOCUMENT_LIMITS.archiveReason} error={error ?? undefined}
        hint="O documento não é excluído: continua no histórico do processo, marcado como arquivado." />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="danger" loading={busy} disabled={busy || !reason.trim()}>Arquivar documento</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
    </form>
  );
}

type Panel = { kind: "novo" } | { kind: "versao"; groupId: string } | { kind: "arquivar"; documentId: string };

export function ProcessDocuments({ processId, closed, onChanged }: {
  processId: string;
  closed: boolean;
  /** Chamado depois de enviar ou arquivar (a linha do tempo do processo muda). */
  onChanged?: () => void;
}) {
  const [list, setList] = useState<ProcessDocumentList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.listProcessDocuments(processId));
      setError(null);
    } catch (err) {
      setError(processErrorMessage(err, "Não foi possível carregar os documentos do processo."));
    } finally {
      setLoading(false);
    }
  }, [processId]);

  useEffect(() => { void load(); }, [load]);

  async function changed(message: string) {
    setPanel(null);
    setNotice(message);
    await load();
    onChanged?.();
  }

  async function openFile(version: ProcessDocumentVersion) {
    setOpening(version.id);
    setOpenError(null);
    try {
      const link = await api.openProcessDocument(processId, version.id);
      window.location.assign(link.url);
    } catch (err) {
      setOpenError(err instanceof ApiError
        ? documentAccessErrorMessage(err.status, err.code ?? undefined)
        : documentAccessErrorMessage(undefined));
    } finally {
      setOpening(null);
    }
  }

  const open = Boolean(list?.open) && !closed;
  const participants = list?.participants ?? [];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Documentos do processo</h2>
        {open && !panel && (
          <Button type="button" size="sm" variant="outline" icon="plus" onClick={() => { setNotice(null); setPanel({ kind: "novo" }); }}>
            Enviar documento
          </Button>
        )}
      </div>
      <p className="mt-1 text-xs" style={{ color: "var(--th-muted)" }}>
        {open
          ? "Área própria deste processo. A versão nova passa a vigente e a anterior fica no histórico como substituída; nada é excluído."
          : "Processo encerrado: os documentos ficam registrados e não recebem versões novas."}
      </p>

      {notice && <div className="mt-3"><FormAlert message={notice} tone="success" /></div>}
      {openError && <div className="mt-3"><FormAlert message={openError} /></div>}
      {error && list && <div className="mt-3"><FormAlert message={error} /></div>}

      {panel?.kind === "novo" && list && (
        <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
          <ProcessDocumentForm processId={processId} module={list.module} participants={participants} submitLabel="Enviar documento"
            onCreated={() => void changed("Documento enviado. Ele aparece na lista e na linha do tempo do processo.")}
            onCancel={() => setPanel(null)} />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><span className="app-spinner" style={{ width: 24, height: 24 }} /></div>
      ) : error && !list ? (
        <p role="alert" className="mt-3 text-sm" style={{ color: "#c62828" }}>{error}</p>
      ) : list && list.groups.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>
          {open
            ? "Nenhum documento ainda. Envie o primeiro: projeto técnico, orçamento, parecer técnico, termo de parceria ou o que o processo pedir."
            : "Nenhum documento foi registrado neste processo."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3" aria-label="Documentos do processo">
          {list?.groups.map((group) => {
            const current = group.versions[0];
            const actions = processDocumentActions(group, open);
            const history = group.versions.slice(1);
            return (
              <li key={group.groupId} className="rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold" style={{ color: "var(--th-text)" }}>
                      <Icon name="document" size={16} className="shrink-0" />
                      <span className="break-words">{group.name}</span>
                    </h3>
                    <p className="text-xs" style={{ color: "var(--th-muted)" }}>
                      {PROCESS_DOCUMENT_TYPE_LABELS[group.documentType] ?? group.documentType}
                      {" · "}versão {group.latestVersion}{group.versions.length > 1 ? ` (${group.versions.length} versões)` : ""}
                    </p>
                  </div>
                  <StatusBadge status={group.status} />
                </div>

                <VersionFields version={current} participants={participants} />

                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.open && (
                    <Button type="button" size="sm" variant="outline" icon="download" loading={opening === current.id}
                      onClick={() => void openFile(current)} aria-label={`Abrir ${group.name}, versão ${current.version}`}>
                      Abrir
                    </Button>
                  )}
                  {actions.replace && !(panel?.kind === "versao" && panel.groupId === group.groupId) && (
                    <Button type="button" size="sm" variant="outline" icon="plus"
                      onClick={() => { setNotice(null); setPanel({ kind: "versao", groupId: group.groupId }); }}
                      aria-label={`Enviar nova versão de ${group.name}`}>
                      Nova versão
                    </Button>
                  )}
                  {actions.archive && !(panel?.kind === "arquivar" && panel.documentId === current.id) && (
                    <Button type="button" size="sm" variant="ghost" icon="close"
                      onClick={() => { setNotice(null); setPanel({ kind: "arquivar", documentId: current.id }); }}
                      aria-label={`Arquivar ${group.name}`}>
                      Arquivar
                    </Button>
                  )}
                </div>

                {panel?.kind === "versao" && panel.groupId === group.groupId && list && (
                  <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "var(--th-border)" }}>
                    <ProcessDocumentForm processId={processId} module={list.module} participants={participants} replaces={group}
                      submitLabel={`Enviar versão ${group.latestVersion + 1}`}
                      onCreated={() => void changed(`Versão ${group.latestVersion + 1} de ${group.name} enviada: ela é a vigente e a anterior ficou no histórico.`)}
                      onCancel={() => setPanel(null)} />
                  </div>
                )}
                {panel?.kind === "arquivar" && panel.documentId === current.id && (
                  <ArchiveForm version={current} onCancel={() => setPanel(null)}
                    onDone={() => void changed(`${group.name} arquivado.`)} />
                )}

                {history.length > 0 && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold" style={{ color: "var(--th-text)" }}>
                      Histórico de versões ({history.length})
                    </summary>
                    <ul className="mt-2 space-y-2" aria-label={`Versões anteriores de ${group.name}`}>
                      {history.map((v) => (
                        <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-2" style={{ background: "var(--th-card-alt)" }}>
                          <p className="min-w-0 text-xs" style={{ color: "var(--th-text)" }}>
                            <strong>Versão {v.version}</strong> · {PROCESS_DOCUMENT_STATUS_LABELS[v.status] ?? v.status}
                            {" · "}<Moment iso={v.createdAt} />
                            {" · "}{v.uploadedBy.name}{v.mine ? " (você)" : ""}
                            {" · "}{processDocumentAccessLabel(v, participants)}
                            {v.status === "arquivado" && v.archiveReason ? ` · Motivo: ${v.archiveReason}` : ""}
                          </p>
                          {v.canOpen && (
                            <Button type="button" size="sm" variant="ghost" icon="download" loading={opening === v.id}
                              onClick={() => void openFile(v)} aria-label={`Abrir ${group.name}, versão ${v.version}`}>
                              Abrir
                            </Button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
