"use client";

/**
 * Comunicação do Processo de Conexão (T-05-02, Modelo de Conexão §12): cada
 * mensagem registra quem escreveu (nome, cargo/perfil e instituição), data e
 * horário, destinatário, o texto e os documentos anexados. Só o Agente autor e
 * a parte conectada leem e escrevem; append-only (nada é editado nem
 * excluído); encerrado o processo, a conversa fica registrada. Segue o padrão
 * da conversa da conexão (ConnectionThread): `role="log"` e Ctrl+Enter envia.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api } from "@/lib/app/api";
import { formatDate, timeAgo } from "@/lib/app/format";
import { processErrorMessage, type ProcessViewerRole } from "@/lib/app/process";
import {
  PROCESS_MESSAGE_LIMITS, messageAuthorDetails, recipientLabel, recipientOptions,
  type ProcessMessage, type ProcessMessageRecipient,
} from "@/lib/app/process-communication";
import { formatBytes } from "@/lib/app/uploads";
import type { UploadedFile } from "@/lib/app/types";
import { Button } from "../Button";
import { FileUpload } from "../FileUpload";
import { Icon } from "../Icon";
import { Card } from "../ui";
import { SelectInput } from "../demand/fields";

export function ProcessThread({ processId, viewerRole, closed }: {
  processId: string;
  viewerRole: ProcessViewerRole | null;
  closed: boolean;
}) {
  const [messages, setMessages] = useState<ProcessMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(!closed);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState<ProcessMessageRecipient>("todos");
  const [attachments, setAttachments] = useState<UploadedFile[]>([]);
  const logRef = useRef<HTMLOListElement>(null);
  const helpId = `process-thread-help-${processId}`;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.processMessages(processId);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setOpen(page.open);
    } catch (err) {
      setError(processErrorMessage(err, "Não foi possível carregar a comunicação do processo."));
    } finally {
      setLoading(false);
    }
  }, [processId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function loadMore() {
    if (!messages.length) return;
    setLoadingMore(true);
    try {
      const page = await api.processMessages(processId, { before: messages[0].createdAt });
      setMessages((current) => [...page.messages, ...current]);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(processErrorMessage(err, "Não foi possível carregar mensagens anteriores."));
    } finally {
      setLoadingMore(false);
    }
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await api.sendProcessMessage(processId, {
        body: text, recipient, attachments: attachments.map((a) => a.ref),
      });
      setMessages((current) => [...current, sent]);
      setBody("");
      setAttachments([]);
    } catch (err) {
      if ((err as { code?: unknown })?.code === "process_closed") setOpen(false);
      setError(processErrorMessage(err, "Não foi possível enviar a mensagem."));
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  }

  const full = attachments.length >= PROCESS_MESSAGE_LIMITS.attachments;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold" style={{ color: "var(--th-text)" }}>Comunicação do processo</h2>
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>
          {open ? "Só as partes do processo leem. Cada mensagem fica registrada." : "Processo encerrado: a comunicação fica registrada."}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><span className="app-spinner" style={{ width: 24, height: 24 }} /></div>
      ) : (
        <>
          {hasMore && (
            <div className="mt-3 text-center">
              <Button size="sm" variant="outline" loading={loadingMore} onClick={loadMore}>Carregar mensagens anteriores</Button>
            </div>
          )}
          <ol
            ref={logRef}
            role="log"
            aria-live="polite"
            aria-label="Mensagens do processo"
            className="mt-3 flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1"
          >
            {messages.length === 0 && (
              <li className="py-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>
                {open ? "Nenhuma mensagem ainda. Registre aqui o que as partes combinarem." : "Nenhuma mensagem foi registrada neste processo."}
              </li>
            )}
            {messages.map((m) => {
              const details = messageAuthorDetails(m);
              return (
                <li key={m.id} className={`flex ${m.mine ? "justify-end" : ""}`}>
                  <div
                    className="max-w-[90%] rounded-2xl px-3 py-2"
                    style={m.mine
                      ? { background: "rgba(244,132,26,0.14)", color: "var(--th-text)" }
                      : { background: "var(--th-card-alt)", color: "var(--th-text)" }}
                  >
                    <p className="text-xs font-semibold" style={{ color: "var(--th-text)" }}>
                      {m.mine ? "Você" : m.authorName}
                      {details && <span className="font-normal" style={{ color: "var(--th-muted)" }}> · {details}</span>}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--th-muted)" }}>{recipientLabel(m.recipient)}</p>
                    <p className={`mt-1 whitespace-pre-line text-[15px] leading-relaxed ${m.anonymized ? "italic" : ""}`}>{m.body}</p>
                    {m.attachments.length > 0 && (
                      <ul className="mt-2 space-y-1" aria-label="Documentos anexados">
                        {m.attachments.map((a) => (
                          <li key={a.id} className="flex items-center gap-1.5 text-sm">
                            <Icon name="document" size={14} className="shrink-0" />
                            {a.url ? (
                              <a href={a.url} target="_blank" rel="noopener noreferrer" className="truncate font-semibold underline">
                                {a.fileName ?? "Anexo"}
                              </a>
                            ) : (
                              <span className="truncate">{a.fileName ?? "Anexo"}</span>
                            )}
                            {a.size ? <span className="text-xs" style={{ color: "var(--th-muted)" }}>({formatBytes(a.size)})</span> : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-1 text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>
                      <time dateTime={m.createdAt} title={formatDate(m.createdAt)}>{formatDate(m.createdAt)} · {timeAgo(m.createdAt)}</time>
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}

      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "#c62828" }}>{error}</p>}

      {open && (
        <form onSubmit={send} className="mt-3 space-y-3" aria-label="Nova mensagem do processo">
          <SelectInput
            name={`process-recipient-${processId}`}
            label="Destinatário"
            value={recipient}
            onValue={(v) => setRecipient(v as ProcessMessageRecipient)}
            options={recipientOptions(viewerRole)}
          />
          <label className="block">
            <span className="sr-only">Escrever mensagem</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, PROCESS_MESSAGE_LIMITS.body))}
              onKeyDown={onKeyDown}
              maxLength={PROCESS_MESSAGE_LIMITS.body}
              rows={4}
              disabled={sending}
              placeholder="Escreva para as partes do processo…"
              className="app-textarea"
              aria-describedby={helpId}
            />
          </label>
          {attachments.length > 0 && (
            <ul className="space-y-1" aria-label="Anexos desta mensagem">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm" style={{ color: "var(--th-text)" }}>
                  <span className="flex min-w-0 items-center gap-1.5"><Icon name="document" size={14} className="shrink-0" /><span className="truncate">{a.fileName ?? "Anexo"}</span></span>
                  <Button type="button" size="sm" variant="ghost" icon="close"
                    onClick={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
                    aria-label={`Tirar ${a.fileName ?? "anexo"} da mensagem`}>Tirar</Button>
                </li>
              ))}
            </ul>
          )}
          <FileUpload
            label="Anexar documento ou imagem"
            purpose="process_attachment"
            target={{ processId }}
            value={null}
            onChange={(file) => { if (file) setAttachments((list) => (list.some((x) => x.id === file.id) ? list : [...list, file])); }}
            disabled={full || sending}
            disabledReason={full ? `No máximo ${PROCESS_MESSAGE_LIMITS.attachments} anexos por mensagem.` : undefined}
          />
          <div className="flex items-center justify-between gap-2">
            <span id={helpId} className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
              {body.length}/{PROCESS_MESSAGE_LIMITS.body} · Ctrl+Enter envia
            </span>
            <Button type="submit" icon="send" loading={sending} disabled={!body.trim()}>Enviar</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
