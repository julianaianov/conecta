"use client";

/**
 * Conversa dentro da conexão (T27) — "Conversar com parceiros" (Arquitetura de
 * Perfis §3.1; Modelo de Conexão §12). Só as duas partes leem e escrevem; a
 * conversa fica registrada quando a conexão é encerrada. Append-only: nada é
 * editado nem excluído.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { api, ApiError } from "@/lib/app/api";
import { formatDate, timeAgo } from "@/lib/app/format";
import { CONNECTION_MESSAGE_MAX_LENGTH, type ConnectionMessage } from "@/lib/app/types";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { Card } from "./ui";

export function ConnectionThread({ connectionId, onSent }: { connectionId: string; onSent?: () => void }) {
  const [messages, setMessages] = useState<ConnectionMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const logRef = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.connectionMessages(connectionId);
      setMessages(page.messages);
      setHasMore(page.hasMore);
      setOpen(page.open);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar a conversa.");
    } finally {
      setLoading(false);
    }
  }, [connectionId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function loadMore() {
    if (!messages.length) return;
    setLoadingMore(true);
    try {
      const page = await api.connectionMessages(connectionId, { before: messages[0].createdAt });
      setMessages((current) => [...page.messages, ...current]);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar mensagens anteriores.");
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
      const sent = await api.sendConnectionMessage(connectionId, text);
      setMessages((current) => [...current, sent]);
      setBody("");
      onSent?.();
    } catch (err) {
      if (err instanceof ApiError && err.code === "connection_closed") {
        setOpen(false);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Não foi possível enviar a mensagem.");
      }
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void send();
  }

  return (
    <Card className="mt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold" style={{ color: "var(--th-text)" }}>Conversa</p>
        <p className="text-xs" style={{ color: "var(--th-muted)" }}>
          {open ? "Só as duas partes leem esta conversa." : "Conexão encerrada: a conversa fica registrada."}
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
            aria-label="Mensagens da conversa"
            className="mt-3 flex max-h-96 flex-col gap-2 overflow-y-auto pr-1"
          >
            {messages.length === 0 && (
              <li className="py-6 text-center text-sm" style={{ color: "var(--th-muted)" }}>
                {open ? "Nenhuma mensagem ainda. Combine os próximos passos por aqui." : "Nenhuma mensagem foi trocada nesta conexão."}
              </li>
            )}
            {messages.map((m) => (
              <li key={m.id} className={`flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
                {!m.mine && <Avatar name={m.authorName} src={m.authorAvatarUrl} id={m.authorId} size={28} />}
                <div
                  className="max-w-[85%] rounded-2xl px-3 py-2"
                  style={m.mine
                    ? { background: "rgba(244,132,26,0.14)", color: "var(--th-text)" }
                    : { background: "var(--th-card-alt)", color: "var(--th-text)" }}
                >
                  <p className="text-[11px] font-semibold" style={{ color: "var(--th-muted)" }}>
                    {m.mine ? "Você" : m.authorName}
                    {/* Cargo/perfil e instituição no envio (T-05-02, Modelo §12). */}
                    {(m.authorRoleLabel || m.authorOrganizationName) && (
                      <span className="font-normal"> · {[m.authorRoleLabel, m.authorOrganizationName].filter(Boolean).join(" · ")}</span>
                    )}
                  </p>
                  <p className="whitespace-pre-line text-[15px] leading-relaxed">{m.body}</p>
                  <p className="mt-1 text-[11px] font-numeric" style={{ color: "var(--th-muted)" }}>
                    <time dateTime={m.createdAt} title={formatDate(m.createdAt)}>{timeAgo(m.createdAt)}</time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {error && <p role="alert" className="mt-3 text-sm" style={{ color: "#c62828" }}>{error}</p>}

      <form onSubmit={send} className="mt-3">
        <label className="block">
          <span className="sr-only">Escrever mensagem</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, CONNECTION_MESSAGE_MAX_LENGTH))}
            onKeyDown={onKeyDown}
            maxLength={CONNECTION_MESSAGE_MAX_LENGTH}
            rows={3}
            disabled={!open || sending}
            placeholder={open ? "Escreva para a outra parte da conexão…" : "A conexão foi encerrada."}
            className="app-textarea"
            aria-describedby={`thread-help-${connectionId}`}
          />
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span id={`thread-help-${connectionId}`} className="text-xs font-numeric" style={{ color: "var(--th-muted)" }}>
            {body.length}/{CONNECTION_MESSAGE_MAX_LENGTH} · Ctrl+Enter envia
          </span>
          <Button type="submit" icon="send" loading={sending} disabled={!open || !body.trim()}>Enviar</Button>
        </div>
      </form>
    </Card>
  );
}
